---
title: "Rendering & Performance Optimization"
description: "Pipeline rendering Flutter (build, layout, paint, raster), cara membaca DevTools Performance, mengurangi rebuild dan operasi raster mahal, list besar, startup, dan ukuran app."
level: advanced
status: complete
version: "Flutter 3.x · Impeller"
updated: 2026-11-12
tags: [flutter, performance, rendering, jank, devtools, impeller]
---

## Overview

Flutter menggambar setiap frame sendiri. Agar halus di 60 Hz, satu frame harus selesai dalam **~16,7 ms** (8,3 ms di
120 Hz). Pekerjaan frame terbagi di dua thread utama:

- **UI thread** (Dart): build widget, layout, membuat *layer tree*.
- **Raster thread**: mengubah layer tree menjadi perintah GPU (Impeller di iOS dan Android modern).

**Jank** terjadi bila salah satu thread melewati anggaran waktu frame.

## Why It Matters

Aplikasi kasir yang tersendat saat scroll daftar produk atau saat menambah item ke keranjang terasa "lambat" walau
backend cepat. Performa juga memengaruhi baterai dan kesan kualitas — dan pertanyaan "bagaimana Anda mengatasi jank?"
hampir selalu muncul di interview Flutter.

## Core Concepts

| Fase | Thread | Penyebab lambat umum |
| --- | --- | --- |
| Build | UI | Subtree besar di-rebuild, logika berat di `build`, parsing di main isolate |
| Layout | UI | `IntrinsicHeight/Width`, nested scroll dengan `shrinkWrap`, layout berulang |
| Paint | UI | Banyak `CustomPaint` kompleks |
| Raster | Raster | `saveLayer` (Opacity/ShaderMask/ColorFilter di subtree besar), clip, blur, gambar besar |

Istilah lain: **const widget**, **RepaintBoundary** (memisahkan area repaint), **`shrinkWrap`**, **lazy list (slivers)**,
**shader compilation jank** (sebagian besar teratasi oleh Impeller), **profile mode**.

## How It Works

```text
vsync → [UI] build → layout → paint → layer tree ──► [Raster] composite → GPU → layar
setState di widget A → hanya Element A & turunannya di-rebuild (widget const / identik dilewati)
RenderObject yang tidak "dirty" tidak di-layout/paint ulang · RepaintBoundary memotong area repaint
```

## Implementation

### Langkah diagnosis yang benar

1. Jalankan **profile mode** di **device fisik**: `flutter run --profile`.
2. Buka DevTools → **Performance**; reproduksi interaksi yang jank.
3. Lihat frame merah: apakah **UI** atau **Raster** yang melebihi anggaran?
4. UI lambat → buka timeline/CPU profiler: fungsi apa yang mahal? Aktifkan **Track widget rebuilds**.
5. Raster lambat → cari `saveLayer`, clip, opacity, gambar besar (Performance overlay & "Highlight oversized images").
6. Perbaiki satu hal, ukur ulang.

### Kurangi rebuild

```dart
// ❌ setState di root halaman → seluruh halaman rebuild setiap detik
// ✅ isolasi bagian yang berubah ke widget kecil
class ShiftTimer extends StatefulWidget { const ShiftTimer({super.key}); ... }   // hanya ini yang rebuild

// ✅ BlocSelector: rebuild hanya saat total berubah
BlocSelector<CartBloc, CartState, int>(
  selector: (s) => s.total,
  builder: (_, total) => Text(total.rupiah),
);

// ✅ const untuk subtree statis
const SizedBox(height: 16);
const _CartHeader();
```

### List besar

```dart
// ✅ builder: hanya item yang terlihat yang dibangun
ListView.builder(
  itemCount: products.length,
  itemExtent: 72,                                  // tinggi tetap → layout & scroll lebih cepat
  itemBuilder: (_, i) => ProductTile(key: ValueKey(products[i].id), product: products[i]),
);

// ❌ Column(children: products.map(ProductTile.new).toList()) di dalam SingleChildScrollView
// ❌ ListView(shrinkWrap: true) di dalam ListView lain → gunakan CustomScrollView + SliverList
```

### Raster: hindari saveLayer yang tidak perlu

```dart
// ❌ Opacity pada subtree besar (memicu offscreen layer)
Opacity(opacity: 0.5, child: BigCard());
// ✅ beri warna transparan langsung, atau FadeTransition/AnimatedOpacity untuk animasi
Container(color: Colors.black.withValues(alpha: 0.5));

// ✅ Gambar: decode sesuai ukuran tampil
Image.network(url, width: 96, height: 96, cacheWidth: (96 * MediaQuery.devicePixelRatioOf(context)).round());

// ✅ RepaintBoundary untuk animasi terus-menerus agar tidak repaint seluruh layar
RepaintBoundary(child: LoadingSpinner());
```

### Kerja berat keluar dari UI thread

```dart
final report = await Isolate.run(() => buildDailyReport(rawRows));   // agregasi besar
```

Lebih baik lagi: lakukan agregasi di SQL (database lokal/server).

### Startup & ukuran app

```bash
flutter build apk --analyze-size --target-platform android-arm64    # rincian ukuran
flutter build appbundle --release --obfuscate --split-debug-info=build/symbols
```

- Tunda inisialisasi non-kritis (analytics, remote config fetch) setelah frame pertama: `WidgetsBinding.instance.addPostFrameCallback`.
- Kompres aset, gunakan WebP/SVG yang sesuai, hapus font/aset yang tidak dipakai; AAB membuat Play Store mengirim hanya resource yang dibutuhkan device.

