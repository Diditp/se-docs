---
title: "CPU & Network Profiling"
description: "Profiling CPU, rendering, dan jaringan pada aplikasi mobile: profile mode Flutter, frame budget 16 ms, UI vs raster thread, DevTools Performance & CPU Profiler, rebuild berlebih, compute/isolate, Android Studio CPU profiler & system trace, analisis request jaringan (waterfall, payload, jumlah request), dan network throttling."
level: advanced
status: complete
version: "Flutter DevTools · Android Studio Profiler · Perfetto — tampilan tool dapat berubah"
updated: 2026-11-13
tags: [performance, profiling, jank, devtools, network, isolate]
---

## Overview

**Profiling** adalah mengukur di mana waktu CPU, frame rendering, dan jaringan dihabiskan — sebelum mengoptimasi.
Aturan utamanya: **ukur dulu, jangan menebak**, dan ukur di **profile/release mode pada perangkat nyata**.

## Why It Matters

Jank (frame terlewat), UI beku, dan layar yang lambat memuat adalah keluhan performa paling umum. Interviewer sering
bertanya "bagaimana Anda menemukan penyebab aplikasi lag?".

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Frame budget | 60 Hz → ~16,7 ms per frame; 120 Hz → ~8,3 ms |
| UI thread (Flutter) | Menjalankan Dart: build, layout, logika |
| Raster thread | Menggambar layer ke GPU; lambat karena efek mahal (saveLayer, clip, shadow, opacity) |
| Jank | Frame melebihi budget sehingga terlewat |
| Profile mode | Build AOT dengan instrumentasi — angka mendekati release |
| Isolate/`compute` | Menjalankan kerja CPU berat di luar UI isolate |
| Network waterfall | Urutan & durasi request: DNS, koneksi, TLS, TTFB, download |

## How It Works

```text
Reproduksi skenario lambat di profile mode → rekam timeline → cari frame merah
→ tentukan thread (UI vs raster) → lihat CPU flame chart/event → temukan fungsi mahal
→ optimasi satu hal → ukur ulang dengan skenario sama → bandingkan angka
```

## Implementation

### Flutter: profile mode & DevTools

```bash
flutter run --profile             # perangkat nyata, bukan emulator untuk angka performa
# DevTools → Performance: frame chart (UI/raster), "Track widget builds", "Enhance tracing"
# DevTools → CPU Profiler: flame chart / bottom-up untuk fungsi termahal
```

### Kesalahan umum & perbaikannya

```dart
// ❌ Kerja berat di build / UI isolate
Widget build(BuildContext context) {
  final rows = jsonDecode(bigJson) as List;          // parsing 5 MB setiap rebuild
  ...
}

// ✅ Parsing di isolate terpisah, sekali, di data layer
final products = await Isolate.run(() => parseProducts(bigJson));
```

```dart
// ❌ Rebuild seluruh layar karena satu nilai berubah
BlocBuilder<CartCubit, CartState>(builder: (_, s) => WholeCheckoutPage(state: s));

// ✅ Rebuild hanya bagian yang berubah
BlocSelector<CartCubit, CartState, int>(selector: (s) => s.total, builder: (_, total) => TotalText(total));
```

| Gejala | Kemungkinan penyebab | Perbaikan |
| --- | --- | --- |
| UI thread merah | Parsing/kalkulasi berat, rebuild besar | Isolate, `const`, selector, pecah widget |
| Raster thread merah | `Opacity`/`ClipRRect`/shadow besar, saveLayer | `FadeTransition`, gambar pra-proses, kurangi efek |
| Jank saat scroll | List tanpa builder, gambar besar di-decode | `ListView.builder`, `cacheWidth`, `itemExtent` |
| Jank pertama kali animasi | Kompilasi shader | Impeller (default di versi baru) — cek versi Flutter |

### Android native

```text
Android Studio → Profiler → CPU: "System Trace" untuk frame & thread; "Java/Kotlin Method Trace" untuk fungsi
Perfetto (ui.perfetto.dev) untuk trace sistem lengkap
StrictMode di debug: deteksi disk/network di main thread
```

```kotlin
if (BuildConfig.DEBUG) StrictMode.setThreadPolicy(
    StrictMode.ThreadPolicy.Builder().detectDiskReads().detectDiskWrites().detectNetwork().penaltyLog().build()
)
```

### Profiling jaringan

