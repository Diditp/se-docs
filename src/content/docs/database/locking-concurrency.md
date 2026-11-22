---
title: "Locking & Concurrency"
description: "Kontrol konkurensi di database: MVCC, row lock (FOR UPDATE, FOR SHARE, SKIP LOCKED, NOWAIT), table lock & lock saat DDL, advisory lock, optimistic vs pessimistic locking, deadlock dan pencegahannya, serta pola job queue di PostgreSQL."
level: advanced
status: complete
version: "PostgreSQL 15+"
updated: 2026-11-12
tags: [database, locking, concurrency, deadlock, postgresql]
---

## Overview

Ketika banyak transaksi mengakses data yang sama, database memakai **MVCC** (pembaca tidak memblokir penulis) dan
**lock** (penulis yang mengubah baris yang sama saling menunggu). Aplikasi dapat menambah kontrol dengan lock eksplisit
(**pessimistic**) atau pengecekan versi (**optimistic**).

## Why It Matters

Konkurensi yang salah menghasilkan data rusak (stok minus, double booking), sistem lambat karena antrian lock, atau
deadlock. Migrasi skema yang mengambil lock berat dapat membuat aplikasi "hang" di production.

## Core Concepts

| Mekanisme | Perilaku |
| --- | --- |
| MVCC | `SELECT` biasa membaca snapshot tanpa lock baris; tidak menunggu penulis |
| Row lock implisit | `UPDATE`/`DELETE` mengunci baris yang diubah hingga commit |
| `SELECT ... FOR UPDATE` | Kunci baris untuk diubah; transaksi lain yang ingin mengubah/mengunci menunggu |
| `FOR NO KEY UPDATE` | Lebih lemah; tidak memblokir insert FK yang merujuk baris |
| `FOR SHARE` | Mencegah baris diubah, boleh dibaca/di-share bersama |
| `NOWAIT` | Gagal langsung bila baris terkunci |
| `SKIP LOCKED` | Lewati baris yang terkunci (cocok untuk antrian job) |
| Table lock | Diambil otomatis oleh DDL (`ALTER TABLE`) — beberapa memblokir semua akses |
| Advisory lock | Lock berbasis angka yang maknanya ditentukan aplikasi |

### Optimistic vs pessimistic

| | Optimistic | Pessimistic |
| --- | --- | --- |
| Cara | Kolom `version`, cek saat update | Kunci baris sebelum mengubah |
| Cocok | Kontensi rendah, edit lewat UI/offline | Kontensi tinggi, operasi singkat |
| Kegagalan | Konflik → 409 / retry | Menunggu; risiko deadlock |

### Deadlock

T1 mengunci A lalu menunggu B; T2 mengunci B lalu menunggu A. PostgreSQL mendeteksinya (setelah `deadlock_timeout`)
dan membatalkan salah satu dengan error `40P01`.

## How It Works

```text
T1: BEGIN; UPDATE products SET stock = stock - 1 WHERE id = 7;   -- kunci baris 7
T2: BEGIN; UPDATE products SET stock = stock - 2 WHERE id = 7;   -- MENUNGGU T1
T1: COMMIT;                                                       -- T2 lanjut, melihat nilai terbaru (Read Committed)
SELECT stock FROM products WHERE id = 7;                          -- pembaca lain tidak pernah menunggu
```

## Implementation

### Pessimistic: transfer stok antar outlet (urutan lock konsisten)

```sql
BEGIN;
-- Kunci kedua baris dalam urutan id yang sama untuk mencegah deadlock
SELECT * FROM stock_levels
WHERE product_id = $1 AND location_id IN ($from, $to)
ORDER BY location_id
FOR UPDATE;
UPDATE stock_levels SET on_hand = on_hand - $qty WHERE product_id = $1 AND location_id = $from AND on_hand >= $qty;
UPDATE stock_levels SET on_hand = on_hand + $qty WHERE product_id = $1 AND location_id = $to;
COMMIT;
```

### Optimistic: edit tiket

```sql
UPDATE tickets SET status = $new_status, version = version + 1
WHERE id = $id AND version = $expected_version;
-- 0 baris → kembalikan 409 Conflict; klien memuat ulang dan mencoba lagi
```

### Antrian job dengan SKIP LOCKED

```sql
-- Banyak worker mengambil job berbeda tanpa saling menunggu
WITH next AS (
  SELECT id FROM jobs
  WHERE status = 'pending' AND run_at <= now()
  ORDER BY run_at
  FOR UPDATE SKIP LOCKED
  LIMIT 10
)
UPDATE jobs SET status = 'running', locked_at = now()
FROM next WHERE jobs.id = next.id
RETURNING jobs.*;
```

### Advisory lock: memastikan hanya satu proses menjalankan tugas terjadwal

```sql
SELECT pg_try_advisory_lock(42) AS acquired;      -- true → jalankan; false → instance lain sedang menjalankan
-- ... kerjakan ...
SELECT pg_advisory_unlock(42);
```

