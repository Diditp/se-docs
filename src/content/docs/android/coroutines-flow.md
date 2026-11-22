---
title: "Coroutines & Flow"
description: "Kotlin coroutines, structured concurrency, dispatcher, exception handling, serta Flow, StateFlow, dan SharedFlow untuk Android modern."
level: intermediate
status: complete
version: "Kotlin 2.x · kotlinx.coroutines 1.8+"
updated: 2026-11-07
tags: [kotlin, coroutines, flow, stateflow, concurrency, android]
---

## Overview

**Coroutine** adalah komputasi yang dapat **ditangguhkan (suspend)** tanpa memblokir thread. Ribuan coroutine dapat
berjalan di atas sedikit thread. **Flow** adalah stream asinkron *cold* yang dibangun di atas coroutine — padanan
`Stream` di Dart.

| Kotlin | Dart/Flutter |
| --- | --- |
| `suspend fun` | `Future`-returning `async` function |
| `Flow<T>` | `Stream<T>` |
| `StateFlow<T>` | `ValueNotifier` / state di Bloc/Riverpod |
| `viewModelScope` | lifecycle Bloc / `ref` + autoDispose |
| `Dispatchers.Default` | `Isolate.run` (kerja CPU) — bedanya coroutine berbagi memory |

## Why It Matters

Android melarang operasi lama di main thread (ANR). Coroutine adalah cara resmi yang direkomendasikan Google untuk
asynchronous programming: lebih sederhana dari callback, aman terhadap leak lewat **structured concurrency**, dan
terintegrasi dengan Jetpack (Room, Retrofit, ViewModel, Lifecycle, Compose).

## Core Concepts

- **`suspend`** — fungsi yang dapat menangguhkan eksekusi; hanya bisa dipanggil dari coroutine/suspend function lain.
- **CoroutineScope** — mendefinisikan umur coroutine (`viewModelScope`, `lifecycleScope`).
- **Builder** — `launch` (Job, tanpa hasil), `async` (`Deferred<T>`, ambil dengan `await`).
- **Dispatcher** — `Main` (UI), `IO` (blocking I/O), `Default` (CPU-bound).
- **Job / SupervisorJob** — hierarki parent-child; Supervisor mencegah kegagalan satu child membatalkan sibling.
- **Cancellation kooperatif** — coroutine dibatalkan di *suspension point*; loop CPU harus memeriksa `isActive`/`ensureActive()`.
- **Flow operators** — `map`, `filter`, `debounce`, `flatMapLatest`, `combine`, `catch`, `flowOn`.
- **Cold vs hot** — Flow dieksekusi per collector; `StateFlow`/`SharedFlow` aktif terlepas dari collector.

## How It Works

Compiler mengubah `suspend fun` menjadi **state machine** dengan parameter tersembunyi `Continuation`. Saat menemui
operasi suspend (mis. menunggu network), fungsi menyimpan state lokalnya dan **melepas thread**. Ketika hasil siap,
dispatcher melanjutkan continuation di thread yang sesuai.

**Structured concurrency:**

```text
viewModelScope (SupervisorJob + Dispatchers.Main.immediate)
 └── launch { loadDashboard() }
      ├── async { api.sales() }      ─┐ gagal → membatalkan parent launch
      └── async { api.stock() }      ─┘ parent menunggu semua child
ViewModel.onCleared() → scope.cancel() → semua child batal otomatis
```

## Implementation

### Paralel dengan `async` + `coroutineScope`

```kotlin
suspend fun loadDashboard(outletId: String): Dashboard = coroutineScope {
    val sales = async { salesRepo.today(outletId) }
    val stock = async { stockRepo.lowStock(outletId) }
    Dashboard(sales.await(), stock.await())   // satu gagal → yang lain dibatalkan, exception dilempar
}
```

### Main-safety: repository yang memilih dispatcher

```kotlin
class ReportRepository(
    private val dao: SalesDao,
    private val io: CoroutineDispatcher = Dispatchers.IO,          // inject → mudah di-test
    private val cpu: CoroutineDispatcher = Dispatchers.Default,
) {
    suspend fun monthlySummary(month: YearMonth): Summary {
        val rows = withContext(io) { dao.rowsFor(month.toString()) }   // blocking I/O
        return withContext(cpu) { summarize(rows) }                    // komputasi berat
    }
}
```

