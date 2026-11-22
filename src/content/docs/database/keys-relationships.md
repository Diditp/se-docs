---
title: "Primary Key, Foreign Key & Jenis Relasi"
description: "Primary key (natural vs surrogate, integer vs UUID), foreign key dan aksi ON DELETE/ON UPDATE, unique & composite key, serta relasi one-to-one, one-to-many, many-to-many, dan self-referencing dengan contoh skema POS."
level: beginner
status: complete
version: "PostgreSQL 13+ (gen_random_uuid bawaan) · MySQL 8"
updated: 2026-11-12
tags: [database, primary-key, foreign-key, relationships, uuid]
---

## Overview

**Kunci** mengidentifikasi baris dan menghubungkan tabel. **Primary key (PK)** adalah identitas unik setiap baris;
**foreign key (FK)** adalah kolom yang merujuk PK tabel lain sehingga database menjamin relasinya valid. Dari kunci inilah
terbentuk **jenis relasi**: one-to-one, one-to-many, dan many-to-many.

## Why It Matters

Pemilihan PK memengaruhi performa, sinkronisasi offline, dan keamanan. FK mencegah data yatim (order item tanpa order).
Salah memodelkan relasi menyebabkan duplikasi data dan query rumit.

## Core Concepts

### Jenis primary key

| Jenis | Contoh | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| Natural key | NIK, kode SKU, email | Bermakna bisnis | Bisa berubah, format bervariasi, data pribadi |
| Surrogate integer | `bigint` identity | Kecil, cepat, berurutan | Bisa ditebak, perlu koordinasi server (tidak cocok dibuat offline) |
| UUID v4 | acak 128-bit | Dibuat di mana saja (klien/offline), tidak bisa ditebak | Lebih besar, acak → fragmentasi index |
| UUID v7 / ULID | berbasis waktu + acak | Dibuat di klien **dan** terurut waktu (index lebih ramah) | Lebih besar dari integer; dukungan bawaan bervariasi per versi DB |

Praktik umum: **surrogate key sebagai PK** + **UNIQUE constraint** pada natural key (mis. `sku`).

### Aksi foreign key

| Aksi | Saat induk dihapus/diubah | Contoh pemakaian |
| --- | --- | --- |
| `RESTRICT` / `NO ACTION` (default) | Ditolak bila masih dirujuk | Produk yang sudah pernah terjual |
| `CASCADE` | Anak ikut terhapus/terubah | `order_items` saat `orders` dihapus (jarang untuk data finansial) |
| `SET NULL` | FK anak menjadi NULL | Order tetap ada saat akun kasir dihapus |
| `SET DEFAULT` | FK anak diset nilai default | Jarang |

### Jenis relasi

| Relasi | Contoh | Implementasi |
| --- | --- | --- |
| One-to-one | user ↔ user_profile | FK + `UNIQUE` di salah satu sisi |
| One-to-many | outlet → banyak order | FK di sisi "many" |
| Many-to-many | product ↔ category | Tabel penghubung (junction) dengan dua FK |
| Self-referencing | category → parent category, employee → manager | FK ke tabel yang sama |

## How It Works

```text
outlets (1) ───< orders (N) ───< order_items (N) >─── (1) products
                                                         │
products (N) >───< categories (N)  via product_categories (product_id, category_id)
categories.parent_id → categories.id (self-reference, kategori bertingkat)
```

## Implementation

```sql
CREATE TABLE outlets (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,                         -- natural key tetap unik
  name text NOT NULL
);

CREATE TABLE products (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku   text NOT NULL UNIQUE,
  name  text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0)
);

-- One-to-many
CREATE TABLE orders (
  id        uuid PRIMARY KEY,                          -- dibuat di perangkat (offline)
  outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  cashier_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty        int NOT NULL CHECK (qty > 0),
  unit_price numeric(12,2) NOT NULL,
  PRIMARY KEY (order_id, product_id)                   -- composite key
);
CREATE INDEX ON order_items (product_id);              -- PostgreSQL TIDAK otomatis meng-index kolom FK

-- Many-to-many
CREATE TABLE categories (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  parent_id uuid REFERENCES categories(id)             -- self-referencing
);
CREATE TABLE product_categories (
  product_id  uuid REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

-- One-to-one
CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,   -- PK = FK menjamin 1:1
  avatar_url text
);
```