:::caution[Version-dependent]
Impeller adalah renderer default di iOS dan di Android modern (dengan fallback pada device/driver tertentu). Karakteristik
performa raster dan dukungan beberapa efek berbeda antara Impeller dan Skia — selalu ukur di device target.
:::

## Best Practices

- **Ukur dulu, di profile mode, di device nyata** — debug mode jauh lebih lambat dan menyesatkan.
- **Push state down**: `setState` di widget sekecil mungkin; gunakan selector.
- **Widget class + `const`** dibanding helper method `_buildX()`.
- **Builder & slivers** untuk list; `itemExtent`/`prototypeItem` bila tinggi tetap.
- **Animasi dengan widget eksplisit/implisit** (`AnimatedBuilder` dengan `child`) agar subtree statis tidak rebuild.
- **Gambar sesuai ukuran tampil**, placeholder, cache.
- **Pindahkan komputasi ke isolate/SQL**.
- **Tetapkan anggaran performa** (mis. tidak ada frame > 16 ms pada scroll katalog di device acuan) dan cek sebelum rilis.

## Anti-Patterns

- Mengoptimasi tanpa profil ("katanya `const` membuat 10× lebih cepat").
- `shrinkWrap: true` pada list panjang.
- `Opacity`/`ClipRRect`/`BackdropFilter` di dalam item list yang banyak.
- `MediaQuery.of(context)` di banyak widget daun (memicu rebuild saat keyboard muncul) — gunakan `MediaQuery.sizeOf(context)`/`paddingOf` yang lebih spesifik.
- JSON parsing & sorting ribuan item di `build()`.

## Performance Considerations

Halaman ini sendiri tentang performa — ringkasan prioritas:

1. Pekerjaan yang tidak perlu (rebuild/layout berulang) → hilangkan.
2. Pekerjaan berat di UI thread → isolate/SQL.
3. Operasi raster mahal → ganti efek, RepaintBoundary, gambar kecil.
4. Startup → tunda inisialisasi, kurangi aset & dependency.

## Security Considerations

Optimasi tidak boleh mengorbankan keamanan: jangan menonaktifkan obfuscation demi startup, jangan cache data sensitif di
memori/disk tanpa perlindungan hanya untuk mempercepat tampilan.

## Real-World Use Cases

- **Katalog 5.000 produk**: `ListView.builder` + `itemExtent` + gambar `cacheWidth` + pencarian di SQL → scroll mulus di HP 3 GB.
- **Keranjang**: `BlocSelector` untuk total sehingga menambah item tidak me-rebuild seluruh daftar.
- **Laporan harian**: agregasi di Drift/SQL, bukan di Dart.

## Interview Questions

1. Jelaskan pipeline rendering Flutter.
2. Bagaimana Anda mendiagnosis jank?
3. Apa beda masalah UI thread dan raster thread?
4. Mengapa `const` dan widget kecil membantu performa?
5. Bagaimana menampilkan list ribuan item dengan efisien?

## Sample Answers

1. Saat vsync, UI thread menjalankan build (widget → element), layout (RenderObject menghitung ukuran/posisi), dan paint (membuat layer tree); raster thread mengomposisi layer tree menjadi perintah GPU. Frame harus selesai dalam ~16 ms di 60 Hz.
2. Profile mode di device nyata, DevTools Performance untuk melihat frame mana yang lambat dan di thread mana, CPU profiler/track rebuilds untuk UI, performance overlay & pengecekan saveLayer/gambar besar untuk raster; perbaiki dan ukur ulang.
3. UI thread lambat karena kode Dart: build berlebihan, layout mahal, komputasi berat. Raster lambat karena efek grafis mahal: saveLayer (opacity, shader mask), clip, blur, atau gambar besar.
4. Widget `const` di-canonicalize sehingga Flutter dapat melewati rebuild subtree tersebut; widget kecil membatasi cakupan rebuild hanya pada bagian yang berubah.
5. `ListView.builder`/`SliverList` agar hanya item terlihat yang dibangun, tinggi item tetap (`itemExtent`), key stabil, gambar di-decode kecil, pagination dari data source, dan filter/sort di database.

## Practical Exercises

1. Profil scroll daftar produk di device fisik; temukan dan perbaiki frame terlambat.
2. Aktifkan Track widget rebuilds, lalu kurangi rebuild halaman keranjang dengan selector.
3. Bandingkan memori & kelancaran list gambar dengan/tanpa `cacheWidth`.
4. Jalankan `--analyze-size` dan kurangi ukuran APK minimal 10%.

## Quick Reference

```text
Anggaran: 16,7 ms (60 Hz) · 8,3 ms (120 Hz) · ukur di --profile + device nyata
UI lambat → kurangi rebuild (const, widget kecil, selector), pindah komputasi ke isolate/SQL
Raster lambat → hindari Opacity/clip/blur di subtree besar, RepaintBoundary, gambar cacheWidth
List → builder/slivers + itemExtent + key · startup → tunda init non-kritis · --analyze-size
```

## Related Topics

- [Widget Lifecycle](/flutter/widget-lifecycle/)
- [Memory Management](/flutter/memory-management/)
- [Async Programming](/flutter/async-programming/)
- [CPU & Network Profiling](/testing-performance/cpu-network-profiling/)
- Referensi resmi: [Flutter performance best practices](https://docs.flutter.dev/perf/best-practices), [DevTools Performance view](https://docs.flutter.dev/tools/devtools/performance), [Impeller](https://docs.flutter.dev/perf/impeller).
