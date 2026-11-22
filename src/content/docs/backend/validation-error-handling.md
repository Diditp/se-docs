---
title: "Validation & Error Handling"
description: "Validasi input dan penanganan error di API Node.js/TypeScript: validasi skema di boundary (zod), tipe error domain, error handler terpusat, format respons error yang konsisten (RFC 9457 Problem Details), status HTTP yang tepat, error yang aman untuk klien, logging, dan cara klien mobile memetakan error ke pesan pengguna."
level: intermediate
status: complete
version: "Node.js 22 LTS · zod 3.x/4.x · Fastify/Express"
updated: 2026-11-13
tags: [backend, validation, error-handling, zod, http, problem-details]
---

## Overview

**Validasi** memastikan data yang masuk ke sistem benar bentuk dan nilainya sebelum diproses. **Error handling**
memastikan setiap kegagalan menghasilkan respons yang **konsisten, aman, dan dapat ditindaklanjuti** oleh klien,
sementara detail teknis tetap tersimpan di log.

## Why It Matters

Aplikasi mobile harus bisa membedakan "input salah", "tidak berwenang", "data konflik", dan "server bermasalah" untuk
menampilkan pesan yang tepat dan memutuskan apakah perlu retry. Format error yang tidak konsisten membuat klien penuh
`if` khusus dan pesan "Terjadi kesalahan" generik.

## Core Concepts

| Status | Kapan | Retry? |
| --- | --- | --- |
| 400 Bad Request | JSON rusak, parameter tidak valid secara format | Tidak |
| 401 Unauthorized | Belum/gagal autentikasi (token hilang/kedaluwarsa) | Setelah refresh token |
| 403 Forbidden | Terautentikasi tetapi tidak berwenang | Tidak |
| 404 Not Found | Resource tidak ada (atau disembunyikan karena bukan miliknya) | Tidak |
| 409 Conflict | Konflik state (versi data, duplikat) | Setelah resolusi |
| 422 Unprocessable Content | Format benar tetapi melanggar aturan validasi/bisnis | Tidak |
| 429 Too Many Requests | Rate limit | Ya, setelah `Retry-After` |
| 500 Internal Server Error | Bug/kegagalan tak terduga | Mungkin (operasi idempoten) |
| 503 Service Unavailable | Dependensi down/maintenance | Ya, dengan backoff |

| Jenis error | Contoh | Ditangani |
| --- | --- | --- |
| Validasi input | email tidak valid, qty negatif | Di boundary (route), 400/422 |
| Error domain (expected) | stok tidak cukup, order sudah dibayar | Service melempar error domain → 409/422 |
| Error infrastruktur | DB timeout, payment API down | Dipetakan → 503/502, dicatat |
| Bug | `undefined is not a function` | 500 generik, alert |

## How It Works

```text
Request → parse & validasi skema (boundary) → service (aturan bisnis, melempar DomainError)
→ repository (memetakan error DB, mis. unique violation → ConflictError)
→ error handler terpusat: DomainError → status + kode; lainnya → 500 generik + log lengkap
```

## Implementation

### Skema validasi di boundary (zod)

```ts
import { z } from 'zod';

export const CreateOrderSchema = z.object({
  outletId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    qty: z.number().int().min(1).max(999),
  })).min(1).max(200),
  note: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(['cash', 'qris', 'card']),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
```

Validasi juga query string, path param, header penting, dan ukuran body (batas di server/framework).

### Error domain yang eksplisit

```ts
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  constructor(message: string, readonly details?: Record<string, unknown>) { super(message); }
}
export class ValidationError extends AppError { status = 422; code = 'VALIDATION_FAILED'; }
export class NotFoundError extends AppError { status = 404; code = 'NOT_FOUND'; }
export class ForbiddenError extends AppError { status = 403; code = 'FORBIDDEN'; }
export class ConflictError extends AppError { status = 409; code = 'CONFLICT'; }
export class OutOfStockError extends AppError {
  status = 409; code = 'OUT_OF_STOCK';
  constructor(productId: string, available: number) { super('Stok tidak cukup', { productId, available }); }
}
```

### Memetakan error database di repository

```ts
try {
  await db.query('INSERT INTO products (outlet_id, sku, name) VALUES ($1, $2, $3)', [outletId, sku, name]);
} catch (e) {
  if (isPgError(e) && e.code === '23505') throw new ConflictError('SKU sudah dipakai', { field: 'sku' });  // unique_violation
  throw e;                                                                                             // biarkan jadi 500
}
```

### Error handler terpusat dengan Problem Details

