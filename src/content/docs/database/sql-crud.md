---
title: "SQL CRUD"
description: "Operasi dasar SQL: CREATE TABLE, INSERT (termasuk batch & RETURNING), SELECT (filter, sort, limit, LIKE, IN, BETWEEN), UPDATE, DELETE, UPSERT (ON CONFLICT), soft delete, serta praktik aman dan parameterized query dari aplikasi."
level: beginner
status: complete
version: "PostgreSQL 15+ (sintaks MySQL dicatat bila berbeda)"
updated: 2026-11-12
tags: [database, sql, crud, insert, update, upsert]
---

## Overview

**CRUD** — Create, Read, Update, Delete — adalah empat operasi dasar data, dipetakan ke SQL `INSERT`, `SELECT`,
`UPDATE`, dan `DELETE`. Halaman ini membahas sintaks yang paling sering dipakai beserta jebakan dan praktik amannya.

## Why It Matters

Walaupun memakai ORM, Anda tetap perlu membaca SQL yang dihasilkan, menulis query laporan, men-debug data di production,
dan menjawab soal SQL di interview.

## Core Concepts

| Operasi | SQL | REST padanan |
| --- | --- | --- |
| Create | `INSERT INTO ... VALUES ...` | `POST` |
| Read | `SELECT ... FROM ... WHERE ...` | `GET` |
| Update | `UPDATE ... SET ... WHERE ...` | `PUT`/`PATCH` |
| Delete | `DELETE FROM ... WHERE ...` | `DELETE` |
| Upsert | `INSERT ... ON CONFLICT ... DO UPDATE` (PG) / `ON DUPLICATE KEY UPDATE` (MySQL) | `PUT` idempoten |

Operator `WHERE` umum: `=`, `<>`, `<`, `>=`, `IN (...)`, `BETWEEN a AND b` (inklusif), `LIKE 'kopi%'`,
`ILIKE` (PG, case-insensitive), `IS NULL`, `AND`/`OR`/`NOT`.

## How It Works

```text
INSERT → validasi constraint → tulis baris + index → WAL
SELECT → FROM → WHERE → (GROUP BY/HAVING) → SELECT kolom → ORDER BY → LIMIT/OFFSET
UPDATE/DELETE → cari baris dengan WHERE (pakai index bila ada) → kunci baris → ubah/hapus
```

## Implementation

```sql
-- CREATE
CREATE TABLE products (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku        text NOT NULL UNIQUE,
  name       text NOT NULL,
  category   text NOT NULL,
  price      numeric(12,2) NOT NULL CHECK (price >= 0),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- INSERT satu & banyak baris, kembalikan id
INSERT INTO products (sku, name, category, price)
VALUES ('KP-001', 'Kopi Susu', 'coffee', 18000)
RETURNING id;

INSERT INTO products (sku, name, category, price) VALUES
  ('KP-002', 'Americano', 'coffee', 15000),
  ('RT-001', 'Roti Bakar', 'food', 12000);

-- READ
SELECT id, name, price
FROM products
WHERE category = 'coffee' AND is_active AND price BETWEEN 10000 AND 20000
ORDER BY price DESC, name
LIMIT 20 OFFSET 0;

SELECT * FROM products WHERE name ILIKE '%kopi%';           -- pencarian sederhana (PG)
SELECT * FROM products WHERE sku IN ('KP-001', 'RT-001');

-- UPDATE (selalu dengan WHERE)
UPDATE products SET price = price * 1.05
WHERE category = 'coffee'
RETURNING id, price;

-- DELETE vs soft delete
DELETE FROM products WHERE id = 42;
UPDATE products SET is_active = false WHERE id = 42;         -- "nonaktifkan", data historis tetap

-- UPSERT: sinkron katalog dari pusat (idempoten)
INSERT INTO products (sku, name, category, price)
VALUES ('KP-001', 'Kopi Susu Gula Aren', 'coffee', 20000)
ON CONFLICT (sku) DO UPDATE
SET name = EXCLUDED.name, price = EXCLUDED.price;
-- MySQL: ... ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price)  (sintaks alias baru di 8.0.19+)
```

### Aman saat mengubah data production

