---
title: "Database Schema Design"
description: "Merancang skema database production-ready: konvensi penamaan, tipe data, kolom standar (audit, timestamp, soft delete, version), enum vs lookup table, JSONB, multi-tenant, status & riwayat, uang & waktu, serta checklist review skema dengan contoh PostgreSQL."
level: intermediate
status: complete
version: "PostgreSQL 15+"
updated: 2026-11-12
tags: [database, schema-design, postgresql, conventions, multi-tenant]
---

## Overview

**Schema design** adalah menerjemahkan model data (ERD) menjadi tabel, kolom, tipe, constraint, dan index yang benar,
mudah dipakai, dan tahan terhadap perubahan. Halaman ini berfokus pada **keputusan praktis** yang sering muncul di
proyek nyata.

## Why It Matters

Skema adalah bagian sistem yang paling sulit diubah setelah ada data production. Keputusan kecil (tipe uang, zona waktu,
soft delete, tenant) berdampak pada kebenaran laporan, keamanan, dan kecepatan pengembangan bertahun-tahun.

## Core Concepts

### Konvensi penamaan (contoh yang konsisten)

| Objek | Konvensi | Contoh |
| --- | --- | --- |
| Tabel | `snake_case`, jamak | `order_items` |
| Kolom | `snake_case` | `created_at`, `outlet_id` |
| FK | `<entitas>_id` | `customer_id` |
| Boolean | `is_` / `has_` | `is_active` |
| Waktu | `_at` (timestamp), `_on` (date) | `paid_at`, `valid_on` |
| Index | `ix_<tabel>__<kolom>` | `ix_orders__outlet_id_created_at` |
| Constraint | `uq_`, `fk_`, `ck_` | `ck_order_items__qty_positive` |

### Pilihan tipe data (PostgreSQL)

| Data | Tipe | Hindari |
| --- | --- | --- |
| Uang | `numeric(14,2)` atau `bigint` (satuan terkecil) | `float`, `real`, `money` |
| Waktu kejadian | `timestamptz` | `timestamp` tanpa zona, string |
| Tanggal bisnis | `date` | `timestamptz` untuk tanggal lahir |
| ID | `bigint identity` / `uuid` | `serial` (lebih baik `identity`) |
| Teks | `text` (+ `CHECK (length(...) <= n)` bila perlu) | `varchar(255)` tanpa alasan |
| Status terbatas | `text` + `CHECK` / enum / lookup table | string bebas tanpa validasi |
| Data semi-terstruktur | `jsonb` | `json`/`text` berisi JSON |

### Enum vs CHECK vs lookup table

| Opsi | Kelebihan | Kekurangan |
| --- | --- | --- |
| `CHECK (status IN (...))` | Sederhana, mudah diubah lewat migrasi | Tidak ada metadata (label, urutan) |
| Native enum | Ringkas, type-safe | Menambah nilai mudah, menghapus/rename sulit |
| Lookup table + FK | Bisa punya label, urutan, aktif/nonaktif, dikelola admin | JOIN tambahan |

## How It Works

```text
ERD logis → pilih tipe & nullability → constraint (PK, FK, UNIQUE, CHECK)
→ kolom standar (audit, version, soft delete) → index berdasarkan pola query
→ review (checklist) → migrasi berversi
```

## Implementation

### Tabel dengan kolom standar

```sql
CREATE TABLE orders (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id),           -- multi-tenant
  outlet_id    uuid NOT NULL REFERENCES outlets(id),
  number       text NOT NULL,                                  -- nomor struk
  status       text NOT NULL DEFAULT 'pending'
               CONSTRAINT ck_orders__status CHECK (status IN ('pending','paid','voided')),
  total        numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,             -- data tambahan non-inti
  version      int NOT NULL DEFAULT 1,                         -- optimistic locking
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,                                    -- soft delete
  CONSTRAINT uq_orders__outlet_number UNIQUE (outlet_id, number)
);
CREATE INDEX ix_orders__tenant_outlet_created ON orders (tenant_id, outlet_id, created_at DESC)
  WHERE deleted_at IS NULL;                                    -- partial index untuk data aktif
```

### Riwayat status (append-only)

```sql
CREATE TABLE order_status_history (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   uuid NOT NULL REFERENCES orders(id),
  from_status text, to_status text NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  reason     text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
```

### Trigger `updated_at`

