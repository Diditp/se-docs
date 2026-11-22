---
title: "OOP & Advanced Kotlin"
description: "Fitur Kotlin tingkat lanjut: class & visibility, open/final, interface, sealed class/interface, object & companion, generics & variance, scope functions, inline & reified, delegation (by, lazy), value class, DSL, dan Result."
level: intermediate
status: complete
version: "Kotlin 2.x"
updated: 2026-11-13
tags: [kotlin, oop, sealed-class, generics, delegation, scope-functions]
---

## Overview

Setelah dasar, Kotlin menawarkan fitur yang membuat kode Android lebih aman dan ringkas: **sealed hierarchy** untuk
state, **object/companion** untuk singleton & factory, **generics dengan variance**, **scope functions**, **delegation**,
dan **inline/reified**. Fitur-fitur ini sering muncul di interview Android tingkat menengah.

## Why It Matters

Kode Android modern (ViewModel, UiState, repository, DI) memakai fitur ini setiap hari. Memahaminya membantu membaca
kode library Jetpack dan menulis model state yang tidak bisa berada pada kondisi tidak valid.

## Core Concepts

| Fitur | Inti |
| --- | --- |
| Class default `final` | Harus `open` untuk diwariskan — mencegah inheritance tak sengaja |
| Visibility | `public` (default), `private`, `protected`, `internal` (satu modul) |
| `sealed class/interface` | Himpunan subtipe tertutup → `when` exhaustive |
| `object` | Singleton; juga object expression (anonymous) |
| `companion object` | Anggota "statis" per class (factory, konstanta) |
| `enum class` | Nilai tetap, bisa punya properti/method |
| Generics `<out T>` / `<in T>` | Covariance (produser) / contravariance (konsumer) |
| Scope functions | `let`, `run`, `with`, `apply`, `also` |
| `inline` + `reified` | Lambda di-inline; tipe generik tersedia saat runtime |
| Delegation | `class A(b: B) : I by b`, `val x by lazy {}`, `by Delegates.observable` |
| `value class` | Pembungkus tipe tanpa overhead alokasi (umumnya) |
| `Result<T>` / `runCatching` | Hasil sukses/gagal; hati-hati dengan coroutine cancellation |

### Scope functions

| Fungsi | Objek sebagai | Mengembalikan | Kegunaan umum |
| --- | --- | --- | --- |
| `let` | `it` | hasil lambda | Null check + transformasi |
| `run` | `this` | hasil lambda | Hitung nilai dari objek |
| `with(x)` | `this` | hasil lambda | Banyak panggilan ke satu objek |
| `apply` | `this` | objek | Konfigurasi objek |
| `also` | `it` | objek | Efek samping (log, validasi) |

## How It Works

```text
sealed interface UiState → compiler mengetahui semua subtipe → when (state) {...} wajib lengkap
inline fun → isi fungsi & lambda disalin ke pemanggil → tidak ada alokasi objek lambda; reified T bisa dipakai (T::class)
by lazy → nilai dihitung saat akses pertama, thread-safe secara default (SYNCHRONIZED)
```

## Implementation

### Sealed hierarchy untuk state & hasil

```kotlin
sealed interface CheckoutUiState {
    data object Idle : CheckoutUiState
    data object Processing : CheckoutUiState
    data class Success(val receiptNo: String) : CheckoutUiState
    data class Error(val message: String, val retryable: Boolean) : CheckoutUiState
}

fun render(state: CheckoutUiState): String = when (state) {     // tanpa else: compiler cek kelengkapan
    CheckoutUiState.Idle -> "Siap"
    CheckoutUiState.Processing -> "Memproses…"
    is CheckoutUiState.Success -> "Struk ${state.receiptNo}"      // smart cast
    is CheckoutUiState.Error -> if (state.retryable) "Coba lagi" else state.message
}
```

### object, companion, enum

```kotlin
object Clock { fun nowUtc(): java.time.Instant = java.time.Instant.now() }

class Money private constructor(val rupiah: Long) {
    companion object {
        fun of(rupiah: Long): Money { require(rupiah >= 0) { "Tidak boleh negatif" }; return Money(rupiah) }
        val ZERO = Money(0)
    }
    operator fun plus(other: Money) = Money(rupiah + other.rupiah)
}

enum class PaymentMethod(val label: String) { CASH("Tunai"), QRIS("QRIS"), CARD("Kartu") }
```

### Generics & variance

```kotlin
interface Source<out T> { fun next(): T }          // hanya menghasilkan T → covariant
interface Sink<in T> { fun put(item: T) }          // hanya menerima T → contravariant

fun printAll(items: List<Any>) = items.forEach(::println)
printAll(listOf("a", "b"))                         // List<String> adalah List<Any> karena List<out E>
```

### Scope functions

```kotlin
val request = Request.Builder().apply {
    url("https://api.example.com/orders")
    header("Accept", "application/json")
}.build()

val length = user?.name?.let { it.trim().length } ?: 0
val saved = repository.save(order).also { log.d("saved ${it.id}") }
```

### inline + reified

