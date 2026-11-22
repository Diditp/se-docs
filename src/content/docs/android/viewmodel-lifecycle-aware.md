---
title: "ViewModel & Lifecycle-Aware Components"
description: "ViewModel (scope, umur, viewModelScope, SavedStateHandle), lifecycle-aware components (LifecycleOwner, DefaultLifecycleObserver), mengumpulkan Flow dengan aman, stateIn & WhileSubscribed, one-off events, LiveData vs StateFlow, dan testing ViewModel."
level: intermediate
status: complete
version: "AndroidX Lifecycle 2.6+ · Kotlin coroutines 1.8+"
updated: 2026-11-13
tags: [android, viewmodel, lifecycle, stateflow, savedstatehandle]
---

## Overview

**ViewModel** menyimpan dan mengelola state UI sehingga bertahan melewati configuration change, serta menjadi jembatan
antara UI dan data layer. **Lifecycle-aware components** adalah komponen yang bereaksi terhadap perubahan lifecycle
(Activity, Fragment, NavBackStackEntry, proses) agar pekerjaan berjalan hanya saat dibutuhkan.

## Why It Matters

Hampir semua bug lifecycle — data dimuat ulang saat rotasi, collector berjalan di background, event ditampilkan dua
kali — diselesaikan dengan pemakaian ViewModel dan lifecycle-aware API yang benar. Ini materi wajib interview Android.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| `ViewModelStoreOwner` | Pemilik ViewModel: Activity, Fragment, NavBackStackEntry |
| Umur ViewModel | Sampai owner benar-benar selesai (bukan saat rotasi) → `onCleared()` |
| `viewModelScope` | CoroutineScope yang dibatalkan saat `onCleared()` |
| `SavedStateHandle` | Map key-value yang bertahan process death (data kecil) |
| `LifecycleOwner` | Objek yang punya `Lifecycle` (state: INITIALIZED, CREATED, STARTED, RESUMED, DESTROYED) |
| `DefaultLifecycleObserver` | Callback onCreate/onStart/... untuk komponen sendiri |
| `repeatOnLifecycle` | Menjalankan blok saat lifecycle ≥ state, membatalkannya saat di bawah |
| `collectAsStateWithLifecycle` | Versi Compose dari koleksi aman lifecycle |

### LiveData vs StateFlow

| | LiveData | StateFlow |
| --- | --- | --- |
| Lifecycle-aware | Ya, otomatis | Lewat `repeatOnLifecycle`/`collectAsStateWithLifecycle` |
| Nilai awal | Opsional | Wajib |
| Operator | Terbatas (`map`, `switchMap`) | Semua operator Flow |
| Platform | Android saja | Kotlin murni (bisa di domain/KMP) |
| Rekomendasi baru | Kode lama | Kode baru |

## How It Works

```text
Activity dibuat → ViewModelProvider mencari di ViewModelStore → buat bila belum ada
Rotasi → Activity baru, ViewModelStore dipertahankan → ViewModel SAMA
finish()/back → ViewModelStore dibersihkan → onCleared() → viewModelScope dibatalkan
Collector dengan repeatOnLifecycle(STARTED): aktif di STARTED/RESUMED, dibatalkan saat STOPPED, mulai lagi saat STARTED
```

## Implementation

### ViewModel dengan state, aksi, dan saved state

```kotlin
@HiltViewModel
class ProductListViewModel @Inject constructor(
    private val repository: ProductRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    val query: StateFlow<String> = savedState.getStateFlow(KEY_QUERY, "")

    @OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
    val uiState: StateFlow<ProductListUiState> = query
        .debounce(300)
        .flatMapLatest { q -> repository.search(q) }
        .map { ProductListUiState.Data(it) as ProductListUiState }
        .catch { emit(ProductListUiState.Error("Gagal memuat produk")) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProductListUiState.Loading)

    fun onQueryChange(value: String) { savedState[KEY_QUERY] = value }

    private companion object { const val KEY_QUERY = "query" }
}
```

### Mengumpulkan dengan aman

```kotlin
// Compose
val state by viewModel.uiState.collectAsStateWithLifecycle()

// Views (Activity/Fragment)
lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        launch { viewModel.uiState.collect(::render) }
        launch { viewModel.events.collect(::handleEvent) }
    }
}
```

### One-off events (snackbar, navigasi)

```kotlin
// Opsi 1 (direkomendasikan panduan Android): jadikan bagian dari state, UI mengonsumsi lalu memberi tahu ViewModel
data class CheckoutUiState(val userMessage: String? = null /* ... */)
fun messageShown() = _state.update { it.copy(userMessage = null) }

// Opsi 2: Channel untuk event yang benar-benar sekali (dikonsumsi satu collector)
private val _events = Channel<CheckoutEvent>(Channel.BUFFERED)
val events = _events.receiveAsFlow()
```

### Komponen lifecycle-aware sendiri

```kotlin
class LocationTracker(private val client: FusedLocationProviderClient) : DefaultLifecycleObserver {
    override fun onStart(owner: LifecycleOwner) { /* mulai update lokasi */ }
    override fun onStop(owner: LifecycleOwner) { /* hentikan update — hemat baterai */ }
}
lifecycle.addObserver(locationTracker)
```

### Scope berbagi ViewModel

