---
title: "REST API Integration"
description: "Integrasi REST API di Flutter dengan Dio: konfigurasi client, interceptor auth & refresh token, model JSON, error mapping, retry, upload, pagination, dan testing."
level: intermediate
status: complete
version: "Flutter 3.x · dio 5.x · json_serializable"
updated: 2026-11-12
tags: [flutter, rest, dio, http, json, api]
---

## Overview

Integrasi REST API adalah menghubungkan app ke backend melalui HTTP: membuat request, mengirim autentikasi,
mengubah JSON menjadi model bertipe, dan menangani error jaringan/server dengan benar. Di Flutter, dua client populer:
`package:http` (sederhana) dan **`dio`** (interceptor, timeout, cancel token, upload progress, FormData) — modul ini memakai Dio.

## Why It Matters

Sebagian besar bug produksi app mobile ada di batas jaringan: token kedaluwarsa, timeout di sinyal lemah, JSON yang
berubah, request ganda, atau error yang ditampilkan mentah ke user. Lapisan API yang rapi membuat fitur baru tinggal
menambah endpoint di satu tempat dengan perilaku yang konsisten.

## Core Concepts

| Konsep | Arti |
| --- | --- |
| `BaseOptions` | baseUrl, timeout, header default |
| Interceptor | Middleware request/response/error (auth header, logging, refresh) |
| DTO / model | Kelas untuk JSON (`fromJson`/`toJson`), dipetakan ke entity domain |
| Error mapping | `DioException` → `Failure` domain (network, unauthorized, validation, server) |
| Idempotency-Key | Header agar POST aman di-retry |
| CancelToken | Membatalkan request yang tidak lagi dibutuhkan (mis. pencarian lama) |
| Pagination | Cursor/offset dari API, diteruskan ke UI infinite scroll |

## How It Works

```text
Cubit → Repository → RemoteDataSource ── Dio ──► interceptors (auth → logging) ──► HTTP
                                                  ◄── response / DioException
            ◄─ Result<Entity> ◄─ mapper DTO→Entity ◄─ error mapping
401 → AuthInterceptor: refresh token (single-flight) → ulangi request asli sekali → gagal: logout
```

## Implementation

### Konfigurasi Dio

```dart
Dio buildDio(AppConfig config, TokenStore tokens, AuthEvents authEvents) {
  final dio = Dio(BaseOptions(
    baseUrl: config.apiBaseUrl,                       // dari flavor, bukan hardcode
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 20),
    sendTimeout: const Duration(seconds: 20),
    headers: {'Accept': 'application/json'},
  ));
  dio.interceptors.addAll([
    AuthInterceptor(dio, tokens, authEvents),
    if (kDebugMode) LogInterceptor(requestBody: false, responseBody: false), // jangan log body sensitif
  ]);
  return dio;
}
```

### Interceptor auth dengan refresh token single-flight

```dart
class AuthInterceptor extends QueuedInterceptor {          // Queued: request diproses berurutan saat refresh
  AuthInterceptor(this._dio, this._tokens, this._events);
  final Dio _dio;
  final TokenStore _tokens;
  final AuthEvents _events;

  @override
  void onRequest(RequestOptions o, RequestInterceptorHandler h) async {
    final token = await _tokens.accessToken();
    if (token != null) o.headers['Authorization'] = 'Bearer $token';
    h.next(o);
  }

  @override
  void onError(DioException e, ErrorInterceptorHandler h) async {
    final isAuthCall = e.requestOptions.path.startsWith('/auth/');
    if (e.response?.statusCode != 401 || isAuthCall || e.requestOptions.extra['retried'] == true) {
      return h.next(e);
    }
    final ok = await _tokens.refresh();                    // refresh di-dedup di TokenStore
    if (!ok) {
      _events.sessionExpired();                            // router redirect ke /login
      return h.next(e);
    }
    final retry = e.requestOptions..extra['retried'] = true;
    retry.headers['Authorization'] = 'Bearer ${await _tokens.accessToken()}';
    try {
      h.resolve(await _dio.fetch(retry));
    } on DioException catch (err) {
      h.next(err);
    }
  }
}
```

### Model JSON dengan json_serializable