```kotlin
inline fun <reified T> Gson.fromJsonTyped(json: String): T = fromJson(json, T::class.java)
inline fun <reified T : Enum<T>> String.toEnumOrNull(): T? =
    enumValues<T>().firstOrNull { it.name.equals(this, ignoreCase = true) }
val method = "qris".toEnumOrNull<PaymentMethod>()      // PaymentMethod.QRIS
```

### Delegation

```kotlin
class LoggingRepository(private val inner: OrderRepository) : OrderRepository by inner {
    override suspend fun create(order: Order): Order = inner.create(order).also { println("created ${it.id}") }
}

class SettingsScreenModel {
    val formatter by lazy { java.text.NumberFormat.getInstance(java.util.Locale("id", "ID")) }
}
```

### value class

```kotlin
@JvmInline value class OrderId(val value: String)
@JvmInline value class OutletId(val value: String)
fun loadOrder(id: OrderId, outlet: OutletId) { /* tidak tertukar parameter */ }
```

### Result & runCatching (hati-hati di coroutine)

```kotlin
suspend fun safeLoad(): Result<List<Order>> =
    try { Result.success(api.getOrders()) }
    catch (e: CancellationException) { throw e }          // jangan telan pembatalan
    catch (e: IOException) { Result.failure(e) }
```

## Best Practices

- **Sealed interface untuk UI state, event, dan hasil operasi**.
- **`private constructor` + factory di companion** untuk menjaga invariant.
- **`value class`** untuk ID agar parameter tidak tertukar.
- **Pilih scope function sesuai tujuan**, jangan disarangkan berlapis.
- **Delegation (`by`)** untuk decorator dan properti lazy.

## Anti-Patterns

- Rantai `?.let { ... }?.also { ... }?.run { ... }` yang sulit dibaca.
- `open` di semua class "untuk jaga-jaga".
- `runCatching` di sekitar `suspend` call yang menelan `CancellationException`.
- `object` berisi state global yang dapat diubah (mutable singleton).
- `else` di `when` atas sealed type (menghilangkan pemeriksaan kelengkapan saat subtipe baru ditambah).

## Performance Considerations

`inline` mengurangi alokasi lambda untuk fungsi higher-order kecil yang sering dipanggil, tetapi memperbesar bytecode bila
fungsi besar. `by lazy` default memakai sinkronisasi; gunakan `LazyThreadSafetyMode.NONE` hanya bila pasti diakses satu
thread. `value class` dapat ter-box ketika dipakai sebagai nullable atau generik.

## Security Considerations

`private constructor` + validasi di factory membuat objek tidak valid (mis. nominal negatif) tidak bisa dibuat. Override
`toString` pada data class yang memuat token/PIN agar tidak tercetak di log.

## Real-World Use Cases

- `sealed interface UiState` di setiap ViewModel.
- `value class` untuk `OrderId`, `OutletId`.
- Decorator caching/logging repository dengan `by`.

## Interview Questions

1. Apa beda sealed class dan enum?
2. Apa beda `object` dan `companion object`?
3. Jelaskan perbedaan `let`, `apply`, `also`, `run`.
4. Apa itu `reified` dan mengapa butuh `inline`?
5. Apa itu variance `out`/`in`?
6. Mengapa class di Kotlin final secara default?

## Sample Answers

1. Enum adalah himpunan instance tetap dengan struktur sama; sealed class/interface adalah himpunan **tipe** tertutup yang tiap subtipenya bisa punya data berbeda (mis. `Success(data)` vs `Error(message)`), dan keduanya membuat `when` exhaustive.
2. `object` mendeklarasikan singleton tersendiri; `companion object` adalah object yang terikat pada sebuah class untuk anggota setara statis seperti factory dan konstanta.
3. `let` (it, kembalikan hasil lambda) untuk null check/transformasi; `apply` (this, kembalikan objek) untuk konfigurasi; `also` (it, kembalikan objek) untuk efek samping; `run` (this, kembalikan hasil lambda) untuk menghitung nilai dari objek.
4. Generik di JVM mengalami type erasure; `reified` membuat tipe tersedia saat runtime (`T::class`), dan hanya mungkin pada fungsi `inline` karena kode disalin ke tempat pemanggil dengan tipe konkret.
5. `out T` berarti hanya menghasilkan T sehingga `Producer<String>` dapat dipakai sebagai `Producer<Any>` (covariant); `in T` hanya menerima T sehingga `Consumer<Any>` dapat dipakai sebagai `Consumer<String>` (contravariant).
6. Agar inheritance terjadi secara sengaja (`open`), mengurangi fragile base class problem dan mendorong composition.

## Practical Exercises

1. Modelkan state layar daftar produk (loading, data, empty, error) sebagai sealed interface dan render dengan `when`.
2. Buat `value class Rupiah` dengan operator `plus` dan validasi.
3. Tulis decorator `CachedProductRepository` memakai `by`.

## Quick Reference

```text
final default (open untuk diwariskan) · internal = satu modul · sealed → when exhaustive
object (singleton) · companion (factory/konstanta) · enum dengan properti
let/run/with/apply/also · inline + reified · by (delegation), by lazy · value class untuk ID
runCatching + coroutine → jangan telan CancellationException
```

## Related Topics

- [Kotlin Fundamentals](/android/kotlin-fundamentals/)
- [Coroutines & Flow](/android/coroutines-flow/)
- [OOP](/fundamentals/oop/)
