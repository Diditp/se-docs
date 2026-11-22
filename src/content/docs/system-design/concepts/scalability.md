---
title: "Scalability: Horizontal vs Vertical"
description: "Skalabilitas sistem: vertical vs horizontal scaling, syarat stateless, mencari bottleneck, skala per lapisan (aplikasi, database, cache, file, koneksi real-time), autoscaling, estimasi kapasitas back-of-the-envelope, hukum Amdahl & Little, serta pertimbangan biaya dan jalur skala bertahap dari MVP sampai jutaan pengguna."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, scalability, autoscaling, capacity-planning, stateless]
---

## Overview

**Skalabilitas** adalah kemampuan sistem menangani beban yang bertambah (pengguna, request, data) dengan menambah sumber
daya, **tanpa** menurunkan performa secara drastis dan tanpa mendesain ulang total.

- **Vertical scaling (scale up)**: mesin lebih besar (CPU, RAM, disk lebih cepat).
- **Horizontal scaling (scale out)**: lebih banyak mesin yang berbagi beban.

## Why It Matters

Hampir setiap soal system design menanyakan "bagaimana jika pengguna naik 10×?". Jawaban yang baik dimulai dari
**menemukan bottleneck**, bukan langsung "pakai microservices dan Kubernetes".

## Core Concepts

| Aspek | Vertical | Horizontal |
| --- | --- | --- |
| Cara | Upgrade satu mesin | Tambah instance |
| Kompleksitas | Rendah, tanpa ubah kode | Butuh stateless, load balancer, data bersama |
| Batas | Ada batas ukuran mesin & biaya naik tajam | Hampir linear bila desain benar |
| Ketersediaan | Satu titik kegagalan | Instance bisa gagal tanpa downtime |
| Cocok untuk | Database awal, beban kecil–sedang | Layer aplikasi stateless, worker, gateway |

| Konsep | Penjelasan |
| --- | --- |
| Stateless service | Tidak menyimpan state sesi di memori lokal, sehingga request bisa ke instance mana saja |
| Bottleneck | Komponen yang pertama jenuh (CPU, DB, koneksi, disk, layanan eksternal) |
| Autoscaling | Menambah/mengurangi instance otomatis berdasarkan metrik |
| Amdahl's law | Bagian yang tidak bisa diparalelkan membatasi percepatan total |
| Little's law | `concurrency = throughput × latency` |

## How It Works

```text
Beban naik → ukur (p95, CPU, koneksi DB, antrean) → temukan bottleneck → atasi bottleneck itu
→ ukur lagi → bottleneck berpindah ke komponen berikutnya → ulangi
```

### Skala per lapisan

| Lapisan | Teknik |
| --- | --- |
| Aplikasi/API | Stateless + load balancer + autoscaling |
| Sesi | Token (JWT) atau store bersama (Redis), bukan memori instance |
| File | Object storage (S3/GCS) + CDN, bukan disk server |
| Baca DB | Index, cache, read replica |
| Tulis DB | Batch, antrean, partisi/sharding (paling akhir) |
| Pekerjaan berat | Queue + worker yang diskalakan terpisah |
| Real-time | Gateway koneksi horizontal + pub/sub |
| Konten statis | CDN |

## Implementation

### Estimasi back-of-the-envelope

```text
Aplikasi POS: 5.000 outlet, rata-rata 300 transaksi/outlet/hari
→ 1,5 juta transaksi/hari ≈ 17 transaksi/detik rata-rata
Jam sibuk 3× → ~50 tps. Setiap transaksi ≈ 3 request API → ~150 rps puncak
Penyimpanan: 1,5 juta × 2 KB (order + item) ≈ 3 GB/hari ≈ 1,1 TB/tahun (tanpa index & replika)

Kesimpulan: 2–3 instance API stateless + satu PostgreSQL yang dikonfigurasi baik sudah cukup.
Fokus pada index, backup, dan partisi tabel per waktu untuk data historis, bukan sharding.
```

Angka acuan kasar: memori ~100 ns, SSD acak ~100 µs, round-trip di satu data center ~0,5 ms, round-trip lintas benua
~100–150 ms. Gunakan untuk memperkirakan, lalu validasi dengan load test.

### Membuat aplikasi stateless

```text
❌ Session di memori Express, upload ke ./uploads, cron di setiap instance, cache Map per proses untuk data yang harus konsisten
✅ Token/Redis session, object storage, scheduler tunggal atau job queue dengan lock, cache bersama (Redis)
```