## Best Practices

- **Surrogate PK + UNIQUE pada natural key**.
- **UUID (idealnya v7/ULID) untuk entitas yang dibuat offline** di perangkat.
- **Index kolom FK** yang sering di-JOIN atau dihapus induknya (PostgreSQL tidak membuatnya otomatis; InnoDB MySQL membuatnya).
- **Pilih aksi FK dengan sadar**; data finansial biasanya `RESTRICT` + soft delete/status, bukan `CASCADE`.
- **Beri nama constraint** agar pesan error mudah dipahami.

## Anti-Patterns

- Tanpa FK "agar fleksibel" → data yatim dan inkonsisten.
- Natural key yang bisa berubah (email, nomor HP) sebagai PK.
- Many-to-many disimpan sebagai list ID di satu kolom.
- `ON DELETE CASCADE` pada data yang harus diaudit.
- Mengekspos ID integer berurutan di URL tanpa otorisasi (mudah ditebak).

## Performance Considerations

Integer PK paling ringkas; UUID v4 acak menyebabkan sisipan tersebar di B-tree (page split, cache kurang efisien) —
UUID v7/ULID mengurangi masalah ini. FK tanpa index membuat JOIN dan penghapusan induk lambat (scan tabel anak).

## Security Considerations

ID yang tidak dapat ditebak (UUID) mengurangi enumerasi, tetapi **bukan pengganti otorisasi** — server tetap harus
memeriksa kepemilikan setiap resource (cegah IDOR). Hindari data pribadi (NIK, email) sebagai PK yang tersebar di
banyak tabel dan log.

## Real-World Use Cases

- UUID dari perangkat kasir untuk transaksi offline yang disinkron.
- Junction table untuk produk dalam banyak kategori/promo.
- Kategori bertingkat dengan self-reference.

## Interview Questions

1. Apa beda primary key dan foreign key?
2. Natural key vs surrogate key?
3. Integer vs UUID sebagai primary key?
4. Bagaimana memodelkan relasi many-to-many?
5. Apa itu ON DELETE CASCADE dan kapan berbahaya?
6. Apakah FK otomatis ter-index?

## Sample Answers

1. PK mengidentifikasi setiap baris secara unik dan tidak null; FK adalah kolom yang merujuk PK (atau unique key) tabel lain dan dijaga database agar selalu valid.
2. Natural key berasal dari data bisnis (SKU, NIK) dan bisa berubah; surrogate key dibuat sistem tanpa makna bisnis dan stabil. Umumnya surrogate sebagai PK plus UNIQUE pada natural key.
3. Integer kecil dan cepat tetapi butuh server untuk membuatnya dan mudah ditebak; UUID dapat dibuat di klien/offline dan sulit ditebak, tetapi lebih besar dan (v4) acak sehingga kurang ramah index — UUID v7/ULID menjadi kompromi.
4. Tabel penghubung berisi FK ke kedua tabel, dengan PK komposit atau UNIQUE pada pasangan, plus kolom tambahan relasi bila perlu (mis. `added_at`).
5. Menghapus baris induk ikut menghapus semua anak; berbahaya untuk data yang harus diaudit atau bila penghapusan tak sengaja menghapus banyak data. Untuk data bisnis, lebih aman `RESTRICT` dan soft delete.
6. Tergantung DBMS: MySQL InnoDB membuat index untuk FK; PostgreSQL tidak, sehingga perlu dibuat manual bila dibutuhkan.

## Practical Exercises

1. Modelkan promo yang berlaku untuk banyak produk dan banyak outlet.
2. Coba hapus produk yang sudah dipakai di order_items dan amati error FK.
3. Bandingkan ukuran index PK `bigint` vs `uuid` pada 1 juta baris.

## Quick Reference

```text
PK unik & not null · FK menjaga referensi · surrogate PK + UNIQUE natural key
UUID (v7/ULID) untuk offline · index kolom FK (PostgreSQL manual)
1:1 = FK UNIQUE/PK=FK · 1:N = FK di sisi N · N:M = junction table · self-ref untuk hierarki
ON DELETE: RESTRICT (aman) · CASCADE (hati-hati) · SET NULL
```

## Related Topics

- [ERD & Relationship Mapping](/database/erd-relationship-mapping/)
- [Database Schema Design](/database/schema-design/)
- [JOIN](/database/joins/)
