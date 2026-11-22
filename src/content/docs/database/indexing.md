---
title: "Indexing"
description: "Cara kerja B-tree index, composite index dan leftmost prefix, covering & partial index, kapan index tidak dipakai, dan cara memilih index berdasarkan query."
level: intermediate
status: complete
version: "PostgreSQL 15+ · MySQL 8 InnoDB"
updated: 2026-11-07
tags: [database, index, b-tree, performance, postgresql, mysql]
---

## Overview

**Index** adalah struktur data tambahan yang memungkinkan database menemukan baris tanpa membaca seluruh tabel —
seperti indeks di belakang buku. Jenis paling umum adalah **B-tree** (B+tree), yang menyimpan key secara terurut
dalam pohon seimbang.

## Why It Matters

Perbedaan antara query 2 ms dan 20 detik pada tabel jutaan baris sering hanya satu index. Sebaliknya, index yang salah
atau berlebihan memperlambat setiap `INSERT/UPDATE/DELETE` dan memakan storage. Indexing adalah keterampilan optimasi
dengan **rasio dampak/usaha paling tinggi** di backend — dan topik favorit interview database.

## Core Concepts

- **Full table scan (Seq Scan)** — membaca semua baris; O(n).
- **Index scan** — menelusuri B-tree O(log n) lalu mengambil baris dari tabel (*heap*).
- **Index-only scan / covering index** — semua kolom yang dibutuhkan ada di index → tidak perlu membaca tabel.
- **Selectivity / cardinality** — persentase baris yang cocok. Index efektif untuk kondisi yang selektif.
- **Composite index** — index pada beberapa kolom; urutan kolom penting (**leftmost prefix rule**).
- **Clustered index** — di MySQL InnoDB, tabel disimpan terurut berdasarkan primary key; secondary index menyimpan PK sebagai pointer. PostgreSQL memakai heap (tidak clustered secara default).
- **Jenis lain:** Hash (equality), GIN (array, JSONB, full-text), GiST (geospasial, range), BRIN (tabel append-only sangat besar berurut waktu).
- **Partial index** — index hanya untuk baris yang memenuhi kondisi. **Expression index** — index pada hasil fungsi.

## How It Works

```text
B+tree index pada orders(created_at)
                     [2026-06-01 | 2026-09-01]                  ← root
           /                    |                     \
 [.. 03-01 | 05-01]   [.. 07-01 | 08-01]        [.. 10-01 | 11-01]     ← internal
   /   |   \             /   |   \                 /   |   \
 leaf ↔ leaf ↔ leaf ↔ leaf ↔ leaf ↔ ... ↔ leaf (key → pointer ke baris)  ← leaf berurutan & ter-link
```

- **Equality** (`=`): turun dari root ke leaf — beberapa page read.
- **Range** (`BETWEEN`, `>`), **ORDER BY**, **prefix LIKE `'abc%'`**: temukan awal range, lalu jalan sepanjang leaf yang ter-link.
- Setiap write pada kolom terindeks juga memperbarui B-tree (bisa memicu page split).

**Leftmost prefix rule** untuk `INDEX (outlet_id, status, created_at)`:

| Kondisi query | Index dipakai? |
| --- | --- |
| `outlet_id = ?` | ✓ |
| `outlet_id = ? AND status = ?` | ✓ |
| `outlet_id = ? AND status = ? AND created_at > ?` | ✓ (penuh) |
| `outlet_id = ? ORDER BY created_at` | Sebagian (skip status → sort tidak dari index) |
| `status = ?` | ✗ (kolom pertama tidak ada) |
| `created_at > ?` | ✗ |

Aturan urutan kolom: **equality dulu → range/sort terakhir.**

## Implementation

```sql
-- Query paling sering di POS: transaksi outlet tertentu, status tertentu, terbaru dulu
SELECT id, total, created_at
FROM orders
WHERE outlet_id = $1 AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 50;

-- Index yang tepat (equality, equality, sort)
CREATE INDEX CONCURRENTLY idx_orders_outlet_status_created
  ON orders (outlet_id, status, created_at DESC);

-- Covering (PostgreSQL 11+): sertakan kolom SELECT agar index-only scan
CREATE INDEX CONCURRENTLY idx_orders_outlet_status_created_cov
  ON orders (outlet_id, status, created_at DESC) INCLUDE (total);
```