### Autoscaling

```text
Metrik: CPU (umum), request per instance, panjang antrean (untuk worker), latensi p95
Atur: minimum instance (hindari cold start di jam sibuk), maksimum (lindungi DB & biaya), cooldown
Ingat: menambah instance API juga menambah koneksi DB → gunakan pool & pooler (PgBouncer)
```

### Jalur skala bertahap

```text
1. Monolith + satu DB + backup (MVP)
2. Index, query optimization, cache, CDN, object storage
3. Beberapa instance API stateless + load balancer + queue untuk pekerjaan berat
4. Read replica, partisi tabel besar, pemisahan beban laporan
5. Pecah layanan/sharding hanya untuk bottleneck yang terukur
```

## Best Practices

- **Ukur dulu**, skala bottleneck yang nyata.
- **Stateless sejak awal** di layer aplikasi (murah dilakukan di awal).
- **Vertical scaling untuk DB dulu** sebelum sharding.
- **Pisahkan beban** (API vs worker vs laporan) agar bisa diskalakan sendiri.
- **Batasi skala otomatis** sesuai kapasitas dependensi.
- **Pertimbangkan biaya** sebagai bagian desain.

## Anti-Patterns

- Microservices/Kubernetes untuk 100 pengguna.
- Sharding sebelum index dan query dioptimalkan.
- State di memori instance lalu bingung saat menambah instance.
- Autoscaling tanpa batas yang menghabiskan koneksi database.

## Performance Considerations

Skalabilitas berbeda dengan performa: sistem cepat untuk 1 pengguna bisa runtuh di 1.000 pengguna. Pantau throughput dan
latensi ekor (p95/p99) saat beban naik. Titik di mana latensi melonjak menunjukkan kapasitas efektif.

## Security Considerations

Autoscaling dapat dimanfaatkan serangan (biaya membengkak), jadi gunakan rate limiting, WAF, dan batas maksimum instance.
Setiap instance baru harus memakai konfigurasi & secret yang sama melalui secret manager, bukan file manual.

## Real-World Use Cases

- POS: 3 instance API + PostgreSQL primary dengan replica untuk laporan.
- Promo flash sale: autoscaling API dan worker, antrean untuk pemrosesan order, CDN untuk aset.

## Interview Questions

1. Apa beda vertical dan horizontal scaling?
2. Apa syarat sebuah service bisa di-scale horizontal?
3. Bagaimana Anda mengestimasi kapasitas sistem?
4. Kapan database perlu di-shard?

## Sample Answers

1. Vertical menambah kapasitas satu mesin (sederhana, ada batas, satu titik gagal). Horizontal menambah jumlah mesin (butuh desain stateless dan load balancer, lebih tahan gagal dan hampir tanpa batas).
2. Stateless: tidak menyimpan sesi, file, atau state penting di memori/disk lokal. State dipindah ke DB, cache bersama, atau object storage, dan pekerjaan terjadwal dikoordinasikan agar tidak berjalan ganda.
3. Hitung pengguna aktif, aksi per pengguna, request per aksi, faktor puncak, ukuran data per entitas, dan pertumbuhan. Turunkan ke rps, penyimpanan, dan bandwidth, lalu validasi dengan load test.
4. Setelah index, cache, replica, partisi, dan vertical scaling tidak lagi cukup untuk beban tulis atau ukuran data, dan ada kunci shard alami (mis. tenant) yang membuat sebagian besar query tetap di satu shard.

## Practical Exercises

1. Lakukan estimasi kapasitas untuk aplikasi Anda (rps, storage/tahun).
2. Audit layanan Anda: state apa yang mencegah horizontal scaling?
3. Gambar jalur skala dari 1.000 ke 1 juta pengguna.

## Quick Reference

```text
Vertical = mesin besar · Horizontal = banyak mesin (stateless + LB)
Ukur → bottleneck → atasi → ulangi
App stateless · file ke object storage · sesi ke token/Redis · job ke queue
DB: index → cache → replica → partisi → shard (terakhir)
Little: concurrency = throughput × latency · autoscaling dibatasi kapasitas dependensi
```

## Related Topics

- [System Design Fundamentals](/system-design/concepts/fundamentals/)
- [Load Balancing](/system-design/concepts/load-balancing/)
- [Database Scaling](/system-design/concepts/database-scaling/)
