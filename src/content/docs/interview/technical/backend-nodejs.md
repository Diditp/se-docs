---
title: "Backend & Node.js Questions"
description: "Bank pertanyaan interview backend Node.js/TypeScript: event loop, async, streams, Express/NestJS, middleware, error handling, validasi, autentikasi, database access, caching, queue, scaling, dan observability — dengan jawaban ringkas."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, nodejs, typescript, backend, question-bank]
---

## Overview

Pertanyaan backend untuk mobile/full-stack engineer berfokus pada **cara kerja Node.js**, **desain API**, **akses data**,
dan **keandalan produksi**. Halaman ini mengumpulkan pertanyaan yang paling sering beserta jawaban ringkasnya.

:::note
Contoh mengikuti Node.js LTS modern dan TypeScript. Detail perilaku (mis. fase event loop, API bawaan seperti `fetch`)
bergantung versi — rujuk dokumentasi resmi Node.js.
:::

## Why It Matters

Mobile engineer yang memahami backend dapat merancang kontrak API yang lebih baik, men-debug masalah lintas sistem, dan
berkontribusi sebagai full-stack.

## Core Concepts

| Area | Topik kunci |
| --- | --- |
| Runtime | Event loop, libuv thread pool, microtask vs macrotask, blocking vs non-blocking |
| Async | Callback → Promise → async/await, `Promise.all/allSettled`, error handling |
| Framework | Express/Fastify/NestJS, middleware, routing, DI |
| Data | ORM/query builder, transaksi, connection pool, N+1, migration |
| Keamanan | AuthN/AuthZ, JWT, hashing password, validasi, rate limit, OWASP |
| Skala | Stateless, cluster/PM2/container, cache, queue, graceful shutdown |
| Ops | Logging terstruktur, metrik, tracing, health check, config via env |

## How It Works

```text
Request → middleware (logging, auth, validation) → controller → service (logika bisnis)
        → repository (DB) → response
Error di mana pun → error middleware terpusat → format error konsisten + log
```

## Implementation

```ts
// Urutan eksekusi: sinkron → microtask (Promise) → macrotask (timer)
console.log('1');
setTimeout(() => console.log('4'), 0);
Promise.resolve().then(() => console.log('3'));
process.nextTick(() => console.log('2'));    // nextTick queue diproses sebelum Promise microtask
// Output (CommonJS): 1, 2, 3, 4
// Catatan: di ES module (.mjs / "type": "module") kode top-level berjalan di dalam microtask,
// sehingga Promise dapat terproses sebelum nextTick → 1, 3, 2, 4. Sebutkan konteks ini bila ditanya.

// Paralel vs berurutan
const [user, orders] = await Promise.all([getUser(id), getOrders(id)]);   // paralel, gagal cepat
const results = await Promise.allSettled(tasks);                        // semua selesai, cek status masing-masing

// Error handling terpusat (Express)
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const e = err instanceof AppError ? err : new AppError('INTERNAL', 500, 'Internal error');
  req.log.error({ err, requestId: req.id }, e.code);
  res.status(e.status).json({ error: { code: e.code, message: e.publicMessage } });
});

// Validasi input dengan schema
const CreateOrder = z.object({ items: z.array(z.object({ productId: z.string(), qty: z.number().int().positive() })).min(1) });
app.post('/v1/orders', async (req, res) => {
  const body = CreateOrder.parse(req.body);           // lempar error validasi → 400 di error middleware
  res.status(201).json(await orderService.create(req.user.id, body));
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  server.close();            // berhenti menerima koneksi baru
  await db.$disconnect();    // tutup pool setelah request berjalan selesai
  process.exit(0);
});
```

## Best Practices

- Jelaskan event loop dengan contoh konkret (urutan output, efek CPU-bound).
- Selalu bicarakan **validasi, error handling, dan observability** saat mendesain endpoint.
- Sebutkan trade-off framework (Express minimal & fleksibel vs NestJS terstruktur).

## Anti-Patterns

- Operasi CPU berat/sinkron (`fs.readFileSync`, `bcrypt` sync, JSON besar) di request handler.
- `async` di dalam `forEach` (tidak ditunggu).
- Promise yang ditolak tanpa ditangani (unhandled rejection).
- Menyimpan state user di memori proses (tidak bisa scale horizontal).
- Mengembalikan stack trace ke klien.

## Performance Considerations

Gunakan connection pool, index database, cache (Redis) untuk data panas, pagination, kompresi, worker threads/queue
untuk pekerjaan CPU berat, dan profiling (`--inspect`, clinic.js) saat latency naik. Lihat
[Node.js Event Loop](/backend/nodejs-event-loop/).

## Security Considerations

Hash password dengan bcrypt/argon2, JWT berumur pendek + refresh token yang dapat dicabut, otorisasi per resource
(cegah IDOR), parameterized query, validasi & batasi ukuran body, helmet/CORS yang tepat, rate limiting, secret dari
env/secret manager, `npm audit`. Lihat [Authentication & Authorization](/backend/authentication-authorization/).

