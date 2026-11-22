---
title: "Caching Strategy"
description: "Strategi caching di level desain sistem: lapisan cache dari perangkat mobile sampai database, pola baca/tulis (cache-aside, read-through, write-through, write-back), invalidasi (TTL, event-driven, versioned key), konsistensi & staleness yang dapat diterima, eviction, hot key, cache stampede, estimasi kapasitas, dan cara membahas caching dalam interview system design."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, caching, cdn, redis, consistency]
---

## Overview

Di level system design, caching bukan sekadar "pakai Redis". Pertanyaannya adalah: **data apa** yang di-cache, **di
lapisan mana**, **berapa lama boleh basi**, dan **bagaimana cache diperbarui** saat data berubah. Halaman ini membahas
keputusan arsitekturnya. Implementasi Redis di Node.js ada di [Caching (Redis)](/backend/caching/).

## Why It Matters

Hampir setiap soal system design (feed, katalog, URL shortener, chat) menyentuh caching. Interviewer menilai apakah Anda
memahami trade-off antara **latensi, beban, biaya, dan konsistensi**, bukan apakah Anda hafal perintah Redis.

## Core Concepts

### Lapisan cache sepanjang jalur request

```text
[Perangkat]          memori → DB lokal (Drift/Room) → HTTP cache
      ↓
[Edge/CDN]           aset statis, gambar, respons publik
      ↓
[API Gateway/LB]     respons GET publik (jarang)
      ↓
[Aplikasi]           in-process LRU (per instance) → Redis/Memcached (bersama)
      ↓
[Database]           buffer pool, read replica, materialized view
```

Semakin dekat ke pengguna, semakin cepat dan murah, tetapi semakin sulit diinvalidasi.

### Pola baca & tulis

| Pola | Alur | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| Cache-aside | App cek cache → miss → DB → isi cache | Sederhana, cache opsional | Miss pertama lambat. App mengelola invalidasi |
| Read-through | Cache layer yang memuat dari DB | Logika muat terpusat | Butuh library/layanan yang mendukung |
| Write-through | Tulis ke cache dan DB sinkron | Cache selalu segar setelah tulis | Latensi tulis naik. Data jarang dibaca ikut di-cache |
| Write-back (write-behind) | Tulis ke cache, DB menyusul | Tulis sangat cepat | Risiko kehilangan data bila cache gagal |
| Write-around | Tulis ke DB saja, cache diisi saat dibaca | Cache tidak tercemar data jarang dibaca | Baca pertama setelah tulis miss |

### Invalidasi

| Strategi | Cara | Cocok untuk |
| --- | --- | --- |
| TTL | Kedaluwarsa otomatis | Data yang boleh basi beberapa detik–menit |
| Explicit delete | Hapus key setelah commit | Perubahan yang harus terlihat cepat |
| Versioned key | `menu:{outlet}:v{n}`, naikkan `n` saat berubah | Agregat besar, banyak key turunan |
| Event-driven | Event/CDC dari DB → konsumen menghapus/memperbarui cache | Banyak layanan, banyak cache |
| Klien: ETag / delta sync | Klien bertanya "ada yang berubah sejak X?" | Data katalog di perangkat mobile |

### Konsistensi

```text
Pertanyaan kunci: "Berapa lama data ini boleh basi?"
- Harga di katalog: 1–5 menit OK, asalkan checkout memvalidasi harga di server
- Stok saat checkout: 0 detik → jangan dari cache, pakai transaksi DB
- Profil pengguna: beberapa menit OK, kecuali tepat setelah pengguna mengubahnya (read-your-writes)
```

### Eviction & hot key

| Konsep | Penjelasan |
| --- | --- |
| LRU / LFU | Buang yang paling lama tidak dipakai / paling jarang dipakai saat memori penuh |
| Hot key | Satu key dibaca sangat sering (promo viral) → satu node Redis kewalahan |
| Mitigasi hot key | Cache lokal in-process dengan TTL pendek, replikasi key (`key#1..n`), CDN |
| Stampede | Banyak miss bersamaan saat key kedaluwarsa → lock single-flight, stale-while-revalidate, jitter |

## How It Works

Cara menentukan strategi untuk satu jenis data:

```text
1. Pola akses: rasio baca:tulis, ukuran, jumlah key, data publik atau per pengguna
2. Toleransi basi (staleness budget) per jenis data
3. Pilih lapisan (klien / CDN / Redis / replica)
4. Pilih pola tulis & invalidasi
5. Estimasi ukuran memori & hit rate
6. Rencanakan kegagalan: cache down → fallback ke DB dengan proteksi (rate limit, circuit breaker)
```

## Implementation

### Studi kasus: katalog menu untuk 50.000 perangkat kasir

```text
Kebutuhan: 5.000 outlet × rata-rata 10 perangkat. Menu ~300 item (~150 KB JSON). Menu berubah beberapa kali sehari.
Jam buka (07.00) semua perangkat membuka aplikasi.

Desain:
- Perangkat: menu disimpan di DB lokal → aplikasi tetap bisa jualan saat offline
- Sinkron: GET /menu dengan If-None-Match (ETag = versi menu outlet) → mayoritas 304 tanpa body
- Server: Redis cache-aside key menu:{outlet}:v{n}, TTL 1 jam + jitter
- Perubahan menu: tulis DB → INCR menu-ver:{outlet} → (opsional) push "menu_changed" ke perangkat outlet
- Gambar produk: CDN dengan nama file berhash, Cache-Control immutable
- Checkout: harga & ketersediaan divalidasi ulang di server dari DB, bukan cache

Estimasi Redis: 5.000 outlet × 150 KB ≈ 750 MB (plus overhead) → satu node dengan replica, atau kompres payload
Lonjakan 07.00: 50.000 request dalam ~10 menit ≈ 83 rps rata-rata, puncak beberapa ratus rps → mayoritas 304/hit
```

