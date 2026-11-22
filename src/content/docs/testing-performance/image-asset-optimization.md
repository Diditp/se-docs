---
title: "Image & Asset Optimization"
description: "Optimasi gambar dan aset di aplikasi mobile: format (WebP, AVIF, PNG, SVG/vector), ukuran decode (cacheWidth), resolusi aset 1x/2x/3x, cached_network_image, CDN resize, placeholder & progressive loading, kompresi sebelum upload, font subset, dan ukuran bundle."
level: intermediate
status: complete
updated: 2026-11-13
tags: [performance, image, asset, cdn, app-size]
---

## Overview

Gambar biasanya adalah **sumber terbesar** penggunaan memori, bandwidth, dan ukuran aplikasi. Optimasi gambar mencakup
format, ukuran file, ukuran decode di memori, caching, dan cara memuatnya.

## Why It Matters

Foto produk 4000×3000 yang ditampilkan sebagai thumbnail 80×80 tetap memakan ~48 MB memori setelah di-decode
(4000×3000×4 byte). Puluhan thumbnail seperti itu cukup untuk jank dan OOM di perangkat murah, serta menghabiskan kuota
data pengguna.

## Core Concepts

| Format | Cocok untuk | Catatan |
| --- | --- | --- |
| WebP | Foto & ilustrasi, lossy/lossless, transparansi | Didukung luas; biasanya jauh lebih kecil dari JPEG/PNG |
| AVIF | Foto, kompresi lebih baik | Dukungan decode perangkat lama terbatas — cek target OS |
| JPEG | Foto (kompatibilitas) | Tanpa transparansi |
| PNG | Grafis dengan transparansi/teks tajam | Besar untuk foto |
| SVG / Vector Drawable | Ikon, logo sederhana | Skalabel; render SVG kompleks bisa mahal |

| Konsep | Penjelasan |
| --- | --- |
| Ukuran file | Memengaruhi download & ukuran app |
| Ukuran decode | Lebar × tinggi × 4 byte di memori — **yang menentukan memori** |
| Device pixel ratio | Aset 1x/2x/3x agar tajam tanpa berlebihan |

## How It Works

```text
URL → cache disk? → (tidak) download → simpan disk → decode ke ukuran target → image cache memori → GPU
Optimasi di setiap tahap: ukuran file kecil (CDN/format), decode sesuai ukuran tampil, cache yang dibatasi
```

## Implementation

### Decode sesuai ukuran tampil

```dart
LayoutBuilder(builder: (context, c) {
  final dpr = MediaQuery.devicePixelRatioOf(context);
  return Image.network(
    product.imageUrl,
    cacheWidth: (c.maxWidth * dpr).round(),          // decode hanya sebesar yang ditampilkan
    fit: BoxFit.cover,
  );
});
```

### Cache gambar jaringan

```dart
CachedNetworkImage(
  imageUrl: cdnUrl(product.imageUrl, width: 160),
  memCacheWidth: 320,
  placeholder: (_, __) => const ColoredBox(color: Color(0xFFEEEEEE)),
  errorWidget: (_, __, ___) => const Icon(Icons.image_not_supported),
);
```

### CDN/image service melakukan resize

```dart
String cdnUrl(String path, {required int width}) =>
    'https://img.example.com/$path?w=$width&format=webp&q=75';   // contoh pola; sesuaikan layanan Anda
```

Server mengirim ukuran yang tepat sehingga hemat bandwidth dan memori sekaligus.

### Aset lokal dengan resolusi

```yaml
# pubspec.yaml
flutter:
  assets:
    - assets/images/          # berisi logo.webp, 2.0x/logo.webp, 3.0x/logo.webp
```

### Kompres sebelum upload (foto bukti, KTP, dll.)

```dart
final bytes = await FlutterImageCompress.compressWithFile(
  file.path, minWidth: 1280, minHeight: 1280, quality: 75, format: CompressFormat.webp,
);
// Jalankan di luar UI thread bila berat; hapus EXIF lokasi bila tidak dibutuhkan
```

### Daftar list yang efisien

