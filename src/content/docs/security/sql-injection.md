---
title: "SQL Injection"
description: "SQL injection secara mendalam: cara kerja, jenis (in-band, blind, second-order), dampak, pencegahan dengan parameterized query di node-postgres, ORM/query builder (Prisma, Knex), identifier dinamis yang aman (ORDER BY, nama kolom), LIKE dan IN, raw query di ORM, SQLite di aplikasi mobile (Drift, Room), least privilege akun database, serta cara mengujinya."
level: intermediate
status: complete
updated: 2026-11-13
tags: [security, sql-injection, database, postgresql, sqlite, owasp]
---

## Overview

**SQL injection** terjadi ketika input pengguna digabungkan ke dalam string SQL sehingga input tersebut **ditafsirkan
sebagai bagian dari perintah SQL**, bukan sebagai data. Penyerang dapat membaca, mengubah, atau menghapus data, dan
terkadang menjalankan perintah di server.

## Why It Matters

SQL injection termasuk kategori *Injection* di OWASP Top 10 dan masih ditemukan di aplikasi produksi, terutama pada
query dinamis (filter, sort, pencarian) dan raw query di ORM. Pencegahannya sederhana dan pasti: **parameterized query**.

## Core Concepts

| Jenis | Cara kerja |
| --- | --- |
| In-band (error/union) | Hasil serangan terlihat langsung di respons (mis. `UNION SELECT`) |
| Blind boolean | Penyerang menyimpulkan data dari perbedaan respons benar/salah |
| Blind time-based | Menyimpulkan dari keterlambatan (`pg_sleep`) |
| Second-order | Input aman saat disimpan, tetapi kemudian dipakai tanpa parameter di query lain |

```text
Kode rentan:  "SELECT * FROM users WHERE email = '" + email + "'"
Input:        ' OR '1'='1
Hasil SQL:    SELECT * FROM users WHERE email = '' OR '1'='1'   → semua baris
```

## How It Works

Dengan **parameterized query (prepared statement)**, struktur SQL dikirim ke database **terpisah** dari nilai-nilainya.
Database memperlakukan nilai sebagai data, apa pun isinya, sehingga tidak bisa mengubah struktur query.

```text
Query:  SELECT * FROM users WHERE email = $1
Values: ["' OR '1'='1"]   → mencari email yang persis bernilai string tersebut → 0 baris
```

## Implementation

### node-postgres

```ts
// ❌ rentan
await db.query(`SELECT id, total FROM orders WHERE outlet_id = '${outletId}' AND status = '${status}'`);

// ✅ parameter
await db.query('SELECT id, total FROM orders WHERE outlet_id = $1 AND status = $2', [outletId, status]);
```

### Identifier dinamis (kolom, arah sort, nama tabel)

Parameter hanya bisa untuk **nilai**, bukan nama kolom atau kata kunci. Gunakan allowlist:

```ts
const SORT_COLUMNS = { created: 'created_at', total: 'total' } as const;
const col = SORT_COLUMNS[req.query.sort as keyof typeof SORT_COLUMNS] ?? 'created_at';
const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
await db.query(`SELECT id, total FROM orders WHERE outlet_id = $1 ORDER BY ${col} ${dir}, id ${dir} LIMIT $2`, [outletId, limit]);
```

### LIKE dan IN

```ts
// LIKE: nilai tetap parameter. Escape wildcard bila pencarian harus literal
const term = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
await db.query(`SELECT id, name FROM products WHERE name ILIKE $1 ESCAPE '\\' LIMIT 20`, [term]);

// IN: gunakan ANY dengan array, bukan menyusun "(1,2,3)"
await db.query('SELECT * FROM products WHERE id = ANY($1::uuid[])', [ids]);
```

### ORM & query builder

```ts
// Prisma: query builder aman secara default
await prisma.order.findMany({ where: { outletId, status } });

// Raw query Prisma: tagged template = aman (nilai jadi parameter)
await prisma.$queryRaw`SELECT * FROM orders WHERE outlet_id = ${outletId}`;
// ❌ $queryRawUnsafe dengan string gabungan input pengguna
await prisma.$queryRawUnsafe(`SELECT * FROM orders WHERE outlet_id = '${outletId}'`);

// Knex
await knex('orders').where({ outlet_id: outletId }).orderBy(col, dir);   // col dari allowlist
await knex.raw('SELECT * FROM orders WHERE outlet_id = ?', [outletId]);
```

ORM tidak otomatis kebal. Fitur raw query, `whereRaw`, dan penyusunan string tetap bisa rentan.

### SQLite di aplikasi mobile

```dart
// Drift: query builder & custom query dengan variabel aman
final rows = await (db.select(db.products)..where((p) => p.name.like('%$q%'))).get();   // nilai menjadi parameter
await db.customSelect('SELECT * FROM products WHERE sku = ?', variables: [Variable.withString(sku)]).get();
// ❌ db.customSelect("SELECT * FROM products WHERE sku = '$sku'")
```

