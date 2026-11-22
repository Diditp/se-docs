---
title: "Middleware"
description: "Konsep middleware di backend Node.js: pipeline request, urutan yang benar (request ID, logging, security headers, CORS, body limit, rate limit, autentikasi, otorisasi, validasi, handler, error handler), perbedaan Express middleware dan Fastify hooks/plugins, encapsulation, async error handling, middleware per route, dan kesalahan umum."
level: beginner
status: complete
version: "Express 5 · Fastify 5 · Node.js 22"
updated: 2026-11-13
tags: [backend, middleware, express, fastify, pipeline]
---

## Overview

**Middleware** adalah fungsi yang berjalan di antara request masuk dan handler akhir. Middleware dapat membaca atau
mengubah request, menolak request, menambahkan data (mis. `req.user`), atau memodifikasi respons. Rangkaian middleware
membentuk **pipeline** yang dilewati setiap request.

## Why It Matters

Hal lintas fitur (autentikasi, logging, rate limiting, CORS, error handling) sebaiknya ditulis sekali sebagai middleware,
bukan diulang di setiap handler. Urutan yang salah dapat menimbulkan celah, misalnya validasi berjalan sebelum
autentikasi atau rate limit memakai IP load balancer.

## Core Concepts

| Framework | Mekanisme | Catatan |
| --- | --- | --- |
| Express | `app.use((req, res, next) => ...)` | Urutan berdasarkan urutan `use`. Express 5 menangani promise yang reject di handler async |
| Fastify | Hooks (`onRequest`, `preParsing`, `preValidation`, `preHandler`, `onSend`, `onResponse`, `onError`) + plugins | Encapsulation: plugin/hook berlaku di konteks tempat didaftarkan |
| NestJS | Middleware, guards (otorisasi), pipes (validasi), interceptors, exception filters | Peran masing-masing lebih eksplisit |

### Urutan pipeline yang direkomendasikan

```text
1. Request ID & logger berkonteks
2. Security headers (helmet) & CORS
3. Body size limit & parsing
4. Rate limit kasar (per IP)
5. Autentikasi (siapa) → req.user
6. Rate limit per user/route
7. Otorisasi fungsi (permission per route)
8. Validasi input (skema)
9. Handler (otorisasi objek di service)
10. Error handler terpusat (format respons error)
11. Log akses / metrik (onResponse)
```

## How It Works

```text
Express: req → mw1 → mw2 → handler → (error) → error middleware (4 argumen)
          setiap mw memanggil next() untuk lanjut, atau mengirim respons untuk berhenti
Fastify: req → onRequest → preParsing → preValidation → (schema validation) → preHandler → handler
          → preSerialization → onSend → onResponse · error → setErrorHandler
```

## Implementation

### Fastify: hooks & plugin terenkapsulasi

```ts
const app = Fastify({ loggerInstance: logger, bodyLimit: 1_048_576, trustProxy: true });

await app.register(helmet);
await app.register(cors, { origin: ['https://admin.example.com'] });
await app.register(rateLimit, { max: 600, timeWindow: '1 minute', redis });

// Plugin auth: menghias request & menyediakan preHandler yang dapat dipakai ulang
app.decorateRequest('user', null);
app.decorate('authenticate', async (req: FastifyRequest) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) throw new UnauthorizedError();
  req.user = await verifyAccessToken(token);
});

// Semua route di dalam plugin ini terautentikasi (encapsulation)
await app.register(async (secured) => {
  secured.addHook('preHandler', secured.authenticate);
  await secured.register(orderRoutes, { prefix: '/v1/orders' });
  await secured.register(catalogRoutes, { prefix: '/v1/catalog' });
});

// Route publik di luar plugin
app.get('/health/live', async () => ({ status: 'ok' }));

app.setErrorHandler(problemDetailsErrorHandler);
```

### Express: urutan & error handler

```ts
const app = express();
app.set('trust proxy', 1);                        // hanya bila di belakang satu proxy tepercaya
app.use(requestId());
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(cors({ origin: ['https://admin.example.com'] }));
app.use(express.json({ limit: '1mb' }));
app.use(ipRateLimit);

app.use('/v1', authenticate);                     // semua /v1 butuh login
app.post('/v1/orders/:id/void', requirePermission('orders:void'), validate(VoidOrderSchema), voidOrderHandler);

app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
app.use((err, req, res, _next) => {               // error middleware: 4 argumen, PALING AKHIR
  req.log.error({ err }, 'request failed');
  res.status(err.status ?? 500).json(toProblem(err, req.id));
});
```

### Middleware yang dapat dipakai ulang

