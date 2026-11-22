---
title: "Design: Image Loading & Caching"
description: "Mobile system design image loader (seperti Glide/Coil/cached_network_image): requirement, pipeline (request → memory cache → disk cache → network → decode → transform → display), cache key & ukuran, LRU memori & disk, downsampling, request dedup & cancel saat scroll, prioritas, placeholder, CDN variant, invalidasi, dan upload gambar."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, mobile, image, caching, performance, cdn]
---

## Overview

Soal: **"Rancang library pemuat gambar untuk aplikasi mobile"** atau "bagaimana menampilkan ribuan gambar produk dengan
lancar". Gambar adalah penyebab terbesar masalah memori (OOM), jank saat scroll, dan pemborosan data. Desain yang baik
memakai **cache berlapis**, **decode sesuai ukuran tampilan**, dan **pembatalan request** yang tidak lagi dibutuhkan.

## Why It Matters

Walau Anda biasanya memakai library (Coil, Glide, `cached_network_image`), interviewer ingin tahu Anda memahami cara
kerjanya — dan pengetahuan ini dipakai saat men-debug memori dan scroll yang patah-patah.

## Core Concepts

| Komponen | Fungsi |
| --- | --- |
| Memory cache (LRU) | Bitmap ter-decode siap tampil — tercepat, terbatas (mis. sebagian memori app) |
| Disk cache (LRU) | Byte terkompresi hasil unduhan — bertahan antar sesi |
| Network fetcher | HTTP dengan caching header/ETag, dedup request yang sama |
| Decoder | Decode di background thread, **downsample** ke ukuran target |
| Transformer | Crop/rounded/blur — hasil di-cache dengan key berbeda |
| Request manager | Prioritas, pembatalan saat view didaur ulang/keluar layar |
| Cache key | URL + ukuran target + transformasi |

Perhitungan memori: gambar 1080×1080 ARGB = 1080 × 1080 × 4 byte ≈ **4,7 MB** — puluhan gambar seperti ini cukup untuk
OOM. Thumbnail 200×200 ≈ 160 KB.

## How It Works

```text
load(url, size=200x200, transform=circle)
 → key = hash(url|200x200|circle)
 → memory cache hit? → tampilkan (sinkron, tanpa flicker)
 → disk cache hit?   → decode di background (downsample) → simpan memory → tampilkan
 → network: dedup (request yang sama berbagi satu download) → simpan disk → decode → memory → tampilkan
 → view didaur ulang / keluar layar → batalkan request yang belum selesai
```

## Implementation

### Di Flutter: pakai dengan benar

```dart
CachedNetworkImage(
  imageUrl: product.thumbnailUrl,           // gunakan varian kecil dari CDN, bukan gambar asli
  memCacheWidth: 300,                        // decode sesuai ukuran tampilan (≈ lebar logis × devicePixelRatio)
  placeholder: (_, __) => const ColoredBox(color: Color(0xFFEFEFEF)),
  errorWidget: (_, __, ___) => const Icon(Icons.broken_image_outlined),
  fadeInDuration: const Duration(milliseconds: 150),
);

// Tanpa paket: Image.network(url, cacheWidth: 300) — decode lebih kecil; cache memori bawaan ImageCache
PaintingBinding.instance.imageCache.maximumSizeBytes = 100 << 20;   // atur batas bila perlu, ukur dulu
```

### Varian dari CDN

```text
https://cdn.example.com/products/p_123.jpg?w=400&format=webp     (image CDN/transformasi)
atau backend menyimpan beberapa ukuran saat upload: _200.webp, _400.webp, _1080.webp
Klien memilih varian berdasarkan ukuran widget × devicePixelRatio
```

### Desain library sendiri (garis besar)

```dart
class ImageLoader {
  final _memory = LruCache<String, ui.Image>(maxBytes: 64 << 20);
  final _inFlight = <String, Future<Uint8List>>{};          // dedup download

  Future<ui.Image> load(String url, {required int targetWidth}) async {
    final key = '$url|$targetWidth';
    final cached = _memory.get(key);
    if (cached != null) return cached;

    final bytes = await (await _disk.get(url)) ??
        await (_inFlight[url] ??= _download(url).whenComplete(() => _inFlight.remove(url)));
    final codec = await ui.instantiateImageCodec(bytes, targetWidth: targetWidth);   // downsample saat decode
    final image = (await codec.getNextFrame()).image;
    _memory.put(key, image, sizeBytes: image.width * image.height * 4);
    return image;
  }
}
```

