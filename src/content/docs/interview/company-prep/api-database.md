---
title: "API & Database"
description: "Ringkasan siap-interview tentang REST API dan database relasional: HTTP method & status code, desain endpoint, SQL dasar sampai JOIN & agregasi, relasi tabel, index, transaksi, serta soal SQL yang sering muncul."
level: intermediate
status: complete
updated: 2026-11-13
tags: [interview, company-prep, api, rest, sql, database]
---

## Overview

Topik **API & database** menguji apakah Anda memahami **bagaimana aplikasi mengambil dan menyimpan data**: kontrak
komunikasi antara client dan server (REST API) serta cara data disimpan dan di-query (SQL, relasi, index, transaksi).
Halaman ini adalah **ringkasan untuk persiapan cepat**; pendalaman ada di menu Backend dan Database.

## Why It Matters

Sebagai mobile developer Anda sudah mengonsumsi API; di seleksi posisi Software Engineer, Anda diharapkan juga bisa
**merancang endpoint**, **menulis query SQL** (sering ada tes tertulis/live), dan **menjelaskan konsep database** seperti
normalisasi, relasi, index, dan ACID.

## Core Concepts

### REST API

| Method | Fungsi | Idempotent |
| --- | --- | --- |
| GET | Ambil data | ✓ |
| POST | Buat data / aksi | ✗ |
| PUT | Ganti seluruh data | ✓ |
| PATCH | Ubah sebagian | ✗ (umumnya) |
| DELETE | Hapus | ✓ |

Status code penting: `200` OK · `201` Created · `204` No Content · `400` Bad Request · `401` Unauthorized (belum login) ·
`403` Forbidden (tidak berhak) · `404` Not Found · `409` Conflict · `422` validasi · `429` Too Many Requests · `500` server error.

### Database relasional

| Konsep | Arti |
| --- | --- |
| Tabel, baris, kolom | Entitas, record, atribut |
| Primary key (PK) | Identitas unik baris |
| Foreign key (FK) | Referensi ke PK tabel lain → relasi |
| Relasi | 1–1, 1–N (customer → orders), N–N (orders ↔ products via `order_items`) |
| Normalisasi | Mengurangi duplikasi (1NF, 2NF, 3NF) |
| Index | Struktur untuk mempercepat pencarian (B-tree) |
| Transaksi & ACID | Atomicity, Consistency, Isolation, Durability |
| SQL vs NoSQL | Relasional & skema ketat vs dokumen/key-value fleksibel |

## How It Works

```text
Client ── GET /v1/customers/42/bills ──► API: auth → validasi → service
                                          SQL: SELECT ... FROM bills WHERE customer_id = $1 ORDER BY period DESC LIMIT 12
         ◄── 200 { "data": [...] } ──────  DB memakai index (customer_id, period) → hasil cepat
```

Contoh schema sederhana untuk layanan pelanggan:

```sql
CREATE TABLE customers (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_no text NOT NULL UNIQUE,
  name        text NOT NULL,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE services (                         -- layanan yang dimiliki pelanggan (1 customer : N services)
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers(id),
  package     text NOT NULL,                    -- mis. 'Internet 50 Mbps'
  status      text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TERMINATED')),
  installed_at date
);

CREATE TABLE tickets (                          -- laporan gangguan
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id  bigint NOT NULL REFERENCES services(id),
  category    text NOT NULL,
  status      text NOT NULL DEFAULT 'OPEN',
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX idx_services_customer_id ON services (customer_id);
CREATE INDEX idx_tickets_service_id_created_at ON tickets (service_id, created_at DESC);
```

## Implementation

### Query yang sering diminta

```sql
-- 1. Pelanggan beserta jumlah layanan aktif (termasuk yang tidak punya layanan aktif)
SELECT c.customer_no, c.name, COUNT(s.id) AS active_services
FROM customers c
LEFT JOIN services s ON s.customer_id = c.id AND s.status = 'ACTIVE'
GROUP BY c.id, c.customer_no, c.name
ORDER BY active_services DESC;

-- 2. Jumlah tiket per kategori bulan ini, hanya kategori dengan > 10 tiket
SELECT category, COUNT(*) AS total
FROM tickets
WHERE created_at >= date_trunc('month', now())
GROUP BY category
HAVING COUNT(*) > 10
ORDER BY total DESC;

-- 3. Rata-rata waktu penyelesaian tiket (jam) per kategori
SELECT category,
       ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 1) AS avg_hours
FROM tickets
WHERE resolved_at IS NOT NULL
GROUP BY category;

-- 4. Pelanggan yang tidak pernah membuat tiket
SELECT c.* FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM services s JOIN tickets t ON t.service_id = s.id WHERE s.customer_id = c.id
);

-- 5. Tiket terbaru per layanan (window function)
SELECT * FROM (
  SELECT t.*, ROW_NUMBER() OVER (PARTITION BY service_id ORDER BY created_at DESC) AS rn
  FROM tickets t
) x WHERE rn = 1;

-- 6. Transaksi: tutup tiket dan catat riwayat secara atomik
BEGIN;
UPDATE tickets SET status = 'RESOLVED', resolved_at = now() WHERE id = $1 AND status <> 'RESOLVED';
INSERT INTO ticket_history (ticket_id, status, changed_by) VALUES ($1, 'RESOLVED', $2);
COMMIT;
```

### Desain endpoint untuk fitur "lapor gangguan"

