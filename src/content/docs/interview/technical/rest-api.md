---
title: "REST API Questions"
description: "Bank pertanyaan interview REST API: prinsip REST, HTTP method & idempotency, status code, desain resource & URL, pagination, versioning, error format, caching (ETag), autentikasi, rate limiting, REST vs GraphQL/gRPC, dan konsumsi API di mobile."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, rest-api, http, api-design, question-bank]
---

## Overview

REST API adalah titik temu mobile dan backend. Pertanyaannya dapat datang dari dua arah: **mendesain** API (backend)
dan **mengonsumsi** API dengan andal (mobile). Materi lengkap ada di [RESTful API Design](/backend/restful-api-design/)
dan [REST API Integration (Flutter)](/flutter/rest-api-integration/).

## Why It Matters

Kontrak API yang buruk menimbulkan bug di kedua sisi, kesulitan versioning, dan pemborosan kuota data pengguna.
Interviewer ingin melihat pemahaman HTTP yang benar dan pertimbangan praktis (retry, idempotency, pagination).

## Core Concepts

| Method | Kegunaan | Safe | Idempotent |
| --- | --- | --- | --- |
| GET | Ambil resource | ✓ | ✓ |
| POST | Buat resource / aksi | ✗ | ✗ (kecuali dengan idempotency key) |
| PUT | Ganti seluruh resource | ✗ | ✓ |
| PATCH | Ubah sebagian | ✗ | Tidak dijamin |
| DELETE | Hapus | ✗ | ✓ |

| Status | Arti |
| --- | --- |
| 200 / 201 / 204 | OK / Created / No Content |
| 400 / 422 | Request tidak valid / validasi semantik gagal |
| 401 / 403 | Belum terautentikasi / tidak berwenang |
| 404 / 409 | Tidak ditemukan / konflik (versi, duplikasi) |
| 429 | Terlalu banyak request |
| 500 / 502 / 503 / 504 | Error server / gateway / tidak tersedia / timeout |

## How It Works

```text
Resource (kata benda, jamak) + method (kata kerja) + status code + representasi (JSON)
GET    /v1/customers/42/orders?status=paid&limit=20&cursor=...
POST   /v1/orders                      → 201 + Location: /v1/orders/9f2c
PATCH  /v1/orders/9f2c  {"note": "..."} → 200
DELETE /v1/orders/9f2c                 → 204
```

## Implementation

### Format error konsisten

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stok produk tidak mencukupi",
    "details": [{ "field": "items[0].qty", "issue": "max 3" }],
    "requestId": "req_01HF..."
  }
}
```

### Caching kondisional (hemat kuota mobile)

```http
GET /v1/products/123
→ 200  ETag: "a1b2c3"   Cache-Control: max-age=60

GET /v1/products/123   If-None-Match: "a1b2c3"
→ 304 Not Modified      (tanpa body)
```

### Konsumsi di Flutter: timeout, retry hanya untuk yang aman

```dart
final dio = Dio(BaseOptions(
  connectTimeout: const Duration(seconds: 10),
  receiveTimeout: const Duration(seconds: 20),
))
  ..interceptors.add(AuthInterceptor(tokenStore))         // sisipkan & refresh token
  ..interceptors.add(RetryInterceptor(
    retries: 3,
    shouldRetry: (e) => e.requestOptions.method == 'GET' || e.requestOptions.headers.containsKey('Idempotency-Key'),
  ));
