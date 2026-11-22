---
title: "RESTful API Design"
description: "Merancang REST API yang konsisten: resource & URL, HTTP method, status code, error format, pagination, idempotency, versioning, dan kontrak dengan client mobile."
level: intermediate
status: complete
updated: 2026-11-07
tags: [rest, api, http, design, backend]
---

## Overview

**REST** (Representational State Transfer) adalah gaya arsitektur untuk API berbasis HTTP di mana sistem dimodelkan
sebagai **resource** (noun) yang diakses melalui **URL** dan dimanipulasi dengan **HTTP method** standar. API yang baik
bukan sekadar "bisa dipanggil" — ia **konsisten, dapat diprediksi, aman di-retry, dan mudah berevolusi**.

## Why It Matters

API adalah kontrak jangka panjang. Aplikasi mobile yang sudah terpasang di ribuan device tidak bisa dipaksa update
seketika; desain yang buruk berarti breaking change, workaround di client, dan bug data (transaksi ganda saat retry).
Sebagai Flutter developer Anda sudah *mengonsumsi* API — memahami desainnya membuat Anda bisa bernegosiasi kontrak yang
lebih baik dengan tim backend dan siap untuk peran full-stack.

## Core Concepts

- **Resource & collection** — `/orders` (collection), `/orders/{id}` (item), `/orders/{id}/items` (sub-resource).
- **HTTP method semantics**

| Method | Tujuan | Safe | Idempotent |
| --- | --- | --- | --- |
| GET | Baca | ✓ | ✓ |
| POST | Buat / aksi non-idempotent | ✗ | ✗ |
| PUT | Ganti seluruh resource | ✗ | ✓ |
| PATCH | Ubah sebagian | ✗ | ✗ (bisa dibuat idempotent) |
| DELETE | Hapus | ✗ | ✓ |

- **Status code** — 2xx sukses, 4xx kesalahan client, 5xx kesalahan server.
- **Statelessness** — setiap request membawa semua konteks (token), server tidak menyimpan session per koneksi.
- **Representasi** — JSON dengan konvensi penamaan konsisten (`snake_case` atau `camelCase`, pilih satu).
- **Idempotency key** — header untuk membuat POST aman di-retry.
- **Cacheability** — `Cache-Control`, `ETag`, `If-None-Match` → `304 Not Modified`.

## How It Works

```text
Client (Flutter)                         Server
POST /v1/orders                          ┌─────────────────────────────┐
Authorization: Bearer <jwt>      ───────►│ auth → validate → authorize │
Idempotency-Key: 7f3e…                   │ → service → DB transaction  │
Content-Type: application/json           └─────────────────────────────┘
{ "outlet_id": "...", "items": [...] }
                                 ◄─────── 201 Created
                                          Location: /v1/orders/0192f…
                                          { "data": { "id": "0192f…", ... } }
```

## Implementation

### Desain URL

```text
GET    /v1/products?category=coffee&sort=-created_at&limit=20&cursor=eyJ…
GET    /v1/products/{id}
POST   /v1/orders                         # buat order
GET    /v1/orders/{id}
PATCH  /v1/orders/{id}                    # ubah catatan
POST   /v1/orders/{id}/void               # aksi domain yang bukan CRUD murni
GET    /v1/outlets/{outletId}/orders      # scoping yang jelas
```

Aturan: **noun jamak, huruf kecil, kebab-case**, tanpa verb di path (`/getOrders` ❌) kecuali untuk aksi domain yang
memang bukan CRUD (`/void`, `/refund`), maksimal ~2 level nesting.

### Status code yang tepat

| Situasi | Status |
| --- | --- |
| GET sukses | `200 OK` |
| Resource dibuat | `201 Created` + `Location` |
| Diterima untuk diproses async | `202 Accepted` + URL status job |
| Sukses tanpa body (DELETE) | `204 No Content` |
| JSON rusak / parameter salah | `400 Bad Request` |
| Tidak/gagal autentikasi | `401 Unauthorized` |
| Terautentikasi tapi tidak berhak | `403 Forbidden` |
| Resource tidak ada (atau disembunyikan) | `404 Not Found` |
| Konflik state (duplikat, versi) | `409 Conflict` |
| Validasi semantik gagal | `422 Unprocessable Content` |
| Rate limit | `429 Too Many Requests` + `Retry-After` |
| Bug server | `500` · upstream gagal `502` · tidak tersedia `503` |

### Format response & error konsisten (RFC 9457 Problem Details)

