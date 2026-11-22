---
title: "Transactions & ACID"
description: "Transaksi database, properti ACID, cara kerja WAL dan MVCC, implementasi di SQL/Node.js/Drift, serta pola yang aman untuk transaksi bisnis seperti penjualan dan transfer saldo."
level: intermediate
status: complete
version: "PostgreSQL 15+ · MySQL 8 InnoDB · SQLite 3"
updated: 2026-11-07
tags: [database, transaction, acid, mvcc, wal, concurrency]
---

## Overview

**Transaksi** adalah sekumpulan operasi database yang diperlakukan sebagai **satu unit kerja**: semuanya berhasil
(`COMMIT`) atau semuanya dibatalkan (`ROLLBACK`). Jaminan transaksi dirangkum dalam **ACID**:

| Properti | Jaminan | Mekanisme umum |
| --- | --- | --- |
| **Atomicity** | Semua atau tidak sama sekali | Undo log / MVCC + WAL |
| **Consistency** | Constraint & invariant tetap valid | PK, FK, UNIQUE, CHECK, trigger + logika aplikasi |
| **Isolation** | Transaksi paralel tidak saling mengganggu (sesuai level) | MVCC, lock |
| **Durability** | Data yang sudah COMMIT bertahan walau crash | Write-Ahead Log (WAL/redo log) + fsync |

## Why It Matters

Transaksi bisnis hampir selalu melibatkan banyak baris: penjualan = insert order + insert items + kurangi stok +
catat pembayaran. Tanpa transaksi, crash atau error di tengah jalan meninggalkan data setengah jadi — order tanpa item,
stok berkurang tanpa penjualan, atau saldo terdebit tanpa dikredit. Data finansial yang tidak konsisten jauh lebih mahal
diperbaiki daripada dicegah.

## Core Concepts

- **BEGIN / COMMIT / ROLLBACK** — batas transaksi.
- **Autocommit** — tanpa `BEGIN`, setiap statement adalah transaksi sendiri.
- **SAVEPOINT** — titik rollback parsial di dalam transaksi.
- **MVCC (Multi-Version Concurrency Control)** — setiap update membuat versi baris baru; pembaca melihat *snapshot* konsisten tanpa memblokir penulis.
- **WAL (Write-Ahead Log)** — perubahan ditulis ke log berurutan dan di-*fsync* sebelum COMMIT dikonfirmasi; data page bisa ditulis belakangan.
- **Isolation level** — trade-off konsistensi vs konkurensi ([Isolation Levels](/database/isolation-levels/)).
- **Deadlock** — dua transaksi saling menunggu lock; database membatalkan salah satunya.

## How It Works

```text
BEGIN
  UPDATE accounts SET balance = balance - 100 WHERE id = 'A';  → versi baru baris A (belum terlihat tx lain)
  UPDATE accounts SET balance = balance + 100 WHERE id = 'B';  → versi baru baris B
COMMIT
  1. record perubahan + commit record ditulis ke WAL
  2. WAL di-fsync ke disk                ← sejak titik ini transaksi DURABLE
  3. "COMMIT" dikembalikan ke client
  4. data page diperbarui di disk nanti (checkpoint)
Crash sebelum (2)  → saat recovery, transaksi dianggap tidak pernah terjadi (atomic)
Crash setelah (2)  → saat recovery, WAL di-replay → perubahan dipulihkan (durable)
```

Dengan MVCC, transaksi lain yang membaca baris A selama transaksi berjalan melihat **versi lama** (sudah committed) —
tidak pernah melihat state setengah jadi (tidak ada *dirty read*).

## Implementation

### SQL: penjualan atomik dengan proteksi stok

```sql
BEGIN;

INSERT INTO orders (id, outlet_id, cashier_id, total, status)
VALUES ($1, $2, $3, $4, 'PAID');

INSERT INTO order_items (order_id, product_id, qty, price)
SELECT $1, x.product_id, x.qty, p.price                       -- harga dari server, bukan client
FROM jsonb_to_recordset($5) AS x(product_id uuid, qty int)
JOIN products p ON p.id = x.product_id;

-- Update atomik bersyarat: gagal jika stok tidak cukup
UPDATE stocks s SET qty = s.qty - x.qty
FROM jsonb_to_recordset($5) AS x(product_id uuid, qty int)
WHERE s.product_id = x.product_id AND s.outlet_id = $2 AND s.qty >= x.qty;
-- aplikasi memeriksa jumlah baris yang ter-update == jumlah item; jika kurang → ROLLBACK

INSERT INTO stock_movements (product_id, outlet_id, delta, reason, ref_id)
SELECT x.product_id, $2, -x.qty, 'SALE', $1 FROM jsonb_to_recordset($5) AS x(product_id uuid, qty int);

COMMIT;
```

