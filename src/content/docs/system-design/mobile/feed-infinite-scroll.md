---
title: "Design: Feed & Infinite Scroll"
description: "Mobile system design: feed dengan infinite scroll (katalog produk, timeline, berita) — requirement, API cursor pagination, arsitektur klien, cache lokal & offline, prefetch, item baru di atas, pembaruan item (like/stok), gambar, performa list di Flutter, error & retry, dan metrik."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, mobile, feed, pagination, caching, flutter]
---

## Overview

Soal: **"Rancang feed seperti katalog produk atau timeline dengan infinite scroll."** Tantangannya: memuat data bertahap
dengan mulus, tetap cepat di perangkat kelas bawah, bekerja saat jaringan buruk, dan menangani data yang berubah
(item baru, harga/stok berubah, item dihapus).

## Why It Matters

Hampir semua aplikasi punya daftar panjang: produk, transaksi, notifikasi, tiket. Pola ini paling sering muncul di
mobile system design interview e-commerce/tech.

## Core Concepts

| Requirement | Contoh |
| --- | --- |
| Fungsional | Daftar item, scroll tak terbatas, pull-to-refresh, buka detail, aksi (like/tambah ke keranjang) |
| Non-fungsional | Scroll 60 fps, first content cepat, hemat data, tetap tampil saat offline (cache), tidak duplikat/terlewat |

| Keputusan | Pilihan | Alasan |
| --- | --- | --- |
| Pagination | **Cursor/keyset** | Stabil saat item baru masuk; offset menyebabkan duplikat/terlewat |
| SSOT | DB lokal (cache halaman) | Offline, restore cepat, satu sumber untuk list & detail |
| Item baru | Banner "Ada N item baru" | Tidak menggeser posisi scroll pengguna |
| Gambar | Thumbnail ukuran tampilan + cache | Memori & data |
| Prefetch | Muat halaman berikut saat tersisa ~N item | Scroll mulus |

## How It Works

```text
Buka layar → tampilkan cache lokal (bila ada) → request halaman pertama (cursor=null) → simpan → UI dari DB
Scroll mendekati akhir → request next_cursor → append ke DB → UI
Pull-to-refresh → request terbaru → ganti halaman pertama (atau gabungkan) → reset cursor
Aksi (tambah ke keranjang) → optimistic update di DB → API → rollback bila gagal
```

## Implementation

### Kontrak API

```http
GET /v1/feed?cursor=eyJ0IjoiMjAyNi0xMS0xM1QwMToyMDowMFoiLCJpZCI6IjEyMyJ9&limit=20
→ 200 {
  "items": [{ "id": "p_123", "title": "Kopi Susu", "price": 18000, "imageUrl": "https://cdn/.../p_123_400.webp", "updatedAt": "..." }],
  "nextCursor": "eyJ0Ijo...",       // null bila habis
  "hasMore": true
}
GET /v1/feed/updates?since=<timestamp>   → item yang berubah/dihapus (opsional, untuk menyegarkan cache)
```

### State & paging di Flutter (Bloc ringkas)

```dart
class FeedState {
  const FeedState({this.items = const [], this.nextCursor, this.isLoadingMore = false, this.hasMore = true, this.error});
  final List<FeedItem> items;
  final String? nextCursor;
  final bool isLoadingMore;
  final bool hasMore;
  final String? error;
  FeedState copyWith({List<FeedItem>? items, String? nextCursor, bool? isLoadingMore, bool? hasMore, String? error}) =>
      FeedState(items: items ?? this.items, nextCursor: nextCursor ?? this.nextCursor,
          isLoadingMore: isLoadingMore ?? this.isLoadingMore, hasMore: hasMore ?? this.hasMore, error: error);
}

class FeedCubit extends Cubit<FeedState> {
  FeedCubit(this._repo) : super(const FeedState());
  final FeedRepository _repo;

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore) return;            // cegah request ganda
    emit(state.copyWith(isLoadingMore: true, error: null));
    final result = await _repo.fetchPage(cursor: state.nextCursor);
    result.when(
      ok: (page) => emit(state.copyWith(
        items: [...state.items, ...page.items.where((i) => !state.items.any((e) => e.id == i.id))], // dedup
        nextCursor: page.nextCursor, hasMore: page.hasMore, isLoadingMore: false)),
      err: (f) => emit(state.copyWith(isLoadingMore: false, error: f.message)),   // tampilkan tombol "Coba lagi" di footer
    );
  }
}
```

*(Untuk daftar sangat panjang, simpan dedup sebagai `Set<String>` id agar O(1); contoh di atas dibuat ringkas.)*

### List yang efisien

