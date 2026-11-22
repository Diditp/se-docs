---
title: "Customer Management (CRM)"
description: "Studi kasus CRM untuk tim sales/lapangan dengan aplikasi mobile: requirement, model data pelanggan/kontak/aktivitas/pipeline, deduplikasi & normalisasi nomor telepon, kunjungan lapangan offline dengan check-in lokasi, segmentasi & loyalty, pencarian, izin berbasis wilayah/tim, consent & UU PDP, integrasi WhatsApp/email, serta laporan."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, case-study, crm, field-sales, offline-first, privacy]
---

## Overview

Desain sistem **Customer Relationship Management (CRM)**: menyimpan data pelanggan dan kontak, mencatat interaksi
(kunjungan, telepon, pesan), mengelola peluang penjualan (pipeline), dan mendukung program loyalitas. Pengguna utama
adalah tim sales lapangan yang memakai aplikasi mobile, serta manajer yang melihat dashboard di web.

## Why It Matters

Banyak perusahaan di Indonesia (distribusi, asuransi, otomotif, F&B) membangun aplikasi sales lapangan dan CRM internal.
Soal ini menguji pemodelan data yang fleksibel, kualitas data (duplikasi), offline-first, kontrol akses berbasis tim, dan
kepatuhan privasi.

## Core Concepts

| Fungsional | Non-fungsional |
| --- | --- |
| Pelanggan (perusahaan/individu) & kontak | Data tidak duplikat & konsisten |
| Aktivitas: kunjungan, telepon, catatan, tugas | Sales bekerja offline di lapangan |
| Pipeline/peluang dengan tahapan | Pencarian cepat (nama, telepon, kota) |
| Check-in kunjungan dengan lokasi & foto | Akses sesuai wilayah/tim |
| Segmentasi, loyalty point, kampanye | Consent & hak subjek data (UU PDP) |
| Dashboard target & aktivitas | Audit perubahan data pelanggan |

| Konsep | Penjelasan |
| --- | --- |
| Account vs contact | Account = organisasi/pelanggan. Contact = orang di dalamnya |
| Activity timeline | Riwayat interaksi kronologis per pelanggan |
| Pipeline stage | Tahapan peluang (prospek → negosiasi → menang/kalah) |
| Deduplikasi | Mendeteksi & menggabungkan data pelanggan ganda |
| Territory | Pembagian wilayah/tim yang menentukan akses |

## How It Works

```text
Aplikasi sales (Flutter, offline-first) ─┐
Dashboard web manajer                    ├─▶ API CRM ─▶ PostgreSQL (data inti) + search index
Integrasi (POS/e-commerce, WhatsApp, email) ─┘        └─ outbox → loyalty, notifikasi, data warehouse
Sales mengunduh data pelanggan wilayahnya → bekerja offline → aktivitas & perubahan disinkron (outbox)
```

### Data model

```text
accounts(id, tenant_id, name, type, territory_id, owner_id, tier, created_at, updated_at, version, deleted_at)
contacts(id, account_id, name, phone_e164, email, role, consent_marketing, consent_at)
activities(id, account_id, contact_id, type: visit|call|note|task, owner_id, occurred_at, notes,
           lat, lng, accuracy_m, photo_upload_id, client_op_id UNIQUE)
opportunities(id, account_id, owner_id, stage, amount, expected_close_date, lost_reason)
territories(id, name, parent_id) · user_territories(user_id, territory_id, role)
loyalty_ledger(id, account_id, points (+/−), reason, ref_id, created_at)
audit_log(entity, entity_id, actor_id, changes_json, at)
```

## Implementation

### 1. Kualitas data & deduplikasi

```text
- Normalisasi telepon ke E.164 (+62812...) saat input, simpan versi normal untuk pencarian & unik
- Normalisasi email (lowercase, trim), nama (trim spasi ganda)
- Saat membuat pelanggan: cari kandidat duplikat (telepon sama, email sama, nama mirip + kota sama) → tampilkan ke sales sebelum menyimpan
- Merge: pilih record utama, pindahkan kontak/aktivitas, simpan alias & audit, jangan hapus jejak
```

```sql
-- Pencarian nama mirip dengan pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_accounts_name_trgm ON accounts USING gin (name gin_trgm_ops);
SELECT id, name, similarity(name, $1) AS score FROM accounts
WHERE tenant_id = $2 AND name % $1 ORDER BY score DESC LIMIT 10;
```

### 2. Kunjungan lapangan offline

```text
Pagi: aplikasi sinkron data pelanggan wilayah (delta) + rencana kunjungan hari ini
Kunjungan: check-in (lokasi + akurasi + waktu), catatan, foto (dikompres, antre upload), order/peluang
Semua ditulis ke DB lokal + outbox dengan client_op_id → sinkron saat ada sinyal
Server memvalidasi jarak check-in ke koordinat pelanggan (toleransi) dan menandai anomali (lokasi palsu, waktu tidak wajar)
```

### 3. Konflik data

| Data | Strategi |
| --- | --- |
| Aktivitas, catatan | Append-only, tanpa konflik |
| Field profil pelanggan (alamat, telepon) | Merge per field + versi. Konflik pada field yang sama ditampilkan |
| Stage peluang | Versi (optimistic). Perubahan mundur memerlukan konfirmasi |
| Loyalty point | Ledger, tidak pernah overwrite |

