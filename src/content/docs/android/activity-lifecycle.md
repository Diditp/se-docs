---
title: "Activity Lifecycle"
description: "Callback lifecycle Activity, configuration change, process death, penyimpanan state, dan lifecycle-aware components — serta kaitannya dengan Flutter."
level: beginner
status: complete
version: "Android API 24+ · AndroidX Lifecycle 2.x"
updated: 2026-11-07
tags: [android, kotlin, lifecycle, activity, process-death]
---

## Overview

**Activity** adalah satu layar/entry point UI di Android. Sistem Android — bukan aplikasi Anda — mengendalikan kapan
Activity dibuat, terlihat, berada di background, dan dihancurkan. **Lifecycle callback** adalah kesempatan Anda untuk
bereaksi terhadap transisi tersebut.

Aplikasi Flutter di Android berjalan di dalam satu `FlutterActivity`, sehingga lifecycle ini tetap relevan untuk
plugin, platform channel, dan `AppLifecycleState` di Dart.

## Why It Matters

- Mencegah **kehilangan data** saat rotasi layar atau proses dibunuh sistem.
- Mencegah **memory leak** dan crash (listener/kamera/lokasi yang tidak dilepas).
- Menghemat **baterai** (menghentikan sensor/polling saat tidak terlihat).
- Pertanyaan wajib di interview Android, dan sering muncul di interview Flutter senior.

## Core Concepts

| Callback | State | Gunakan untuk |
| --- | --- | --- |
| `onCreate(savedInstanceState)` | Created | Inflate UI/`setContent`, inisialisasi ViewModel, restore state |
| `onStart()` | Started (terlihat) | Mulai hal yang dibutuhkan saat terlihat |
| `onResume()` | Resumed (fokus, interaktif) | Kamera, sensor, animasi eksklusif |
| `onPause()` | Started (kehilangan fokus) | Lepas resource eksklusif — **harus cepat** |
| `onStop()` | Created (tidak terlihat) | Hentikan update UI, simpan draft |
| `onDestroy()` | Destroyed | Cleanup final (tidak dijamin terpanggil saat proses dibunuh) |
| `onSaveInstanceState(Bundle)` | — | Simpan state UI kecil untuk dipulihkan |

- **Configuration change** (rotasi, ganti bahasa, dark mode, resize multi-window) → Activity **dihancurkan & dibuat ulang** secara default.
- **Process death** — saat di background, sistem dapat membunuh proses untuk mengambil memory. Saat user kembali, Activity dibuat ulang **dengan** `savedInstanceState`.
- **ViewModel** bertahan melewati configuration change, **tidak** melewati process death.
- **SavedStateHandle / `rememberSaveable`** bertahan melewati keduanya (data kecil).

## How It Works

```text
          ┌───────────── onCreate ─────────────┐
          ▼                                     │
      onStart ──► onResume ──►  [RUNNING]       │
          ▲           ▲            │            │
     onRestart        │         onPause         │
          │           └────────────┤            │
          │                     onStop ──► onDestroy
          └────────────────────────┘
```

Skenario penting:

| Aksi user | Urutan callback |
| --- | --- |
| Buka app | `onCreate → onStart → onResume` |
| Tekan Home | `onPause → onStop` (+ `onSaveInstanceState`) |
| Kembali ke app | `onRestart → onStart → onResume` |
| Rotasi layar | `onPause → onStop → onSaveInstanceState → onDestroy → onCreate → onStart → onResume` |
| Dialog sistem/permission muncul | `onPause` (Activity masih terlihat sebagian) |
| Tekan Back (Activity selesai) | `onPause → onStop → onDestroy` |
| Proses dibunuh di background | (tidak ada callback) → saat kembali: `onCreate(savedState)` |

## Implementation

### ViewModel + SavedStateHandle

```kotlin
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val savedState: SavedStateHandle,
    private val createOrder: CreateOrderUseCase,
) : ViewModel() {

    // bertahan terhadap rotasi DAN process death (data kecil saja)
    val note: StateFlow<String> = savedState.getStateFlow("note", "")
    fun onNoteChanged(v: String) { savedState["note"] = v }

    private val _ui = MutableStateFlow<CheckoutUiState>(CheckoutUiState.Idle)
    val ui: StateFlow<CheckoutUiState> = _ui.asStateFlow()

    fun pay(cartId: String) = viewModelScope.launch {       // otomatis batal saat ViewModel cleared
        _ui.value = CheckoutUiState.Loading
        _ui.value = createOrder(cartId).fold(
            onSuccess = { CheckoutUiState.Success(it) },
            onFailure = { CheckoutUiState.Error(it.message ?: "Gagal") },
        )
    }
}
```