```sql
-- Partial index: hanya baris yang sering dicari (antrian sync yang kecil)
CREATE INDEX idx_outbox_pending ON outbox (created_at) WHERE status = 'PENDING';

-- Expression index: pencarian email case-insensitive
CREATE INDEX idx_users_email_lower ON users (lower(email));
SELECT * FROM users WHERE lower(email) = lower($1);     -- ✓ memakai index

-- Unique index sebagai aturan bisnis (sekaligus mempercepat lookup)
CREATE UNIQUE INDEX uq_products_outlet_sku ON products (outlet_id, sku);

-- Foreign key: PostgreSQL TIDAK membuat index otomatis
CREATE INDEX idx_order_items_order_id ON order_items (order_id);
```

### Verifikasi dengan EXPLAIN

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, total, created_at FROM orders
WHERE outlet_id = '…' AND status = 'PAID'
ORDER BY created_at DESC LIMIT 50;

-- Sebelum: Seq Scan on orders … rows=2,400,000 → Sort → Limit   (actual time=1850 ms)
-- Sesudah: Index Only Scan using idx_orders_outlet_status_created_cov … (actual time=0.4 ms)
```

### Menemukan index yang tidak terpakai (PostgreSQL)

```sql
SELECT relname AS table, indexrelname AS index, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

## Best Practices

- **Index berdasarkan pola query nyata** (slow query log, `pg_stat_statements`), bukan berdasarkan tebakan per kolom.
- **Composite index: equality → range/sort**, dan satu composite yang tepat sering lebih baik dari beberapa index satu kolom.
- **Index semua foreign key** yang dipakai untuk JOIN atau `ON DELETE`.
- **Gunakan `CREATE INDEX CONCURRENTLY`** (PostgreSQL) di production agar tidak mengunci write tabel. (MySQL 8: online DDL `ALGORITHM=INPLACE, LOCK=NONE` untuk banyak kasus.)
- **Selalu verifikasi dengan `EXPLAIN ANALYZE`** sebelum & sesudah.
- **Hapus index yang tidak terpakai/duplikat** — biaya write dan storage nyata.
- **Jaga statistik tetap baru** (`ANALYZE`/autovacuum) agar planner memilih rencana yang tepat.

## Anti-Patterns

- **Index di setiap kolom** "untuk berjaga-jaga".
- **Membungkus kolom dengan fungsi/cast** di WHERE (`WHERE DATE(created_at) = '2026-11-07'`) → index biasa tidak terpakai. Gunakan range: `created_at >= '2026-11-07' AND created_at < '2026-11-08'`.
- **`LIKE '%kata%'`** berharap B-tree membantu → gunakan full-text search atau trigram (`pg_trgm` + GIN).
- **Index pada kolom selektivitas rendah sendirian** (boolean, status dengan 3 nilai) — kecuali sebagai partial index untuk nilai yang langka.
- **Implicit type conversion** (`WHERE phone = 81234` pada kolom varchar).
- **`OR` antar kolom berbeda** tanpa index pendukung → sering jatuh ke seq scan (pertimbangkan `UNION`).

## Performance Considerations

- Setiap index menambah biaya pada **write** (insert/update kolom terindeks/delete) dan **storage**; tabel write-heavy (log, event) butuh index minimal.
- Planner bisa **sengaja memilih seq scan** jika query mengambil sebagian besar tabel (lebih murah membaca berurutan) — itu bukan bug.
- **Index bloat** dari update/delete masif → `REINDEX CONCURRENTLY` berkala jika perlu.
- **UUID v4 acak sebagai primary key** pada clustered index (InnoDB) menyebabkan insert acak & page split; pertimbangkan UUID v7 (berurut waktu) atau bigint internal + UUID publik.

## Security Considerations

- Unique index adalah **penjaga integritas** terakhir (mencegah duplikat transaksi/email) meski aplikasi punya bug race condition.
- Index pada kolom sensitif (NIK, nomor kartu) berarti data tersebut juga ada di struktur index — ikut terlindungi enkripsi at rest; untuk pencarian data terenkripsi gunakan *blind index* (hash ber-key), bukan plaintext.
- Query yang tidak terindeks pada endpoint publik adalah vektor DoS (request murah, query mahal).

