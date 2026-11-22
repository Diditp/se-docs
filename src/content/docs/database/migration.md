---
title: "Database Migration"
description: "Mengelola perubahan skema dengan migrasi berversi: tools (Prisma, Knex, Flyway, Drift), forward-only vs down migration, pola expand–contract untuk zero downtime, operasi berbahaya di tabel besar, backfill bertahap, migrasi database lokal mobile, dan migrasi di CI/CD."
level: intermediate
status: complete
version: "PostgreSQL 15+ · Drift 2.x"
updated: 2026-11-12
tags: [database, migration, zero-downtime, schema, drift, ci-cd]
---

## Overview

**Database migration** adalah perubahan skema (dan kadang data) yang ditulis sebagai **file berversi**, disimpan di
repo, dan dijalankan berurutan di setiap environment. Dengan migrasi, skema dapat direproduksi, direview, dan diterapkan
otomatis — tidak ada lagi "ubah langsung di production".

## Why It Matters

Perubahan skema adalah salah satu penyebab terbesar downtime dan kehilangan data. Di mobile, migrasi database lokal yang
salah membuat aplikasi crash bagi pengguna yang melompati beberapa versi.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Versioned migration | File berurutan (`20261112_add_orders_note.sql`) yang dijalankan sekali |
| Migration table | Tabel yang mencatat migrasi yang sudah dijalankan |
| Forward-only | Kesalahan diperbaiki dengan migrasi baru, bukan rollback skema |
| Down migration | Skrip pembalik; berguna di dev, berisiko di production (data hilang) |
| Expand–contract | Perubahan bertahap yang kompatibel dengan versi aplikasi lama dan baru |
| Backfill | Mengisi data kolom baru secara bertahap |
| Schema vs data migration | Struktur vs isi; pisahkan bila besar |

Tools umum: **Prisma Migrate**, **Knex**, **TypeORM**, **node-pg-migrate** (Node.js); **Flyway**, **Liquibase**
(lintas bahasa); **Drift** `MigrationStrategy` / **Room** migrations (mobile).

## How It Works

Expand–contract untuk mengganti nama kolom `phone` → `phone_number` tanpa downtime:

```text
1. Expand  : tambah kolom phone_number (nullable)                      ← app lama tetap jalan
2. Deploy  : app menulis ke KEDUA kolom, membaca kolom lama
3. Backfill: salin phone → phone_number bertahap (batch)
4. Deploy  : app membaca kolom baru (masih menulis keduanya)
5. Contract: setelah semua instance/versi lama hilang → hapus kolom lama, tambah NOT NULL
```

## Implementation

### Migrasi SQL yang aman

```sql
-- 20261112_01_add_order_note.sql
ALTER TABLE orders ADD COLUMN note text;                         -- cepat: tanpa default volatile

-- 20261112_02_index_orders_customer.sql   (jalankan di luar transaksi)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_orders__customer_id ON orders (customer_id);

-- Menambah NOT NULL pada tabel besar secara bertahap
ALTER TABLE orders ADD CONSTRAINT ck_orders__channel_not_null CHECK (channel IS NOT NULL) NOT VALID;  -- tanpa scan
ALTER TABLE orders VALIDATE CONSTRAINT ck_orders__channel_not_null;                                  -- scan tanpa lock berat
ALTER TABLE orders ALTER COLUMN channel SET NOT NULL;   -- PG 12+ memakai CHECK yang sudah valid, tanpa scan ulang
```

### Backfill bertahap

```sql
-- Ulangi sampai 0 baris; jeda singkat di antara batch
UPDATE customers SET phone_number = phone
WHERE id IN (
  SELECT id FROM customers WHERE phone_number IS NULL AND phone IS NOT NULL LIMIT 5000
);
```

### Operasi berisiko pada tabel besar (PostgreSQL)

| Operasi | Risiko | Alternatif |
| --- | --- | --- |
| `CREATE INDEX` | Memblokir tulis selama build | `CREATE INDEX CONCURRENTLY` |
| `ADD COLUMN ... DEFAULT <volatile>` | Menulis ulang tabel | Tambah kolom lalu backfill |
| `ALTER COLUMN TYPE` | Menulis ulang tabel + lock eksklusif | Kolom baru + backfill + swap |
| `ADD FOREIGN KEY` | Scan tabel dengan lock | `NOT VALID` lalu `VALIDATE CONSTRAINT` |
| `DROP COLUMN` saat app lama masih membaca | Error di app lama | Expand–contract |
| Rename kolom/tabel | App lama rusak | Expand–contract / view sementara |

### Migrasi database lokal (Flutter Drift)

```dart
@override
int get schemaVersion => 3;

@override
MigrationStrategy get migration => MigrationStrategy(
  onCreate: (m) => m.createAll(),
  onUpgrade: (m, from, to) async {
    if (from < 2) await m.addColumn(sales, sales.note);
    if (from < 3) {
      await m.createTable(outbox);
      await m.createIndex(Index('ix_sales_created', 'CREATE INDEX ix_sales_created ON sales (created_at)'));
    }
  },
);
```