```sql
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders__updated_at BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Pola multi-tenant

| Pola | Isolasi | Kompleksitas | Cocok |
| --- | --- | --- | --- |
| Kolom `tenant_id` di setiap tabel (+ Row Level Security) | Logis | Rendah | Banyak tenant kecil (SaaS) |
| Schema per tenant | Sedang | Sedang (migrasi per schema) | Puluhan–ratusan tenant |
| Database per tenant | Tinggi | Tinggi | Tenant besar/regulasi ketat |

### Checklist review skema

```markdown
- [ ] Nama konsisten & bermakna; tidak ada singkatan aneh
- [ ] NOT NULL default; NULL hanya bila bermakna
- [ ] Uang numeric/integer; waktu timestamptz
- [ ] PK, FK (dengan aksi yang disengaja), UNIQUE untuk natural key, CHECK untuk aturan nilai
- [ ] Index untuk FK yang di-JOIN dan pola query utama
- [ ] Kolom audit (created_at/by, updated_at), version bila ada edit bersamaan
- [ ] Strategi soft delete / arsip / retensi jelas
- [ ] Data sensitif teridentifikasi (enkripsi/masking)
- [ ] Migrasi aman untuk tabel besar (lihat Database Migration)
```

## Best Practices

- **Konsisten** lebih penting daripada konvensi "terbaik".
- **Constraint sebanyak mungkin di database**: aturan yang dijaga database tidak bisa dilewati bug aplikasi.
- **JSONB untuk data tambahan**, bukan untuk kolom inti yang di-query/di-JOIN.
- **Soft delete hanya bila dibutuhkan**, dan pertimbangkan partial unique index (`WHERE deleted_at IS NULL`).
- **Pikirkan pertumbuhan**: tabel event/log akan besar → partisi & retensi.

## Anti-Patterns

- *Entity–Attribute–Value* (tabel `attributes(entity_id, key, value)`) untuk semua hal.
- Satu tabel generik untuk banyak jenis entitas (`items.type = 'order' | 'user' | ...`).
- Soft delete di semua tabel tanpa memfilter di query (data "terhapus" muncul di laporan).
- Kolom `status` string bebas tanpa validasi.
- Menyimpan file biner besar di database (simpan di object storage, DB menyimpan URL/metadata).

## Performance Considerations

Tipe data yang tepat menghemat ruang dan mempercepat index; partial index untuk subset data aktif; partisi tabel
time-series besar; hindari kolom `jsonb` raksasa yang sering diupdate (seluruh baris ditulis ulang).

## Security Considerations

Pisahkan kolom/tabel data sensitif, gunakan Row Level Security untuk multi-tenant, enkripsi kolom tertentu bila
diperlukan, dan hindari menyimpan data yang tidak dibutuhkan (data minimization).

## Real-World Use Cases

- Skema SaaS POS multi-tenant dengan `tenant_id` + RLS.
- Riwayat status tiket/order untuk audit dan perhitungan SLA.
- Metadata integrasi pihak ketiga di kolom `jsonb`.

## Interview Questions

1. Tipe data apa untuk uang dan waktu? Mengapa?
2. Soft delete vs hard delete?
3. Enum vs lookup table?
4. Kapan memakai JSONB?
5. Bagaimana merancang skema multi-tenant?
6. Kolom standar apa yang biasanya Anda tambahkan ke setiap tabel?

## Sample Answers

1. Uang: `numeric` atau integer satuan terkecil agar tidak ada kesalahan pembulatan float. Waktu: `timestamptz` (instant UTC) sehingga benar lintas zona waktu; `date` untuk tanggal bisnis tanpa jam.
2. Soft delete (kolom `deleted_at`) mempertahankan data untuk audit/pemulihan tetapi menambah kompleksitas query dan unique constraint; hard delete sederhana dan mendukung penghapusan data pribadi. Pilih per tabel sesuai kebutuhan audit dan regulasi.
3. CHECK/enum sederhana untuk himpunan nilai kecil yang jarang berubah; lookup table bila nilai perlu metadata, dikelola pengguna, atau sering berubah.
4. Untuk data semi-terstruktur atau bervariasi yang jarang menjadi kunci query/JOIN (metadata integrasi, pengaturan); kolom inti tetap kolom biasa dengan constraint.
5. Paling umum `tenant_id` di setiap tabel + index berawalan `tenant_id` + Row Level Security; alternatif schema atau database per tenant untuk isolasi lebih kuat dengan biaya operasional lebih tinggi.
6. `id`, `created_at`, `updated_at`, `created_by`/`updated_by` bila perlu audit, `version` untuk optimistic locking, `deleted_at` bila memakai soft delete, dan `tenant_id` di sistem multi-tenant.

## Practical Exercises

1. Review skema proyek Anda dengan checklist di atas.
2. Terapkan Row Level Security sederhana untuk `tenant_id`.
3. Ubah satu kolom status bebas menjadi CHECK constraint lewat migrasi aman.

## Quick Reference

```text
snake_case jamak · NOT NULL default · uang numeric/bigint · waktu timestamptz · id identity/uuid
Constraint di DB: PK · FK · UNIQUE · CHECK · kolom standar: created_at/updated_at/version/deleted_at
Status: CHECK/enum/lookup · JSONB untuk non-inti · multi-tenant: tenant_id + RLS
Riwayat append-only · file → object storage
```

## Related Topics

- [Normalization & Denormalization](/database/normalization/)
- [Database Migration](/database/migration/)
- [Database Security](/database/database-security/)
