---
title: "Performance & Memory Management"
description: "Performa aplikasi Android: startup (cold/warm/hot, App Startup, Baseline Profiles), jank & rendering, ANR, memory leak & LeakCanary, bitmap & image loading, ukuran APK (R8, App Bundle), baterai & jaringan, alat ukur (Profiler, Perfetto, Macrobenchmark, Android vitals), serta padanannya di Flutter."
level: advanced
status: complete
version: "Android 8–15 · Jetpack Macrobenchmark/Baseline Profiles 1.2+"
updated: 2026-11-13
tags: [android, performance, memory, anr, startup, baseline-profiles]
---

## Overview

Performa Android mencakup **startup**, **kelancaran UI (jank)**, **responsivitas (ANR)**, **memori**, **ukuran
aplikasi**, serta **baterai & data**. Prinsipnya sama dengan Flutter: **ukur di perangkat nyata dan build release**,
temukan bottleneck terbesar, perbaiki, ukur ulang.

## Why It Matters

Google Play menampilkan dan memperhitungkan metrik kualitas (Android vitals: crash rate, ANR rate, dan lainnya) yang
dapat memengaruhi visibilitas aplikasi. Pengguna di perangkat kelas menengah–bawah (umum di Indonesia) paling merasakan
aplikasi yang lambat atau boros memori.

## Core Concepts

| Area | Metrik/gejala | Alat |
| --- | --- | --- |
| Startup | Time to initial display (TTID), time to full display (TTFD) | Macrobenchmark, `adb shell am start -W`, Logcat "Displayed" |
| Jank | Frame melewati batas (≈16 ms @60 Hz) | Perfetto/System Trace, JankStats, Layout Inspector (recomposition) |
| ANR | Main thread terblokir (±5 detik untuk input) | Android vitals, StrictMode, trace |
| Memory | Leak, OOM, GC berlebihan | Memory Profiler, LeakCanary, heap dump |
| Ukuran | Unduhan & instal | APK Analyzer, App Bundle, R8 |
| Baterai/jaringan | Wake lock, job berlebih, request kecil berulang | Battery Historian/Energy profiler, Network Inspector |

### Jenis start

| Jenis | Kondisi | Biaya |
| --- | --- | --- |
| Cold | Proses belum ada | Tertinggi: buat proses + Application + Activity |
| Warm | Proses ada, Activity dibuat ulang | Sedang |
| Hot | Activity masih di memori, dibawa ke depan | Terendah |

## How It Works

```text
Cold start: fork Zygote → buat proses → Application.onCreate → Activity.onCreate → layout/compose → frame pertama
JIT vs AOT: Baseline Profile memberi tahu ART kode mana yang di-precompile → startup & jank lebih baik
Memory leak: objek berumur panjang memegang referensi ke Activity/View → GC tidak bisa membebaskan → OOM
```

## Implementation

### Mengukur startup dengan Macrobenchmark

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule val rule = MacrobenchmarkRule()
    @Test fun coldStartup() = rule.measureRepeated(
        packageName = "com.example.pos",
        metrics = listOf(StartupTimingMetric()),
        iterations = 5,
        startupMode = StartupMode.COLD,
    ) { pressHome(); startActivityAndWait() }
}
```

### Baseline Profile

```kotlin
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule val rule = BaselineProfileRule()
    @Test fun generate() = rule.collect("com.example.pos") {
        pressHome(); startActivityAndWait()
        device.findObject(By.text("Penjualan")).click()       // jalur kritis pengguna
        device.waitForIdle()
    }
}
```

### Menunda inisialisasi

```kotlin
// ❌ semua SDK diinisialisasi sinkron di Application.onCreate
// ✅ tunda yang tidak perlu untuk frame pertama
class PosApp : Application() {
    override fun onCreate() {
        super.onCreate()
        initCrashReporting()                                  // perlu sejak awal
        ProcessLifecycleOwner.get().lifecycleScope.launch(Dispatchers.Default) {
            initAnalytics(); warmUpImageCache()               // tidak memblokir startup
        }
    }
}
```

### Mencegah ANR: StrictMode di debug

```kotlin
if (BuildConfig.DEBUG) {
    StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder().detectDiskReads().detectDiskWrites().detectNetwork().penaltyLog().build())
    StrictMode.setVmPolicy(StrictMode.VmPolicy.Builder().detectLeakedClosableObjects().detectActivityLeaks().penaltyLog().build())
}
```

### Memory leak umum & perbaikan

```kotlin
// ❌ singleton memegang Activity
object Printer { var context: Context? = null }
Printer.context = this                                       // Activity bocor

// ✅ gunakan applicationContext dan lepas listener sesuai lifecycle
class PrinterManager @Inject constructor(@ApplicationContext private val ctx: Context)

