---
title: "Database Security"
description: "Mengamankan database: SQL injection & parameterized query, least privilege (role & GRANT), jaringan & TLS, enkripsi at rest dan kolom, Row Level Security untuk multi-tenant, manajemen kredensial, audit logging, masking data non-produksi, dan keamanan database lokal mobile."
level: intermediate
status: complete
version: "PostgreSQL 15+"
updated: 2026-11-12
tags: [database, security, sql-injection, rls, encryption, least-privilege]
---

## Overview

Database menyimpan aset paling berharga: data pelanggan, transaksi, dan kredensial. Keamanan database memakai prinsip
**defense in depth** — beberapa lapisan perlindungan sehingga satu kegagalan tidak langsung menjadi kebocoran.

## Why It Matters

Kebocoran data sering berasal dari hal sederhana: SQL injection, database terekspos ke internet, kredensial di repo,
akun aplikasi dengan hak superuser, atau backup yang tidak terenkripsi. Regulasi pelindungan data pribadi juga menuntut
pengamanan yang memadai.

## Core Concepts

| Lapisan | Kontrol |
| --- | --- |
| Aplikasi | Parameterized query, validasi input, otorisasi per resource |
| Akun & hak | Role terpisah, least privilege, tidak memakai superuser |
| Jaringan | Private network, firewall/security group, tanpa akses publik, TLS |
| Data | Enkripsi at rest, enkripsi kolom sensitif, hashing password, masking |
| Multi-tenant | Row Level Security (RLS), filter tenant wajib |
| Operasional | Secret manager & rotasi, patch, audit log, backup terenkripsi |
| Non-produksi | Data dummy/termasking, bukan salinan production mentah |

## How It Works

```text
Internet → API (validasi, authN/authZ) → koneksi TLS → PostgreSQL di private subnet
   role app_rw: hanya SELECT/INSERT/UPDATE di schema app (tanpa DDL, tanpa DROP)
   role migrator: DDL, dipakai pipeline migrasi saja
   role report_ro: SELECT di view laporan (tanpa kolom sensitif)
   RLS: baris difilter berdasarkan tenant_id sesi
   Audit: koneksi, DDL, perubahan tabel sensitif
```

## Implementation

### SQL injection

```ts
// ❌ Rentan: input "x' OR '1'='1" mengembalikan semua user
await pool.query(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ Parameterized
await pool.query('SELECT id, name FROM users WHERE email = $1', [email]);

// ✅ Nama kolom dinamis (ORDER BY) dengan allowlist
const sortable = { created: 'created_at', total: 'total' } as const;
const col = sortable[req.query.sort as keyof typeof sortable] ?? 'created_at';
await pool.query(`SELECT id, total FROM orders ORDER BY ${col} DESC LIMIT $1`, [20]);
```

### Least privilege dengan role

```sql
CREATE ROLE app_rw LOGIN PASSWORD '***';                 -- kredensial dari secret manager
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO app_rw;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO app_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE ON TABLES TO app_rw;

CREATE ROLE report_ro LOGIN PASSWORD '***';
GRANT USAGE ON SCHEMA reporting TO report_ro;
GRANT SELECT ON reporting.daily_sales TO report_ro;      -- view tanpa data pribadi
```

### Row Level Security untuk multi-tenant

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;             -- berlaku juga bagi pemilik tabel

CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- Di aplikasi, per transaksi:
-- BEGIN; SELECT set_config('app.tenant_id', $1, true); ... COMMIT;
```

### Enkripsi kolom sensitif (pgcrypto, contoh sederhana)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Kunci TIDAK disimpan di database; dikirim dari aplikasi/KMS sebagai parameter
INSERT INTO customers_private (customer_id, id_number_enc)
VALUES ($1, pgp_sym_encrypt($2, $3));
SELECT pgp_sym_decrypt(id_number_enc, $1) FROM customers_private WHERE customer_id = $2;
```

Sering kali enkripsi di level aplikasi (dengan kunci dari KMS) lebih mudah dikelola dan diaudit. Password pengguna
**di-hash** (Argon2/bcrypt) di aplikasi, bukan dienkripsi.

### Masking untuk non-produksi

```sql
UPDATE customers SET
  name  = 'Pelanggan ' || id,
  phone = '08' || lpad((id % 100000000)::text, 10, '0'),
  email = 'user' || id || '@example.test';
```

