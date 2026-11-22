---
title: "Design a Scalable REST API"
description: "Latihan system design interview: merancang REST API yang scalable untuk aplikasi mobile — requirement, estimasi, desain API, data model, stateless service, cache, rate limiting, pagination, idempotency, observability, dan trade-off."
level: advanced
status: complete
updated: 2026-11-12
tags: [interview, system-design, rest-api, scalability, caching, rate-limiting]
---

## Overview

Soal: **"Rancang REST API untuk aplikasi katalog & pemesanan yang dipakai jutaan pengguna mobile."** Ini soal dasar
yang menguji pemahaman komponen backend standar: load balancer, service stateless, database, cache, queue, serta
praktik API (versioning, pagination, idempotency, rate limit).

## Why It Matters

Hampir semua aplikasi mobile bergantung pada API. Interviewer ingin melihat apakah Anda memahami apa yang terjadi di
balik `dio.get()` dan bisa merancang API yang tetap cepat dan andal saat pengguna bertambah.

## Core Concepts

### 1. Requirement (klarifikasi dulu)

| Fungsional | Non-fungsional (asumsi) |
| --- | --- |
| Lihat katalog produk (list, detail, search) | p95 latency baca < 200 ms |
| Buat & lihat order | Availability tinggi (target mis. 99,9%) |
| Autentikasi pengguna | Baca jauh lebih banyak dari tulis (mis. 50:1) |
| Notifikasi status order | Order tidak boleh ganda/hilang |

### 2. Estimasi kasar (contoh)

```text
1 juta DAU × 20 request/hari ≈ 20 juta request/hari ≈ ~230 RPS rata-rata, puncak ×5 ≈ ~1.200 RPS
Order: 1 juta × 0,05 = 50 ribu/hari → tulis ringan
Katalog 100 ribu produk × 2 KB ≈ 200 MB → muat di cache
```

Kesimpulan: masalah utamanya **beban baca** → cache & replika baca; tulis order perlu **konsistensi & idempotency**.

## How It Works

```text
Mobile app
   │ HTTPS
   ▼
CDN (gambar, aset statis) ──────────────► Object storage
   │
API Gateway / Load Balancer  (TLS, rate limit, auth check, routing)
   │
API service (stateless, N instance, autoscale)
   ├──► Redis (cache katalog, session/rate-limit counter)
   ├──► PostgreSQL primary (tulis order) ──replikasi──► read replica (baca katalog)
   └──► Message queue ──► worker (notifikasi, email, sinkron stok, laporan)
Observability: log terstruktur, metrik (RPS, latency, error), tracing
```

## Implementation

### Desain endpoint

```http
GET    /v1/products?category=coffee&cursor=eyJpZCI6MTIzfQ&limit=20
GET    /v1/products/{id}
GET    /v1/search?q=kopi
POST   /v1/orders                 Idempotency-Key: 7f3c...   → 201 Created
GET    /v1/orders/{id}
GET    /v1/me/orders?cursor=...
```

Contoh respons list dengan cursor pagination:

```json
{
  "data": [{ "id": "p_123", "name": "Kopi Susu", "price": 18000, "updatedAt": "2026-11-10T08:00:00Z" }],
  "nextCursor": "eyJpZCI6MTQzfQ",
  "hasMore": true
}
```

### Data model inti

```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL,
  status text NOT NULL,
  total numeric(14,2) NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)          -- request ulang tidak membuat order ganda
);
CREATE INDEX ON orders (user_id, created_at DESC);
```

### Cache-aside untuk detail produk (Node.js)