```sql
BEGIN;
SELECT count(*) FROM products WHERE category = 'coffee';     -- 1. cek dampak
UPDATE products SET price = price * 1.05 WHERE category = 'coffee';   -- 2. jalankan
SELECT id, price FROM products WHERE category = 'coffee' LIMIT 5;     -- 3. verifikasi
COMMIT;   -- atau ROLLBACK bila tidak sesuai
```

### Dari aplikasi: parameterized query

```ts
// node-postgres
await pool.query('SELECT id, name FROM products WHERE category = $1 AND price <= $2', [category, maxPrice]);
```

```dart
// Drift (custom query) — tetap gunakan variabel, bukan interpolasi string
db.customSelect('SELECT * FROM products WHERE category = ?', variables: [Variable.withString(category)]);
```

## Best Practices

- **Sebutkan kolom secara eksplisit** di `SELECT` dan `INSERT`.
- **Selalu `WHERE` pada UPDATE/DELETE**, cek dengan `SELECT` lebih dulu, jalankan dalam transaksi.
- **`RETURNING`** untuk mendapatkan data hasil tanpa query tambahan (PG; MySQL terbatas).
- **Batch insert** untuk banyak baris.
- **Upsert** untuk sinkronisasi idempoten.
- **Parameterized query** — jangan pernah menyusun SQL dengan interpolasi input.

## Anti-Patterns

- `SELECT *` di kode aplikasi (kolom baru ikut terkirim, index-only scan tidak bisa dipakai).
- `UPDATE products SET price = 0;` tanpa `WHERE`.
- Insert dalam loop satu per satu tanpa transaksi.
- `LIKE '%kata%'` pada tabel besar tanpa index trigram/full-text.
- `OFFSET` besar untuk pagination tabel besar.

## Performance Considerations

Batch insert dan `COPY` jauh lebih cepat dari ribuan insert terpisah. `WHERE` pada UPDATE/DELETE perlu index agar tidak
memindai seluruh tabel dan mengunci banyak baris. Untuk pencarian teks gunakan index `pg_trgm` atau full-text search.
Lihat [Indexing](/database/indexing/).

## Security Considerations

SQL injection adalah risiko utama CRUD — gunakan parameterized query/ORM. Batasi hak user aplikasi (mis. tanpa `DROP`),
dan catat audit untuk perubahan data penting.

## Real-World Use Cases

- Upsert katalog produk dari kantor pusat ke outlet.
- Penyesuaian harga massal dengan transaksi dan verifikasi.
- Soft delete produk yang sudah pernah terjual.

## Interview Questions

1. Apa itu CRUD dan padanannya di SQL?
2. Apa itu upsert dan kapan dipakai?
3. Apa beda `DELETE`, `TRUNCATE`, dan `DROP`?
4. Bagaimana mencegah SQL injection?
5. Mengapa sebaiknya tidak memakai `SELECT *`?

## Sample Answers

1. Create/Read/Update/Delete → `INSERT`, `SELECT`, `UPDATE`, `DELETE`.
2. Insert atau update bila baris dengan kunci unik sudah ada (`ON CONFLICT DO UPDATE`); untuk sinkronisasi dan operasi idempoten.
3. `DELETE` menghapus baris terpilih (bisa dengan WHERE, tercatat per baris, memicu trigger); `TRUNCATE` mengosongkan seluruh tabel dengan cepat; `DROP` menghapus tabel beserta strukturnya.
4. Parameterized query/prepared statement atau ORM/query builder, validasi input, dan hak akses minimum.
5. Mengirim kolom yang tidak diperlukan, rapuh terhadap perubahan skema, dan menghalangi optimasi seperti index-only scan.

## Practical Exercises

1. Buat tabel `products` dan isi 20 baris dengan satu `INSERT` batch.
2. Tulis upsert untuk sinkronisasi harga dari file CSV.
3. Naikkan harga kategori tertentu 5% dalam transaksi dengan langkah verifikasi.

## Quick Reference

```text
INSERT ... RETURNING · batch VALUES (...),(...) · SELECT kolom eksplisit · WHERE · ORDER BY · LIMIT
UPDATE/DELETE: WHERE + cek dulu + transaksi · upsert: ON CONFLICT (key) DO UPDATE SET x = EXCLUDED.x
Parameterized query · soft delete untuk data historis
```

## Related Topics

- [JOIN](/database/joins/)
- [GROUP BY & HAVING](/database/group-by-having/)
- [SQL Challenges](/interview/coding-test/sql-challenges/)
