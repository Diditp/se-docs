---
title: "Query Optimization & EXPLAIN ANALYZE"
description: "Mengoptimalkan query PostgreSQL secara sistematis: menemukan query lambat (pg_stat_statements, slow log), membaca EXPLAIN ANALYZE (scan, join, estimasi vs aktual, buffers), pola perbaikan (index, sargable, keyset pagination, N+1, batching), statistik & VACUUM, serta kapan cache/denormalisasi."
level: advanced
status: complete
version: "PostgreSQL 15+"
updated: 2026-11-12
tags: [database, performance, explain, postgresql, optimization]
---

## Overview

Optimasi query adalah proses **mengukur → memahami rencana eksekusi → memperbaiki penyebab → mengukur ulang**. Alat
utamanya di PostgreSQL adalah `EXPLAIN (ANALYZE, BUFFERS)` dan ekstensi `pg_stat_statements`.

## Why It Matters

Query lambat adalah penyebab paling umum API lambat, timeout di aplikasi mobile, dan database kehabisan CPU/koneksi.
Satu query yang buruk di jalur populer dapat menjatuhkan seluruh sistem saat trafik naik.

## Core Concepts

### Node rencana yang umum

| Node | Arti | Kapan wajar |
| --- | --- | --- |
| Seq Scan | Membaca seluruh tabel | Tabel kecil atau mengambil sebagian besar baris |
| Index Scan | Index → ambil baris di heap | Selektif, sedikit baris |
| Index Only Scan | Data cukup dari index | Covering index + visibility map bagus |
| Bitmap Heap Scan | Kumpulkan lokasi dari index, baca heap berurutan | Selektivitas sedang |
| Nested Loop | Untuk setiap baris luar, cari di dalam | Sisi luar kecil + index di sisi dalam |
| Hash Join | Bangun hash dari satu sisi | Join set besar tanpa urutan |
| Merge Join | Gabungkan dua input terurut | Keduanya sudah terurut |
| Sort / HashAggregate | Mengurutkan / agregasi | Waspadai "external merge" (tumpah ke disk) |

### Yang dibaca dari EXPLAIN ANALYZE

- **actual time** (ms) dan **rows** aktual vs **rows** estimasi — selisih besar → statistik buruk.
- **loops** — dikalikan dengan waktu per loop.
- **Buffers: shared hit/read** — hit = dari memori, read = dari disk.
- **Rows Removed by Filter** — banyak → index tidak tepat/tidak dipakai.

## How It Works

```text
1. Temukan: pg_stat_statements (total_exec_time, mean, calls), slow query log, APM
2. Reproduksi dengan parameter nyata & data seukuran production
3. EXPLAIN (ANALYZE, BUFFERS) → cari node termahal & estimasi yang meleset
4. Perbaiki: index · tulis ulang query · ubah pola akses · statistik
5. Ukur ulang & pantau
```

## Implementation

### Menemukan query termahal

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;      -- butuh shared_preload_libraries
SELECT left(query, 80) AS q, calls, round(total_exec_time) AS total_ms, round(mean_exec_time, 1) AS mean_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### Membaca rencana

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, total FROM orders
WHERE outlet_id = '7c1e...' AND created_at >= now() - interval '30 days'
ORDER BY created_at DESC LIMIT 20;
```

```text
Limit (actual time=0.05..182.4 rows=20 loops=1)
  -> Sort (actual time=182.3..182.3 rows=20)  Sort Method: top-N heapsort
       -> Seq Scan on orders (actual time=0.02..170.1 rows=8123 loops=1)
            Filter: (outlet_id = '7c1e...' AND created_at >= ...)
            Rows Removed by Filter: 1491877
            Buffers: shared read=18500
```

Diagnosis: seq scan 1,5 juta baris untuk 20 hasil. Perbaikan:

```sql
CREATE INDEX CONCURRENTLY ix_orders__outlet_created ON orders (outlet_id, created_at DESC);
-- Rencana baru: Index Scan → Limit, ±0,1 ms
```

### Pola perbaikan umum

```sql
-- 1. Sargable: jangan bungkus kolom ber-index dengan fungsi
WHERE created_at::date = '2026-11-12'                                       -- ❌
WHERE created_at >= '2026-11-12' AND created_at < '2026-11-13'              -- ✅
WHERE lower(email) = lower($1)   -- ✅ bila ada index ekspresi: CREATE INDEX ON users (lower(email))

-- 2. Keyset pagination daripada OFFSET besar
SELECT id, created_at FROM orders
WHERE (created_at, id) < ($last_created_at, $last_id)
ORDER BY created_at DESC, id DESC LIMIT 20;

-- 3. Hindari N+1 dari aplikasi: ambil relasi sekaligus
SELECT * FROM order_items WHERE order_id = ANY($1::uuid[]);