### Mengumpulkan Flow dengan aman sesuai lifecycle

```kotlin
class CheckoutActivity : ComponentActivity() {
    private val vm: CheckoutViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Compose
        setContent {
            val state by vm.ui.collectAsStateWithLifecycle()   // berhenti collect saat < STARTED
            CheckoutScreen(state, onPay = vm::pay)
        }
        // View system:
        // lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.STARTED) { vm.ui.collect(::render) } }
    }
}
```

### Lifecycle-aware component (bukan logika di Activity)

```kotlin
class BarcodeScannerObserver(private val scanner: Scanner) : DefaultLifecycleObserver {
    override fun onResume(owner: LifecycleOwner) = scanner.start()
    override fun onPause(owner: LifecycleOwner) = scanner.stop()
}
// di Activity: lifecycle.addObserver(BarcodeScannerObserver(scanner))
```

### Padanan di Flutter

```dart
// AppLifecycleListener (Flutter 3.13+) memetakan lifecycle Activity/UIApplication
final listener = AppLifecycleListener(
  onResume: () => scanner.start(),
  onPause: () => scanner.stop(),
  onStateChange: (s) => debugPrint('lifecycle: $s'),
);
```

:::tip[Uji process death]
Developer Options → **"Don't keep activities"**, atau: buka app → tekan Home → `adb shell am kill <package>` → buka lagi dari Recents.
Bug yang muncul di sini biasanya tidak terlihat di testing biasa.
:::

## Best Practices

- **Logika di ViewModel/lifecycle observer, bukan di Activity** — Activity hanya merender dan meneruskan event. Alasan: Activity berumur pendek dan sulit di-test.
- **Collect Flow dengan `repeatOnLifecycle(STARTED)` / `collectAsStateWithLifecycle`** — mencegah update UI saat background dan pemborosan resource.
- **Simpan state minimal** (id, input user, posisi scroll) di `SavedStateHandle`; data besar → Room/disk.
- **`onPause` harus cepat** — Activity berikutnya menunggu `onPause` selesai sebelum tampil.
- **Jangan mengandalkan `onDestroy` untuk menyimpan data** — tidak dipanggil saat proses dibunuh.
- **Biarkan sistem menangani configuration change** kecuali ada alasan kuat; `android:configChanges` sering menutupi masalah state, bukan menyelesaikannya.

## Anti-Patterns

- Menyimpan referensi `Activity`/`Context` di singleton atau companion object → memory leak.
- Memulai network call di `onResume` tanpa cache → request ulang setiap kembali ke layar.
- Menyimpan objek besar (bitmap, list ribuan item) di `Bundle` → `TransactionTooLargeException`.
- `GlobalScope.launch` dari Activity → coroutine terus berjalan setelah Activity hilang.
- Mengabaikan `savedInstanceState != null` → inisialisasi ganda (mis. menambah Fragment dua kali).

## Performance Considerations

- **Cold start** dipengaruhi pekerjaan di `Application.onCreate` dan `Activity.onCreate` — tunda inisialisasi non-esensial (App Startup library, lazy init), gunakan Baseline Profiles.
- Hindari kerja berat di main thread pada callback lifecycle (ANR jika main thread terblokir ~5 detik untuk input).
- Lepas resource berat (kamera, lokasi presisi tinggi) di `onPause`/`onStop`.

## Security Considerations

- **`FLAG_SECURE`** pada layar sensitif (PIN, saldo) — mencegah screenshot & preview di Recents.
- Saat `onStop`, pertimbangkan **mengunci sesi** dan meminta autentikasi ulang setelah timeout.
- Activity yang di-export (`android:exported="true"`) dapat dibuka aplikasi lain — validasi semua data dari `Intent`.
- Jangan simpan token/PIN di `Bundle` (dapat ditulis ke disk oleh sistem saat process death).

## Real-World Use Cases