```json
{
  "data": [{ "id": "0192f…", "name": "Kopi Susu", "price": 18000 }],
  "meta": { "next_cursor": "eyJpZCI6…", "has_more": true }
}
```

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "Beberapa field tidak valid",
  "instance": "/v1/orders",
  "request_id": "req_01J9…",
  "errors": [{ "field": "items[0].qty", "code": "min", "message": "Minimal 1" }]
}
```

### Express + Zod: validasi, idempotency, dan error handler terpusat

```ts
import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

const CreateOrder = z.object({
  outlet_id: z.string().uuid(),
  items: z.array(z.object({ product_id: z.string().uuid(), qty: z.number().int().min(1) })).min(1),
});

class HttpError extends Error {
  constructor(public status: number, public title: string, public errors?: unknown) { super(title); }
}

const router = express.Router();

router.post('/v1/orders', requireAuth, async (req, res, next) => {
  try {
    const key = req.header('Idempotency-Key');
    if (!key) throw new HttpError(400, 'Idempotency-Key header is required');

    const parsed = CreateOrder.safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, 'Validation failed', parsed.error.issues);

    // Idempotent: jika key sama pernah diproses oleh user ini, kembalikan hasil yang sama
    const existing = await idempotencyStore.find(req.user.id, key);
    if (existing) return res.status(existing.status).json(existing.body);

    // Server menghitung harga — jangan percaya total dari client
    const order = await orderService.create(req.user, parsed.data);
    const body = { data: order };
    await idempotencyStore.save(req.user.id, key, 201, body);
    res.status(201).location(`/v1/orders/${order.id}`).json(body);
  } catch (e) { next(e); }
});

// Error handler terpusat (dipasang paling akhir)
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) req.log.error({ err }, 'unhandled error');      // stack hanya di log
  res.status(status).type('application/problem+json').json({
    title: err instanceof HttpError ? err.title : 'Internal Server Error',
    status,
    errors: err instanceof HttpError ? err.errors : undefined,
    request_id: req.id,
  });
}
```

### Pagination berbasis cursor (keyset)

```sql
-- Halaman berikutnya setelah (created_at, id) terakhir yang dilihat client
SELECT id, name, price, created_at
FROM products
WHERE outlet_id = $1
  AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT 21;            -- ambil limit+1 untuk mengetahui has_more
