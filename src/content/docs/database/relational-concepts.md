---
title: "Relational Database Concepts"
description: "Konsep model relasional: relasi/tabel, tuple, atribut, domain & tipe data, NULL dan three-valued logic, kunci, integritas (entity, referential, domain), operasi relasional, dan bagaimana SQL memetakan konsep tersebut."
level: beginner
status: complete
updated: 2026-11-12
tags: [database, relational, sql, null-handling, integrity]
---

## Overview

**Model relasional** (diperkenalkan E. F. Codd, 1970) menyimpan data dalam **relasi** (tabel) yang terdiri dari
**tuple** (baris) dan **atribut** (kolom). Data dihubungkan lewat nilai kunci, bukan pointer, dan dimanipulasi dengan
operasi himpunan yang diwujudkan oleh SQL.

## Why It Matters

Memahami konsep dasar ini membuat Anda menulis query yang benar (terutama terkait `NULL` dan JOIN), merancang skema yang
konsisten, dan memahami pesan error constraint.

## Core Concepts

| Istilah teori | Istilah SQL | Contoh |
| --- | --- | --- |
| Relation | Table | `products` |
| Tuple | Row | (1, 'Kopi Susu', 18000) |
| Attribute | Column | `price` |
| Domain | Data type + constraint | `integer CHECK (price >= 0)` |
| Degree | Jumlah kolom | 3 |
| Cardinality | Jumlah baris | 2.000 |
| Candidate key | Kolom unik yang bisa jadi PK | `id`, `sku` |
| Primary key | Kunci yang dipilih | `id` |
| Foreign key | Referensi ke kunci tabel lain | `order_items.product_id` |

### Integritas

| Jenis | Aturan | Penegakan |
| --- | --- | --- |
| Entity integrity | PK unik & tidak NULL | `PRIMARY KEY` |
| Referential integrity | FK harus menunjuk baris yang ada | `FOREIGN KEY ... REFERENCES` |
| Domain integrity | Nilai sesuai tipe & aturan | Tipe data, `NOT NULL`, `CHECK`, `UNIQUE` |
| Business rules | Aturan bisnis | Constraint, trigger, logika aplikasi |

### NULL dan three-valued logic

`NULL` berarti "tidak diketahui/tidak ada", bukan nol atau string kosong. Perbandingan dengan `NULL` menghasilkan
`UNKNOWN`, bukan `TRUE`/`FALSE`.

```text
NULL = NULL      → UNKNOWN      (gunakan IS NULL)
NULL + 1         → NULL
WHERE x <> 'A'   → baris dengan x NULL TIDAK ikut
COUNT(col)       → mengabaikan NULL; COUNT(*) tidak
```

### Operasi relasional → SQL

| Operasi | SQL |
| --- | --- |
| Selection (σ) | `WHERE` |
| Projection (π) | daftar kolom di `SELECT` |
| Join (⋈) | `JOIN ... ON` |
| Union / Intersect / Difference | `UNION`, `INTERSECT`, `EXCEPT` |
| Rename | `AS` |
| Aggregation | `GROUP BY` + fungsi agregat |

## How It Works

```text
customers(id PK, name)            orders(id PK, customer_id FK → customers.id, total)
  1 | Rina                          10 | 1 | 50000
  2 | Bayu                          11 | 1 | 20000
Relasi direpresentasikan oleh NILAI customer_id, bukan pointer fisik.
JOIN menggabungkan tuple yang nilai kuncinya cocok.
```

## Implementation

```sql
CREATE TABLE customers (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  phone       text UNIQUE,                               -- boleh NULL, tapi bila ada harus unik
  member_tier text NOT NULL DEFAULT 'regular'
              CHECK (member_tier IN ('regular', 'silver', 'gold'))
);

CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint REFERENCES customers(id),           -- NULL = pelanggan umum (walk-in)
  total       numeric(14,2) NOT NULL CHECK (total >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Jebakan NULL
SELECT * FROM orders WHERE customer_id <> 1;               -- order walk-in (NULL) tidak muncul
SELECT * FROM orders WHERE customer_id IS DISTINCT FROM 1; -- termasuk NULL
SELECT COALESCE(phone, '-') FROM customers;                -- ganti NULL saat ditampilkan
```