### Read-your-writes setelah pengguna mengubah data

```text
Opsi: (a) hapus/perbarui cache setelah commit sebelum merespons
      (b) klien memakai respons mutation untuk memperbarui state lokal (tanpa menunggu cache)
      (c) baca dari primary (bukan replica/cache) untuk pengguna tersebut selama beberapa detik
```

### Cara membahas di interview

```text
"Untuk endpoint X yang read-heavy (100:1), saya pakai cache-aside di Redis dengan TTL 5 menit karena
data boleh basi beberapa menit. Saat admin mengubah data, saya naikkan versi key setelah commit.
Untuk hot key saya tambahkan cache lokal 10 detik. Bila Redis down, request jatuh ke DB dengan
rate limit agar DB tidak runtuh. Stok tidak di-cache karena harus akurat."
```

## Best Practices

- **Tentukan staleness budget per jenis data** sebelum memilih teknologi.
- **Cache sedekat mungkin dengan pengguna** untuk data publik/statis (CDN, perangkat).
- **TTL selalu ada**, invalidasi eksplisit untuk perubahan penting.
- **Data kritis (uang, stok) divalidasi di sumber kebenaran**.
- **Rencanakan kegagalan cache** dan cold start (warm-up bertahap).
- **Ukur hit rate dan latensi** sebelum dan sesudah.

## Anti-Patterns

- "Tambahkan Redis" sebagai jawaban untuk semua masalah performa tanpa analisis pola akses.
- Cache tanpa strategi invalidasi.
- Write-back untuk data finansial.
- Cache bersama untuk data per pengguna tanpa user/tenant di key.
- Sistem yang tidak bisa berjalan sama sekali saat cache kosong/down.

## Performance Considerations

Hit rate menentukan manfaat: hit rate 50% berarti setengah request tetap ke DB. Perhatikan ukuran nilai (serialisasi &
bandwidth), latensi jaringan ke Redis, dan distribusi akses (Pareto: sebagian kecil key menerima sebagian besar trafik).
Cache lokal in-process sangat cepat tetapi menambah inkonsistensi antar instance, jadi beri TTL pendek.

## Security Considerations

Pisahkan data publik dan pribadi: `Cache-Control: private` untuk respons per pengguna agar tidak di-cache CDN. Key cache
harus menyertakan tenant/user. Waspadai *cache poisoning* (respons dengan input berbahaya disimpan dan disajikan ke orang
lain) dan *cache deception* (respons pribadi tersimpan di CDN karena URL terlihat seperti file statis).

## Real-World Use Cases

- Katalog e-commerce: CDN untuk gambar, Redis untuk detail produk, harga divalidasi saat checkout.
- Feed sosial: timeline pengguna di-cache (fan-out on write), invalidasi saat ada post baru.
- Konfigurasi aplikasi (Remote Config): cache di perangkat dengan interval fetch minimum.

## Interview Questions

1. Di lapisan mana saja cache bisa ditempatkan dan apa trade-off-nya?
2. Bandingkan cache-aside, write-through, dan write-back.
3. Bagaimana menangani invalidasi cache di sistem dengan banyak layanan?
4. Apa itu hot key dan cache stampede, dan bagaimana mitigasinya?
5. Data apa yang tidak boleh diambil dari cache?

## Sample Answers

1. Perangkat (paling cepat, mendukung offline, sulit diinvalidasi), CDN (bagus untuk konten publik), cache aplikasi bersama seperti Redis (fleksibel, tambahan hop jaringan), in-process (sangat cepat tetapi tidak konsisten antar instance), dan database (replica, materialized view).
2. Cache-aside: aplikasi mengisi cache saat miss (sederhana, default). Write-through: tulis ke cache dan DB bersamaan sehingga cache segar tetapi tulis lebih lambat. Write-back: tulis ke cache dulu lalu DB menyusul (cepat tetapi berisiko kehilangan data).
3. Gunakan TTL sebagai pengaman, dan publikasikan event perubahan (atau CDC dari database) yang dikonsumsi layanan pemilik cache untuk menghapus atau memperbarui key. Versioned key memudahkan invalidasi agregat.
4. Hot key: satu key menerima trafik sangat besar sehingga satu node kewalahan; mitigasi dengan cache lokal, replikasi key, atau CDN. Stampede: banyak miss bersamaan saat kedaluwarsa; mitigasi dengan single-flight lock, stale-while-revalidate, dan TTL jitter.
5. Data yang harus akurat saat itu juga untuk keputusan penting: saldo, stok saat checkout, status pembayaran, dan izin akses yang baru dicabut.

## Practical Exercises

1. Buat tabel staleness budget untuk 10 jenis data di aplikasi Anda.
2. Rancang strategi caching katalog untuk 100.000 perangkat dan hitung kebutuhan memori.
3. Jelaskan dalam 2 menit desain caching untuk endpoint feed.

## Quick Reference

```text
Lapisan: perangkat → CDN → app (in-process, Redis) → DB (replica, MV)
Pola: cache-aside (default) · read-through · write-through · write-back (hindari untuk uang) · write-around
Invalidasi: TTL · delete after commit · versioned key · event/CDC · ETag/delta di klien
Staleness budget per data · stok/saldo jangan dari cache · hot key → lokal/replika · stampede → lock/SWR/jitter
Rencanakan cache down & cold start
```

## Related Topics

- [Caching (Redis)](/backend/caching/)
- [Image Loading & Caching](/system-design/mobile/image-loading-caching/)
- [Database Scaling](/system-design/concepts/database-scaling/)
