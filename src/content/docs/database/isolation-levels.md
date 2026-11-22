---
title: "Isolation Levels"
description: "Isolation level transaksi: anomali dirty read, non-repeatable read, phantom read, lost update, write skew; Read Uncommitted hingga Serializable; perilaku nyata di PostgreSQL dan MySQL InnoDB; serta cara memilih level dan menangani serialization failure."
level: advanced
status: complete
version: "PostgreSQL 15+ · MySQL 8 InnoDB"
updated: 2026-11-12
tags: [database, isolation, transactions, concurrency, mvcc]
---

## Overview

**Isolation** (huruf I di ACID) menentukan seberapa jauh transaksi yang berjalan bersamaan dapat melihat dan memengaruhi
perubahan satu sama lain. Standar SQL mendefinisikan empat level; semakin tinggi levelnya, semakin sedikit anomali,
tetapi semakin besar kemungkinan transaksi menunggu atau gagal dan harus diulang.

## Why It Matters

Bug konkurensi (stok minus, saldo salah, jadwal ganda) jarang muncul di test lokal tetapi muncul saat banyak pengguna
aktif. Memahami isolation level membantu memilih antara level yang lebih tinggi, locking eksplisit, atau constraint.

## Core Concepts

### Anomali

| Anomali | Skenario |
| --- | --- |
| Dirty read | T1 membaca perubahan T2 yang belum commit (lalu T2 rollback) |
| Non-repeatable read | T1 membaca baris dua kali, nilainya berubah karena T2 commit di antaranya |
| Phantom read | T1 menjalankan query rentang dua kali, muncul/hilang baris karena insert/delete T2 |
| Lost update | T1 & T2 membaca nilai sama lalu menulis; salah satu update hilang |
| Write skew | Dua transaksi membaca kondisi yang sama, masing-masing menulis baris berbeda, bersama-sama melanggar aturan |

### Level standar SQL vs implementasi

| Level | Dirty | Non-repeatable | Phantom | PostgreSQL | MySQL InnoDB |
| --- | --- | --- | --- | --- | --- |
| Read Uncommitted | mungkin | mungkin | mungkin | Diperlakukan sebagai Read Committed | Benar-benar membaca data belum commit |
| Read Committed | ✗ | mungkin | mungkin | **Default**; snapshot per statement | Snapshot per statement |
| Repeatable Read | ✗ | ✗ | mungkin (standar) | Snapshot per transaksi; phantom juga dicegah; lost update → error | **Default**; snapshot konsisten untuk SELECT biasa, locking read memakai next-key lock |
| Serializable | ✗ | ✗ | ✗ | SSI: mendeteksi konflik → `serialization_failure` (40001) | Locking read implisit untuk SELECT |

*Detail perilaku berbeda antar DBMS dan versi — selalu cek dokumentasi resmi DBMS Anda.*

## How It Works

PostgreSQL memakai **MVCC**: setiap transaksi/statement melihat *snapshot*. Di Read Committed snapshot diambil per
statement; di Repeatable Read dan Serializable per transaksi. Serializable menambahkan **Serializable Snapshot Isolation
(SSI)** yang melacak dependensi baca–tulis dan membatalkan transaksi yang akan menghasilkan hasil non-serial.

```text
Write skew (dokter jaga): aturan "minimal 1 dokter on-call"
T1: SELECT count(*) WHERE on_call → 2       T2: SELECT count(*) WHERE on_call → 2
T1: UPDATE dr_A SET on_call=false           T2: UPDATE dr_B SET on_call=false
COMMIT → 0 dokter on-call (Read Committed & Repeatable Read lolos; Serializable menolak salah satu)
```

## Implementation

### Mengatur level

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- ...
COMMIT;

SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL REPEATABLE READ;   -- PostgreSQL per sesi
```

### Lost update dan tiga cara mencegahnya

```sql
-- ❌ read-modify-write di aplikasi (Read Committed)
SELECT stock FROM products WHERE id = 1;          -- 5 (T1 & T2)
UPDATE products SET stock = 4 WHERE id = 1;       -- keduanya menulis 4 → satu penjualan hilang

-- ✅ 1. Update atomik
UPDATE products SET stock = stock - 1 WHERE id = 1 AND stock >= 1;

-- ✅ 2. Pessimistic lock
BEGIN; SELECT stock FROM products WHERE id = 1 FOR UPDATE; UPDATE ...; COMMIT;