```kotlin
// Room: parameter di @Query aman
@Query("SELECT * FROM products WHERE sku = :sku")
suspend fun findBySku(sku: String): ProductEntity?
// RawQuery: gunakan SimpleSQLiteQuery dengan bindArgs, bukan string gabungan
```

Injection di SQLite lokal berdampak lebih kecil (data di perangkat sendiri), tetapi tetap bisa merusak data atau
membocorkan data pengguna lain di perangkat bersama, dan input dapat berasal dari deep link atau QR.

### Least privilege akun database

```sql
CREATE ROLE app_user LOGIN PASSWORD '...';
GRANT SELECT, INSERT, UPDATE ON orders, order_items, products TO app_user;   -- tanpa DROP/ALTER/TRUNCATE
-- Migrasi memakai role terpisah yang hanya dipakai di pipeline deploy
```

### Menguji

```text
- Code review: cari penyusunan string SQL (template literal, +, format) dengan input
- Lint/SAST (mis. Semgrep rules untuk query string)
- Test negatif: kirim ' OR '1'='1, ' ; DROP TABLE, '' pada setiap filter
- DAST/pentest dengan tool seperti sqlmap di lingkungan uji (dengan izin)
```

## Best Practices

- **Selalu parameterized query** untuk nilai.
- **Allowlist untuk identifier** (kolom, arah sort, tabel).
- **Hati-hati dengan raw query di ORM**.
- **Least privilege** untuk akun database aplikasi.
- **Error database tidak ditampilkan ke klien**.
- **Review & SAST** untuk mendeteksi penyusunan string SQL.

## Anti-Patterns

- Escape manual (mengganti `'` dengan `''`) sebagai pencegahan utama.
- Validasi input sebagai satu-satunya pencegahan.
- `ORDER BY ${req.query.sort}`.
- Stored procedure yang menyusun SQL dinamis dari parameter tanpa binding.
- Akun aplikasi dengan hak superuser.

## Performance Considerations

Parameterized query juga memungkinkan database memakai ulang rencana eksekusi (prepared statement). Untuk IN dengan
banyak nilai, `= ANY($1)` dengan array lebih efisien dan aman daripada menyusun ribuan placeholder.

## Security Considerations

Kombinasikan pencegahan (parameter) dengan pembatasan dampak: least privilege, pemisahan data per tenant (RLS sebagai
lapisan tambahan), enkripsi data sensitif, monitoring query anomali, dan error generik agar penyerang tidak mendapat
petunjuk struktur database.

## Real-World Use Cases

- Fitur pencarian produk memakai ILIKE dengan parameter dan escape wildcard.
- Endpoint laporan dengan sort dinamis memakai allowlist kolom.

## Interview Questions

1. Apa itu SQL injection dan bagaimana mencegahnya?
2. Mengapa parameterized query aman?
3. Bagaimana menangani ORDER BY dinamis dengan aman?
4. Apakah memakai ORM menjamin aman dari SQL injection?
5. Apa itu second-order SQL injection?

## Sample Answers

1. Input pengguna disisipkan ke string SQL sehingga mengubah struktur query. Cegah dengan parameterized query, allowlist untuk identifier, least privilege, dan error generik.
2. Struktur query dan nilai dikirim terpisah ke database, sehingga nilai selalu diperlakukan sebagai data dan tidak dapat mengubah perintah SQL.
3. Petakan input ke daftar kolom yang diizinkan (allowlist) dan arah sort ke ASC/DESC tetap, lalu sisipkan hasil pemetaan, bukan input mentah.
4. Tidak. Query builder ORM aman secara default, tetapi raw query, fungsi "unsafe", dan penyusunan string tetap bisa rentan.
5. Input disimpan dengan aman, tetapi kemudian diambil dari database dan dipakai untuk menyusun query lain tanpa parameter, sehingga injeksi terjadi pada tahap kedua.

## Practical Exercises

1. Cari semua query string dinamis di kode Anda dan ubah ke parameter.
2. Implementasikan sort & filter dinamis dengan allowlist.
3. Buat role database dengan hak minimum untuk aplikasi.

## Quick Reference

```text
Nilai → parameter ($1, ?, :name, tagged template) · identifier → allowlist
LIKE: parameter + escape wildcard · IN: = ANY($1::type[])
ORM aman default, raw/unsafe tidak · Drift customSelect variables · Room :param / bindArgs
Least privilege DB · error generik · SAST + test negatif
```

## Related Topics

- [Input Validation & Sanitization](/security/input-validation/)
- [Database Security](/database/database-security/)
- [ORM vs Raw SQL](/database/orm-vs-raw-sql/)