Setiap langkah bergantung pada `from`, sehingga pengguna yang melompat dari v1 ke v3 menjalankan semua langkah. Uji
migrasi dari **setiap versi skema lama** (Drift menyediakan utilitas schema dump & test).

### Di pipeline CI/CD

```text
PR: jalankan migrasi pada database kosong + test → review file migrasi (wajib)
Deploy: backup/snapshot → jalankan migrasi (job terpisah, satu kali) → deploy aplikasi → verifikasi
```

## Best Practices

- **Satu perubahan logis per migrasi**, nama deskriptif, tidak pernah mengedit migrasi yang sudah dijalankan.
- **Kompatibel mundur**: aplikasi versi lama dan baru harus berjalan dengan skema baru.
- **Forward-only di production**; siapkan rencana pemulihan (backup) bukan down migration.
- **`lock_timeout`** dan operasi `CONCURRENTLY` untuk tabel besar.
- **Uji pada salinan data seukuran production** sebelum menjalankan migrasi berat.
- **Mobile**: uji upgrade dari semua versi lama; jangan pernah mengurangi `schemaVersion`.

## Anti-Patterns

- Mengubah skema production secara manual lewat GUI.
- Mengedit file migrasi lama setelah dirilis.
- Migrasi dijalankan otomatis oleh setiap instance aplikasi saat start bersamaan (race).
- Menghapus/rename kolom dalam rilis yang sama dengan kode yang berhenti memakainya.
- Backfill jutaan baris dalam satu transaksi.

## Performance Considerations

Migrasi yang menulis ulang tabel atau memegang lock eksklusif dapat menghentikan seluruh trafik. Ukur durasi di staging
dengan data realistis, gunakan batch untuk backfill, dan jadwalkan operasi berat di jam sepi.

## Security Considerations

Jalankan migrasi dengan akun yang memiliki hak DDL terpisah dari akun runtime aplikasi (aplikasi tidak perlu hak
`ALTER`/`DROP`). Review migrasi untuk perubahan hak akses dan data sensitif; backup sebelum migrasi destruktif.

## Real-World Use Cases

- Menambah kolom & index pada tabel transaksi berjuta baris tanpa downtime.
- Memisahkan kolom alamat menjadi tabel tersendiri dengan expand–contract.
- Upgrade skema SQLite aplikasi kasir dari versi 1 ke 5.

## Interview Questions

1. Apa itu database migration dan mengapa perlu?
2. Bagaimana mengganti nama kolom tanpa downtime?
3. Down migration di production — perlu atau tidak?
4. Operasi DDL apa yang berbahaya di tabel besar?
5. Bagaimana menangani migrasi database lokal di aplikasi mobile?

## Sample Answers

1. Perubahan skema berversi yang disimpan di repo dan dijalankan berurutan sehingga semua environment konsisten, perubahan dapat direview, dan deploy dapat diotomatisasi.
2. Expand–contract: tambah kolom baru, tulis ke keduanya, backfill, pindahkan pembacaan, lalu hapus kolom lama setelah tidak ada versi aplikasi yang memakainya.
3. Umumnya forward-only: rollback skema dapat menghapus data yang sudah ditulis. Perbaiki dengan migrasi baru dan siapkan backup/snapshot untuk kondisi darurat.
4. Membuat index tanpa `CONCURRENTLY`, mengubah tipe kolom, menambah FK/constraint yang memvalidasi seluruh tabel, default volatile yang menulis ulang tabel, serta drop/rename yang memutus aplikasi lama.
5. Versi skema bertambah setiap perubahan, `onUpgrade` menjalankan langkah berdasarkan versi asal sehingga lompatan versi tetap aman, diuji dari semua versi lama, dan data lokal penting (outbox) tidak pernah dihapus tanpa disinkronkan.

## Practical Exercises

1. Tulis rangkaian migrasi expand–contract untuk memecah `customers.address` menjadi tabel `addresses`.
2. Ukur waktu `CREATE INDEX` vs `CREATE INDEX CONCURRENTLY` pada 5 juta baris sambil menjalankan insert paralel.
3. Tulis test migrasi Drift dari versi 1, 2, dan 3 ke versi terbaru.

## Quick Reference

```text
Migrasi berversi di repo · tidak mengedit yang lama · forward-only + backup
Expand → dual write → backfill (batch) → switch read → contract
PG: CONCURRENTLY · NOT VALID + VALIDATE · lock_timeout · hindari rewrite tabel
Mobile: schemaVersion naik · onUpgrade per `from` · uji dari semua versi lama
```

## Related Topics

- [Database Schema Design](/database/schema-design/)
- [Locking & Concurrency](/database/locking-concurrency/)
- [Local Database (Flutter)](/flutter/local-database/)
