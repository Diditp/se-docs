---
title: "Database Performance"
description: "Performa database di server (PostgreSQL) dan di perangkat (SQLite/Drift/Room): membaca EXPLAIN ANALYZE, index yang tepat, query lambat, pagination keyset, connection pooling, transaksi & batch insert, VACUUM/statistik, serta optimasi SQLite mobile (WAL, transaksi, index, query di background)."
level: advanced
status: complete
version: "PostgreSQL 16+ · SQLite (Drift/Room) — perilaku planner dapat berbeda antar versi"
updated: 2026-11-13
tags: [performance, database, postgresql, sqlite, index, explain]
---

## Overview

Database hampir selalu menjadi **bottleneck pertama** dalam performa API, dan database lokal (SQLite) menentukan
kecepatan aplikasi offline-first. Topik ini berfokus pada cara **mendiagnosis** query lambat dan teknik perbaikan yang
paling berdampak, baik di server maupun di perangkat.

## Why It Matters

Satu index yang hilang dapat membuat query berjalan ratusan kali lebih lambat ketika data tumbuh. Di perangkat, insert
ribuan baris tanpa transaksi bisa memakan detik dan membekukan UI.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Seq Scan vs Index Scan | Membaca seluruh tabel vs memakai index |
| Selectivity | Seberapa sedikit baris yang cocok — index efektif untuk selektivitas tinggi |
| Composite index | Index beberapa kolom; urutan kolom penting (kesetaraan dulu, lalu rentang/urut) |
| Covering index | Index berisi semua kolom yang dibutuhkan (Index Only Scan) |
| Keyset pagination | `WHERE (created_at, id) < (...)` alih-alih `OFFSET` besar |
| Connection pool | Membatasi & memakai ulang koneksi DB |
| WAL (SQLite) | Write-Ahead Logging: pembaca tidak memblokir penulis |

## How It Works

```text
Query → parser → planner memperkirakan biaya berbagai rencana (pakai statistik tabel) → executor
Rencana buruk biasanya karena: tidak ada index yang cocok, statistik usang, fungsi pada kolom, tipe tidak cocok, OFFSET besar
```

## Implementation

### PostgreSQL: diagnosis

```sql
-- Query paling mahal (butuh ekstensi pg_stat_statements)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, total, created_at FROM orders
WHERE outlet_id = $1 AND status = 'paid'
ORDER BY created_at DESC LIMIT 20;
```

```text
Cari di output: Seq Scan pada tabel besar · rows estimasi vs aktual jauh berbeda · Sort mahal · Nested Loop dengan banyak loop
```

### Index yang cocok dengan query

```sql
-- Kesetaraan (outlet_id, status) dulu, lalu kolom urutan
CREATE INDEX CONCURRENTLY idx_orders_outlet_status_created
  ON orders (outlet_id, status, created_at DESC);

-- Partial index untuk subset yang sering diquery
CREATE INDEX CONCURRENTLY idx_orders_pending ON orders (created_at) WHERE status = 'pending';
```

### Query yang tidak bisa memakai index

```sql
-- ❌ fungsi pada kolom
WHERE date(created_at) = '2026-11-13'
-- ✅ rentang
WHERE created_at >= '2026-11-13' AND created_at < '2026-11-14'

-- ❌ LIKE dengan wildcard depan (butuh pg_trgm/full-text search)
WHERE name ILIKE '%latte%'
```

### Keyset pagination

```sql
SELECT id, total, created_at FROM orders
WHERE outlet_id = $1 AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT 20;          -- stabil & cepat walau di halaman ke-1000
```

### Batch & transaksi

```sql
INSERT INTO sale_items (sale_id, product_id, qty, price)
SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::int[], $4::bigint[]);   -- satu round-trip untuk banyak baris
```

### Pemeliharaan

```text
Autovacuum aktif & dipantau · ANALYZE setelah load besar · pantau bloat & index tak terpakai (pg_stat_user_indexes)
Pool koneksi (PgBouncer / pool aplikasi) — jangan ratusan koneksi langsung
```

### SQLite di mobile (Drift/Room)

```dart
// Insert banyak baris dalam satu transaksi + batch
await db.batch((b) => b.insertAll(db.products, companions, mode: InsertMode.insertOrReplace));

// Index untuk query yang sering
// Drift: @TableIndex(name: 'idx_sales_outlet_created', columns: {#outletId, #createdAt})

// Jalankan di background isolate
final db = AppDatabase(NativeDatabase.createInBackground(file));
```