```sql
-- Pengaman terakhir di level schema
ALTER TABLE stocks ADD CONSTRAINT stock_non_negative CHECK (qty >= 0);
```

### Node.js (node-postgres): pola transaksi yang benar

```ts
import { Pool, type PoolClient } from 'pg';
const pool = new Pool({ max: 20 });

export async function withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();            // SATU koneksi untuk seluruh transaksi
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();                             // selalu kembalikan ke pool
  }
}

await withTransaction(async (tx) => {
  await tx.query('INSERT INTO orders (...) VALUES (...)', [/* ... */]);
  const r = await tx.query(
    'UPDATE stocks SET qty = qty - $1 WHERE product_id = $2 AND outlet_id = $3 AND qty >= $1',
    [qty, productId, outletId],
  );
  if (r.rowCount !== 1) throw new InsufficientStockError(productId);   // → ROLLBACK
});
```

> Kesalahan klasik: memanggil `pool.query('BEGIN')` lalu `pool.query(...)` — setiap `pool.query` bisa memakai koneksi berbeda,
> sehingga statement tidak berada dalam transaksi yang sama.

### Retry untuk serialization failure / deadlock

```ts
const RETRYABLE = new Set(['40001', '40P01']);   // serialization_failure, deadlock_detected
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e: any) {
      if (!RETRYABLE.has(e.code) || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 2 ** i * 20 + Math.random() * 20)); // backoff + jitter
    }
  }
}
```

### Flutter (Drift): transaksi lokal

```dart
await db.transaction(() async {
  await db.into(db.orders).insert(order);
  await db.batch((b) => b.insertAll(db.orderItems, items));
  await db.into(db.outbox).insert(outboxEntry);   // data + outbox atomik (offline-first)
});
// Exception di dalam callback → rollback otomatis
```

## Best Practices

- **Transaksi sependek mungkin** — jangan memanggil HTTP/API eksternal, mengirim email, atau menunggu input user di dalam transaksi. Alasannya: lock dan koneksi tertahan, throughput turun, risiko deadlock naik.
- **Gunakan satu koneksi untuk seluruh transaksi** dan selalu `ROLLBACK` di jalur error + `release` di `finally`.
- **Biarkan database menegakkan invariant** (FK, UNIQUE, CHECK) — aplikasi bisa punya bug, constraint tidak.
- **Gunakan update atomik/bersyarat** (`SET qty = qty - 1 WHERE qty >= 1`) daripada read-modify-write di aplikasi.
- **Akses tabel/baris dalam urutan konsisten** antar kode untuk mengurangi deadlock.
- **Siapkan retry** untuk error yang memang retryable (deadlock, serialization failure) — dengan backoff.
- **Side effect setelah COMMIT** (kirim notifikasi) — atau gunakan **transactional outbox** agar event tidak hilang.

## Anti-Patterns

- Memanggil payment gateway di tengah transaksi DB lalu menahan lock beberapa detik.
- Transaksi raksasa (update jutaan baris sekaligus) → lock lama, WAL membengkak, replikasi tertinggal. Lakukan per batch.
- Menelan exception lalu tetap `COMMIT`.
- Mengandalkan "cek dulu lalu insert" (`SELECT` lalu `INSERT`) untuk mencegah duplikat tanpa unique constraint — race condition.
- Membuka transaksi lalu lupa menutupnya (*idle in transaction*) → menghambat vacuum & menahan lock.

## Performance Considerations

- **Batch insert dalam satu transaksi** jauh lebih cepat daripada autocommit per baris (fsync sekali vs ribuan kali) — sangat terasa di SQLite.
- Transaksi panjang di PostgreSQL menahan *xmin horizon* → vacuum tidak bisa membersihkan dead tuple → bloat.
- `synchronous_commit` (PostgreSQL) dapat dilonggarkan untuk data tidak kritis demi latency — dengan risiko kehilangan transaksi terakhir saat crash. Jangan untuk data finansial.
- Ukuran connection pool yang wajar; transaksi lama menghabiskan pool.

## Security Considerations

