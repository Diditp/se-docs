---
title: "API Performance"
description: "Mengoptimasi performa API Node.js/TypeScript untuk klien mobile: mengukur latensi (p95, TTFB), menemukan bottleneck (DB, N+1, I/O serial, event loop blocking), caching (HTTP ETag, Redis), pagination, kompresi, payload ramping, connection pooling, timeout, dan desain API yang ramah mobile (agregasi/BFF)."
level: advanced
status: complete
version: "Node.js 22 LTS · Fastify/Express · Redis — cek versi proyek Anda"
updated: 2026-11-13
tags: [performance, api, nodejs, caching, redis, latency]
---

## Overview

**API performance** menentukan seberapa cepat layar mobile terisi. Bagi aplikasi mobile, latensi jaringan seluler sudah
tinggi, sehingga setiap round-trip dan setiap kilobyte payload penting. Optimasi API mencakup server (kode & database)
dan **desain kontrak** (berapa request, seberapa besar respons).

## Why It Matters

Mobile developer yang memahami sisi backend dapat mendiskusikan desain endpoint dengan tim backend, atau membangun
backend ringan sendiri. Pertanyaan "API Anda lambat, apa yang Anda lakukan?" umum di interview.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Latensi & percentiles | p50/p95/p99 waktu respons per endpoint |
| TTFB | Waktu sampai byte pertama — mencerminkan kerja server |
| Throughput | Request per detik yang mampu dilayani |
| Bottleneck | Komponen paling lambat (biasanya DB atau layanan eksternal) |
| Event loop blocking | Kode sinkron berat di Node menghambat semua request |
| Caching | Menyimpan hasil agar tidak dihitung ulang (klien, CDN, server, DB) |

## How It Works

```text
Request → middleware (auth, validasi) → handler → service → DB / cache / layanan eksternal → serialisasi → kompresi → respons
Latensi total = jaringan + antrean + kerja CPU + I/O menunggu (DB, HTTP lain) + ukuran respons
```

## Implementation

### 1. Ukur per endpoint

```ts
app.addHook('onResponse', async (req, reply) => {
  req.log.info({ route: req.routeOptions.url, status: reply.statusCode, ms: reply.elapsedTime }, 'request done');
});
// Kirim ke APM/metrics (OpenTelemetry → Prometheus/Grafana/vendor) untuk p95 per route
```

### 2. Paralelkan I/O independen

```ts
// ❌ serial: 3 × 80 ms = 240 ms
const outlet = await outletRepo.find(id);
const stats = await statsRepo.today(id);
const promos = await promoRepo.active(id);

// ✅ paralel: ~80 ms
const [outlet, stats, promos] = await Promise.all([
  outletRepo.find(id), statsRepo.today(id), promoRepo.active(id),
]);
```

### 3. Hindari N+1 query

```ts
// ❌ 1 query order + N query item
for (const o of orders) o.items = await itemRepo.byOrder(o.id);
// ✅ 1 query untuk semua item lalu dikelompokkan
const items = await itemRepo.byOrders(orders.map(o => o.id));     // WHERE order_id = ANY($1)
```

### 4. Jangan memblokir event loop

```ts
// ❌ bcrypt sinkron / JSON besar / laporan CPU-heavy di handler
const hash = bcrypt.hashSync(pw, 12);
// ✅ versi async (thread pool), worker_threads, atau job queue untuk kerja panjang
const hash = await bcrypt.hash(pw, 12);
```

### 5. Caching berlapis

```ts
// HTTP conditional request: klien mobile mengirim If-None-Match
app.get('/v1/catalog', async (req, reply) => {
  const { etag, body } = await catalogService.snapshot(req.user.outletId);
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return reply.header('ETag', etag).header('Cache-Control', 'private, max-age=60').send(body);
});

// Redis cache-aside untuk data mahal yang sering dibaca
async function getMenu(outletId: string) {
  const key = `menu:${outletId}:v3`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const menu = await menuRepo.load(outletId);
  await redis.set(key, JSON.stringify(menu), 'EX', 300);
  return menu;
}
// Invalidasi saat menu berubah: hapus key atau naikkan versi
```

### 6. Payload ramping

```text
- Pagination cursor (limit + next_cursor), bukan kirim semua
- Hanya field yang dibutuhkan layar (DTO khusus list vs detail)
- Kompresi gzip/brotli untuk JSON besar
- Sinkronisasi delta (updated_since) untuk data katalog di mobile
```