- **Scanner barcode di POS** dimulai di `onResume`, dihentikan di `onPause`.
- **Form panjang** (registrasi pelanggan) tidak hilang saat rotasi atau saat user membuka kamera untuk foto KTP lalu proses dibunuh.
- **Plugin Flutter** yang memakai `ActivityAware` untuk mendapatkan/melepas referensi Activity dengan benar.

## Interview Questions

1. **(Fundamental)** Sebutkan callback lifecycle Activity dan kegunaannya.
2. **(Fundamental)** Apa yang terjadi saat layar dirotasi?
3. **(Intermediate)** Apa beda `onPause` dan `onStop`?
4. **(Intermediate)** Apa beda ViewModel dan `onSaveInstanceState`?
5. **(Advanced)** Apa itu process death dan bagaimana mengujinya?
6. **(Advanced)** Bagaimana lifecycle Activity berhubungan dengan `AppLifecycleState` di Flutter?

## Sample Answers

1. `onCreate` (setup UI & ViewModel), `onStart` (terlihat), `onResume` (interaktif, mulai kamera/sensor), `onPause` (kehilangan fokus, lepas resource eksklusif), `onStop` (tidak terlihat, hentikan update), `onDestroy` (cleanup akhir). Plus `onSaveInstanceState` untuk state UI kecil.
2. Secara default Activity dihancurkan dan dibuat ulang: `onPause → onStop → onSaveInstanceState → onDestroy → onCreate → onStart → onResume`. ViewModel tetap ada; state UI kecil dipulihkan dari Bundle/SavedStateHandle.
3. `onPause`: Activity masih mungkin terlihat sebagian tetapi tidak fokus (dialog, multi-window) — harus cepat. `onStop`: Activity tidak terlihat sama sekali — tempat untuk menghentikan pekerjaan yang lebih berat dan menyimpan draft.
4. ViewModel menyimpan state di memory dan bertahan saat configuration change, tetapi hilang saat process death. `onSaveInstanceState`/SavedStateHandle menyimpan data kecil yang diserialisasi dan bertahan terhadap process death. Gunakan keduanya bersama + Room untuk data persisten.
5. Sistem membunuh proses app di background untuk mengambil memory; saat user kembali, Android membuat ulang task & Activity dengan Bundle tersimpan, tetapi semua singleton/ViewModel sudah hilang. Uji dengan "Don't keep activities" atau `adb shell am kill`.
6. Flutter engine menerima callback dari `FlutterActivity` dan memetakannya: `onResume` → `resumed`, `onPause` → `inactive`, `onStop` → `hidden` lalu `paused`, dan saat engine dilepas → `detached`. Jadi logika "pause kamera saat background" di Flutter sebenarnya bereaksi pada lifecycle Activity.

## Practical Exercises

1. Log semua callback dengan `Log.d` lalu lakukan skenario di tabel How It Works; bandingkan dengan tabel.
2. Buat form dengan `SavedStateHandle`, aktifkan "Don't keep activities", dan pastikan input tetap ada.
3. Ubah kode yang collect Flow di `lifecycleScope.launch` biasa menjadi `repeatOnLifecycle(STARTED)` dan amati perbedaannya saat app di background.
4. Di Flutter, gunakan `AppLifecycleListener` untuk menghentikan polling saat app di background.

## Quick Reference

- Terlihat: `onStart`/`onStop` · Interaktif: `onResume`/`onPause`.
- Rotasi = destroy + recreate. ViewModel bertahan, process death tidak.
- State kecil → `SavedStateHandle`/`rememberSaveable`; data → Room.
- Collect Flow → `repeatOnLifecycle(STARTED)` / `collectAsStateWithLifecycle()`.
- Logika di ViewModel & `DefaultLifecycleObserver`, bukan di Activity.
- Uji process death dengan "Don't keep activities".

## Related Topics

- [Fragment Lifecycle](/android/fragment-lifecycle/)
- [ViewModel & Lifecycle-Aware Components](/android/viewmodel-lifecycle-aware/)
- [Android Application & Process Lifecycle](/android/application-lifecycle/)
- [Coroutines & Flow](/android/coroutines-flow/)
- [Widget Lifecycle (Flutter)](/flutter/widget-lifecycle/)
- Referensi resmi: [The activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle), [Saving UI states](https://developer.android.com/topic/libraries/architecture/saving-states).