```ts
async function getProduct(id: string) {
  const key = `product:${id}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const product = await db.product.findUnique({ where: { id } });
  if (product) await redis.set(key, JSON.stringify(product), 'EX', 300);   // TTL 5 menit
  return product;
}
// Saat produk diubah: update DB lalu hapus key cache (invalidate).
```

### Pertimbangan desain kunci

| Topik | Pilihan & alasan |
| --- | --- |
| Stateless service | Session/token di JWT atau Redis → instance bisa ditambah bebas |
| Pagination | Cursor (keyset) daripada offset: stabil & cepat di data besar |
| Idempotency | Header `Idempotency-Key` + unique constraint untuk POST order |
| Rate limiting | Token bucket per user/IP di gateway/Redis → `429` + `Retry-After` |
| Versioning | `/v1` di path; perubahan breaking → `/v2`, dukung versi app lama |
| Async work | Notifikasi & email lewat queue agar request cepat dan retry aman |
| Compression | gzip/brotli, field selection, ETag/`If-None-Match` untuk hemat kuota mobile |

## Best Practices

- **Klarifikasi & estimasi** sebelum menggambar.
- **Mulai sederhana** (satu service + DB + cache), lalu skala sesuai bottleneck.
- **Pisahkan jalur baca dan tulis** — cache dan replika untuk baca.
- **Buat API ramah mobile**: payload kecil, pagination, ETag, idempotency untuk retry jaringan buruk.
- **Observability sejak awal**: request id, metrik RED (Rate, Errors, Duration).

## Anti-Patterns

- Langsung ke microservices dan Kubernetes tanpa alasan.
- Offset pagination untuk feed besar (lambat, data bergeser).
- Menyimpan session di memori instance (tidak bisa scale horizontal).
- Mengirim email/notifikasi secara sinkron di dalam request.
- Tidak ada rate limit atau timeout ke dependensi.

## Performance Considerations

- Cache hit ratio tinggi untuk katalog; TTL + invalidasi saat update.
- Index sesuai pola query (`orders(user_id, created_at)`).
- Connection pooling ke database (PgBouncer/pool di aplikasi).
- Replication lag: setelah membuat order, baca dari primary (*read-your-writes*).
- CDN untuk gambar dengan ukuran sesuai perangkat.

## Security Considerations

HTTPS/TLS, autentikasi (OAuth2/JWT dengan masa berlaku pendek + refresh token), otorisasi per resource (cegah IDOR:
user hanya bisa melihat order miliknya), validasi input, rate limiting, secret di secret manager, logging tanpa data
sensitif, dan proteksi dari OWASP API Top 10.

## Real-World Use Cases

- Backend aplikasi e-commerce, POS, atau layanan pelanggan.
- API publik untuk mitra dengan kuota per API key.
- Backend-for-frontend (BFF) khusus aplikasi mobile.

## Interview Questions

1. Bagaimana membuat API bisa melayani 10× trafik saat ini?
2. Bagaimana mencegah order ganda saat mobile melakukan retry?
3. Offset vs cursor pagination — mana dan kenapa?
4. Bagaimana menerapkan rate limiting?
5. Bagaimana menangani perubahan API tanpa merusak aplikasi versi lama?

## Sample Answers

1. Service stateless di belakang load balancer dengan autoscaling, cache untuk data yang sering dibaca, read replica, pekerjaan berat dipindah ke queue, dan monitoring untuk menemukan bottleneck berikutnya (sering di database).
2. Client membuat `Idempotency-Key` per aksi checkout; server menyimpannya dengan unique constraint dan mengembalikan respons yang sama jika key sudah ada.
3. Cursor/keyset: query `WHERE (created_at, id) < (...) ORDER BY ... LIMIT n` memakai index dan stabil ketika data baru masuk; offset lambat di halaman jauh dan bisa melewatkan/menggandakan item.
4. Token bucket/sliding window per user atau API key dengan counter di Redis, diterapkan di gateway; kembalikan `429` dengan `Retry-After`; batas berbeda per endpoint.
5. Perubahan additive tetap di versi yang sama; breaking change di versi baru (`/v2`), dukung versi lama selama masa transisi, dan gunakan minimum supported app version/force update untuk menghentikannya.

## Practical Exercises

1. Hitung estimasi RPS dan kebutuhan cache untuk 5 juta DAU.
2. Desain endpoint & skema untuk fitur "favorit produk".
3. Gambar ulang arsitektur untuk skenario flash sale (lonjakan 50× dalam 10 menit).

## Quick Reference

```text
Klarifikasi → estimasi → API → data model → arsitektur → deep dive → trade-off
LB + service stateless + cache (cache-aside) + primary/replica + queue + CDN
Mobile-friendly: cursor pagination · ETag · idempotency key · versioning · rate limit 429
```

## Related Topics

- [Framework Menjawab System Design](/interview/system-design/framework/)
- [RESTful API Design](/backend/restful-api-design/)
- [Caching Strategy](/system-design/concepts/caching-strategy/)
- [Load Balancing](/system-design/concepts/load-balancing/)