```kotlin
@Entity(indices = [Index(value = ["outletId", "createdAt"])])
data class SaleEntity(...)

@Transaction
suspend fun replaceCatalog(items: List<ProductEntity>) { clear(); insertAll(items) }   // Room: suspend → di luar main thread
```

| Masalah mobile | Perbaikan |
| --- | --- |
| Insert 5.000 produk 8 detik | Satu transaksi/batch |
| UI beku saat query | Isolate background (Drift) / suspend & Flow (Room) |
| List lambat seiring data tumbuh | Index + pagination (LIMIT/keyset, Paging 3) |
| Ukuran DB terus membesar | Hapus data lama yang sudah tersinkron, `VACUUM` sesekali |

## Best Practices

- **Ukur dengan EXPLAIN ANALYZE** dan data berukuran realistis.
- **Index sesuai pola query** (WHERE + ORDER BY), bukan setiap kolom.
- **Keyset pagination** untuk data besar.
- **Batch + transaksi** untuk banyak tulis.
- **Pool koneksi** di server; **query di background** di mobile.
- **Pantau query lambat** terus-menerus.

## Anti-Patterns

- `SELECT *` untuk list besar.
- Index di setiap kolom (memperlambat tulis & memakan ruang).
- `OFFSET 100000`.
- Membuat index di production tanpa `CONCURRENTLY` pada tabel besar (mengunci tulis).
- Query di main thread mobile.

## Performance Considerations

Index mempercepat baca tetapi memperlambat tulis dan menambah ukuran — seimbangkan sesuai rasio baca/tulis. Query cepat di
data development (100 baris) bisa lambat di production (10 juta baris); uji dengan data volume realistis.

## Security Considerations

Selalu gunakan parameterized query (juga mencegah SQL injection); jangan membuka `pg_stat_statements` atau log query
lengkap berisi data sensitif ke pihak yang tidak berwenang. Enkripsi database lokal (SQLCipher) menambah overhead
— ukur dampaknya.

## Real-World Use Cases

- Riwayat transaksi dari 2,4 s ke 15 ms dengan composite index + keyset pagination.
- Sinkronisasi katalog 10.000 produk di aplikasi kasir dari 20 s ke < 1 s dengan batch dalam transaksi.

## Interview Questions

1. Bagaimana menemukan dan memperbaiki query lambat?
2. Bagaimana memilih urutan kolom pada composite index?
3. Mengapa OFFSET besar lambat dan apa alternatifnya?
4. Mengapa insert banyak baris di SQLite harus dalam transaksi?
5. Apa kerugian terlalu banyak index?

## Sample Answers

1. Cari query mahal (pg_stat_statements/log slow query), jalankan EXPLAIN ANALYZE, periksa seq scan, estimasi baris, dan sort; tambahkan index yang cocok, tulis ulang query, atau ubah pagination; ukur ulang.
2. Kolom dengan kondisi kesetaraan dulu, lalu kolom rentang atau ORDER BY, sesuai pola query yang paling sering.
3. Database tetap membaca dan membuang semua baris sebelum offset; keyset pagination memakai nilai terakhir sebagai batas sehingga langsung lompat lewat index.
4. Tanpa transaksi, setiap insert adalah transaksi sendiri dengan sinkronisasi disk; satu transaksi menggabungkan semuanya sehingga jauh lebih cepat dan atomik.
5. Tulis lebih lambat karena setiap index harus diperbarui, ruang disk lebih besar, dan pemeliharaan (vacuum) lebih berat.

## Practical Exercises

1. Jalankan EXPLAIN ANALYZE pada 3 query utama Anda dengan 1 juta baris data dummy.
2. Ubah pagination OFFSET menjadi keyset dan bandingkan.
3. Ukur insert 5.000 baris di Drift dengan dan tanpa batch.

## Quick Reference

```text
pg_stat_statements → EXPLAIN (ANALYZE, BUFFERS) → index (equality, lalu range/order) → ukur ulang
Partial/covering index · CREATE INDEX CONCURRENTLY · keyset pagination · unnest batch insert · pool
SQLite: transaksi/batch · index · background isolate · WAL · Paging · hapus data lama
```

## Related Topics

- [Indexing](/database/indexing/)
- [Query Optimization](/database/query-optimization/)
- [API Performance](/testing-performance/api-performance/)