```text
POST   /v1/tickets                     body: { service_id, category, description }  → 201 + Location
GET    /v1/tickets?status=OPEN&limit=20&cursor=…                                   → 200 list (milik user)
GET    /v1/tickets/{id}                                                             → 200 / 404
PATCH  /v1/tickets/{id}                body: { description }                        → 200
POST   /v1/tickets/{id}/cancel                                                      → 200 / 409 jika sudah diproses
```

## Best Practices

- **Endpoint berbasis resource** (noun jamak), status code yang benar, error format konsisten.
- **Validasi & otorisasi di server** — user hanya bisa melihat tiket layanannya sendiri.
- **SQL berparameter** (`$1`), bukan concatenation string.
- **Index pada FK dan kolom filter/sort**; cek dengan `EXPLAIN`.
- **Transaksi untuk perubahan multi-tabel**.
- **Pagination** untuk list.
- **Normalisasi sampai 3NF**, denormalisasi hanya dengan alasan performa terukur.

## Anti-Patterns

- Semua response `200` dengan `"success": false`.
- `SELECT *` dan query tanpa `LIMIT` di endpoint list.
- Menyimpan banyak nilai dalam satu kolom (`"1,5,9"`) → melanggar 1NF, sulit di-query.
- N+1 query (query per item di loop).
- Menghapus data penting secara fisik tanpa jejak (gunakan status/soft delete + audit).

## Performance Considerations

- Index tepat mengubah full scan menjadi pencarian O(log n).
- Agregasi di SQL, bukan di aplikasi.
- Cache untuk data yang sering dibaca & jarang berubah (katalog paket layanan).
- Keyset pagination untuk tabel besar.

## Security Considerations

- SQL injection dicegah dengan parameterized query.
- BOLA/IDOR dicegah dengan scope query ke pemilik data.
- Data pribadi (NIK, nomor HP) dilindungi: akses terbatas, masking di log, enkripsi bila perlu.
- Least privilege user database untuk aplikasi.

## Real-World Use Cases

- Portal pelanggan: daftar layanan, tagihan, riwayat tiket.
- Dashboard operasional: tiket per kategori/wilayah, SLA penyelesaian.
- Aplikasi teknisi: daftar work order, update status, foto bukti.

## Interview Questions

1. Apa itu REST API? Sebutkan HTTP method dan kegunaannya.
2. Apa beda 401 dan 403?
3. Apa beda primary key dan foreign key? Beri contoh relasi many-to-many.
4. Apa itu normalisasi?
5. Apa beda INNER JOIN dan LEFT JOIN?
6. Apa fungsi index dan kekurangannya?
7. Jelaskan ACID.
8. SQL vs NoSQL — kapan memakai masing-masing?

## Sample Answers

1. Gaya arsitektur API berbasis resource yang diakses lewat URL dan dimanipulasi dengan method HTTP: GET ambil, POST buat, PUT ganti, PATCH ubah sebagian, DELETE hapus; stateless dan memakai status code standar.
2. 401: belum/gagal autentikasi (token tidak ada atau kedaluwarsa). 403: sudah terautentikasi tetapi tidak punya izin.
3. PK mengidentifikasi baris secara unik; FK adalah kolom yang merujuk PK tabel lain untuk membentuk relasi. Many-to-many: `orders` ↔ `products` melalui tabel penghubung `order_items(order_id, product_id, qty)`.
4. Proses menata tabel untuk mengurangi duplikasi dan anomali update: 1NF nilai atomik, 2NF tidak ada dependensi parsial pada composite key, 3NF tidak ada dependensi transitif.
5. INNER JOIN hanya baris yang punya pasangan di kedua tabel; LEFT JOIN mengembalikan semua baris tabel kiri dengan NULL bila tidak ada pasangan.
6. Mempercepat pencarian/filter/sort dengan struktur terurut (B-tree); kekurangannya memperlambat insert/update/delete dan memakan storage.
7. Atomicity (semua atau tidak sama sekali), Consistency (constraint tetap terpenuhi), Isolation (transaksi paralel tidak saling mengganggu), Durability (data yang sudah commit bertahan walau crash).
8. SQL untuk data terstruktur dengan relasi dan kebutuhan transaksi kuat (billing, transaksi, pelanggan). NoSQL untuk skema fleksibel, skala tulis sangat besar, atau pola akses sederhana (log, cache, dokumen, time-series) — sering dipakai berdampingan.

## Practical Exercises

1. Buat schema `customers`, `services`, `tickets` di PostgreSQL (Docker) dan isi data contoh.
2. Kerjakan 6 query di atas tanpa melihat jawaban, lalu bandingkan.
3. Rancang 5 endpoint untuk fitur tagihan (daftar, detail, bayar, riwayat, unduh PDF) lengkap dengan status code.
4. Latih [SQL Query Challenges](/interview/coding-test/sql-challenges/).

## Quick Reference

```text
GET ambil · POST buat · PUT ganti · PATCH ubah · DELETE hapus · 401 authn · 403 authz · 422 validasi
PK unik · FK relasi · N–N via tabel penghubung · 1NF/2NF/3NF
INNER = irisan · LEFT = semua kiri · WHERE (sebelum agregasi) vs HAVING (sesudah) · NOT EXISTS untuk anti-join
Index = cepat baca, lambat tulis · ACID · transaksi untuk multi-tabel · query berparameter
```

## Related Topics

- [RESTful API Design](/backend/restful-api-design/)
- [JOIN](/database/joins/) · [Indexing](/database/indexing/) · [Transactions & ACID](/database/transactions-acid/)
- [Client-Server Architecture](/interview/company-prep/client-server/)
- [SQL Query Challenges](/interview/coding-test/sql-challenges/)