```dart
ListView.builder(
  controller: _scroll,                       // listener: bila extentAfter < 600 → cubit.loadMore()
  itemCount: state.items.length + 1,         // +1 untuk footer (loading/error/selesai)
  itemBuilder: (context, i) {
    if (i == state.items.length) return FeedFooter(state: state, onRetry: cubit.loadMore);
    final item = state.items[i];
    return FeedTile(key: ValueKey(item.id), item: item);   // const/stateless, gambar dengan cacheWidth
  },
);
```

### Caching & offline

```text
Tabel feed_items(id, payload, sort_key, page_cursor, cached_at)
- Buka layar: tampilkan cache segera (tandai "terakhir diperbarui 10 menit lalu")
- Refresh sukses: ganti halaman pertama, pertahankan maksimal N item (mis. 500) → hapus sisanya
- Item dihapus/berubah: endpoint updates atau ETag per halaman
```

### Pembaruan item & optimistic UI

```text
Tap "Tambah ke keranjang" → update lokal (badge, tombol) → POST /cart (Idempotency-Key)
  sukses → konfirmasi · gagal → rollback + snackbar "Gagal, coba lagi"
Harga/stok berubah → detail selalu mengambil data terbaru; checkout memvalidasi ulang di server
```

## Best Practices

- **Cursor pagination + dedup by id**.
- **Prefetch** sebelum mencapai akhir; satu request in-flight.
- **Footer state** (loading, error + retry, akhir daftar).
- **Cache halaman pertama** untuk tampilan instan dan offline.
- **Thumbnail sesuai ukuran** dari CDN (variasi lebar) + cache memori/disk.
- **Banner "item baru"** alih-alih menggeser scroll.

## Anti-Patterns

- Offset pagination untuk feed yang berubah cepat.
- Memuat semua item sekaligus.
- `ListView(children: [...])` untuk ratusan item.
- Gambar resolusi penuh di thumbnail.
- Banyak request paralel untuk halaman yang sama saat scroll cepat.

## Performance Considerations

Gunakan builder/sliver, item ringan (const, tanpa layout bertingkat berlebihan), key stabil, decode gambar sesuai ukuran,
batasi jumlah item di memori (windowing/trim cache), dan ukur dengan DevTools (frame time) di perangkat kelas bawah.

## Security Considerations

Endpoint feed tetap butuh otorisasi bila konten personal; jangan menyimpan data sensitif di cache tanpa enkripsi; validasi
URL gambar/link dari server sebelum dibuka; rate limit di server untuk mencegah scraping berlebihan.

## Real-World Use Cases

- Katalog produk e-commerce/POS dengan ribuan item.
- Riwayat transaksi dengan filter tanggal.
- Timeline notifikasi atau berita internal perusahaan.

## Interview Questions

1. Offset vs cursor pagination untuk feed?
2. Bagaimana mencegah duplikat saat infinite scroll?
3. Bagaimana menampilkan feed saat offline?
4. Bagaimana menangani item baru tanpa mengganggu scroll?
5. Bagaimana menjaga scroll tetap 60 fps?

## Sample Answers

1. Cursor: stabil karena memakai posisi item terakhir, tidak terpengaruh item baru, dan efisien di database; offset bisa menghasilkan duplikat/terlewat saat data berubah dan lambat di halaman jauh.
2. Cursor pagination, dedup berdasarkan id saat append, dan hanya satu request load-more yang berjalan pada satu waktu.
3. Simpan halaman yang sudah dimuat di DB lokal sebagai SSOT; tampilkan cache dengan indikator waktu, lalu segarkan saat online.
4. Cek item baru (polling ringan/push), tampilkan banner "N item baru"; saat ditekan, scroll ke atas dan sisipkan.
5. List builder dengan item ringan dan key stabil, gambar ukuran tampilan + cache, prefetch, kerja berat di isolate, dan profiling di perangkat nyata.

## Practical Exercises

1. Implementasikan feed dengan cursor pagination, footer retry, dan pull-to-refresh.
2. Tambahkan cache halaman pertama di Drift dan uji mode pesawat.
3. Ukur frame time feed 1.000 item di perangkat kelas bawah dan optimalkan.

## Quick Reference

```text
Cursor pagination · nextCursor/hasMore · dedup id · satu request in-flight · prefetch
DB lokal sebagai SSOT · cache halaman pertama · trim cache · banner item baru
ListView.builder + key · thumbnail sesuai ukuran · optimistic update + rollback · footer state
```

## Related Topics

- [Framework Mobile System Design](/system-design/mobile/framework/)
- [Design: Image Loading & Caching](/system-design/mobile/image-loading-caching/)
- [Rendering & Performance (Flutter)](/flutter/rendering-performance/)