```

## Best Practices

- **Konsistensi mengalahkan kesempurnaan** — satu konvensi penamaan, format error, pagination, dan tanggal (ISO 8601 UTC, `2026-11-07T08:30:00Z`).
- **Desain API dari kebutuhan client** (use case layar), bukan dari struktur tabel. Hindari memaksa client melakukan N+1 request.
- **Idempotency-Key untuk POST yang membuat transaksi/pembayaran** — retry dari mobile pasti terjadi.
- **Server adalah otoritas** untuk harga, diskon, stok, dan hak akses.
- **Versioning sejak awal** (`/v1`) dan hanya perubahan **additive** di dalam satu versi (tambah field opsional, jangan ganti arti/menghapus field).
- **Cursor pagination** untuk list besar/infinite scroll; batasi `limit` maksimum.
- **Dokumentasikan dengan OpenAPI** dan generate client (mis. `openapi-generator` untuk Dart) agar kontrak tidak menyimpang.
- **Uang sebagai integer unit terkecil** (rupiah, sen) atau string desimal — bukan float.

## Anti-Patterns

- **Selalu `200 OK`** dengan `{ "success": false }` — merusak caching, monitoring, dan retry logic client.
- **Verb di URL** (`/createOrder`, `/deleteProduct?id=`).
- **Membocorkan struktur DB** (kolom internal, nama tabel, stack trace di response).
- **Breaking change tanpa versi** — mengganti nama field yang dipakai app versi lama.
- **Offset pagination untuk feed besar** dan tanpa batas `limit`.
- **GET yang mengubah data** (`GET /orders/1/cancel`) — bisa terpicu prefetch/crawler/retry.

## Performance Considerations

- **Kompresi** (gzip/br) untuk payload JSON besar.
- **Field selection / sparse fieldset** (`?fields=id,name,price`) atau endpoint khusus layar (BFF) untuk mobile.
- **ETag + `If-None-Match`** untuk data yang jarang berubah (katalog) → `304` hemat bandwidth.
- **Hindari N+1** di server (JOIN/batching) dan di client (endpoint agregat).
- **Timeout & batas payload** di server untuk melindungi resource.

## Security Considerations

- **HTTPS wajib**; HSTS.
- **Autentikasi per request** (Bearer token) + **otorisasi per objek** (cek kepemilikan/tenant di setiap query) — mencegah BOLA/IDOR.
- **Validasi input dengan schema** di boundary; tolak field tak dikenal untuk mencegah *mass assignment* (`role: "admin"`).
- **Rate limiting** dan batas ukuran body.
- **Jangan menaruh secret/PII di URL** (masuk ke log & history).
- **Response 404 untuk resource milik orang lain** bila keberadaannya pun sensitif.

## Real-World Use Cases

- **POS:** `POST /v1/orders` dengan Idempotency-Key = UUID transaksi offline; `GET /v1/changes?since=` untuk sync.
- **E-commerce:** `POST /v1/checkout` mengembalikan `202` dan status pembayaran via webhook + polling.
- **Telecom service management:** `POST /v1/tickets` (gangguan pelanggan), `PATCH /v1/tickets/{id}` (status), `GET /v1/customers/{id}/services`.

## Interview Questions

1. **(Fundamental)** Apa prinsip REST? Apa beda PUT dan PATCH?
2. **(Fundamental)** Apa beda 401 dan 403?
3. **(Intermediate)** Apa itu idempotency dan bagaimana membuat POST pembayaran aman di-retry?
4. **(Intermediate)** Bagaimana Anda mendesain pagination untuk list produk 1 juta baris?
5. **(Intermediate)** Bagaimana mengubah API tanpa merusak app versi lama?
6. **(Advanced)** REST vs GraphQL vs gRPC — kapan masing-masing?

## Sample Answers

1. Resource diidentifikasi URL, dimanipulasi lewat method HTTP standar, stateless, representasi (JSON), dan memanfaatkan semantik HTTP (status, cache). PUT mengganti seluruh resource (idempotent); PATCH mengubah sebagian field.
2. 401: identitas belum terverifikasi (token tidak ada/expired/invalid). 403: identitas diketahui tetapi tidak punya izin untuk aksi tersebut.
3. Request yang diulang menghasilkan efek yang sama dengan satu request. Client mengirim `Idempotency-Key` unik (UUID transaksi); server menyimpan key + hasil dan mengembalikan hasil yang sama untuk retry, dengan unique constraint di DB sebagai pengaman.
4. Cursor/keyset pagination berdasarkan kolom terurut & unik (`created_at, id`) dengan index komposit, `limit` maksimum, dan `next_cursor` opaque (base64). Offset besar lambat karena DB tetap memindai baris yang dilewati.
5. Perubahan additive saja dalam versi yang sama (field baru opsional, client mengabaikan field tak dikenal); deprecate dengan header dan timeline; breaking change → `/v2` dan jalankan paralel; pantau versi app yang masih memanggil versi lama; force update hanya bila terpaksa.
6. REST: umum, cache HTTP, mudah untuk public API dan mobile. GraphQL: client butuh fleksibilitas query, banyak layar dengan kebutuhan data berbeda, mengurangi over/under-fetching — dengan biaya kompleksitas caching & otorisasi per field. gRPC: komunikasi antar service internal, performa tinggi, kontrak ketat (protobuf), streaming.

## Practical Exercises

1. Rancang OpenAPI spec untuk POS mini: products, orders (idempotent), void, laporan harian.
2. Implementasikan error handler Problem Details dan pastikan semua error (validasi, 404, 500) memakai format sama.
3. Ubah endpoint list dari offset ke cursor pagination; bandingkan `EXPLAIN ANALYZE` pada halaman ke-5.000.
4. Generate Dart client dari OpenAPI dan pakai di app Flutter.

## Quick Reference

- Noun jamak · kebab-case · `/v1` · maksimal 2 level nesting.
- GET/PUT/DELETE idempotent; POST → **Idempotency-Key**.
- 201+Location · 202 async · 204 kosong · 400/422 input · 401 authn · 403 authz · 404 · 409 konflik · 429 rate limit.
- Error: **Problem Details** + `request_id`.
- Cursor pagination · ISO 8601 UTC · uang = integer.
- Server = otoritas; cek kepemilikan objek di setiap query.

## Related Topics

- [API Versioning](/backend/api-versioning/)
- [Authentication & Authorization](/backend/authentication-authorization/)
- [Validation & Error Handling](/backend/validation-error-handling/)
- [Pagination, Filtering & Sorting](/backend/pagination-filtering-sorting/)
- [REST API Integration (Flutter)](/flutter/rest-api-integration/)
- [OWASP API Security Top 10](/security/owasp-api-security/)
- Referensi: [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110), [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457).