-- 4. Ambil hanya kolom yang perlu (memungkinkan index-only scan)
SELECT id, name FROM products WHERE category = $1;

-- 5. Agregasi besar yang sering dibaca → tabel ringkasan / materialized view
```

### Statistik & pemeliharaan

```sql
ANALYZE orders;                                 -- perbarui statistik planner
SELECT relname, n_dead_tup, last_autovacuum FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 5;
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;   -- statistik lebih detail untuk kolom skewed
```

## Best Practices

- **Ukur dengan data dan parameter realistis**; dataset kecil menyesatkan.
- **Optimalkan berdasarkan total waktu** (calls × mean), bukan hanya query terlambat sekali.
- **Satu perubahan, satu pengukuran**.
- **Index sesuai pola query** (kolom equality dulu, lalu range/sort).
- **Pastikan autovacuum & statistik sehat**.
- **Pasang `statement_timeout`** untuk melindungi database dari query liar.

## Anti-Patterns

- Menambah index untuk setiap kolom tanpa analisis (tulis melambat).
- Optimasi di laptop dengan 100 baris.
- Mengandalkan cache aplikasi untuk menutupi query yang buruk.
- `SELECT *` + pagination OFFSET besar di endpoint publik.
- Mengabaikan perbedaan estimasi vs aktual di rencana.

## Performance Considerations

Selain query: connection pooling (PgBouncer), ukuran `work_mem` untuk sort/hash, `shared_buffers`, read replica untuk
beban baca, partisi untuk tabel time-series besar. Ubah konfigurasi server dengan hati-hati dan ukur dampaknya.

## Security Considerations

`EXPLAIN ANALYZE` benar-benar mengeksekusi query — jangan jalankan pada `UPDATE/DELETE` di production tanpa transaksi
yang di-rollback. `pg_stat_statements` dapat memuat teks query; batasi aksesnya.

## Real-World Use Cases

- Endpoint riwayat transaksi lambat → composite index + keyset pagination.
- Laporan bulanan berat → materialized view yang di-refresh malam hari.
- API lambat karena N+1 dari ORM → eager loading/batching.

## Interview Questions

1. Bagaimana langkah Anda mengoptimalkan query lambat?
2. Apa beda EXPLAIN dan EXPLAIN ANALYZE?
3. Apa arti Seq Scan dan apakah selalu buruk?
4. Apa itu query sargable?
5. Mengapa OFFSET besar lambat dan apa alternatifnya?
6. Mengapa estimasi baris bisa meleset jauh?

## Sample Answers

1. Temukan query termahal (pg_stat_statements/slow log), reproduksi dengan data realistis, baca `EXPLAIN (ANALYZE, BUFFERS)`, perbaiki penyebab (index, tulis ulang, pola akses, statistik), ukur ulang dan pantau.
2. EXPLAIN menampilkan rencana dan estimasi tanpa menjalankan query; EXPLAIN ANALYZE menjalankannya dan menampilkan waktu serta jumlah baris aktual.
3. Membaca seluruh tabel; wajar untuk tabel kecil atau saat mengambil sebagian besar baris, tetapi buruk bila hanya sedikit baris yang dibutuhkan dari tabel besar.
4. Kondisi yang dapat memanfaatkan index — kolom tidak dibungkus fungsi/cast, misalnya rentang tanggal alih-alih `created_at::date = ...`.
5. Database tetap harus membaca dan membuang semua baris sebelum offset; keyset pagination memakai kondisi pada kunci urut terakhir sehingga langsung lompat melalui index.
6. Statistik usang atau tidak cukup detail, korelasi antar kolom, distribusi data yang timpang, atau parameter yang berbeda; perbaiki dengan `ANALYZE`, target statistik lebih tinggi, atau extended statistics.

## Practical Exercises

1. Isi tabel orders dengan 2 juta baris (generate_series) dan optimalkan query riwayat per outlet.
2. Aktifkan pg_stat_statements di Docker dan temukan 3 query termahal aplikasi Anda.
3. Ubah endpoint OFFSET pagination menjadi keyset dan bandingkan waktunya di halaman ke-1000.

## Quick Reference

```text
Ukur (pg_stat_statements) → EXPLAIN (ANALYZE, BUFFERS) → perbaiki → ukur ulang
Baca: actual vs estimasi rows · loops · Rows Removed by Filter · shared read (disk)
Perbaikan: composite index · sargable · keyset pagination · hindari N+1 · kolom perlu saja · ANALYZE
Lindungi: statement_timeout · pooling · CREATE INDEX CONCURRENTLY
```

## Related Topics

- [Indexing](/database/indexing/)
- [Subquery, CTE & Window Function](/database/subquery-cte/)
- [Debugging & Performance Questions](/interview/technical/debugging-performance/)