### Flow: pencarian dengan debounce dan hanya hasil terbaru

```kotlin
@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
class ProductSearchViewModel(private val repo: ProductRepository) : ViewModel() {
    private val query = MutableStateFlow("")

    val results: StateFlow<List<Product>> = query
        .debounce(300)
        .map { it.trim() }
        .distinctUntilChanged()
        .flatMapLatest { q -> if (q.isEmpty()) flowOf(emptyList()) else repo.search(q) } // query lama dibatalkan
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun onQueryChange(q: String) { query.value = q }
}
```

`SharingStarted.WhileSubscribed(5_000)` menjaga upstream tetap aktif 5 detik setelah collector terakhir hilang —
cukup untuk melewati rotasi layar tanpa memulai ulang query.

### Exception handling

```kotlin
viewModelScope.launch {
    try {
        _ui.value = UiState.Success(repo.load())
    } catch (e: CancellationException) {
        throw e                                   // JANGAN telan cancellation
    } catch (e: IOException) {
        _ui.value = UiState.Error("Koneksi bermasalah")
    }
}
```

### Testing dengan virtual time

```kotlin
@Test
fun `search debounces input`() = runTest {
    val vm = ProductSearchViewModel(FakeProductRepository())
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.results.collect {} }
    vm.onQueryChange("kop"); vm.onQueryChange("kopi")
    advanceTimeBy(301)
    assertEquals(listOf("Kopi Susu"), vm.results.value.map { it.name })
}
```

## Best Practices

- **Gunakan scope yang terikat lifecycle** (`viewModelScope`, `lifecycleScope`); hindari `GlobalScope`. Alasan: pembatalan otomatis mencegah leak dan kerja sia-sia.
- **Fungsi suspend harus main-safe** — pemanggil tidak perlu tahu dispatcher; repository yang melakukan `withContext`.
- **Inject dispatcher** agar dapat diganti `StandardTestDispatcher` saat test.
- **Expose `StateFlow` read-only** (`asStateFlow()`), mutasi hanya di ViewModel.
- **`flatMapLatest` untuk pencarian**, `combine` untuk menggabungkan beberapa sumber state.
- **Jangan menangkap `CancellationException`** tanpa melempar ulang (perhatikan `runCatching` yang ikut menangkapnya).
- **Collect di UI dengan lifecycle awareness** (`repeatOnLifecycle`, `collectAsStateWithLifecycle`).

## Anti-Patterns

- `runBlocking` di kode production/main thread → memblokir thread, bisa ANR.
- `GlobalScope.launch` untuk pekerjaan yang terkait layar.
- `withContext(Dispatchers.IO)` di setiap lapisan secara berlebihan (Room & Retrofit suspend sudah main-safe).
- Memakai `SharedFlow` untuk UI state (tidak punya nilai saat ini) — gunakan `StateFlow`.
- Loop CPU panjang tanpa `ensureActive()` → tidak bisa dibatalkan.
- `launch` di dalam `init {}` ViewModel tanpa penanganan error.

## Performance Considerations

- Coroutine sangat ringan (bukan thread), tetapi **dispatcher IO** dibatasi (default 64 thread atau jumlah core, mana yang lebih besar) — jangan memblokir terlalu lama.
- `Dispatchers.Default` berukuran sebesar jumlah core — cocok untuk CPU-bound, jangan dipakai untuk blocking I/O.
- `conflate()`/`buffer()` untuk producer cepat & consumer lambat; `distinctUntilChanged` untuk mengurangi recomposition.
- `stateIn`/`shareIn` untuk berbagi satu upstream ke banyak collector (hindari query DB ganda).

## Security Considerations

- Batalkan operasi sensitif saat user logout (cancel scope sesi) agar respons lama tidak menulis data ke sesi baru.
- Timeout (`withTimeout`) untuk network call agar tidak menggantung dan membuka celah DoS di sisi client.
- Hindari logging payload sensitif di operator `onEach { Log.d(...) }`.

## Real-World Use Cases