### Invalidasi

| Strategi | Kapan |
| --- | --- |
| URL ber-versi (`p_123_v3.webp` atau `?v=hash`) | Paling sederhana & andal — gambar baru = URL baru |
| HTTP cache header + ETag | Server mengatur umur cache |
| Hapus manual | Logout (gambar privat), "kosongkan cache" di pengaturan |

### Upload gambar (arah sebaliknya)

```text
Ambil foto → kompres & resize di klien (mis. sisi panjang 1600px, JPEG/WebP kualitas ~80) → hapus metadata lokasi bila tidak perlu
→ presigned URL → upload (resumable/background bila besar) → server membuat varian ukuran
```

## Best Practices

- **Varian ukuran dari server/CDN** + **decode sesuai ukuran tampilan**.
- **Cache key mencakup ukuran & transformasi**.
- **Batalkan request** untuk item yang keluar layar; dedup request yang sama.
- **Placeholder dengan ukuran tetap** untuk mencegah layout shift.
- **URL ber-versi** untuk invalidasi yang mudah.
- **Bersihkan memory cache** saat peringatan memori.

## Anti-Patterns

- Memuat gambar resolusi asli untuk thumbnail.
- Decode di UI thread.
- Cache tanpa batas ukuran.
- Mengunggah foto kamera 12 MP mentah melalui jaringan seluler.
- Cache gambar privat (KTP, dokumen) tanpa dihapus saat logout.

## Performance Considerations

Ukur memori dengan DevTools/Android Profiler saat scroll katalog; targetkan tidak ada lonjakan memori berulang dan frame
time stabil. Format WebP/AVIF mengurangi ukuran unduhan; prefetch beberapa gambar berikutnya saat jaringan bagus.

## Security Considerations

Gambar privat (bukti transaksi, dokumen identitas) sebaiknya diakses dengan URL bertanda tangan berumur pendek, tidak
disimpan di cache publik/galeri, dan dihapus saat logout. Validasi tipe & ukuran file saat upload di server.

## Real-World Use Cases

- Katalog ribuan produk dengan thumbnail di aplikasi kasir.
- Foto bukti pekerjaan teknisi (upload terkompres, tampil thumbnail).
- Avatar pengguna dalam chat.

## Interview Questions

1. Jelaskan cara kerja image loader seperti Glide/Coil.
2. Mengapa perlu memory cache dan disk cache?
3. Bagaimana mencegah OOM saat menampilkan banyak gambar?
4. Bagaimana menangani gambar yang berubah di server?
5. Apa yang terjadi pada request gambar saat pengguna scroll cepat?

## Sample Answers

1. Request dengan key (URL+ukuran+transformasi) → cek memory cache → disk cache → network (dedup) → decode di background dengan downsampling → transformasi → simpan di cache → tampilkan; request dibatalkan bila view tidak lagi membutuhkan.
2. Memory cache menyimpan bitmap ter-decode untuk tampil instan; disk cache menyimpan byte terkompresi agar tidak mengunduh ulang antar sesi; keduanya LRU dengan batas ukuran.
3. Decode sesuai ukuran tampilan, varian kecil dari server, batas memory cache, membatalkan request di luar layar, dan membersihkan cache saat peringatan memori.
4. URL ber-versi (konten baru = URL baru) atau header cache/ETag dari server; hapus cache untuk konten privat saat logout.
5. Request untuk item yang sudah keluar layar dibatalkan atau diturunkan prioritasnya, sehingga bandwidth dan decode dipakai untuk item yang terlihat.

## Practical Exercises

1. Hitung memori yang dibutuhkan untuk 50 thumbnail 1080px vs 300px.
2. Terapkan `memCacheWidth`/`cacheWidth` di katalog Anda dan bandingkan memori.
3. Implementasikan kompres & resize sebelum upload foto.

## Quick Reference

```text
Key = URL + ukuran + transform · memory LRU (bitmap) → disk LRU (bytes) → network (dedup)
Decode di background + downsample ke ukuran tampilan · varian CDN · cancel di luar layar
Invalidasi: URL ber-versi / ETag · upload: kompres + resize + presigned URL · hapus cache privat saat logout
```

## Related Topics

- [Design: Feed & Infinite Scroll](/system-design/mobile/feed-infinite-scroll/)
- [Memory Management (Flutter)](/flutter/memory-management/)
- [Performance & Memory Management (Android)](/android/performance-memory/)