### 4. Akses berbasis wilayah

```text
Sales: hanya account di territory-nya (dan yang dia miliki) · manajer: territory dan sub-territory
Filter di setiap query (tenant + territory) + Row Level Security sebagai lapisan tambahan
Data yang diunduh ke perangkat juga dibatasi wilayah, dan dihapus saat sales dipindah/keluar (remote wipe saat sinkron)
```

### 5. Privasi & consent

```text
- Simpan consent pemasaran per kontak (kanal, waktu, sumber) dan hormati saat kampanye
- Minimisasi: hanya data yang dibutuhkan, masking telepon di daftar, full number saat dibuka dengan audit
- Hak subjek data: ekspor & penghapusan/anonimisasi data pelanggan sesuai permintaan dan kebijakan
- Retensi aktivitas & foto sesuai kebijakan
```

### 6. Integrasi komunikasi

```text
Tombol "WhatsApp" membuka deep link wa.me ke nomor E.164 (tidak memerlukan API) dan mencatat aktivitas
Kampanye massal resmi lewat penyedia API resmi dengan template yang disetujui dan consent pelanggan
Email transaksional via penyedia email dengan pelacakan bounce
```

### 7. Laporan

```text
Dashboard: kunjungan per sales per hari, konversi pipeline, target vs realisasi
Dibangun dari read model/materialized view atau warehouse, bukan query berat di DB transaksi
```

## Best Practices

- **Normalisasi & deduplikasi sejak input**.
- **Aktivitas append-only**, profil dengan versi.
- **Offline-first** untuk sales lapangan dengan sinkron idempoten.
- **Akses berbasis territory** di server dan di data yang diunduh.
- **Consent & minimisasi data** sebagai fitur inti.
- **Audit log** perubahan data pelanggan.

## Anti-Patterns

- Nomor telepon disimpan dalam berbagai format sehingga pencarian & dedup gagal.
- Mengunduh seluruh database pelanggan ke setiap perangkat sales.
- Menghapus record duplikat tanpa memindahkan riwayat.
- Mengirim pesan promosi tanpa consent.
- Laporan manajer langsung dari tabel transaksi di jam kerja.

## Performance Considerations

Index trigram untuk pencarian nama, index `(tenant_id, territory_id)` untuk daftar, sinkron delta dengan cursor, dan
pagination di aplikasi. Foto kunjungan dikompres di perangkat dan diunggah via presigned URL di background.

## Security Considerations

Data pelanggan adalah aset dan data pribadi. Terapkan otorisasi per territory, masking, enkripsi DB lokal di perangkat,
batas ekspor (siapa boleh mengunduh CSV), deteksi ekspor massal, dan audit akses data sensitif.

## Real-World Use Cases

- Distributor FMCG: 300 sales mengunjungi toko dengan aplikasi offline, check-in lokasi divalidasi server.
- Program loyalitas F&B: poin berbasis ledger dari transaksi POS, segmentasi pelanggan untuk kampanye ber-consent.

## Interview Questions

1. Bagaimana mencegah data pelanggan duplikat?
2. Bagaimana mendesain aplikasi sales lapangan yang bekerja offline?
3. Bagaimana mengatur akses data berdasarkan wilayah?
4. Bagaimana CRM memenuhi kebutuhan perlindungan data pribadi?

## Sample Answers

1. Normalisasi data saat input (telepon E.164, email lowercase), unique constraint untuk identitas kuat, pencarian kandidat duplikat (telepon/email sama, nama mirip dengan trigram) sebelum menyimpan, dan proses merge yang memindahkan riwayat dengan audit.
2. Sinkron data wilayah ke DB lokal, semua aktivitas ditulis lokal dengan outbox dan ID operasi dari klien, foto diantrekan untuk upload, sinkron idempoten saat online, strategi konflik per jenis data, dan validasi server untuk check-in.
3. Territory dan peran per pengguna, filter tenant & territory di setiap query (plus Row Level Security), data yang diunduh ke perangkat juga dibatasi, dan dihapus saat akses dicabut.
4. Consent tercatat per kontak dan kanal, minimisasi & masking data, retensi terdefinisi, fitur ekspor/penghapusan sesuai hak subjek data, otorisasi ketat, audit akses, dan enkripsi.

## Practical Exercises

1. Implementasikan normalisasi telepon E.164 dan deteksi kandidat duplikat.
2. Rancang skema sinkron offline untuk kunjungan beserta foto.
3. Tulis kebijakan akses territory dan test-nya.

## Quick Reference

```text
Account · contact · activity (append-only) · opportunity (stage, versi) · territory · loyalty ledger
Normalisasi E.164 + dedup (trigram) + merge beraudit
Sales offline: sinkron wilayah (delta) · outbox · client_op_id · foto antre · check-in divalidasi server
Akses: tenant + territory + RLS · data perangkat dibatasi & wipe
Privasi: consent per kanal · masking · retensi · ekspor/hapus · audit
```

## Related Topics

- [Maps & Location Services](/flutter/maps-location/)
- [Sensitive Data Protection & Encryption](/security/sensitive-data-protection/)
- [Inventory Management](/system-design/case-studies/inventory-management/)
