---
title: "Android Application & Process Lifecycle"
description: "Siklus hidup proses aplikasi Android: class Application, prioritas proses & low memory killer, process death dan cara mengujinya, ProcessLifecycleOwner untuk foreground/background, App Startup, serta dampaknya ke aplikasi Flutter."
level: intermediate
status: complete
version: "Android 8–15 · AndroidX Lifecycle 2.6+"
updated: 2026-11-13
tags: [android, process, lifecycle, process-death, application]
---

## Overview

Di Android, **sistem — bukan pengguna — yang memutuskan kapan proses aplikasi dimatikan**. Saat memori kurang, proses di
background bisa dibunuh kapan saja; ketika pengguna kembali, Android membuat proses baru dan memulihkan Activity
terakhir beserta *saved state*-nya. Ini disebut **process death**, salah satu sumber bug paling umum di aplikasi mobile.

## Why It Matters

Aplikasi yang hanya diuji dengan rotasi layar sering crash atau kehilangan data setelah process death (singleton
kosong, sesi hilang, form ter-reset). Pertanyaan "apa yang terjadi saat aplikasi di background lama?" sering muncul di
interview Android.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| `Application` | Objek pertama yang dibuat saat proses mulai (`onCreate`) — tempat inisialisasi global |
| Prioritas proses | Foreground > visible > service > cached (background) |
| Low Memory Killer | Mematikan proses berprioritas rendah saat memori kurang |
| Configuration change | Activity dibuat ulang, proses tetap (ViewModel bertahan) |
| Process death | Proses dibunuh; hanya saved state & penyimpanan persisten yang tersisa |
| `ProcessLifecycleOwner` | Lifecycle seluruh aplikasi: ON_START (foreground) / ON_STOP (background) |
| App Startup | Library untuk inisialisasi komponen secara efisien saat start |

### Apa yang bertahan?

| Data | Rotasi | Process death | Swipe dari recents / force stop |
| --- | --- | --- | --- |
| Variabel di Activity | ✗ | ✗ | ✗ |
| ViewModel | ✓ | ✗ | ✗ |
| `SavedStateHandle` / `rememberSaveable` | ✓ | ✓ | ✗ |
| Singleton/static in-memory | ✓ | ✗ | ✗ |
| Room / DataStore / file | ✓ | ✓ | ✓ |

## How It Works

```text
User buka form checkout → pindah ke app kamera → memori kurang → sistem membunuh proses aplikasi
User kembali → proses BARU: Application.onCreate() → Activity dibuat ulang dengan savedInstanceState
→ ViewModel baru (SavedStateHandle berisi data tersimpan) → singleton in-memory KOSONG
```

## Implementation

### Application class

```kotlin
@HiltAndroidApp
class PosApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) Timber.plant(Timber.DebugTree())
        // Inisialisasi ringan saja; hal berat ditunda (lazy / App Startup / WorkManager)
    }
}
```

### Foreground/background aplikasi

```kotlin
class AppVisibilityObserver @Inject constructor(private val session: SessionManager) : DefaultLifecycleObserver {
    override fun onStart(owner: LifecycleOwner) { session.onForeground() }   // mis. cek kunci PIN
    override fun onStop(owner: LifecycleOwner) { session.onBackground() }    // mis. catat waktu masuk background
}
// Di Application.onCreate:
ProcessLifecycleOwner.get().lifecycle.addObserver(appVisibilityObserver)
```

### Bertahan dari process death

```kotlin
@HiltViewModel
class CheckoutViewModel @Inject constructor(private val savedState: SavedStateHandle) : ViewModel() {
    val note: StateFlow<String> = savedState.getStateFlow("note", "")
    fun onNoteChanged(value: String) { savedState["note"] = value }    // kecil & tidak sensitif
}
```

```kotlin
@Composable
fun SearchBar() {
    var query by rememberSaveable { mutableStateOf("") }   // bertahan rotasi & process death
}
```

### Menguji process death

```bash
# 1. Jalankan app, buka layar yang ingin diuji, tekan Home
adb shell am kill com.example.pos          # membunuh proses background seperti yang dilakukan sistem
# 2. Buka kembali app dari Recents → periksa state layar
# Alternatif: Developer options → "Don't keep activities" (menguji recreate Activity)
```

### Flutter