// LeakCanary: cukup tambahkan sebagai debugImplementation — otomatis mendeteksi Activity/Fragment/ViewModel bocor
```

### Gambar

```kotlin
// Coil (Compose): ukuran sesuai tampilan, cache memori & disk
AsyncImage(
    model = ImageRequest.Builder(LocalContext.current).data(product.imageUrl).size(300).crossfade(true).build(),
    contentDescription = product.name,
)
```

### Ukuran aplikasi

```text
- Publikasikan Android App Bundle (AAB) → APK dipecah per ABI/density/bahasa
- isMinifyEnabled + isShrinkResources (R8)
- WebP/vector drawable, hapus resource & dependensi tak terpakai
- Periksa dengan Build > Analyze APK
```

### Padanan Flutter

| Android | Flutter |
| --- | --- |
| Macrobenchmark/Baseline Profile | `flutter run --profile`, DevTools, integration_test + timeline |
| LeakCanary | DevTools Memory, `leak_tracker` |
| Coil/Glide | `cached_network_image`, `cacheWidth` |
| R8 + App Bundle | `--obfuscate --split-debug-info`, `--split-per-abi`, AAB |

## Best Practices

- **Ukur di build release (atau benchmark) pada perangkat kelas bawah**.
- **Main thread hanya untuk UI**; I/O & komputasi di dispatcher background.
- **Startup ramping**: inisialisasi lazy, App Startup, Baseline Profile.
- **Gambar sesuai ukuran tampilan** dengan library caching.
- **LeakCanary di debug** dan perbaiki setiap leak.
- **Pantau Android vitals** dan tetapkan anggaran (startup, ukuran, crash/ANR rate).

## Anti-Patterns

- Mengukur performa di build debug.
- `runBlocking`/akses disk/jaringan di main thread.
- Decode bitmap resolusi penuh untuk thumbnail.
- Static reference ke Context/View.
- Optimasi mikro tanpa profiling.

## Performance Considerations

Halaman ini sendiri tentang performa. Prioritas umum: (1) ANR & crash, (2) startup, (3) jank di layar utama, (4) memori,
(5) ukuran. Perbaiki yang paling berdampak pada pengguna terlebih dahulu berdasarkan data production.

## Security Considerations

Heap dump dan trace dapat berisi data sensitif (token, data pribadi) — jangan dibagikan sembarangan dan jangan aktifkan
alat profiling/debuggable di build release.

## Real-World Use Cases

- Mempercepat cold start aplikasi kasir dari layar putih lama menjadi cepat dengan inisialisasi lazy + Baseline Profile.
- Memperbaiki OOM di galeri foto inspeksi dengan downsampling & cache.
- Menurunkan ANR karena query database di main thread.

## Interview Questions

1. Apa itu ANR dan cara mencegahnya?
2. Bagaimana mengukur dan mempercepat startup?
3. Apa itu memory leak di Android dan contoh penyebabnya?
4. Apa itu Baseline Profile?
5. Bagaimana mengurangi ukuran APK?
6. Bagaimana mendiagnosis jank?

## Sample Answers

1. Application Not Responding — main thread terblokir terlalu lama (mis. ±5 detik untuk input). Cegah dengan memindahkan I/O dan komputasi ke background, menghindari lock di main thread, dan memantau dengan StrictMode serta Android vitals.
2. Ukur TTID/TTFD dengan Macrobenchmark atau `am start -W`, lalu kurangi kerja di Application/Activity onCreate (lazy init, App Startup), sederhanakan layout awal, dan tambahkan Baseline Profile.
3. Objek yang tidak lagi dibutuhkan tetap dirujuk sehingga tidak bisa di-GC, mis. singleton/static yang memegang Activity, listener tidak dilepas, coroutine/thread yang hidup lebih lama dari layar, binding fragment tidak di-null-kan.
4. Daftar kelas/method penting yang dikirim bersama aplikasi agar ART melakukan kompilasi AOT untuk jalur tersebut sejak instalasi, sehingga startup dan interaksi awal lebih cepat dan jank berkurang.
5. App Bundle, R8 minify + shrinkResources, format gambar efisien (WebP/vector), hapus dependensi/resource tak terpakai, analisis dengan APK Analyzer.
6. Rekam System Trace/Perfetto atau gunakan JankStats, cari frame panjang di main/render thread, periksa recomposition berlebih (Compose) atau layout bertingkat (View), pindahkan kerja berat ke background, ukur ulang.

## Practical Exercises

1. Tambahkan Macrobenchmark startup dan Baseline Profile ke aplikasi sampel; bandingkan hasilnya.
2. Pasang LeakCanary, temukan dan perbaiki satu leak.
3. Analisis APK Anda dan kurangi ukurannya minimal 10%.

## Quick Reference

```text
Ukur: release + perangkat low-end · Macrobenchmark · Perfetto · Profiler · Android vitals
Startup: lazy init · App Startup · Baseline Profile · ANR: main thread bebas I/O · StrictMode (debug)
Memory: LeakCanary · applicationContext · lepas listener · gambar sesuai ukuran (Coil/Glide)
Ukuran: AAB · R8 minify + shrinkResources · WebP/vector
```

## Related Topics

- [Rendering & Performance (Flutter)](/flutter/rendering-performance/)
- [Memory Management (Flutter)](/flutter/memory-management/)
- [Debugging & Performance Questions](/interview/technical/debugging-performance/)