-- ✅ 3. Optimistic (version)
UPDATE products SET stock = $new, version = version + 1 WHERE id = 1 AND version = $v;  -- 0 baris → konflik
```

### Retry untuk serialization failure (Node.js)

```ts
async function withSerializableRetry<T>(fn: (c: PoolClient) => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e: any) {
      await client.query('ROLLBACK');
      if ((e.code === '40001' || e.code === '40P01') && i < attempts) {      // serialization failure / deadlock
        await new Promise((r) => setTimeout(r, 20 * 2 ** i + Math.random() * 20));
        continue;
      }
      throw e;
    } finally {
      client.release();
    }
  }
}
```

## Best Practices

- **Pahami default DBMS Anda** (PostgreSQL: Read Committed; MySQL InnoDB: Repeatable Read).
- **Utamakan update atomik & constraint** untuk invariant sederhana.
- **Gunakan `FOR UPDATE` atau optimistic locking** untuk read-modify-write.
- **Serializable untuk invariant lintas baris yang kompleks**, dengan retry otomatis.
- **Transaksi singkat** dan tanpa panggilan jaringan eksternal di dalamnya.

## Anti-Patterns

- Mengandalkan Repeatable Read untuk mencegah write skew.
- Menaikkan semua transaksi ke Serializable tanpa logika retry.
- Mengasumsikan perilaku MySQL sama dengan PostgreSQL (atau sebaliknya).
- Transaksi panjang yang menahan snapshot (menghambat vacuum dan memperbesar konflik).

## Performance Considerations

Level lebih tinggi meningkatkan konflik dan pembatalan/penungguan. Di PostgreSQL, Serializable menambah overhead
pelacakan dan rollback yang harus diulang; ukur tingkat retry. Transaksi lama menahan versi baris lama sehingga tabel
membengkak (bloat).

## Security Considerations

Bug konkurensi dapat dieksploitasi (mis. menggunakan voucher sekali pakai dua kali dengan request paralel, menarik saldo
melebihi batas). Lindungi operasi bernilai uang dengan constraint unik, update atomik, atau Serializable + retry.

## Real-World Use Cases

- Voucher sekali pakai: UNIQUE constraint pada (voucher_id) di tabel penggunaan.
- Pemesanan kursi/slot: Serializable atau lock pada slot.
- Laporan konsisten selama beberapa query: Repeatable Read (snapshot tetap).

## Interview Questions

1. Sebutkan isolation level dan anomali yang dicegah.
2. Apa default PostgreSQL dan MySQL?
3. Apa itu write skew? Level apa yang mencegahnya?
4. Apa itu lost update dan cara mencegahnya?
5. Apa yang harus dilakukan aplikasi saat terjadi serialization failure?

## Sample Answers

1. Read Uncommitted (dirty read mungkin), Read Committed (cegah dirty read), Repeatable Read (cegah non-repeatable read), Serializable (cegah semua anomali — hasil setara eksekusi berurutan).
2. PostgreSQL: Read Committed. MySQL InnoDB: Repeatable Read.
3. Dua transaksi membaca kondisi yang sama lalu menulis baris berbeda sehingga bersama-sama melanggar aturan; dicegah Serializable atau dengan mengunci baris/kondisi yang dibaca (`FOR UPDATE` atau constraint).
4. Dua transaksi membaca nilai yang sama lalu menimpa satu sama lain; cegah dengan update atomik relatif, `SELECT ... FOR UPDATE`, atau optimistic locking dengan version (Repeatable Read di PostgreSQL juga akan menggagalkan salah satunya).
5. Rollback dan ulangi seluruh transaksi dengan backoff, dengan batas percobaan; operasi harus idempoten terhadap pengulangan.

## Practical Exercises

1. Reproduksi lost update dengan dua sesi `psql`, lalu perbaiki dengan tiga cara di atas.
2. Reproduksi write skew dan lihat Serializable menolak salah satu transaksi.
3. Tambahkan helper retry Serializable ke backend Anda.

## Quick Reference

```text
RU → RC (PG default) → RR (MySQL default) → Serializable
Anomali: dirty · non-repeatable · phantom · lost update · write skew
Cegah lost update: atomic UPDATE · FOR UPDATE · version · Write skew: Serializable/lock/constraint
Serializable = wajib retry (40001) · transaksi singkat
```

## Related Topics

- [Transactions & ACID](/database/transactions-acid/)
- [Locking & Concurrency](/database/locking-concurrency/)
- [Design an Inventory Management System](/interview/system-design/inventory-system/)