Di aplikasi Flutter, process death berarti **seluruh Dart VM dimulai ulang**: state in-memory (provider/bloc) hilang.
Gunakan penyimpanan lokal untuk data penting dan `RestorationMixin`/restoration API bila perlu memulihkan state UI.
Pantau `AppLifecycleState` (`resumed`, `inactive`, `hidden`, `paused`, `detached`) dari `WidgetsBindingObserver` atau
`AppLifecycleListener`.

## Best Practices

- **Data penting → penyimpanan persisten**; state UI kecil → `SavedStateHandle`/`rememberSaveable`.
- **Jangan menyimpan state di singleton** dengan asumsi proses hidup selamanya.
- **Inisialisasi ringan di `Application.onCreate`** (cold start).
- **Uji process death** secara rutin (`adb shell am kill`).
- **Pulihkan sesi dari storage** (token di penyimpanan aman), bukan dari memori.

## Anti-Patterns

- Objek global berisi "user saat ini" yang dianggap selalu terisi → NPE setelah process death.
- Menyimpan list besar/bitmap di saved state (`TransactionTooLargeException`).
- Inisialisasi SDK berat secara sinkron di `Application.onCreate`.
- Mengandalkan `onDestroy` untuk menyimpan data (tidak dijamin dipanggil saat proses dibunuh).

## Performance Considerations

Cold start dimulai dari pembuatan proses dan `Application.onCreate`. Tunda inisialisasi non-esensial, gunakan App Startup
untuk mengurutkan initializer, dan Baseline Profiles untuk mempercepat start. Saved state dibatasi ukuran Binder (sekitar
1 MB per transaksi untuk seluruh proses) — simpan ID, bukan data besar.

## Security Considerations

Saved instance state dapat ditulis ke disk oleh sistem; jangan masukkan PIN, token, atau data pribadi. Untuk aplikasi
finansial, kunci ulang (PIN/biometrik) setelah aplikasi lama di background menggunakan `ProcessLifecycleOwner`.

## Real-World Use Cases

- Aplikasi kasir yang memulihkan keranjang dari database lokal setelah process death.
- Auto-lock aplikasi bank setelah 5 menit di background.
- Form survei panjang di aplikasi lapangan yang draft-nya disimpan otomatis.

## Interview Questions

1. Apa itu process death dan bagaimana mengujinya?
2. Apa beda configuration change dan process death?
3. Data apa yang bertahan setelah process death?
4. Bagaimana mendeteksi aplikasi masuk foreground/background?
5. Apa yang sebaiknya dilakukan di `Application.onCreate`?

## Sample Answers

1. Sistem membunuh proses aplikasi di background untuk mengambil memori; saat pengguna kembali, proses baru dibuat dan Activity dipulihkan dari saved state. Uji dengan `adb shell am kill <package>` setelah menekan Home.
2. Configuration change hanya membuat ulang Activity dalam proses yang sama (ViewModel bertahan); process death menghilangkan seluruh memori proses termasuk ViewModel dan singleton.
3. Saved instance state (`SavedStateHandle`, `rememberSaveable`, `onSaveInstanceState`), argumen/intent, back stack, serta data di penyimpanan persisten (Room, DataStore, file).
4. `ProcessLifecycleOwner` dengan `DefaultLifecycleObserver` (`onStart` = foreground, `onStop` = background); di Flutter `AppLifecycleListener`/`WidgetsBindingObserver`.
5. Inisialisasi ringan dan wajib (DI, logging, crash reporting); tunda yang berat dengan lazy init, App Startup, atau WorkManager.

## Practical Exercises

1. Uji 3 layar aplikasi Anda dengan `adb shell am kill` dan catat state yang hilang.
2. Pindahkan input form penting ke `SavedStateHandle`/penyimpanan lokal.
3. Implementasikan auto-lock setelah 5 menit di background.

## Quick Reference

```text
Sistem dapat membunuh proses background kapan saja · Application.onCreate = titik awal proses
Rotasi: ViewModel ✓ · Process death: ViewModel ✗, singleton ✗, SavedState ✓, Room/DataStore ✓
Uji: adb shell am kill <pkg> · Don't keep activities · ProcessLifecycleOwner untuk foreground/background
```

## Related Topics

- [Activity Lifecycle](/android/activity-lifecycle/)
- [ViewModel & Lifecycle-Aware Components](/android/viewmodel-lifecycle-aware/)
- [Performance & Memory Management](/android/performance-memory/)
