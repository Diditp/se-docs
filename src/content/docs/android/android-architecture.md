---
title: "Android Architecture"
description: "Arsitektur aplikasi Android yang direkomendasikan: UI layer (Compose/ViewModel/UiState), domain layer opsional, data layer (repository & data source), unidirectional data flow, single source of truth, offline-first, modularisasi, serta perbandingan MVVM, MVI, dan Clean Architecture."
level: intermediate
status: complete
version: "Panduan arsitektur Android (developer.android.com) · Jetpack 2024+"
updated: 2026-11-13
tags: [android, architecture, mvvm, mvi, clean-architecture, modularization]
---

## Overview

Panduan resmi arsitektur Android membagi aplikasi menjadi **UI layer**, **domain layer (opsional)**, dan **data layer**,
dengan prinsip **unidirectional data flow (UDF)** dan **single source of truth (SSOT)**. Polanya sangat mirip dengan
Clean Architecture di Flutter — konsep yang sama, nama komponen berbeda.

## Why It Matters

Hampir setiap interview Android menanyakan arsitektur proyek Anda. Arsitektur yang jelas membuat aplikasi tahan
configuration change & process death, mudah diuji, dan dapat dikembangkan banyak engineer.

## Core Concepts

| Layer | Komponen | Tanggung jawab |
| --- | --- | --- |
| UI | Composable/Activity/Fragment, **ViewModel**, `UiState` | Menampilkan state, meneruskan event pengguna |
| Domain (opsional) | **Use case** (`GetOrdersUseCase`) | Logika bisnis yang dipakai ulang atau kompleks |
| Data | **Repository**, data source (Room, Retrofit, DataStore) | Sumber kebenaran, sinkronisasi, caching |

| Prinsip | Arti |
| --- | --- |
| UDF | State mengalir ke bawah (ViewModel → UI), event mengalir ke atas (UI → ViewModel) |
| SSOT | Setiap data punya satu pemilik (biasanya database lokal/repository) |
| Separation of concerns | Activity/Composable tidak berisi logika bisnis |
| Drive UI from data models | UI adalah fungsi dari state yang persisten |

### MVVM vs MVI vs Clean

| Pola | Inti | Catatan |
| --- | --- | --- |
| MVVM | ViewModel mengekspos state yang di-observe View | Rekomendasi default Android |
| MVI | Intent/event → reducer → satu state immutable | Lebih ketat; mudah dilacak; boilerplate lebih banyak |
| Clean Architecture | Domain murni di tengah, dependency rule ke dalam | Dikombinasikan dengan MVVM/MVI di UI layer |

## How It Works

```text
User tap "Bayar"
  → Composable memanggil viewModel.onEvent(PayClicked)
  → ViewModel memanggil PayOrderUseCase / OrderRepository (suspend)
  → Repository: tulis Room (SSOT) + antre sync ke API
  → Room Flow memancarkan data baru → ViewModel map ke UiState (StateFlow)
  → Composable collectAsStateWithLifecycle() → recompose
```

## Implementation

### Struktur feature module

```text
app/                       (Application, navigation graph, DI root)
core/
  model/                   (domain model murni Kotlin)
  data/                    (repository impl, mapper)
  database/                (Room: entity, DAO)
  network/                 (Retrofit/OkHttp, DTO)
  designsystem/            (theme, komponen Compose)
feature/
  orders/                  (OrdersScreen, OrdersViewModel, navigation)
  checkout/
```

### Data layer: repository sebagai SSOT

```kotlin
class OfflineFirstOrderRepository @Inject constructor(
    private val dao: OrderDao,
    private val api: OrderApi,
    @IoDispatcher private val io: CoroutineDispatcher,
) : OrderRepository {
    override fun observeOrders(outletId: String): Flow<List<Order>> =
        dao.observeByOutlet(outletId).map { list -> list.map(OrderEntity::toDomain) }

    override suspend fun refresh(outletId: String) = withContext(io) {
        val remote = api.getOrders(outletId)
        dao.upsertAll(remote.map(OrderDto::toEntity))
    }
}
```

### UI layer: ViewModel + UiState

```kotlin
data class OrdersUiState(
    val isLoading: Boolean = false,
    val orders: List<OrderItemUi> = emptyList(),
    val errorMessage: String? = null,
)

@HiltViewModel
class OrdersViewModel @Inject constructor(
    private val repository: OrderRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val outletId: String = checkNotNull(savedStateHandle["outletId"])
    private val refreshing = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)

    val uiState: StateFlow<OrdersUiState> =
        combine(repository.observeOrders(outletId), refreshing, error) { orders, loading, err ->
            OrdersUiState(loading, orders.map { it.toUi() }, err)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), OrdersUiState(isLoading = true))

    fun refresh() = viewModelScope.launch {
        refreshing.value = true
        try {
            repository.refresh(outletId)
            error.value = null
        } catch (e: IOException) {
            error.value = "Tidak ada koneksi"
        } finally {
            refreshing.value = false
        }
    }
}
```