- Parameterized query di dalam transaksi tetap wajib.
- **Audit trail** (siapa mengubah apa) sebaiknya ditulis **dalam transaksi yang sama** dengan perubahan agar tidak ada perubahan tanpa jejak.
- Least privilege: user DB aplikasi tidak perlu `DROP`/`ALTER`.
- Untuk ledger keuangan, gunakan append-only (insert) + constraint, bukan update saldo tanpa histori.

## Real-World Use Cases

- **POS:** order + items + stok + pembayaran + outbox dalam satu transaksi.
- **Transfer saldo/e-wallet:** debit & kredit + entri ledger double-entry dalam satu transaksi dengan `SELECT ... FOR UPDATE` diurutkan berdasarkan id akun.
- **Booking tiket/kursi:** insert reservasi dengan unique constraint `(event_id, seat_no)` → hanya satu yang berhasil.

## Interview Questions

1. **(Fundamental)** Apa itu transaksi dan jelaskan ACID?
2. **(Intermediate)** Bagaimana database menjamin durability?
3. **(Intermediate)** Apa itu MVCC dan apa keuntungannya?
4. **(Intermediate)** Bagaimana mencegah stok minus saat dua kasir menjual barang yang sama?
5. **(Advanced)** Mengapa tidak boleh memanggil API pihak ketiga di dalam transaksi? Lalu bagaimana menjamin konsistensi?
6. **(Advanced)** Apa itu deadlock dan bagaimana menguranginya?

## Sample Answers

1. Transaksi adalah unit kerja yang berhasil seluruhnya atau dibatalkan seluruhnya. Atomicity: semua-atau-tidak. Consistency: constraint tetap valid. Isolation: transaksi paralel tidak melihat state setengah jadi milik yang lain (sesuai level). Durability: setelah commit, data bertahan crash.
2. Write-Ahead Logging: perubahan dicatat ke log berurutan dan di-fsync sebelum commit dikonfirmasi; saat recovery log di-replay untuk memulihkan transaksi yang sudah commit.
3. Database menyimpan beberapa versi baris; setiap transaksi membaca snapshot konsisten. Pembaca tidak memblokir penulis dan sebaliknya, sehingga konkurensi tinggi. Konsekuensinya perlu vacuum/purge versi lama.
4. Update atomik bersyarat (`qty = qty - n WHERE qty >= n`) dan cek affected rows, atau `SELECT ... FOR UPDATE` dalam transaksi, ditambah `CHECK (qty >= 0)` sebagai pengaman.
5. Transaksi akan menahan lock dan koneksi selama latency jaringan yang tidak terkendali, dan rollback DB tidak bisa membatalkan efek di pihak ketiga. Gunakan pola: simpan intent + outbox dalam transaksi → worker memanggil API (idempotent) → simpan hasil dalam transaksi baru; untuk alur multi-langkah gunakan saga dengan kompensasi.
6. Dua transaksi saling menunggu lock yang dipegang lainnya; DB mendeteksi dan membatalkan salah satu. Kurangi dengan urutan akses lock yang konsisten, transaksi pendek, index yang tepat (lock lebih sedikit baris), dan retry otomatis.

## Practical Exercises

1. Buat dua sesi `psql`; jalankan transaksi yang belum di-commit di sesi 1 dan amati apa yang terlihat di sesi 2.
2. Picu deadlock dengan dua sesi yang meng-update baris A lalu B dan B lalu A; baca pesan error-nya.
3. Implementasikan endpoint penjualan dengan `withTransaction` + update stok bersyarat; uji dengan 50 request paralel untuk stok 10.
4. Bandingkan waktu insert 10.000 baris di SQLite/Drift dengan dan tanpa transaksi.

## Quick Reference

- `BEGIN … COMMIT/ROLLBACK`; satu koneksi per transaksi.
- **A**tomic · **C**onsistent · **I**solated · **D**urable (WAL + fsync).
- Pendek: **tanpa network call** di dalam transaksi.
- Stok/saldo: update bersyarat + `CHECK` + ledger.
- Retry `40001`/`40P01` dengan backoff.
- Side effect: setelah commit atau via **outbox**.

## Related Topics

- [Isolation Levels](/database/isolation-levels/)
- [Locking & Concurrency](/database/locking-concurrency/)
- [Offline-First Application](/flutter/offline-first/)
- [Banking / Financial Application](/system-design/case-studies/banking-financial/)
- Referensi resmi: [PostgreSQL — Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html), [PostgreSQL — MVCC](https://www.postgresql.org/docs/current/mvcc.html), [PostgreSQL — WAL](https://www.postgresql.org/docs/current/wal-intro.html).