### Database lokal mobile

- Enkripsi database lokal (mis. SQLCipher) bila menyimpan data sensitif; kunci di Android Keystore/iOS Keychain.
- Jangan menyimpan data yang tidak dibutuhkan offline.
- Hapus data lokal saat logout sesuai kebijakan (setelah memastikan outbox tersinkron).

## Best Practices

- **Parameterized query selalu**; allowlist untuk identifier dinamis.
- **Role terpisah** untuk aplikasi, migrasi, laporan, dan admin manusia; tanpa superuser di aplikasi.
- **Database tidak terekspos publik**; akses admin melalui bastion/VPN/SSO.
- **TLS** untuk koneksi; enkripsi at rest (umumnya bawaan layanan terkelola).
- **Secret di secret manager** dengan rotasi.
- **Audit log** untuk akses & perubahan data sensitif; pantau login gagal.
- **Patch versi minor** secara rutin.

## Anti-Patterns

- Aplikasi terhubung sebagai `postgres`/`root`.
- Port database terbuka ke `0.0.0.0/0`.
- Kredensial di repo atau di aplikasi mobile.
- Salinan data production mentah di laptop/staging.
- Mengandalkan filter tenant di aplikasi tanpa pengaman tambahan.

## Performance Considerations

RLS menambah kondisi pada setiap query — pastikan kolom kebijakan (`tenant_id`) ter-index dan menjadi awalan index
komposit. Enkripsi kolom membuat kolom tersebut tidak dapat di-index/dicari langsung; gunakan hash terpisah (blind
index) bila perlu pencarian kesetaraan.

## Security Considerations

Halaman ini sendiri adalah topik keamanan. Tambahan: pertimbangkan regulasi pelindungan data pribadi yang berlaku
(dasar pemrosesan, retensi, hak penghapusan), klasifikasi data, dan rencana respons insiden kebocoran.

## Real-World Use Cases

- SaaS POS multi-tenant dengan RLS per tenant.
- Role laporan read-only untuk tim analitik melalui view tanpa data pribadi.
- Staging dengan data termasking.

## Interview Questions

1. Bagaimana mencegah SQL injection?
2. Apa itu prinsip least privilege di database?
3. Apa itu Row Level Security?
4. Bagaimana menyimpan data sensitif seperti nomor identitas dan password?
5. Bagaimana mengamankan akses ke database production?

## Sample Answers

1. Parameterized query/prepared statement atau ORM, allowlist untuk identifier dinamis, validasi input, dan akun database dengan hak minimum untuk membatasi dampak.
2. Setiap akun hanya memiliki hak yang benar-benar diperlukan: aplikasi hanya DML pada schema-nya, migrasi memakai akun DDL terpisah, laporan hanya SELECT pada view tertentu.
3. Fitur PostgreSQL yang memfilter baris yang dapat dibaca/ditulis per sesi berdasarkan kebijakan (mis. `tenant_id`), sebagai lapisan isolasi tambahan di luar logika aplikasi.
4. Password di-hash dengan algoritma lambat ber-salt (Argon2/bcrypt). Nomor identitas dienkripsi (aplikasi atau pgcrypto) dengan kunci di KMS, akses dibatasi dan diaudit, ditampilkan termasking.
5. Database di jaringan privat tanpa IP publik, akses admin via bastion/VPN dengan SSO & MFA, TLS, kredensial di secret manager dengan rotasi, audit log, dan prinsip just-in-time access.

## Practical Exercises

1. Buat role `app_rw`, `migrator`, `report_ro` dan uji bahwa `app_rw` tidak bisa `DROP TABLE`.
2. Terapkan RLS pada tabel orders dan uji dengan dua tenant.
3. Tulis skrip masking untuk membuat salinan staging dari data production.

## Quick Reference

```text
Parameterized + allowlist · role terpisah (app/migrator/report) · tanpa superuser · REVOKE PUBLIC
Private network + TLS · enkripsi at rest + kolom sensitif (kunci di KMS) · hash password
RLS untuk tenant (FORCE + index tenant_id) · secret manager + rotasi · audit · masking non-prod
Mobile: SQLCipher + Keystore/Keychain · minimal data lokal
```

## Related Topics

- [Security Questions](/interview/technical/security/)
- [OWASP Top 10](/security/owasp-top-10/)
- [Backup & Recovery](/database/backup-recovery/)