```ts
app.setErrorHandler((err, req, reply) => {
  if (err instanceof z.ZodError) {
    return reply.code(422).type('application/problem+json').send({
      type: 'https://api.example.com/problems/validation-failed',
      title: 'Input tidak valid', status: 422, code: 'VALIDATION_FAILED',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      requestId: req.id,
    });
  }
  if (err instanceof AppError) {
    return reply.code(err.status).type('application/problem+json').send({
      type: `https://api.example.com/problems/${err.code.toLowerCase()}`,
      title: err.message, status: err.status, code: err.code, ...err.details, requestId: req.id,
    });
  }
  req.log.error({ err }, 'unhandled error');                       // detail hanya di log
  return reply.code(500).type('application/problem+json').send({
    type: 'about:blank', title: 'Terjadi kesalahan pada server', status: 500, code: 'INTERNAL', requestId: req.id,
  });
});
```

Contoh respons:

```json
{
  "type": "https://api.example.com/problems/out_of_stock",
  "title": "Stok tidak cukup",
  "status": 409,
  "code": "OUT_OF_STOCK",
  "productId": "5b0e…",
  "available": 2,
  "requestId": "req_01J…"
}
```

### Klien mobile memetakan ke Failure

```dart
Failure mapDioError(DioException e) {
  final res = e.response;
  if (res == null) return const NetworkFailure();                         // timeout/offline → bisa retry
  final code = (res.data is Map) ? res.data['code'] as String? : null;
  return switch ((res.statusCode, code)) {
    (401, _) => const UnauthenticatedFailure(),
    (403, _) => const ForbiddenFailure(),
    (409, 'OUT_OF_STOCK') => OutOfStockFailure(res.data['productId'] as String, res.data['available'] as int),
    (422, _) => ValidationFailure.fromProblem(res.data as Map<String, dynamic>),
    (429, _) => RateLimitedFailure(retryAfter: _retryAfter(res.headers)),
    (final s?, _) when s >= 500 => ServerFailure(requestId: res.data?['requestId'] as String?),
    _ => const UnknownFailure(),
  };
}
```

## Best Practices

- **Validasi di boundary** dengan skema, lalu kerja dengan tipe yang sudah tervalidasi.
- **Aturan bisnis di service**, bukan di skema saja (stok, status order).
- **Satu format error** (Problem Details + `code` stabil + `requestId`).
- **Kode error stabil** untuk klien. Pesan boleh berubah atau diterjemahkan.
- **Log sekali di handler**, dengan konteks dan request ID.
- **Validasi tetap di server** walau klien juga memvalidasi (validasi klien hanya untuk UX).

## Anti-Patterns

- `200 OK` dengan `{ success: false }`.
- Mengirim stack trace atau pesan SQL ke klien.
- `catch (e) { return null; }` di service.
- Status 500 untuk input yang salah.
- Klien mencocokkan teks pesan error untuk logika.

## Performance Considerations

Validasi skema sangat murah dibanding I/O. Tolak request tidak valid sedini mungkin (sebelum query DB). Batasi ukuran body
dan panjang array agar validasi tidak menjadi vektor DoS.

## Security Considerations

Validasi input mencegah banyak serangan (mass assignment, nilai di luar batas), tetapi tetap gunakan parameterized query
dan encoding output. Pesan error untuk login/reset password harus generik agar tidak membocorkan keberadaan akun. Untuk
resource milik pengguna lain, pertimbangkan 404 alih-alih 403 agar tidak membocorkan keberadaan data.

## Real-World Use Cases

- Checkout menolak qty 0 dengan 422 per field. Stok kurang menghasilkan 409 `OUT_OF_STOCK` dengan jumlah tersedia, lalu aplikasi menawarkan mengubah qty.
- SKU duplikat dari constraint unik dipetakan ke 409 dengan `field: sku`, dan form menyorot field tersebut.

## Interview Questions

1. Di mana validasi sebaiknya dilakukan?
2. Apa beda 400, 401, 403, 409, dan 422?
3. Bagaimana mendesain format respons error yang baik?
4. Bagaimana menangani error yang tidak terduga?
5. Bagaimana klien mobile sebaiknya memakai respons error?

## Sample Answers

1. Di boundary sistem (route/controller) dengan skema untuk bentuk data, lalu aturan bisnis di service. Validasi klien hanya untuk UX, server tetap memvalidasi.
2. 400: request rusak/format salah. 401: belum terautentikasi. 403: terautentikasi tetapi tidak berwenang. 409: konflik dengan state saat ini. 422: format benar tetapi melanggar aturan validasi.
3. Konsisten di semua endpoint (mis. RFC 9457 Problem Details), berisi status, kode error stabil yang dapat dibaca mesin, pesan yang aman, detail per field untuk validasi, dan request ID untuk penelusuran.
4. Error handler terpusat mengembalikan 500 generik tanpa detail internal, mencatat error lengkap dengan request ID, dan memicu alert. Proses tidak boleh crash diam-diam.
5. Memetakan status + kode ke tipe Failure domain, menampilkan pesan yang sesuai, menyorot field yang salah, me-retry hanya error sementara (jaringan, 429, 503), dan menampilkan request ID untuk dukungan.

## Practical Exercises

1. Buat skema zod untuk tiga endpoint utama dan error handler terpusat.
2. Petakan unique violation dan foreign key violation PostgreSQL ke error domain.
3. Implementasikan mapper Failure di Flutter dan tulis unit test-nya.

## Quick Reference

```text
Boundary: zod parse (body, query, params) · aturan bisnis di service · error DB dipetakan di repository
400 format · 401 authn · 403 authz · 404 · 409 konflik · 422 validasi · 429 limit · 5xx server
Problem Details (application/problem+json) + code stabil + requestId · tanpa stack trace ke klien
Mobile: status+code → Failure · retry hanya untuk error sementara
```

## Related Topics

- [RESTful API Design](/backend/restful-api-design/)
- [Error Handling (Flutter)](/flutter/error-handling/)
- [Logging & Error Tracking](/testing-performance/logging-error-tracking/)