```

## Best Practices

- **Kata benda jamak & hierarki wajar** (`/customers/{id}/orders`), hindari kata kerja di URL kecuali aksi khusus (`/orders/{id}/cancel`).
- **Status code yang benar** + format error konsisten dengan kode mesin.
- **Pagination** (cursor untuk feed besar), filter & sort via query.
- **Versioning** dan kompatibilitas mundur untuk aplikasi mobile versi lama.
- **Idempotency key** untuk POST yang dapat di-retry.
- **Dokumentasi OpenAPI** sebagai kontrak bersama.

## Anti-Patterns

- Selalu `200 OK` dengan `{"success": false}`.
- `GET` yang mengubah data.
- Breaking change tanpa versi baru.
- Mengembalikan seluruh tabel tanpa pagination.
- Retry otomatis pada POST pembayaran tanpa idempotency.

## Performance Considerations

Payload ringkas (field yang dibutuhkan saja), kompresi gzip/brotli, ETag & Cache-Control, pagination, menghindari
chatty API (banyak request kecil) dengan endpoint agregat/BFF untuk layar mobile, HTTP/2 multiplexing.

## Security Considerations

HTTPS wajib, autentikasi (OAuth2/JWT), otorisasi per objek (cegah BOLA/IDOR), validasi input & batas ukuran, rate
limiting, CORS untuk web, jangan menaruh token/data sensitif di query string, dan rujuk OWASP API Security Top 10.

## Real-World Use Cases

- API katalog & transaksi untuk aplikasi kasir.
- API publik untuk integrasi mitra dengan API key & kuota.
- Webhook dari payment gateway (verifikasi signature, idempoten).

## Interview Questions

1. Apa itu REST dan prinsip-prinsipnya?
2. Apa beda PUT dan PATCH?
3. Apa arti idempotent dan method mana yang idempotent?
4. Apa beda 401 dan 403? 400 dan 422?
5. Bagaimana mendesain pagination?
6. Bagaimana versioning API?
7. Bagaimana mencegah double submit/charge dari aplikasi mobile?
8. REST vs GraphQL vs gRPC?
9. Bagaimana menangani token kedaluwarsa di aplikasi?
10. Bagaimana mengamankan webhook?

## Sample Answers

1. Gaya arsitektur berbasis resource dengan antarmuka seragam (HTTP method), stateless (setiap request membawa konteks sendiri), cacheable, client–server, layered system. Dalam praktik: resource URL, method yang tepat, status code, representasi JSON.
2. PUT mengganti seluruh representasi resource (field yang tidak dikirim dianggap hilang/default) dan idempoten; PATCH mengubah sebagian field.
3. Request yang sama dikirim berkali-kali menghasilkan efek akhir yang sama di server. GET, PUT, DELETE (dan HEAD, OPTIONS) idempoten; POST tidak, kecuali dibuat idempoten dengan idempotency key.
4. 401: identitas tidak ada/tidak valid (login ulang/refresh token). 403: identitas valid tetapi tidak berwenang. 400: request rusak/format salah; 422: format benar tetapi melanggar aturan validasi/bisnis (konvensi tim bisa berbeda — yang penting konsisten).
5. Offset/limit sederhana untuk data kecil dan butuh lompat halaman; cursor/keyset untuk data besar & feed karena stabil terhadap data baru dan memakai index. Kembalikan `nextCursor`/`hasMore`.
6. Versi di path (`/v1`) paling umum; alternatif header/media type. Perubahan additive tanpa versi baru; breaking change di versi baru dengan masa transisi dan pemantauan pemakaian versi lama.
7. Idempotency key per aksi dari klien yang disimpan server dengan unique constraint; tombol dinonaktifkan saat request berjalan; retry memakai key yang sama.
8. REST: sederhana, cacheable HTTP, ekosistem luas. GraphQL: klien memilih field, cocok untuk banyak kebutuhan layar berbeda, tetapi caching & keamanan query lebih kompleks. gRPC: biner & kontrak protobuf, cepat untuk komunikasi antar service, dukungan browser/mobile perlu tooling.
9. Interceptor menangkap 401, menjalankan refresh token sekali (request lain menunggu/antre), mengulang request asli dengan token baru; jika refresh gagal → logout dan arahkan ke login.
10. Verifikasi signature HMAC dengan secret bersama, cek timestamp untuk mencegah replay, proses idempoten berdasarkan event id, balas cepat lalu proses asinkron, dan hanya lewat HTTPS.

## Practical Exercises

1. Desain endpoint untuk fitur keranjang belanja lengkap dengan status code dan error.
2. Implementasikan refresh token di interceptor Dio dengan antrean request.
3. Tulis spesifikasi OpenAPI singkat untuk 3 endpoint order.

## Quick Reference

```text
GET/PUT/DELETE idempotent · POST tidak (→ idempotency key) · PATCH sebagian
401 autentikasi · 403 otorisasi · 404 · 409 konflik · 422 validasi · 429 rate limit
Kata benda jamak · cursor pagination · /v1 · error {code,message,details,requestId} · ETag/304
Mobile: timeout · retry hanya yang aman · refresh token di interceptor
```

## Related Topics

- [RESTful API Design](/backend/restful-api-design/)
- [REST API Integration (Flutter)](/flutter/rest-api-integration/)
- [Design a Scalable REST API](/interview/system-design/scalable-rest-api/)