```text
ListView.builder/GridView.builder · thumbnail kecil · precacheImage untuk gambar berikutnya (hemat)
Hindari Opacity di atas gambar (pakai FadeInImage/FadeTransition)
```

### Ukuran aplikasi

```bash
flutter build appbundle --analyze-size --target-platform android-arm64
```

- Konversi PNG besar ke WebP, hapus aset yang tidak dipakai.
- Font: sertakan hanya weight yang dipakai; pertimbangkan subset.
- Animasi Lottie/Rive lebih kecil dari GIF/video untuk animasi UI.
- Aset besar yang jarang dipakai bisa diunduh saat dibutuhkan.

## Best Practices

- **Decode sesuai ukuran tampil** (`cacheWidth`/`memCacheWidth`).
- **Minta ukuran yang tepat dari server/CDN** dalam format modern.
- **Cache disk & memori dengan batas**.
- **Placeholder & error widget** untuk UX jaringan lambat.
- **Kompres foto sebelum upload**.
- **Audit ukuran app** di setiap rilis.

## Anti-Patterns

- Menampilkan foto kamera asli sebagai thumbnail.
- `Image.network` tanpa cache untuk list besar.
- Menyimpan base64 gambar di database/JSON API.
- GIF besar untuk animasi UI.
- Aset 3x saja untuk semua perangkat tanpa variasi (tetap di-decode besar).

## Performance Considerations

Decode gambar terjadi di thread terpisah, tetapi memori dan upload tekstur ke GPU tetap memengaruhi frame. Batasi ukuran
`imageCache` sesuai kebutuhan dan uji scroll list bergambar di perangkat low-end dengan DevTools Memory & Performance.

## Security Considerations

Hapus metadata EXIF (lokasi GPS) dari foto yang diunggah bila tidak diperlukan; gunakan URL bertanda tangan
(signed URL) dengan masa berlaku untuk gambar pribadi (dokumen identitas) dan jangan cache gambar sensitif di lokasi
publik/galeri.

## Real-World Use Cases

- Katalog 500 produk: thumbnail WebP 160 px dari CDN + `memCacheWidth` → memori stabil saat scroll.
- Kurir mengunggah foto bukti 300 KB alih-alih 5 MB → upload sukses di sinyal lemah.

## Interview Questions

1. Mengapa gambar besar menyebabkan OOM walau file-nya kecil?
2. Bagaimana mengoptimasi gambar di list Flutter?
3. Format gambar apa yang Anda pilih dan mengapa?
4. Bagaimana mengurangi ukuran aplikasi?

## Sample Answers

1. Memori ditentukan ukuran decode (lebar × tinggi × 4 byte), bukan ukuran file terkompresi; JPEG 500 KB bisa menjadi puluhan MB setelah di-decode.
2. Builder list, thumbnail dari server sesuai ukuran, `cacheWidth`/`memCacheWidth`, cache disk/memori, placeholder, dan hindari efek mahal di atas gambar.
3. WebP untuk sebagian besar foto/ilustrasi, vector untuk ikon, PNG untuk grafis yang butuh lossless bila WebP tidak cocok, AVIF bila target perangkat mendukung.
4. App Bundle per ABI, kompres/konversi aset, hapus aset & dependency tak terpakai, subset font, unduh aset besar sesuai kebutuhan, dan analisis dengan `--analyze-size`.

## Practical Exercises

1. Ukur memori list gambar sebelum/sesudah `cacheWidth`.
2. Konversi aset PNG ke WebP dan bandingkan ukuran app.
3. Implementasikan kompresi foto sebelum upload dengan penghapusan EXIF.

## Quick Reference

```text
Memori = W × H × 4 byte · cacheWidth/memCacheWidth · CDN ?w=&format=webp
WebP default · vector untuk ikon · 1x/2x/3x · cached_network_image · placeholder/error
Kompres sebelum upload · hapus EXIF · --analyze-size · font subset
```

## Related Topics

- [Memory Leak Detection](/testing-performance/memory-leak-detection/)
- [Image Loading & Caching (System Design)](/system-design/mobile/image-loading-caching/)
- [Startup Optimization](/testing-performance/startup-optimization/)
