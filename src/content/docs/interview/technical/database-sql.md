---
title: "Database & SQL Questions"
description: "Bank pertanyaan interview database: relasional vs NoSQL, normalisasi, keys & constraint, JOIN, index, transaksi & ACID, isolation level, locking, query optimization, replikasi & sharding, serta database lokal di mobile."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, database, sql, postgresql, question-bank]
---

## Overview

Pertanyaan database menguji pemahaman **pemodelan data**, **query**, **konsistensi**, dan **performa**. Untuk mobile
engineer, pertanyaan juga sering menyentuh **database lokal** (SQLite/Drift) dan sinkronisasi. Latihan menulis query
ada di [SQL Challenges](/interview/coding-test/sql-challenges/).

## Why It Matters

Hampir setiap bug data (stok salah, transaksi ganda, laporan lambat) bermuara pada desain skema, transaksi, atau index.
Interviewer ingin tahu apakah Anda bisa merancang dan menggunakan database dengan benar, bukan hanya memanggil ORM.

## Core Concepts

| Area | Topik kunci |
| --- | --- |
| Model | Relasional vs dokumen/key-value, kapan memilih masing-masing |
| Desain | Normalisasi (1NF–3NF), denormalisasi, primary/foreign key, constraint |
| Query | JOIN, GROUP BY/HAVING, subquery/CTE, window function |
| Index | B-tree, composite index & urutan kolom, covering index, kapan index tidak dipakai |
| Transaksi | ACID, isolation level, anomali (dirty/non-repeatable/phantom read), locking, deadlock |
| Skala | Replikasi, read replica, partitioning, sharding, connection pooling |
| Operasional | Migrasi, backup & restore, EXPLAIN |

## How It Works

```text
Query → parser → planner (pilih rencana berdasarkan statistik & index) → executor
EXPLAIN menunjukkan rencana: Seq Scan vs Index Scan, Nested Loop/Hash Join, estimasi vs aktual (ANALYZE)
```

## Implementation

```sql
-- Composite index: urutan kolom penting (filter kesetaraan dulu, lalu rentang/urutan)
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);
-- Dipakai oleh: WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20
-- Tidak efektif untuk: WHERE created_at > now() - interval '1 day' (tanpa customer_id)

-- Transaksi transfer saldo dengan penguncian baris
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
UPDATE accounts SET balance = balance - 100000 WHERE id = 1 AND balance >= 100000;
UPDATE accounts SET balance = balance + 100000 WHERE id = 2;
COMMIT;

-- Membaca rencana eksekusi
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 20;
```

## Best Practices

- Jawab dengan contoh skema nyata (order, order_items, products).
- Selalu sebut **constraint** sebagai pertahanan integritas, bukan hanya validasi aplikasi.
- Bicarakan **cara mengukur** (EXPLAIN, slow query log) sebelum menambah index.

## Anti-Patterns

- Index di setiap kolom (memperlambat write, memboroskan storage).
- Menyimpan uang sebagai float.
- Tanpa foreign key/constraint "karena aplikasi sudah memvalidasi".
- `SELECT *` dan offset pagination besar di tabel besar.

## Performance Considerations

Index sesuai pola query, hindari fungsi pada kolom ber-index di `WHERE`, keyset pagination, batching, connection pool,
denormalisasi/materialized view untuk laporan, partisi untuk tabel time-series besar. Lihat
[Indexing](/database/indexing/).

## Security Considerations

Parameterized query (cegah SQL injection), least privilege per user database, enkripsi data sensitif & koneksi TLS,
backup terenkripsi yang diuji restore-nya, audit akses, masking data di environment non-produksi.

## Real-World Use Cases

- Skema transaksi POS & laporan penjualan.
- Ledger stok yang dapat diaudit.
- Database lokal SQLite untuk aplikasi offline-first.

## Interview Questions

1. Apa beda SQL dan NoSQL; kapan memilih masing-masing?
2. Jelaskan normalisasi dan kapan melakukan denormalisasi.
3. Apa beda primary key, foreign key, unique, dan check constraint?
4. Jelaskan jenis-jenis JOIN.
5. Bagaimana index bekerja dan kapan tidak dipakai?
6. Jelaskan ACID.
7. Apa itu isolation level dan anomali yang dicegahnya?
8. Optimistic vs pessimistic locking?
9. Apa itu deadlock dan cara mencegahnya?
10. Bagaimana mengoptimalkan query yang lambat?
11. Replikasi vs sharding?
12. Bagaimana menjalankan migrasi skema tanpa downtime?