- **Dashboard outlet:** memuat penjualan, stok rendah, dan notifikasi secara paralel dengan `async`.
- **Room + Flow:** daftar transaksi yang otomatis ter-update saat data berubah (`@Query` mengembalikan `Flow<List<T>>`).
- **Pencarian produk** dengan debounce dan pembatalan query lama.
- **Upload batch** di `CoroutineWorker` (WorkManager) dengan retry.

## Interview Questions

1. **(Fundamental)** Apa itu coroutine dan bedanya dengan thread?
2. **(Fundamental)** Apa beda `launch` dan `async`?
3. **(Intermediate)** Jelaskan Dispatchers.Main, IO, dan Default.
4. **(Intermediate)** Apa itu structured concurrency?
5. **(Intermediate)** Apa beda Flow, StateFlow, dan SharedFlow?
6. **(Advanced)** Bagaimana cancellation bekerja dan mengapa `CancellationException` tidak boleh ditelan?
7. **(Advanced)** Apa beda `SupervisorJob` dan `Job` biasa?

## Sample Answers

1. Coroutine adalah unit komputasi yang dapat ditangguhkan tanpa memblokir thread; banyak coroutine berbagi sedikit thread. Thread dikelola OS dan mahal (stack ~1 MB); memblokirnya berarti thread tidak bisa dipakai pekerjaan lain.
2. `launch` mengembalikan `Job` tanpa hasil; exception langsung dipropagasi. `async` mengembalikan `Deferred<T>` untuk hasil via `await()`; dipakai untuk paralelisasi.
3. Main untuk UI; IO untuk blocking I/O (file, DB, network blocking) dengan pool besar; Default untuk kerja CPU dengan pool seukuran core.
4. Coroutine selalu berjalan dalam scope; parent menunggu child, pembatalan parent membatalkan child, dan kegagalan child membatalkan parent. Hasilnya tidak ada coroutine yang bocor.
5. Flow cold — dijalankan per collector. StateFlow hot, selalu punya nilai, conflated — untuk UI state. SharedFlow hot dengan replay/buffer yang bisa diatur — untuk event broadcast.
6. Pembatalan bersifat kooperatif: saat dibatalkan, suspension point berikutnya melempar `CancellationException`. Jika ditelan, coroutine terus berjalan seolah tidak dibatalkan, merusak structured concurrency.
7. Dengan `Job`, kegagalan satu child membatalkan parent dan semua sibling. Dengan `SupervisorJob`, kegagalan child tidak memengaruhi sibling — `viewModelScope` memakai SupervisorJob agar satu request gagal tidak mematikan seluruh ViewModel.

## Practical Exercises

1. Ubah repository berbasis callback (Retrofit `enqueue`) menjadi suspend function dengan `suspendCancellableCoroutine`.
2. Buat pencarian dengan `debounce + flatMapLatest` dan tulis test dengan `runTest` + virtual time.
3. Muat 3 sumber data paralel; buktikan bahwa ketika satu gagal, yang lain dibatalkan.
4. Bandingkan `StateFlow` vs `SharedFlow(replay = 0)` untuk event "tampilkan snackbar" saat rotasi.

## Quick Reference

- `launch` → Job · `async/await` → hasil · `coroutineScope` → paralel terstruktur.
- Main = UI · IO = blocking I/O · Default = CPU.
- UI state → `StateFlow` + `stateIn(WhileSubscribed(5000))`.
- Search → `debounce` + `distinctUntilChanged` + `flatMapLatest`.
- Collect → `repeatOnLifecycle(STARTED)` / `collectAsStateWithLifecycle`.
- Jangan: `GlobalScope`, `runBlocking` di main, menelan `CancellationException`.

## Related Topics

- [Activity Lifecycle](/android/activity-lifecycle/)
- [ViewModel & Lifecycle-Aware Components](/android/viewmodel-lifecycle-aware/)
- [WorkManager](/android/workmanager/)
- [Async Programming di Dart](/flutter/async-programming/)
- Referensi resmi: [Kotlin coroutines on Android](https://developer.android.com/kotlin/coroutines), [Kotlin flows](https://developer.android.com/kotlin/flow).