```dart
@JsonSerializable(fieldRename: FieldRename.snake)
class OrderDto {
  OrderDto({required this.id, required this.total, required this.createdAt, this.note});
  final String id;
  final int total;
  final DateTime createdAt;         // ISO 8601 UTC dari server
  final String? note;

  factory OrderDto.fromJson(Map<String, dynamic> json) => _$OrderDtoFromJson(json);
  Map<String, dynamic> toJson() => _$OrderDtoToJson(this);

  Order toEntity() => Order(id: id, total: total, createdAt: createdAt.toUtc(), note: note);
}
```

### Remote data source & error mapping

```dart
class OrderRemoteDataSource {
  OrderRemoteDataSource(this._dio);
  final Dio _dio;

  Future<Page<OrderDto>> list({String? cursor, int limit = 20}) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/orders',
        queryParameters: {'limit': limit, if (cursor != null) 'cursor': cursor});
    final body = res.data!;
    return Page(
      items: (body['data'] as List).map((e) => OrderDto.fromJson(e as Map<String, dynamic>)).toList(),
      nextCursor: (body['meta'] as Map<String, dynamic>?)?['next_cursor'] as String?,
    );
  }

  Future<OrderDto> create(CreateOrderRequest req) async {
    final res = await _dio.post<Map<String, dynamic>>('/v1/orders',
        data: req.toJson(),
        options: Options(headers: {'Idempotency-Key': req.id}));   // UUID transaksi
    return OrderDto.fromJson(res.data!['data'] as Map<String, dynamic>);
  }
}

Failure mapDioError(DioException e) => switch (e.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.connectionError => const NetworkFailure(),
      DioExceptionType.cancel => const CancelledFailure(),
      DioExceptionType.badCertificate => const SecurityFailure(),
      DioExceptionType.badResponse => switch (e.response?.statusCode) {
          401 => const UnauthorizedFailure(),
          403 => const ForbiddenFailure(),
          404 => const NotFoundFailure(),
          409 => const ConflictFailure(),
          422 || 400 => ValidationFailure.fromProblem(e.response?.data),
          _ => const ServerFailure(),
        },
      _ => const UnknownFailure(),
    };
```

### Upload file dengan progress

```dart
Future<String> uploadPhoto(File file, void Function(double) onProgress) async {
  final form = FormData.fromMap({
    'file': await MultipartFile.fromFile(file.path, filename: 'evidence.jpg'),
  });
  final res = await _dio.post<Map<String, dynamic>>('/v1/uploads', data: form,
      onSendProgress: (sent, total) => onProgress(total > 0 ? sent / total : 0));
  return res.data!['data']['url'] as String;
}
```

### Parsing respons besar di isolate

```dart
final res = await _dio.get<String>('/v1/catalog/full', options: Options(responseType: ResponseType.plain));
final products = await Isolate.run(() =>
    (jsonDecode(res.data!) as List).map((e) => ProductDto.fromJson(e as Map<String, dynamic>)).toList());
```

## Best Practices

- **Satu instance Dio** dengan timeout, base URL per flavor, dan interceptor yang konsisten.
- **DTO terpisah dari entity**, dipetakan di data layer; field JSON mengikuti kontrak OpenAPI (idealnya client di-generate).
- **Map semua error ke `Failure`** di data layer; UI menampilkan pesan lokal yang ramah.
- **Refresh token single-flight** (`QueuedInterceptor` + dedup) — banyak request 401 bersamaan hanya memicu satu refresh.
- **Idempotency-Key untuk POST transaksi**; retry hanya untuk request idempotent atau yang punya key.
- **Retry dengan backoff + jitter** untuk error jaringan sementara, maksimal beberapa kali.
- **Cancel request usang** (pencarian, halaman ditutup) dengan `CancelToken`.
- **Parse respons besar di isolate**.

## Anti-Patterns

- `Dio()` baru di setiap pemanggilan; base URL hardcode.
- Memanggil API dari widget/Bloc langsung.
- `catch (e) { showSnackBar(e.toString()) }` — membocorkan detail teknis.
- `Map<String, dynamic>` mengalir sampai ke UI.
- Tidak ada timeout → request menggantung lama di jaringan buruk.
- Retry otomatis untuk `POST /payments` tanpa idempotency key → transaksi ganda.
- `LogInterceptor(requestBody: true)` di release → token & data pribadi tercatat.