## Sample Answers

1. SQL/relasional: skema ketat, relasi, transaksi ACID, query ad-hoc yang kaya — cocok untuk data transaksional. NoSQL (dokumen, key-value, wide-column): skema fleksibel, skala horizontal lebih mudah untuk pola akses tertentu — cocok untuk data semi-terstruktur, cache, event. Pilih berdasarkan pola akses dan kebutuhan konsistensi.
2. Normalisasi menghilangkan duplikasi dan anomali update dengan memecah data ke tabel terkait (1NF nilai atomik, 2NF tidak ada ketergantungan parsial, 3NF tidak ada ketergantungan transitif). Denormalisasi secara sadar untuk performa baca (laporan, read model) dengan konsekuensi menjaga konsistensi.
3. PK mengidentifikasi baris secara unik dan tidak null; FK menjaga referensi ke tabel lain valid; UNIQUE mencegah duplikasi nilai; CHECK memaksa aturan nilai (mis. `qty > 0`).
4. INNER (hanya yang cocok), LEFT (semua kiri + yang cocok kanan), RIGHT, FULL OUTER, CROSS (kartesian), dan self join. Lihat [Joins](/database/joins/).
5. B-tree index menyimpan nilai terurut dengan pointer ke baris sehingga pencarian O(log n). Tidak dipakai jika selektivitas rendah, kolom dibungkus fungsi/cast, `LIKE '%x'`, tipe tidak cocok, atau urutan kolom composite tidak sesuai filter.
6. Atomicity (semua atau tidak sama sekali), Consistency (constraint tetap terpenuhi), Isolation (transaksi bersamaan tidak saling mengganggu sesuai level), Durability (setelah commit tidak hilang). Lihat [Transactions & ACID](/database/transactions-acid/).
7. Read Uncommitted → Read Committed (cegah dirty read; default PostgreSQL) → Repeatable Read (cegah non-repeatable read; di PostgreSQL juga mencegah phantom) → Serializable (seolah berurutan; bisa gagal dan perlu retry). Level lebih tinggi = konsistensi lebih kuat, konkurensi lebih rendah.
8. Pessimistic mengunci data sebelum mengubah (`SELECT ... FOR UPDATE`) — cocok untuk kontensi tinggi. Optimistic memakai kolom version dan gagal saat konflik (`UPDATE ... WHERE version = n`) — cocok untuk kontensi rendah dan sistem terdistribusi/offline.
9. Dua transaksi saling menunggu lock yang dipegang lawannya; database akan membatalkan salah satu. Cegah dengan urutan penguncian konsisten, transaksi singkat, index yang tepat, dan retry pada error deadlock.
10. Ukur dengan slow query log/`EXPLAIN ANALYZE`, periksa scan & join, tambah/ubah index, tulis ulang query (hindari N+1, fungsi pada kolom, subquery berulang), batasi data, cache, lalu ukur ulang.
11. Replikasi menyalin data yang sama ke beberapa node (read scaling, HA). Sharding membagi data ke beberapa node berdasarkan shard key (write & storage scaling) dengan biaya kompleksitas query lintas shard dan rebalancing.
12. Expand–contract: tambahkan kolom/tabel baru yang kompatibel, deploy kode yang menulis keduanya, backfill bertahap, pindahkan pembacaan, lalu hapus yang lama; hindari lock panjang (mis. `CREATE INDEX CONCURRENTLY` di PostgreSQL).

## Practical Exercises

1. Rancang skema untuk aplikasi tiket gangguan dan tentukan index-nya.
2. Jalankan `EXPLAIN ANALYZE` sebelum/sesudah menambah composite index di dataset 1 juta baris.
3. Simulasikan lost update dengan dua sesi psql, lalu perbaiki dengan locking.

## Quick Reference

```text
Normalisasi untuk integritas · denormalisasi sadar untuk baca · constraint = jaring pengaman
Index: B-tree O(log n) · composite (equality → range/order) · ukur dengan EXPLAIN ANALYZE
ACID · RC (default PG) → RR → Serializable · optimistic (version) vs pessimistic (FOR UPDATE)
Replikasi (baca/HA) vs sharding (tulis/storage) · migrasi expand–contract
```

## Related Topics

- [SQL Challenges](/interview/coding-test/sql-challenges/)
- [Indexing](/database/indexing/)
- [Transactions & ACID](/database/transactions-acid/)
- [Local Database (Flutter)](/flutter/local-database/)
