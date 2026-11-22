---
title: "Kotlin & Android Questions"
description: "Bank pertanyaan interview Kotlin & Android native: Kotlin language, Activity/Fragment lifecycle, configuration change, ViewModel, coroutines & Flow, Jetpack Compose, background work, platform channel, dan keamanan — dengan jawaban ringkas."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, kotlin, android, question-bank, coroutines, compose]
---

## Overview

Untuk Flutter developer, pertanyaan Android native sering muncul untuk menguji pemahaman **platform di bawah Flutter**:
lifecycle, permission, background work, dan platform channel. Halaman ini merangkum pertanyaan Kotlin & Android yang
paling sering ditanyakan.

:::note
API Android berubah antar versi (mis. batasan background, izin notifikasi Android 13+, foreground service type di
Android 14+). Sebutkan target SDK yang Anda kenal dan rujuk dokumentasi resmi Android Developers.
:::

## Why It Matters

Banyak bug aplikasi Flutter berakar di platform: activity dibuat ulang, proses dimatikan sistem, izin, atau batasan
background. Pemahaman native membuat Anda lebih efektif men-debug dan membuat plugin.

## Core Concepts

| Area | Topik kunci |
| --- | --- |
| Kotlin | null safety, `val`/`var`, data/sealed class, extension, scope functions, higher-order function, `object`/companion |
| Lifecycle | Activity & Fragment lifecycle, configuration change, process death |
| Arsitektur | MVVM, ViewModel, SavedStateHandle, Repository, Hilt |
| Concurrency | Coroutines, scope, dispatcher, structured concurrency, Flow/StateFlow/SharedFlow |
| UI | XML View vs Jetpack Compose, recomposition, state hoisting |
| Background | WorkManager, foreground service, Doze, batasan background |
| Platform | Intent, permission runtime, manifest, ProGuard/R8, Gradle |
| Interop | Flutter platform channel / Pigeon |

## How It Works

```text
Configuration change (rotasi, bahasa, dark mode) → Activity di-destroy & dibuat ulang
  → ViewModel bertahan (ViewModelStore) · state UI kecil via SavedStateHandle/rememberSaveable
Process death (sistem membunuh proses di background) → ViewModel hilang
  → hanya SavedStateHandle/persistent storage yang tersisa
```

## Implementation

```kotlin
// Data & sealed class untuk state UI
data class Product(val id: String, val name: String, val price: Long)

sealed interface UiState {
    data object Loading : UiState
    data class Success(val items: List<Product>) : UiState
    data class Error(val message: String) : UiState
}

// ViewModel + StateFlow + coroutines
class ProductViewModel(
    private val repo: ProductRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {
    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun load() = viewModelScope.launch {                 // dibatalkan otomatis saat ViewModel cleared
        _state.value = try {
            UiState.Success(withContext(Dispatchers.IO) { repo.getAll() })
        } catch (e: IOException) {
            UiState.Error("Tidak ada koneksi")
        }
    }
}

// Mengumpulkan Flow sesuai lifecycle (View system)
lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.state.collect { render(it) }
    }
}

// Scope functions
val user = User().apply { name = "Raka"; age = 25 }     // konfigurasi objek, return objek
val len = name?.let { it.trim().length } ?: 0           // null-safe transform
```

## Best Practices

- Jelaskan **alasan** di balik pola (mengapa ViewModel, mengapa `repeatOnLifecycle`).
- Hubungkan dengan Flutter: `MainActivity` adalah `FlutterActivity`; lifecycle app Flutter (`AppLifecycleState`) dipetakan dari lifecycle Activity.
- Sebutkan perbedaan antar versi Android bila relevan.

## Anti-Patterns

- Menyimpan `Context`/`Activity` di ViewModel atau singleton (memory leak).
- `GlobalScope.launch` untuk pekerjaan yang terikat layar.
- Mengumpulkan Flow di `lifecycleScope.launch` tanpa `repeatOnLifecycle` (tetap berjalan di background).
- Operasi I/O di main thread (ANR).

## Performance Considerations

ANR terjadi bila main thread terblokir terlalu lama; gunakan dispatcher IO/Default, hindari kerja berat di
`onCreate`, gunakan Baseline Profiles untuk startup, dan pantau dengan Android Studio Profiler serta Android vitals.

## Security Considerations

Android Keystore untuk kunci, EncryptedSharedPreferences/DataStore terenkripsi, `exported` yang tepat pada komponen di
manifest, validasi Intent/deep link, R8 obfuscation, network security config, izin minimum.

## Real-World Use Cases

- Membuat plugin/platform channel untuk SDK native (printer Bluetooth, scanner, payment).
- Men-debug crash Flutter yang terjadi saat activity dibuat ulang.
- Menjadwalkan sinkronisasi background yang patuh pada batasan Android.