### 7. Endpoint ramah mobile

| Masalah | Solusi |
| --- | --- |
| Layar butuh 6 request | Endpoint agregasi / Backend-for-Frontend |
| Upload besar gagal di sinyal lemah | Upload langsung ke object storage (signed URL), resumable |
| Request lama (laporan) | Job async + polling/push saat selesai |
| Retry menyebabkan duplikat | Idempotency-Key |

### 8. Koneksi & timeout

```ts
const pool = new Pool({ max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 });
const res = await fetch(paymentUrl, { signal: AbortSignal.timeout(5_000) });   // jangan menunggu tanpa batas
```

## Best Practices

- **Ukur p95 per endpoint** sebelum mengoptimasi.
- **Optimasi database dulu** (index, N+1) — biasanya bottleneck terbesar.
- **Paralelkan I/O** dan jangan blok event loop.
- **Cache dengan strategi invalidasi yang jelas**.
- **Desain kontrak untuk mobile**: sedikit request, payload kecil, pagination, delta sync.
- **Timeout & circuit breaker** untuk dependensi eksternal.

## Anti-Patterns

- Mengembalikan seluruh tabel tanpa pagination.
- Cache tanpa TTL/invalidasi (data basi).
- `await` di dalam loop untuk pekerjaan independen.
- Logging body besar setiap request.
- Menambah server sebelum memahami bottleneck.

## Performance Considerations

Optimasi satu lapisan dapat memindahkan bottleneck ke lapisan lain (misalnya cache menurunkan beban DB tetapi menambah
memori Redis). Uji dengan beban realistis (lihat Load & Stress Testing) dan pantau setelah perubahan.

## Security Considerations

Cache tidak boleh mencampur data antar pengguna/tenant — sertakan tenant/user di key dan gunakan `Cache-Control: private`
untuk data pribadi. Rate limiting melindungi performa dari penyalahgunaan; validasi ukuran payload untuk mencegah DoS.

## Real-World Use Cases

- Dashboard outlet dari 900 ms menjadi 180 ms dengan `Promise.all` + index + cache 60 detik.
- Katalog mobile memakai ETag: 90% request menjadi 304 tanpa body.

## Interview Questions

1. API lambat — langkah apa yang Anda ambil?
2. Apa itu masalah N+1 dan cara mengatasinya?
3. Strategi caching apa yang Anda kenal?
4. Mengapa kode sinkron berat berbahaya di Node.js?
5. Bagaimana mendesain API yang efisien untuk aplikasi mobile?

## Sample Answers

1. Ukur latensi per endpoint dan cari bagian lambat (tracing/log durasi), cek query DB (EXPLAIN, index, N+1), paralelkan I/O, tambahkan cache bila cocok, kurangi payload, lalu ukur ulang dan uji beban.
2. Mengambil daftar dengan satu query lalu satu query tambahan per item; atasi dengan join, query `IN/ANY` sekaligus, atau dataloader/batching.
3. Cache klien/HTTP (Cache-Control, ETag), CDN, cache aplikasi (Redis cache-aside, write-through), dan cache di database (materialized view), masing-masing dengan TTL dan invalidasi.
4. Node menjalankan JavaScript di satu thread event loop; kode CPU berat menahan semua request lain sehingga latensi seluruh server naik.
5. Minimalkan round-trip dengan endpoint agregasi, pagination cursor, field secukupnya, kompresi, delta sync, idempotensi untuk retry, dan upload langsung ke object storage.

## Practical Exercises

1. Ukur endpoint terlambat Anda dan tulis breakdown waktu (DB, eksternal, serialisasi).
2. Refactor kode N+1 menjadi satu query batch.
3. Tambahkan ETag pada endpoint katalog dan uji dari aplikasi mobile.

## Quick Reference

```text
Ukur p95/route → DB (index, N+1) → Promise.all → jangan blok event loop → cache (ETag, Redis) → payload ramping
Mobile: agregasi/BFF · cursor pagination · delta sync · gzip/brotli · signed URL upload · Idempotency-Key
Pool koneksi · timeout · circuit breaker · cache private per user/tenant
```

## Related Topics

- [Database Performance](/testing-performance/database-performance/)
- [Load & Stress Testing](/testing-performance/load-stress-testing/)
- [CPU & Network Profiling](/testing-performance/cpu-network-profiling/)