### Melihat siapa yang memblokir

```sql
SELECT pid, pg_blocking_pids(pid) AS blocked_by, state, wait_event_type, left(query, 60) AS query
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;
```

### Migrasi tanpa mengunci lama

```sql
SET lock_timeout = '3s';                                          -- gagal cepat daripada mengantrekan semua query
CREATE INDEX CONCURRENTLY ix_orders__customer ON orders (customer_id);
ALTER TABLE orders ADD COLUMN note text;                           -- cepat (tanpa default volatile)
```

## Best Practices

- **Transaksi sesingkat mungkin**; jangan panggil API eksternal saat memegang lock.
- **Urutan penguncian konsisten** di seluruh kode untuk mencegah deadlock.
- **Update atomik bersyarat** sebelum mempertimbangkan lock eksplisit.
- **Optimistic locking untuk edit dari UI/mobile**.
- **`SKIP LOCKED`** untuk antrian kerja; **`lock_timeout`** untuk migrasi.
- **Retry otomatis** untuk deadlock dan serialization failure.

## Anti-Patterns

- `SELECT ... FOR UPDATE` lalu menunggu input pengguna sebelum commit.
- Mengunci seluruh tabel (`LOCK TABLE`) untuk operasi rutin.
- Menjalankan `ALTER TABLE` berat di jam sibuk tanpa `lock_timeout`.
- Menelan error deadlock tanpa retry.
- Distributed lock buatan sendiri tanpa batas waktu (lock tidak pernah dilepas setelah crash).

## Performance Considerations

Lock contention pada "hot row" (mis. counter global, stok produk populer) membatasi throughput. Solusinya: pecah
counter (sharded counter), antrean per produk, agregasi asinkron, atau model ledger (insert-only) yang lalu dijumlahkan.

## Security Considerations

Race condition adalah celah keamanan (voucher dipakai dua kali, saldo ditarik ganda). Uji endpoint kritis dengan
request paralel, dan lindungi dengan constraint unik, update atomik, atau lock.

## Real-World Use Cases

- Transfer stok antar gudang dengan `FOR UPDATE` terurut.
- Antrian notifikasi/email dengan `SKIP LOCKED` di PostgreSQL tanpa broker terpisah.
- Edit tiket bersamaan dengan optimistic locking.
- Satu scheduler aktif di banyak instance dengan advisory lock.

## Interview Questions

1. Apakah SELECT di PostgreSQL memblokir UPDATE?
2. Optimistic vs pessimistic locking — kapan memakai masing-masing?
3. Apa itu deadlock dan bagaimana mencegahnya?
4. Apa itu `SKIP LOCKED` dan kegunaannya?
5. Bagaimana menjalankan migrasi tanpa mengganggu trafik?

## Sample Answers

1. Tidak — berkat MVCC, SELECT biasa membaca snapshot dan tidak memblokir maupun diblokir penulis; hanya locking read (`FOR UPDATE/SHARE`) yang berinteraksi dengan lock baris.
2. Optimistic untuk kontensi rendah dan edit yang lama (UI, offline) — cek version saat update; pessimistic untuk operasi singkat dengan kontensi tinggi di mana konflik sering terjadi.
3. Dua transaksi saling menunggu lock yang dipegang lawannya; cegah dengan urutan lock konsisten, transaksi singkat, index tepat (agar lock lebih sedikit), dan retry bila tetap terjadi.
4. Opsi locking read yang melewati baris yang sudah terkunci, sehingga banyak worker dapat mengambil job berbeda dari tabel antrian secara paralel tanpa menunggu.
5. `CREATE INDEX CONCURRENTLY`, `lock_timeout` agar DDL gagal cepat, perubahan bertahap (expand–contract), backfill dalam batch kecil, dan jadwalkan di jam sepi.

## Practical Exercises

1. Buat deadlock sengaja dengan dua sesi, lalu perbaiki dengan urutan lock.
2. Implementasikan antrian job dengan `SKIP LOCKED` dan jalankan 3 worker paralel.
3. Uji endpoint klaim voucher dengan 50 request paralel; pastikan hanya satu yang berhasil.

## Quick Reference

```text
MVCC: baca tidak memblokir tulis · UPDATE mengunci baris hingga commit
FOR UPDATE · FOR SHARE · NOWAIT · SKIP LOCKED (job queue) · advisory lock (singleton task)
Optimistic (version, 409) vs pessimistic (FOR UPDATE) · deadlock: urutan lock + retry (40P01)
Migrasi: lock_timeout · CREATE INDEX CONCURRENTLY · pg_blocking_pids untuk diagnosis
```

## Related Topics

- [Isolation Levels](/database/isolation-levels/)
- [Transactions & ACID](/database/transactions-acid/)
- [Database Migration](/database/migration/)
