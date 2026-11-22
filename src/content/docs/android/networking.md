---
title: "Networking (Retrofit/OkHttp/Ktor)"
description: "Networking di Android: OkHttp (interceptor, timeout, cache, authenticator), Retrofit dengan coroutines dan kotlinx.serialization, Ktor Client sebagai alternatif multiplatform, error handling ke domain, refresh token tersinkronisasi, retry & backoff, monitoring konektivitas, dan padanannya dengan Dio di Flutter."
level: intermediate
status: complete
version: "OkHttp 4.12+/5.x · Retrofit 2.11+ · Ktor 2.x/3.x · kotlinx.serialization 1.6+"
updated: 2026-11-13
tags: [android, networking, retrofit, okhttp, ktor, api]
---

## Overview

Stack networking Android yang paling umum adalah **OkHttp** (HTTP client: koneksi, interceptor, cache, TLS) +
**Retrofit** (mengubah interface Kotlin menjadi panggilan API, dengan dukungan `suspend`). **Ktor Client** adalah
alternatif Kotlin murni yang populer untuk Kotlin Multiplatform. Padanannya di Flutter adalah **Dio** (+ Retrofit.dart).

## Why It Matters

Hampir semua aplikasi mobile berkomunikasi dengan API. Interview Android sering menanyakan interceptor, penanganan error,
refresh token, timeout, dan cara menguji networking.

## Core Concepts

| Konsep | Penjelasan | Padanan Dio |
| --- | --- | --- |
| `OkHttpClient` | Satu instance bersama (connection pool, cache) | `Dio` instance |
| Interceptor | Memodifikasi request/response (header auth, logging) | `Interceptor` |
| `Authenticator` | Dipanggil OkHttp saat 401 untuk mencoba ulang dengan kredensial baru | Interceptor `onError` 401 |
| Timeout | connect, read, write, call | `connectTimeout`, `receiveTimeout` |
| Retrofit interface | `@GET`, `@POST`, `@Path`, `@Query`, `@Body` | Retrofit.dart / manual |
| Converter | JSON ↔ objek (kotlinx.serialization, Moshi) | `json_serializable` |
| `Response<T>` | Akses status & body error | `Response` |

## How It Works

```text
Repository → Retrofit service (suspend) → OkHttp: interceptors (auth, header, logging) → koneksi (pool, TLS)
→ server → response → interceptors → converter → DTO
401 → Authenticator → refresh token (sekali, disinkronkan) → ulangi request dengan token baru
IOException (jaringan) / HttpException (4xx/5xx) / SerializationException → dipetakan ke error domain
```

## Implementation

### Retrofit + kotlinx.serialization

```kotlin
@Serializable
data class OrderDto(val id: String, val total: Long, val status: String, @SerialName("created_at") val createdAt: String)

@Serializable
data class PageDto<T>(val data: List<T>, @SerialName("next_cursor") val nextCursor: String? = null)

interface OrderApi {
    @GET("v1/outlets/{outletId}/orders")
    suspend fun getOrders(@Path("outletId") outletId: String, @Query("cursor") cursor: String? = null): PageDto<OrderDto>

    @POST("v1/orders")
    suspend fun createOrder(@Header("Idempotency-Key") key: String, @Body body: CreateOrderDto): OrderDto
}

val json = Json { ignoreUnknownKeys = true; explicitNulls = false }   // toleran terhadap field baru dari server
```

### Interceptor & Authenticator (refresh token)

```kotlin
class AuthInterceptor @Inject constructor(private val tokens: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokens.accessToken() ?: return chain.proceed(chain.request())
        return chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $token").build())
    }
}

class TokenAuthenticator @Inject constructor(
    private val tokens: TokenStore,
    private val authApi: Provider<AuthApi>,                // Provider: hindari siklus DI dengan OkHttp
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null       // sudah dicoba → menyerah (logout)
        synchronized(this) {
            val current = tokens.accessToken()
            val sentToken = response.request.header("Authorization")?.removePrefix("Bearer ")
            val newToken = if (current != null && current != sentToken) {
                current                                              // sudah di-refresh thread lain
            } else {
                val refresh = tokens.refreshToken() ?: return null   // tidak ada sesi → logout
                runCatching { runBlocking { authApi.get().refresh(refresh) } }   // thread OkHttp, bukan main thread
                    .getOrNull()?.also { tokens.save(it) }?.accessToken
            }
            return newToken?.let { response.request.newBuilder().header("Authorization", "Bearer $it").build() }
        }
    }
    private fun responseCount(r: Response): Int = generateSequence(r) { it.priorResponse }.count()
}
```

### Pemetaan error ke domain

```kotlin
sealed interface DataError {
    data object Network : DataError
    data object Unauthorized : DataError
    data class Server(val code: Int) : DataError
    data class Validation(val message: String) : DataError
    data object Unknown : DataError
}

suspend inline fun <T> safeApiCall(crossinline block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (e: CancellationException) {
    throw e
} catch (e: IOException) {
    Result.failure(AppException(DataError.Network))
} catch (e: HttpException) {
    Result.failure(AppException(when (e.code()) {
        401 -> DataError.Unauthorized
        422 -> DataError.Validation(e.response()?.errorBody()?.string().orEmpty())
        in 500..599 -> DataError.Server(e.code())
        else -> DataError.Unknown
    }))
} catch (e: SerializationException) {
    Result.failure(AppException(DataError.Unknown))
}
```

### Ktor Client (alternatif, multiplatform)

