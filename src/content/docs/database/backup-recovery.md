---
title: "Backup & Recovery"
description: "Strategi backup dan pemulihan database: RPO & RTO, backup logis (pg_dump) vs fisik (pg_basebackup), WAL archiving & point-in-time recovery, aturan 3-2-1, enkripsi & retensi, uji restore, backup di layanan cloud terkelola, serta backup data lokal aplikasi mobile."
level: intermediate
status: complete
version: "PostgreSQL 15+"
updated: 2026-11-12
tags: [database, backup, recovery, pitr, rpo, rto, disaster-recovery]
---

## Overview

**Backup** adalah salinan data yang dapat dipakai untuk **memulihkan** sistem setelah kesalahan manusia, bug, serangan
(ransomware), atau kerusakan perangkat keras. Backup yang tidak pernah diuji restore-nya **belum terbukti sebagai backup**.

## Why It Matters

Kehilangan data transaksi atau pelanggan dapat berarti kerugian finansial, sanksi, dan hilangnya kepercayaan. Insiden
paling umum bukan bencana alam, melainkan `DELETE` tanpa `WHERE`, migrasi yang salah, atau bug aplikasi.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| **RPO** (Recovery Point Objective) | Berapa banyak data (dalam waktu) yang boleh hilang — mis. ≤ 5 menit |
| **RTO** (Recovery Time Objective) | Berapa lama sistem boleh mati sampai pulih — mis. ≤ 1 jam |
| Backup logis | Dump SQL/arsip objek (`pg_dump`) — portabel, lambat untuk DB besar |
| Backup fisik | Salinan file data (`pg_basebackup`, snapshot disk) — cepat untuk DB besar |
| WAL archiving | Menyimpan log perubahan secara kontinu |
| PITR | Point-in-time recovery: restore base backup + replay WAL hingga waktu tertentu |
| Replika ≠ backup | Replika ikut menerima `DELETE` yang salah secara instan |
| Aturan 3-2-1 | 3 salinan, 2 media berbeda, 1 di luar lokasi (off-site/akun terpisah) |

## How It Works

```text
Minggu 00:00  base backup ───────────────────────────────────► object storage
Terus-menerus  WAL segment ─► archive ─► object storage
Rabu 14:32     DELETE tanpa WHERE terjadi
Recovery       restore base backup Minggu + replay WAL hingga Rabu 14:31:59  (PITR)
               → verifikasi → alihkan aplikasi / salin data yang hilang kembali
```

## Implementation

### Backup logis

```bash
# Format custom (terkompresi, bisa restore selektif)
pg_dump -h db -U backup_user -d pos -Fc -f pos_$(date +%F).dump

# Restore ke database baru (bukan menimpa production)
createdb -h db-restore pos_restore
pg_restore -h db-restore -d pos_restore --jobs 4 pos_2026-11-12.dump

# Restore satu tabel saja
pg_restore -d pos_restore -t orders pos_2026-11-12.dump
```

### Backup fisik + WAL archiving (konsep konfigurasi)

```text
postgresql.conf:
  wal_level = replica
  archive_mode = on
  archive_command = '<perintah/alat yang menyalin %p ke object storage>'
Base backup: pg_basebackup -D /backup/base -Ft -z -X stream
Restore PITR: pulihkan base backup → set restore_command & recovery_target_time → start
```

Di praktik, gunakan alat yang matang seperti **pgBackRest**, **Barman**, atau **WAL-G**, atau fitur backup otomatis &
PITR dari layanan terkelola (RDS/Cloud SQL/Azure, dsb.).

### Jadwal & retensi contoh

| Jenis | Frekuensi | Retensi |
| --- | --- | --- |
| WAL archive | Kontinu | 14 hari |
| Base backup fisik | Harian | 14 hari |
| Dump logis | Mingguan | 3 bulan |
| Backup bulanan (arsip) | Bulanan | Sesuai kebijakan/regulasi |

### Uji restore otomatis (checklist)

```markdown
- [ ] Restore backup terbaru ke environment terpisah (terjadwal, mis. mingguan)
- [ ] Jalankan query verifikasi: jumlah baris tabel inti, transaksi terakhir, checksum sederhana
- [ ] Catat waktu restore (bandingkan dengan RTO)
- [ ] Alert bila backup/restore gagal atau backup terbaru lebih tua dari RPO
- [ ] Runbook langkah pemulihan tertulis & dilatih
```