## Real-World Use Cases

- Backend REST untuk aplikasi mobile (BFF).
- Worker pemroses queue (notifikasi, laporan, sinkronisasi).
- Webhook receiver untuk payment gateway.

## Interview Questions

1. Jelaskan event loop Node.js.
2. Mengapa Node.js cocok untuk I/O-bound dan kurang cocok untuk CPU-bound?
3. Apa beda `process.nextTick`, Promise, `setTimeout`, dan `setImmediate`?
4. Bagaimana menangani error di async/await dan Express?
5. Apa itu middleware?
6. Bagaimana mendesain autentikasi dengan JWT dan refresh token?
7. Apa itu masalah N+1 dan cara mengatasinya?
8. Bagaimana menskalakan aplikasi Node.js?
9. Bagaimana menjalankan pekerjaan berat tanpa memblokir request?
10. Apa itu streams dan kapan dipakai?
11. Bagaimana mengelola konfigurasi & secret?
12. Apa yang Anda pantau di production?

## Sample Answers

1. Satu thread JavaScript menjalankan callback dari antrean; I/O didelegasikan ke OS/libuv (thread pool untuk fs, dns, crypto tertentu). Event loop berputar melalui fase (timers, pending callbacks, poll, check, close); microtask (nextTick, Promise) diproses di antara callback.
2. I/O non-blocking memungkinkan satu proses melayani banyak koneksi bersamaan dengan overhead kecil. Komputasi CPU berat memblokir satu-satunya thread JS sehingga semua request tertunda — pindahkan ke worker threads, service lain, atau queue.
3. `nextTick` dijalankan paling awal setelah operasi saat ini, lalu microtask Promise, lalu macrotask: `setTimeout` (fase timers) dan `setImmediate` (fase check). Di dalam callback I/O, `setImmediate` selalu sebelum `setTimeout(0)`.
4. `try/catch` di sekitar `await` atau biarkan error naik ke error middleware terpusat (Express 5 meneruskan rejection dari handler async; di Express 4 gunakan wrapper). Petakan ke error domain dengan status & kode yang konsisten.
5. Fungsi di pipeline request–response yang dapat membaca/mengubah request, mengakhiri respons, atau memanggil `next()` — untuk logging, autentikasi, validasi, rate limit, error handling.
6. Access token pendek (menit) untuk setiap request; refresh token panjang yang disimpan aman, dirotasi saat dipakai, dan dapat dicabut di server; logout/ganti password mencabut refresh token. Di mobile, simpan di secure storage.
7. Query daftar lalu satu query per item untuk relasi (1 + N query). Atasi dengan JOIN, `include`/eager loading, batching (`WHERE id IN (...)`), atau DataLoader.
8. Buat service stateless, jalankan banyak instance (container/cluster) di belakang load balancer, cache, read replica, queue untuk pekerjaan asinkron, dan ukur bottleneck (biasanya database).
9. Masukkan job ke queue (BullMQ/RabbitMQ), kembalikan `202 Accepted` + id job, worker terpisah memproses dengan retry; klien polling atau menerima notifikasi.
10. Pemrosesan data secara bertahap (chunk) tanpa memuat semuanya ke memori — untuk file besar, ekspor CSV, proxy upload/download; gunakan `pipeline` untuk menangani backpressure dan error.
11. Konfigurasi dari environment variable yang divalidasi saat startup, secret di secret manager, tidak pernah di repo; nilai berbeda per environment.
12. Metrik RED (rate, errors, duration/latency p95–p99), saturasi (CPU, memori, event loop lag, pool DB), log terstruktur dengan request id, tracing antar service, dan alert berbasis SLO.

## Practical Exercises

1. Tebak output urutan eksekusi dari 5 potongan kode campuran timer/Promise/nextTick, lalu jalankan.
2. Bangun endpoint `POST /orders` dengan validasi, transaksi, idempotency key, dan test.
3. Tambahkan graceful shutdown dan health check ke API Anda, lalu uji dengan Docker.

## Quick Reference

```text
Event loop: sync → nextTick → Promise microtask → timers/poll/check
I/O-bound ✓ · CPU-bound → worker threads/queue · async forEach ✗ → for...of / Promise.all
Middleware → controller → service → repository · error middleware terpusat
JWT pendek + refresh token rotasi · parameterized query · validasi schema · rate limit
Stateless + LB + cache + replica + queue · RED metrics · graceful shutdown
```

## Related Topics

- [Node.js Event Loop](/backend/nodejs-event-loop/)
- [RESTful API Design](/backend/restful-api-design/)
- [Authentication & Authorization](/backend/authentication-authorization/)
- [Design a Scalable REST API](/interview/system-design/scalable-rest-api/)