```kotlin
val vm: CartViewModel by activityViewModels()                       // Fragment: berbagi dengan Activity
val vm: CheckoutViewModel = hiltViewModel(navController.getBackStackEntry("checkout_graph")) // Compose: per nav graph
```

### Testing ViewModel

```kotlin
@get:Rule val mainDispatcherRule = MainDispatcherRule()   // ganti Dispatchers.Main dengan TestDispatcher

@Test fun `query kosong menampilkan semua produk`() = runTest {
    val vm = ProductListViewModel(FakeProductRepository(listOf(latte, tea)), SavedStateHandle())
    vm.uiState.test {                                       // Turbine
        assertEquals(ProductListUiState.Loading, awaitItem())
        assertEquals(ProductListUiState.Data(listOf(latte, tea)), awaitItem())
    }
}
```

## Best Practices

- **Satu `StateFlow<UiState>` immutable** per layar; mutable disimpan privat.
- **`stateIn(WhileSubscribed(5_000))`** untuk flow dari repository.
- **`collectAsStateWithLifecycle` / `repeatOnLifecycle(STARTED)`** untuk koleksi di UI.
- **`SavedStateHandle`** untuk input kecil yang harus bertahan process death.
- **Injeksi dependensi lewat constructor** (Hilt) agar mudah dites.
- **Event sebagai state** bila memungkinkan; Channel untuk event yang benar-benar sekali.

## Anti-Patterns

- ViewModel memegang `Context`, `View`, `Activity`, atau `NavController`.
- `lifecycleScope.launch { flow.collect {} }` tanpa `repeatOnLifecycle` (collector tetap jalan di background).
- `SharedFlow(replay = 1)` untuk event → snackbar muncul ulang setelah rotasi.
- Memuat data di `onCreate` Activity setiap kali (ulang saat rotasi) alih-alih di ViewModel.
- `GlobalScope` untuk pekerjaan yang terkait layar.

## Performance Considerations

`WhileSubscribed` mencegah upstream (query DB, lokasi) berjalan saat aplikasi di background, menghemat baterai.
Gunakan `distinctUntilChanged` untuk menghindari render berulang, dan hindari membuat objek state baru tanpa perubahan.

## Security Considerations

`SavedStateHandle` dapat ditulis ke disk — jangan simpan data sensitif. Bersihkan data sensitif di ViewModel saat logout
(atau gunakan scope yang berakhir saat sesi berakhir).

## Real-World Use Cases

- Pencarian produk dengan debounce yang bertahan rotasi.
- ViewModel bersama untuk keranjang lintas beberapa layar checkout.
- Tracker lokasi kurir yang hanya aktif saat layar terlihat.

## Interview Questions

1. Mengapa ViewModel bertahan saat rotasi?
2. Kapan `onCleared()` dipanggil?
3. Apa itu `repeatOnLifecycle` dan mengapa perlu?
4. LiveData vs StateFlow?
5. Bagaimana menangani event sekali seperti snackbar atau navigasi?
6. Apa fungsi `SavedStateHandle`?

## Sample Answers

1. ViewModel disimpan di `ViewModelStore` milik owner yang dipertahankan sistem melewati configuration change; Activity baru mengambil instance yang sama.
2. Saat owner selesai secara permanen: Activity di-`finish()`, Fragment dihapus, atau entri navigasi di-pop — bukan saat rotasi.
3. API yang menjalankan blok coroutine ketika lifecycle mencapai state tertentu (mis. STARTED) dan membatalkannya ketika turun di bawahnya, sehingga collector tidak berjalan saat UI tidak terlihat.
4. LiveData lifecycle-aware otomatis tetapi khusus Android dan operatornya terbatas; StateFlow adalah Kotlin murni dengan operator Flow lengkap dan wajib nilai awal, dikumpulkan secara aman dengan `repeatOnLifecycle`/`collectAsStateWithLifecycle` — pilihan utama untuk kode baru.
5. Modelkan sebagai bagian dari UiState yang dikonsumsi lalu di-reset lewat callback ke ViewModel, atau gunakan `Channel` yang dikonsumsi satu collector; hindari SharedFlow dengan replay.
6. Menyimpan data kecil (ID, query, input form) yang dipulihkan setelah process death, juga sumber argumen navigasi untuk ViewModel.

## Practical Exercises

1. Konversi satu ViewModel berbasis LiveData menjadi StateFlow + `stateIn`.
2. Tulis test ViewModel dengan `runTest`, `MainDispatcherRule`, dan Turbine.
3. Buat `DefaultLifecycleObserver` yang memulai/menghentikan sensor sesuai lifecycle.

## Quick Reference

```text
ViewModel bertahan rotasi, onCleared saat owner selesai · viewModelScope · SavedStateHandle (process death)
StateFlow<UiState> + stateIn(WhileSubscribed(5000)) · UI: collectAsStateWithLifecycle / repeatOnLifecycle(STARTED)
Event: state yang dikonsumsi atau Channel · jangan pegang Context/View/NavController di ViewModel
Test: runTest + MainDispatcherRule + Turbine + fake repository
```

## Related Topics

- [Android Architecture](/android/android-architecture/)
- [Coroutines & Flow](/android/coroutines-flow/)
- [Android Application & Process Lifecycle](/android/application-lifecycle/)