### Data lokal aplikasi mobile

- Data yang belum tersinkron (outbox) adalah satu-satunya salinan — sinkronkan secepatnya dan tampilkan status pending.
- Jangan menghapus database lokal saat logout/upgrade jika masih ada data belum tersinkron.
- Untuk data penting, sediakan ekspor (mis. file terenkripsi) sebagai jalan terakhir dukungan teknis.
- Perhatikan pengaturan auto-backup platform (Android Auto Backup) agar database/token sensitif tidak ikut dicadangkan tanpa sengaja.

## Best Practices

- **Tentukan RPO/RTO bersama bisnis**, lalu rancang backup untuk memenuhinya.
- **PITR untuk database transaksional** penting.
- **3-2-1 dan salinan immutable/terpisah akun** untuk melindungi dari ransomware atau akun yang dibobol.
- **Enkripsi backup** dan kelola kuncinya terpisah.
- **Uji restore secara berkala** dan ukur waktunya.
- **Backup sebelum migrasi destruktif**.

## Anti-Patterns

- Menganggap replika sebagai backup.
- Backup di server yang sama dengan database.
- Tidak pernah menguji restore.
- Backup tanpa enkripsi berisi data pribadi di storage publik.
- Satu akun cloud yang dapat menghapus database **dan** semua backup.

## Performance Considerations

`pg_dump` pada database besar memakan waktu dan I/O — jalankan dari replika atau di jam sepi. Backup fisik dan snapshot
lebih cepat untuk data besar; restore paralel (`--jobs`) mempercepat pemulihan logis. Waktu restore sering menjadi
pembatas RTO.

## Security Considerations

Backup berisi seluruh data sensitif: enkripsi at rest dan in transit, akses minimum (akun khusus backup), audit akses,
retensi sesuai regulasi, dan penghapusan aman saat kedaluwarsa. Lindungi dari penghapusan oleh penyerang (object lock /
immutability).

## Real-World Use Cases

- Memulihkan tabel `orders` setelah `DELETE` salah melalui PITR ke database terpisah.
- Uji restore mingguan otomatis di pipeline.
- Backup otomatis harian + PITR di layanan PostgreSQL terkelola.

## Interview Questions

1. Apa itu RPO dan RTO?
2. Apa beda backup logis dan fisik?
3. Apa itu point-in-time recovery?
4. Mengapa replika bukan backup?
5. Bagaimana memastikan backup benar-benar bisa dipakai?

## Sample Answers

1. RPO adalah batas maksimal data yang boleh hilang (diukur dalam waktu); RTO adalah batas maksimal waktu pemulihan layanan.
2. Logis menyimpan representasi SQL/objek (portabel, selektif, lambat untuk data besar); fisik menyalin file data database (cepat untuk data besar, terikat versi/platform).
3. Mengembalikan database ke waktu tertentu dengan merestore base backup lalu memutar ulang WAL hingga titik sebelum insiden.
4. Replika menerima semua perubahan — termasuk penghapusan atau korupsi akibat kesalahan — hampir seketika, sehingga tidak melindungi dari kesalahan logis.
5. Uji restore terjadwal ke environment terpisah, verifikasi isi data, ukur waktu restore terhadap RTO, pantau keberhasilan backup, dan latih runbook.

## Practical Exercises

1. Buat backup `pg_dump -Fc` dan restore satu tabel ke database baru.
2. Siapkan PostgreSQL di Docker dengan WAL archiving dan lakukan PITR ke 1 menit sebelum `DELETE`.
3. Tulis runbook pemulihan untuk skenario "data order hari ini terhapus".

## Quick Reference

```text
RPO = data boleh hilang · RTO = waktu pulih · replika ≠ backup
Logis: pg_dump -Fc / pg_restore --jobs · fisik: pg_basebackup + WAL archive → PITR
3-2-1 · enkripsi · immutable/terpisah akun · uji restore terjadwal · backup sebelum migrasi
```

## Related Topics

- [Database Security](/database/database-security/)
- [Database Migration](/database/migration/)
- [Transactions & ACID](/database/transactions-acid/)