```ts
// Factory: requirePermission('orders:void')
export const requirePermission = (perm: Permission) => async (req: FastifyRequest) => {
  if (!hasPermission(req.user.roles, perm)) throw new ForbiddenError();
};

// Validasi body dengan zod sebagai preValidation
export const body = <T extends z.ZodTypeAny>(schema: T) => async (req: FastifyRequest) => {
  req.body = schema.parse(req.body);
};
```

Fastify juga memiliki validasi JSON Schema bawaan (cepat). Zod lebih nyaman untuk tipe TypeScript, dan keduanya dapat
dipakai sesuai konvensi proyek.

### Menghitung durasi & metrik

```ts
app.addHook('onResponse', async (req, reply) => {
  httpDuration.observe({ method: req.method, route: req.routeOptions.url ?? 'unknown', status: reply.statusCode },
    reply.elapsedTime / 1000);
});
```

Gunakan pola route (`/v1/orders/:id`), bukan URL asli, agar label metrik tidak meledak.

## Best Practices

- **Urutan pipeline yang disengaja** dan terdokumentasi.
- **Autentikasi default untuk grup route**, pengecualian publik eksplisit.
- **Middleware kecil & fokus**, satu tanggung jawab.
- **Error handler terpusat** di akhir pipeline.
- **Otorisasi objek tetap di service**. Middleware menangani hal lintas fitur.
- **Konfigurasi trust proxy dengan benar**.

## Anti-Patterns

- Logika bisnis di middleware (mis. menghitung harga di middleware global).
- Middleware async di Express 4 tanpa penanganan error (promise reject tidak tertangkap).
- Middleware yang lupa memanggil `next()` atau mengirim respons (request menggantung).
- Body parser tanpa batas ukuran.
- Route admin yang lupa dipasang middleware otorisasi karena didaftarkan per route satu per satu.

## Performance Considerations

Setiap middleware berjalan pada setiap request yang cocok. Hindari query database di middleware global kecuali perlu
(mis. memuat user lengkap di setiap request). Simpan klaim penting di token, cache data yang sering dibutuhkan, dan
pasang middleware mahal hanya pada route yang memerlukannya.

## Security Considerations

Pipeline adalah tempat kontrol keamanan lintas fitur: header keamanan, CORS, batas ukuran, rate limit, autentikasi,
dan otorisasi fungsi. Pastikan pengecualian (route publik) terdaftar eksplisit dan diuji. Test otomatis harus memastikan
setiap route terlindungi mengembalikan 401 tanpa token.

## Real-World Use Cases

- API POS: semua `/v1` di dalam plugin terautentikasi, `/health` dan `/v1/auth/*` publik.
- Middleware `requirePermission('reports:read')` untuk route laporan manajer.

## Interview Questions

1. Apa itu middleware dan contoh penggunaannya?
2. Bagaimana urutan middleware yang benar dan mengapa urutan penting?
3. Apa beda middleware Express dan hooks Fastify?
4. Di mana sebaiknya otorisasi objek dilakukan?

## Sample Answers

1. Fungsi di antara request dan handler untuk hal lintas fitur, seperti request ID, logging, CORS, rate limiting, autentikasi, validasi, dan error handling.
2. Urutan menentukan data apa yang tersedia dan kontrol mana yang berlaku lebih dulu: request ID dan logging paling awal, batas ukuran sebelum parsing, autentikasi sebelum rate limit per user dan otorisasi, validasi sebelum handler, dan error handler di akhir.
3. Express memakai rantai `use` dengan `next()`. Fastify memakai hooks pada fase siklus hidup yang jelas dan plugin dengan encapsulation, sehingga hook berlaku hanya pada konteks tempat didaftarkan, dengan validasi skema bawaan.
4. Di service/repository dengan memfilter berdasarkan tenant/pemilik dari token, karena membutuhkan data objek. Middleware cukup untuk otorisasi fungsi (peran/permission).

## Practical Exercises

1. Gambar pipeline API Anda dan perbaiki urutannya.
2. Pindahkan semua route terautentikasi ke satu plugin/router dengan auth default.
3. Tulis test yang memastikan setiap route non-publik mengembalikan 401 tanpa token.

## Quick Reference

```text
requestId → log → helmet/CORS → body limit → rate limit IP → authN → rate limit user → authZ fungsi → validasi → handler → error handler → onResponse metrik
Express: app.use, next(), error mw 4 argumen di akhir · Fastify: hooks + plugin encapsulation + setErrorHandler
Auth default per grup · route publik eksplisit · otorisasi objek di service · trust proxy benar
```

## Related Topics

- [Express.js vs NestJS](/backend/express-nestjs/)
- [Validation & Error Handling](/backend/validation-error-handling/)
- [Authentication & Authorization](/backend/authentication-authorization/)