```kotlin
@Composable
fun OrdersRoute(viewModel: OrdersViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    OrdersScreen(state = state, onRefresh = viewModel::refresh)
}
```

## Best Practices

- **ViewModel mengekspos `StateFlow<UiState>` immutable**; satu state per layar.
- **Repository sebagai SSOT**; database lokal sebagai sumber UI untuk aplikasi offline-first.
- **Model terpisah** untuk entity, DTO, domain, dan UI dengan mapper.
- **Domain layer hanya bila perlu** (logika dipakai ulang/kompleks).
- **Modularisasi per fitur** untuk proyek besar: build lebih cepat, batas tegas.
- **Route/Screen split** di Compose: Route terhubung ke ViewModel, Screen stateless dan mudah dites/preview.

## Anti-Patterns

- Logika bisnis/pemanggilan API di Activity/Composable.
- ViewModel menyimpan `Context`/`View`/`NavController`.
- Banyak `MutableLiveData`/`MutableStateFlow` publik yang diubah dari luar.
- Entity Room dipakai langsung sebagai model UI dan JSON.
- God module `app` berisi semua kode.

## Performance Considerations

`SharingStarted.WhileSubscribed(5_000)` menghentikan upstream saat UI tidak terlihat tetapi bertahan melewati rotasi.
Lakukan mapping berat di dispatcher Default, bukan di composition. Modularisasi mengurangi waktu build inkremental.

## Security Considerations

Data sensitif tidak disimpan di `SavedStateHandle` (bisa tersimpan ke disk saat process death). Repository adalah tempat
yang tepat untuk menerapkan enkripsi penyimpanan dan pengelolaan token.

## Real-World Use Cases

- Aplikasi kasir native dengan Room sebagai SSOT dan sinkronisasi WorkManager.
- Aplikasi e-commerce dengan modul fitur per tim.
- Proyek hybrid: modul native Android untuk SDK pembayaran dipanggil dari Flutter.

## Interview Questions

1. Jelaskan arsitektur Android yang direkomendasikan Google.
2. Apa itu unidirectional data flow?
3. Apa itu single source of truth?
4. MVVM vs MVI?
5. Kapan perlu domain layer/use case?
6. Mengapa dan bagaimana memodularisasi aplikasi?

## Sample Answers

1. UI layer (UI + ViewModel yang mengekspos UiState), domain layer opsional (use case), dan data layer (repository + data source); dependensi mengalir dari UI ke data, data diekspos sebagai Flow.
2. State mengalir satu arah dari ViewModel ke UI, sedangkan event dari UI dikirim ke ViewModel; UI tidak mengubah state langsung, sehingga perubahan dapat dilacak dan diuji.
3. Satu pemilik untuk setiap data (mis. repository yang membaca dari Room) — pihak lain hanya membaca atau meminta perubahan melalui pemilik itu, sehingga tidak ada versi data yang saling bertentangan.
4. MVVM: ViewModel mengekspos state yang bisa terdiri dari beberapa properti; MVI: semua aksi menjadi intent yang diproses reducer menjadi satu state immutable — lebih terprediksi, lebih banyak boilerplate.
5. Ketika logika bisnis dipakai di beberapa ViewModel, cukup kompleks untuk diuji terpisah, atau menggabungkan beberapa repository.
6. Untuk mempercepat build, menegakkan batas antar fitur, memungkinkan kerja paralel tim, dan dynamic delivery; dibagi menjadi modul `core` (data, network, design system) dan `feature`.

## Practical Exercises

1. Gambar arsitektur aplikasi Android/Flutter Anda dan tandai SSOT setiap data.
2. Refactor satu Activity yang memanggil API langsung menjadi ViewModel + Repository.
3. Pisahkan satu fitur menjadi modul Gradle tersendiri.

## Quick Reference

```text
UI (Composable + ViewModel + UiState) → [Domain: use case] → Data (Repository + Room/Retrofit/DataStore)
UDF: state ↓ event ↑ · SSOT: repository/DB lokal · model terpisah + mapper
StateFlow + stateIn(WhileSubscribed(5s)) · collectAsStateWithLifecycle · modul core/* + feature/*
```

## Related Topics

- [ViewModel & Lifecycle-Aware Components](/android/viewmodel-lifecycle-aware/)
- [Room Database](/android/room-database/)
- [Clean Architecture (Flutter)](/flutter/clean-architecture/)
- Dokumentasi resmi: developer.android.com/topic/architecture