## Performance Considerations

- Reuse koneksi (satu Dio), aktifkan kompresi gzip di server (Dio/HttpClient mengirim `Accept-Encoding` secara default).
- Pagination & field yang dibutuhkan saja; hindari endpoint yang mengembalikan seluruh tabel.
- Cache respons GET yang jarang berubah (ETag/`If-None-Match` atau cache lokal di repository).
- Debounce pencarian dan batalkan request lama.
- Parse JSON besar di isolate.

## Security Considerations

- HTTPS saja; pertimbangkan certificate pinning untuk app finansial (dengan rencana rotasi).
- Token di secure storage; jangan pernah log header `Authorization` atau body sensitif.
- Jangan simpan API secret di app; gunakan token per user dari backend.
- Validasi/cast JSON dengan aman — respons server bisa berubah atau dimanipulasi (proxy).
- Logout saat refresh token gagal; bersihkan data cache user.

## Real-World Use Cases

- **POS**: `POST /v1/orders` dengan Idempotency-Key = UUID transaksi offline; sync worker memakai remote data source yang sama.
- **Field app**: upload foto bukti dengan progress dan retry saat sinyal kembali.
- **Katalog**: cursor pagination + cache lokal.

## Interview Questions

1. Mengapa memilih Dio dibanding `package:http`?
2. Bagaimana Anda menangani token kedaluwarsa?
3. Bagaimana memetakan error API ke UI?
4. Bagaimana mencegah transaksi ganda saat user menekan tombol bayar dua kali atau request di-retry?
5. Bagaimana menangani JSON besar tanpa jank?

## Sample Answers

1. Dio menyediakan interceptor, timeout per jenis, cancel token, FormData & progress upload, serta transformer — memudahkan auth, logging, dan retry terpusat. `http` cukup untuk kebutuhan sederhana.
2. Interceptor menangkap 401, melakukan refresh token sekali (single-flight dengan `QueuedInterceptor`/Completer), mengulang request asli dengan token baru, dan jika refresh gagal memicu logout/redirect ke login.
3. Data source melempar `DioException`, repository memetakannya ke `Failure` (network, unauthorized, validation dengan error per field, server), Bloc emit state error, UI menampilkan pesan lokal yang sesuai; detail teknis hanya di log.
4. Nonaktifkan tombol saat proses (`droppable` transformer), kirim Idempotency-Key berupa UUID transaksi, dan server menyimpan hasil per key sehingga request ulang mengembalikan hasil yang sama.
5. Ambil sebagai string dan parse di `Isolate.run`, gunakan pagination, dan hanya minta field yang dibutuhkan.

## Practical Exercises

1. Buat `buildDio` dengan AuthInterceptor dan uji 5 request paralel yang mendapat 401 → hanya satu refresh.
2. Implementasikan `mapDioError` dan tampilkan pesan validasi per field dari Problem Details.
3. Tambahkan infinite scroll dengan cursor pagination dan `CancelToken` saat halaman ditutup.
4. Generate client Dart dari OpenAPI dan bandingkan dengan model manual.

## Quick Reference

```text
1 Dio: baseUrl per flavor · connect 10s / receive 20s · interceptors (auth, log debug-only)
401 → QueuedInterceptor → refresh sekali → retry sekali → gagal: logout
DTO (json_serializable) → Entity di data layer · DioException → Failure
POST transaksi: Idempotency-Key · CancelToken untuk request usang · JSON besar → Isolate.run
```

## Related Topics

- [Repository Pattern & DI](/flutter/repository-pattern-di/)
- [Error Handling](/flutter/error-handling/)
- [RESTful API Design (Backend)](/backend/restful-api-design/)
- [Authentication & Authorization](/backend/authentication-authorization/)
- Referensi: [dio](https://pub.dev/packages/dio), [json_serializable](https://pub.dev/packages/json_serializable), [Flutter networking](https://docs.flutter.dev/data-and-backend/networking).