```text
DevTools → Network (Flutter) / App Inspection → Network Inspector (Android)
Periksa: jumlah request per layar, ukuran payload, request serial yang bisa paralel,
TTFB lambat (backend) vs download lambat (payload/jaringan), request duplikat, tidak ada cache/kompresi
```

| Temuan | Perbaikan |
| --- | --- |
| 10 request saat buka dashboard | Endpoint agregasi (BFF) atau paralelkan |
| Payload 2 MB untuk list | Pagination, field selection, gzip/brotli |
| Request sama berulang | Cache HTTP (ETag), cache repository, dedup in-flight |
| TTFB 1,5 s | Profil backend/DB (lihat API & Database Performance) |

Uji kondisi nyata: throttling jaringan (emulator → Network: "3G"/latensi tinggi) dan perangkat kelas bawah.

## Best Practices

- **Profile/release mode di perangkat nyata**, bukan debug di emulator.
- **Satu perubahan per pengukuran**, catat angka sebelum/sesudah.
- **Jaga kerja berat keluar dari UI thread** (isolate, coroutine `Dispatchers.Default`).
- **Batasi rebuild** dengan `const`, selector, dan widget kecil.
- **Kurangi jumlah & ukuran request**.

## Anti-Patterns

- Mengoptimasi tanpa mengukur (micro-optimization yang tidak berdampak).
- Menilai performa di debug mode.
- `Isolate.run` untuk pekerjaan kecil (overhead lebih besar dari manfaat).
- Menambah `RepaintBoundary` di mana-mana tanpa bukti.

## Performance Considerations

Profiler sendiri menambah overhead — bandingkan relatif (sebelum vs sesudah) dengan kondisi sama. Untuk regresi
berkelanjutan, otomatiskan benchmark (mis. `integration_test` dengan `traceAction` atau Macrobenchmark di Android).

## Security Considerations

Network inspector dan log menampilkan header/body — jangan merekam/berbagi trace yang berisi token atau data pengguna
nyata, dan pastikan fitur inspeksi hanya aktif di build debug/profile internal.

## Real-World Use Cases

- Jank di daftar produk karena gambar 4000 px di-decode penuh → `cacheWidth` memperbaiki raster time.
- Dashboard lambat karena 8 request serial → satu endpoint ringkasan.
- Parsing laporan besar dipindah ke isolate sehingga UI tetap responsif.

## Interview Questions

1. Bagaimana Anda menemukan penyebab jank di aplikasi Flutter?
2. Apa beda UI thread dan raster thread di Flutter?
3. Mengapa tidak mengukur performa di debug mode?
4. Kapan memakai isolate?
5. Bagaimana menganalisis performa jaringan aplikasi?

## Sample Answers

1. Jalankan profile mode di perangkat nyata, rekam di DevTools Performance, cari frame melebihi budget, tentukan thread yang lambat, telusuri flame chart dan widget rebuild, perbaiki satu penyebab, ukur ulang.
2. UI thread menjalankan kode Dart (build, layout); raster thread mengubah layer tree menjadi piksel di GPU. Masalah di UI biasanya logika/rebuild, di raster biasanya efek grafis mahal.
3. Debug memakai JIT, assertion, dan service tambahan sehingga jauh lebih lambat dan tidak mewakili release.
4. Untuk kerja CPU berat yang dapat melebihi beberapa milidetik — parsing JSON besar, kompresi gambar, kriptografi, kalkulasi laporan — agar UI tidak beku.
5. Lihat jumlah, urutan, ukuran, dan durasi request (TTFB vs download) di network inspector, uji dengan throttling, lalu kurangi request, ukuran payload, dan manfaatkan cache.

## Practical Exercises

1. Rekam satu layar lambat di profile mode dan tulis laporan before/after.
2. Pindahkan parsing JSON besar ke `Isolate.run` dan ukur dampaknya.
3. Hitung jumlah request saat membuka layar utama dan rancang pengurangannya.

## Quick Reference

```text
Ukur dulu · profile mode · perangkat nyata · 16,7 ms/frame
UI thread: rebuild, parsing → const, selector, isolate · Raster: efek mahal → kurangi saveLayer/opacity/clip
Android: System Trace, Perfetto, StrictMode · Network: jumlah, ukuran, serial vs paralel, cache, TTFB
```

## Related Topics

- [Memory Leak Detection](/testing-performance/memory-leak-detection/)
- [Startup Optimization](/testing-performance/startup-optimization/)
- [API Performance](/testing-performance/api-performance/)