## Interview Questions

1. Jelaskan lifecycle Activity.
2. Apa yang terjadi saat rotasi layar dan bagaimana mempertahankan state?
3. Apa beda configuration change dan process death?
4. Apa itu ViewModel dan mengapa bertahan saat rotasi?
5. Jelaskan coroutines, scope, dan dispatcher.
6. Apa beda `StateFlow`, `SharedFlow`, dan `LiveData`?
7. Apa itu structured concurrency?
8. `val` vs `var`, `data class`, `sealed class` — kapan dipakai?
9. Kapan memakai WorkManager vs foreground service?
10. Apa itu recomposition di Jetpack Compose?
11. Bagaimana Flutter berkomunikasi dengan kode native?
12. Apa penyebab umum memory leak di Android?

## Sample Answers

1. `onCreate` (inisialisasi) → `onStart` (terlihat) → `onResume` (interaktif) → `onPause` (kehilangan fokus) → `onStop` (tidak terlihat) → `onDestroy`. Detail: [Activity Lifecycle](/android/activity-lifecycle/).
2. Activity di-destroy dan dibuat ulang; data layar disimpan di ViewModel, state UI kecil di `SavedStateHandle`/`onSaveInstanceState`/`rememberSaveable`.
3. Configuration change membuat ulang Activity dalam proses yang sama (ViewModel bertahan). Process death mematikan seluruh proses; hanya saved state dan penyimpanan persisten yang bertahan.
4. Komponen yang menyimpan state UI dan logika presentasi; disimpan di `ViewModelStore` milik Activity/Fragment/NavBackStackEntry yang dipertahankan melewati configuration change, dibersihkan saat owner benar-benar selesai (`onCleared`).
5. Coroutine adalah komputasi yang bisa ditangguhkan tanpa memblokir thread. Scope (`viewModelScope`, `lifecycleScope`) menentukan umur & pembatalan; dispatcher menentukan thread (`Main`, `IO`, `Default`).
6. `StateFlow` memegang nilai terkini (selalu punya nilai, cocok untuk state UI); `SharedFlow` untuk event/broadcast dengan replay yang dapat diatur; `LiveData` lifecycle-aware tetapi terikat Android dan kurang kaya operator.
7. Coroutine anak hidup dalam scope induk: induk menunggu anak selesai, pembatalan induk membatalkan anak, dan error anak dipropagasi — mencegah kebocoran pekerjaan. Lihat [Coroutines & Flow](/android/coroutines-flow/).
8. `val` read-only, `var` mutable; `data class` untuk model nilai (equals/hashCode/copy otomatis); `sealed class/interface` untuk himpunan tipe tertutup seperti state UI atau hasil operasi, sehingga `when` exhaustive.
9. WorkManager untuk pekerjaan tertunda yang harus terjamin berjalan (sinkronisasi, upload) dengan constraint; foreground service untuk pekerjaan yang sedang berlangsung dan terlihat user (navigasi, pemutaran, pelacakan aktif) dengan notifikasi dan tipe yang sesuai.
10. Compose memanggil ulang fungsi composable yang membaca state yang berubah; pengoptimalan dengan state hoisting, `remember`, parameter stabil, dan `derivedStateOf` untuk menghindari recomposition berlebihan.
11. Platform channel (MethodChannel/EventChannel) dengan codec pesan antara Dart dan Kotlin/Swift, atau Pigeon untuk API yang type-safe; panggilan asinkron dan berjalan di main thread platform kecuali dipindah.
12. Referensi statis/singleton ke Activity/View/Context, listener/callback yang tidak dilepas, coroutine/thread yang hidup lebih lama dari layar, Handler dengan pesan tertunda; deteksi dengan LeakCanary.

## Practical Exercises

1. Buat aplikasi Kotlin kecil: daftar produk dengan ViewModel + StateFlow + Compose, uji rotasi dan "Don't keep activities".
2. Buat MethodChannel Flutter → Kotlin yang mengembalikan info baterai.
3. Jadwalkan sinkronisasi periodik dengan WorkManager dengan constraint jaringan.

## Quick Reference

```text
Lifecycle: onCreate → onStart → onResume → onPause → onStop → onDestroy
Config change: ViewModel bertahan · process death: hanya SavedState/persistent
Coroutines: scope (viewModelScope/lifecycleScope) + dispatcher (Main/IO/Default) · repeatOnLifecycle
StateFlow (state) · SharedFlow (event) · WorkManager (deferrable terjamin) · FGS (sedang berlangsung)
Flutter ↔ native: MethodChannel / EventChannel / Pigeon
```

## Related Topics

- [Activity Lifecycle](/android/activity-lifecycle/)
- [Coroutines & Flow](/android/coroutines-flow/)
- [Flutter Background Processing](/flutter/background-processing/)