```kotlin
val client = HttpClient(OkHttp) {
    install(ContentNegotiation) { json(json) }
    install(HttpTimeout) { requestTimeoutMillis = 20_000 }
    install(HttpRequestRetry) { retryOnServerErrors(maxRetries = 3); exponentialDelay() }
    defaultRequest { url(BuildConfig.API_BASE_URL) }
}
val orders: PageDto<OrderDto> = client.get("v1/outlets/$outletId/orders").body()
```

### Memantau konektivitas

```kotlin
fun ConnectivityManager.isOnlineFlow(): Flow<Boolean> = callbackFlow {
    val cb = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { trySend(true) }
        override fun onLost(network: Network) { trySend(false) }
    }
    registerDefaultNetworkCallback(cb)
    awaitClose { unregisterNetworkCallback(cb) }
}.distinctUntilChanged()
```

"Terhubung ke jaringan" belum tentu "server dapat dijangkau" — tetap tangani error saat request.

### Test dengan MockWebServer

```kotlin
@Test fun getOrders_parsesPage() = runTest {
    server.enqueue(MockResponse().setBody("""{"data":[{"id":"o1","total":50000,"status":"PAID","created_at":"2026-11-13T01:00:00Z"}]}"""))
    val page = api.getOrders("outlet-1")
    assertEquals("o1", page.data.first().id)
    assertEquals("/v1/outlets/outlet-1/orders", server.takeRequest().path)
}
```

## Best Practices

- **Satu `OkHttpClient` bersama** (DI singleton); gunakan `newBuilder()` untuk variasi.
- **Timeout eksplisit** dan **idempotency key** untuk POST yang di-retry.
- **DTO terpisah dari domain**, `ignoreUnknownKeys` untuk kompatibilitas.
- **Petakan exception ke error domain** di data layer; jangan telan `CancellationException`.
- **Refresh token tersinkronisasi** — hanya satu refresh berjalan.
- **Logging interceptor hanya di debug**, tanpa header Authorization.

## Anti-Patterns

- Membuat `OkHttpClient` baru per request (kehilangan pool & cache).
- Networking di main thread (`NetworkOnMainThreadException`).
- Retry otomatis untuk POST pembayaran tanpa idempotency.
- Menampilkan pesan exception mentah ke pengguna.
- Mencetak body response berisi data pribadi di log production.

## Performance Considerations

Aktifkan HTTP cache OkHttp (`Cache(dir, size)`) dan hormati `Cache-Control`/ETag, gunakan kompresi gzip (otomatis),
pagination, dan HTTP/2. Gabungkan panggilan paralel dengan `async/awaitAll` bila independen. Hindari parsing JSON besar di
main thread (Retrofit `suspend` sudah di background).

## Security Considerations

HTTPS saja (`usesCleartextTraffic=false`), certificate pinning via `CertificatePinner` atau Network Security Config
dengan rencana rotasi, token di penyimpanan terenkripsi, tidak ada API secret di APK, dan redaksi header sensitif di
logging. Lihat [Android App Security](/android/app-security/).

## Real-World Use Cases

- API katalog & transaksi dengan cursor pagination.
- Refresh token otomatis untuk sesi kasir yang panjang.
- Klien Ktor bersama di modul Kotlin Multiplatform Android/iOS.

## Interview Questions

1. Apa beda OkHttp dan Retrofit?
2. Apa itu interceptor dan contoh penggunaannya?
3. Bagaimana menangani token kedaluwarsa (401)?
4. Bagaimana memetakan error jaringan ke UI?
5. Bagaimana menguji kode networking?
6. Retrofit vs Ktor?

## Sample Answers

1. OkHttp adalah HTTP client tingkat rendah (koneksi, TLS, cache, interceptor); Retrofit adalah lapisan di atasnya yang mengubah interface beranotasi menjadi panggilan HTTP dengan konversi JSON.
2. Komponen yang mencegat request/response untuk menambahkan header autentikasi, logging, header umum (versi app, bahasa), atau metrik.
3. `Authenticator` OkHttp (atau interceptor) yang menjalankan refresh secara tersinkronisasi sekali, menyimpan token baru, dan mengulang request; jika refresh gagal → logout.
4. Tangkap `IOException`/`HttpException`/serialisasi di data layer, petakan ke sealed `DataError`, lalu ViewModel menerjemahkan ke pesan dan aksi (coba lagi, login ulang) di UiState.
5. MockWebServer untuk menguji service Retrofit (parsing, path, header), fake repository untuk ViewModel, dan test interceptor/authenticator dengan respons 401 terenkueue.
6. Retrofit matang, deklaratif, dan khusus JVM/Android; Ktor berbasis Kotlin murni dengan plugin (timeout, retry, serialization) dan mendukung multiplatform.

## Practical Exercises

1. Bangun `OrderApi` dengan Retrofit + kotlinx.serialization dan test MockWebServer.
2. Implementasikan `TokenAuthenticator` dan uji dengan dua request paralel yang menerima 401.
3. Tambahkan pemetaan `DataError` dan tampilkan pesan yang tepat di UI.

## Quick Reference

```text
OkHttp (client, interceptor, cache, timeout) + Retrofit (suspend API) · Ktor (multiplatform)
Interceptor (header/log) · Authenticator (401 → refresh sekali, synchronized) · Idempotency-Key untuk POST
Exception → DataError (Network/Unauthorized/Server/Validation) · jangan telan CancellationException
MockWebServer · satu OkHttpClient · logging hanya debug tanpa token
```

## Related Topics

- [REST API Integration (Flutter)](/flutter/rest-api-integration/)
- [REST API Questions](/interview/technical/rest-api/)
- [Android App Security](/android/app-security/)