## Best Practices

- **`NOT NULL` secara default**; izinkan NULL hanya bila "tidak ada nilai" bermakna.
- **Gunakan tipe data yang tepat** (`numeric` untuk uang, `timestamptz` untuk waktu, `boolean`, `uuid`).
- **Tegakkan integritas di database** dengan constraint, bukan hanya di aplikasi.
- **Pahami perilaku NULL** di perbandingan, agregat, dan `NOT IN`.

## Anti-Patterns

- Memakai string kosong atau `0` sebagai pengganti "tidak ada".
- Menyimpan banyak nilai dalam satu kolom (`'1,5,9'`).
- Tipe `text` untuk semua kolom.
- Mengandalkan urutan baris tanpa `ORDER BY` (relasi tidak memiliki urutan).

## Performance Considerations

Tipe data yang tepat dan ringkas menghemat storage dan mempercepat index. Constraint memiliki biaya kecil saat tulis,
tetapi jauh lebih murah daripada membersihkan data yang rusak.

## Security Considerations

Constraint mencegah data tidak valid walaupun ada bug di aplikasi atau akses langsung ke database. Gabungkan dengan hak
akses minimum agar hanya aplikasi yang dapat menulis tabel tertentu.

## Real-World Use Cases

- Pelanggan opsional pada order kasir (FK nullable).
- Status terbatas dengan `CHECK` atau tipe enum.
- Laporan yang benar karena perilaku `NULL` dipahami.

## Interview Questions

1. Apa itu model relasional?
2. Apa arti NULL dan bagaimana perilakunya di perbandingan?
3. Sebutkan jenis integritas data.
4. Apa beda candidate key dan primary key?
5. Apakah baris di tabel memiliki urutan?

## Sample Answers

1. Model data yang menyimpan data dalam relasi (tabel) berisi tuple dan atribut, menghubungkan data melalui nilai kunci, dan dimanipulasi dengan operasi relasional (diwujudkan SQL).
2. Nilai tidak diketahui/tidak ada. Perbandingan dengan NULL menghasilkan UNKNOWN sehingga baris tidak lolos `WHERE`; gunakan `IS NULL`/`IS DISTINCT FROM`; agregat seperti `SUM`/`COUNT(col)` mengabaikan NULL.
3. Entity integrity (PK unik & tidak null), referential integrity (FK valid), domain integrity (tipe & aturan nilai), dan aturan bisnis.
4. Candidate key adalah setiap kolom/kombinasi minimal yang unik untuk setiap baris; primary key adalah candidate key yang dipilih sebagai identitas utama.
5. Tidak — relasi adalah himpunan; urutan hasil hanya dijamin dengan `ORDER BY`.

## Practical Exercises

1. Buat tabel `customers` & `orders` di atas dan uji 5 query dengan NULL.
2. Coba insert data yang melanggar setiap constraint dan baca pesan errornya.
3. Tulis query `UNION`, `INTERSECT`, `EXCEPT` untuk pelanggan bulan ini vs bulan lalu.

## Quick Reference

```text
Relation=table · tuple=row · attribute=column · domain=tipe+aturan
Integritas: entity (PK) · referential (FK) · domain (NOT NULL/CHECK/UNIQUE)
NULL ≠ 0 ≠ '' · = NULL → UNKNOWN · IS NULL · COALESCE · tanpa ORDER BY tidak ada urutan
```

## Related Topics

- [Primary Key, Foreign Key & Jenis Relasi](/database/keys-relationships/)
- [SQL CRUD](/database/sql-crud/)
- [Normalization & Denormalization](/database/normalization/)