## Real-World Use Cases

- **Riwayat transaksi outlet:** `(outlet_id, created_at DESC)` untuk list dengan cursor pagination.
- **Login:** unique index `lower(email)`.
- **Antrian outbox/job:** partial index `WHERE status = 'PENDING'`.
- **Pencarian produk:** trigram GIN index pada `name` untuk pencarian `ILIKE '%kopi%'`.
- **Log/telemetri besar:** BRIN pada `created_at`.

## Interview Questions

1. **(Fundamental)** Apa itu index dan bagaimana ia mempercepat query?
2. **(Fundamental)** Apa kerugian menambah index?
3. **(Intermediate)** Jelaskan composite index dan leftmost prefix rule.
4. **(Intermediate)** Mengapa `WHERE YEAR(created_at) = 2026` lambat walau ada index?
5. **(Intermediate)** Apa itu covering index?
6. **(Advanced)** Bagaimana Anda memutuskan index untuk tabel orders dengan 50 juta baris?
7. **(Advanced)** Kapan planner tidak memakai index yang ada?

## Sample Answers

1. Struktur data terurut (umumnya B-tree) yang memetakan nilai kolom ke lokasi baris, sehingga pencarian menjadi O(log n) alih-alih memindai seluruh tabel; juga mempercepat range & ORDER BY.
2. Memperlambat write (index ikut diperbarui), menambah storage & memory, menambah pekerjaan maintenance; index yang tidak dipakai murni beban.
3. Index pada beberapa kolom yang diurutkan berdasarkan kolom pertama, lalu kedua, dst. Query hanya dapat memanfaatkan index jika memakai kolom dari kiri tanpa melompat. Urutkan: kolom equality dulu, range/sort terakhir.
4. Fungsi pada kolom membuat database harus menghitung fungsi untuk setiap baris; index menyimpan nilai asli. Ubah menjadi range (`>= '2026-01-01' AND < '2027-01-01'`) atau buat expression index.
5. Index yang berisi semua kolom yang dibutuhkan query (kolom key + `INCLUDE`), sehingga hasil bisa diambil langsung dari index (index-only scan) tanpa membaca tabel.
6. Kumpulkan query aktual & frekuensinya dari `pg_stat_statements`, prioritaskan berdasarkan total waktu; rancang composite index yang melayani beberapa query sekaligus; buat `CONCURRENTLY`; verifikasi dengan `EXPLAIN ANALYZE`; pantau dampak write & hapus index tak terpakai. Untuk data historis yang sangat besar, pertimbangkan partitioning by time.
7. Saat query mengambil porsi besar tabel, statistik usang membuat estimasi salah, kolom dibungkus fungsi/cast, tipe tidak cocok, kolom pertama composite tidak dipakai, `LIKE '%..'`, atau tabel sangat kecil.

## Practical Exercises

1. Buat tabel 1 juta order (pakai `generate_series`), ukur query list per outlet sebelum/sesudah composite index.
2. Bandingkan index `(status, outlet_id)` vs `(outlet_id, status)` untuk query yang berbeda.
3. Buat partial index untuk outbox pending dan bandingkan ukurannya dengan index penuh.
4. Temukan dan hapus index yang tidak pernah dipakai di database project Anda.

## Quick Reference

- B-tree: `=`, range, ORDER BY, prefix LIKE.
- Composite: **equality → range/sort**; leftmost prefix.
- Jangan bungkus kolom terindeks dengan fungsi; gunakan range atau expression index.
- Index FK (PostgreSQL tidak otomatis). `CREATE INDEX CONCURRENTLY` di production.
- Covering: `INCLUDE (...)` → index-only scan.
- Verifikasi dengan `EXPLAIN (ANALYZE, BUFFERS)`; hapus index yang `idx_scan = 0`.

## Related Topics

- [Query Optimization & EXPLAIN ANALYZE](/database/query-optimization/)
- [JOIN](/database/joins/)
- [Database Performance](/testing-performance/database-performance/)
- [Pagination, Filtering & Sorting](/backend/pagination-filtering-sorting/)
- Referensi resmi: [PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html), [MySQL Optimization and Indexes](https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html), [Use The Index, Luke](https://use-the-index-luke.com).
