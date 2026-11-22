---
title: "Rate Limiting"
description: "Implementasi rate limiting di backend Node.js: algoritma (fixed window, sliding window log/counter, token bucket) beserta kode Redis atomik (Lua), rate limit terdistribusi untuk banyak instance, @fastify/rate-limit, kunci & kuota per endpoint, header standar (RateLimit, Retry-After), concurrency limit, kuota harian, pengecualian, monitoring, serta cara klien mobile merespons 429."
level: intermediate
status: complete
version: "Node.js 22 · Redis 7 · @fastify/rate-limit · ioredis"
updated: 2026-11-13
tags: [backend, rate-limiting, redis, token-bucket, api]
---

## Overview

**Rate limiting** membatasi berapa banyak request yang boleh dilakukan sebuah *kunci* (pengguna, IP, perangkat, API key)
dalam rentang waktu tertentu. Tujuannya melindungi layanan dari penyalahgunaan dan kelebihan beban, serta membagi
kapasitas secara adil.

Halaman ini fokus pada **implementasi**. Strategi kebijakan keamanan (OTP, login, enumerasi) dibahas di
[Secure API Design & Rate Limiting](/security/secure-api-design/).

## Why It Matters

Satu klien yang salah konfigurasi (retry tanpa backoff) atau satu bot dapat menjatuhkan API untuk semua pengguna. Rate
limit yang benar juga melindungi biaya (SMS, email, API pihak ketiga yang ditagih per panggilan).

## Core Concepts

| Algoritma | Cara kerja | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| Fixed window | Counter per jendela (menit ke-N) | Sangat sederhana & murah | Lonjakan 2× di batas jendela |
| Sliding window log | Simpan timestamp setiap request | Akurat | Memori besar untuk limit tinggi |
| Sliding window counter | Bobot jendela sekarang + sebelumnya | Akurat & hemat | Sedikit lebih rumit |
| Token bucket | Bucket terisi `r` token/detik, kapasitas `b` | Mengizinkan burst terkontrol | Perlu state per kunci |
| Concurrency limit | Batas request yang sedang berjalan | Melindungi operasi berat | Bukan per waktu |

| Header | Arti |
| --- | --- |
| `Retry-After` | Detik (atau tanggal) sampai boleh mencoba lagi (dengan 429) |
| `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` | Informasi kuota (draf standar IETF, banyak dipakai). Beberapa library memakai awalan `X-RateLimit-*` |

## How It Works

```text
Request → hitung kunci (user/IP/route) → operasi atomik di Redis (cek + kurangi/tambah)
→ izinkan (set header sisa kuota) / tolak 429 + Retry-After
Banyak instance API berbagi Redis yang sama → limit konsisten di seluruh cluster
```

## Implementation

### Plugin siap pakai (Fastify)

```ts
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  global: true,
  max: 300,                                   // default: 300 request per menit per kunci
  timeWindow: '1 minute',
  redis,                                      // store bersama untuk banyak instance
  keyGenerator: (req) => req.user?.id ?? req.ip,
  allowList: (req) => req.headers['x-internal-token'] === env.INTERNAL_TOKEN,   // hati-hati, untuk health/internal
});

// Override per route
app.post('/v1/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, loginHandler);
```

Pastikan `trustProxy` benar agar `req.ip` adalah IP klien asli, bukan IP load balancer.

### Token bucket atomik dengan Lua

```ts
const TOKEN_BUCKET = `
local key = KEYS[1]
local rate = tonumber(ARGV[1])      -- token per detik
local capacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])       -- milidetik
local cost = tonumber(ARGV[4])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1]) or capacity
local ts = tonumber(data[2]) or now
tokens = math.min(capacity, tokens + (now - ts) / 1000 * rate)
local allowed = tokens >= cost
if allowed then tokens = tokens - cost end
redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(capacity / rate * 1000) + 1000)
local retry = allowed and 0 or math.ceil((cost - tokens) / rate * 1000)
return { allowed and 1 or 0, math.floor(tokens), retry }
`;

export async function takeToken(key: string, rate: number, capacity: number, cost = 1) {
  const [allowed, remaining, retryMs] = await redis.eval(
    TOKEN_BUCKET, 1, `tb:${key}`, rate, capacity, Date.now(), cost) as [number, number, number];
  return { allowed: allowed === 1, remaining, retryAfterSec: Math.ceil(retryMs / 1000) };
}
```

Script Lua dijalankan atomik di Redis sehingga dua instance tidak bisa sama-sama "mengambil token terakhir". Memakai
jam server aplikasi (`Date.now()`) cukup bila jam antar server tersinkron (NTP). Alternatifnya, panggil `TIME` di Redis.

### Middleware yang memakai token bucket

```ts
export const limit = (name: string, rate: number, capacity: number, keyOf: (r: FastifyRequest) => string) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    const r = await takeToken(`${name}:${keyOf(req)}`, rate, capacity);
    reply.header('RateLimit-Remaining', r.remaining);
    if (!r.allowed) {
      reply.header('Retry-After', r.retryAfterSec);
      throw new TooManyRequestsError();          // error handler → 429 Problem Details
    }
  };

app.post('/v1/reports', { preHandler: [authenticate, limit('reports', 1 / 60, 3, (r) => r.user.id)] }, createReport);
// rata-rata 1 laporan per menit, burst hingga 3
```

### Concurrency limit untuk operasi berat

```ts
import pLimit from 'p-limit';
const exportLimit = pLimit(4);                  // maks 4 ekspor bersamaan per instance
app.get('/v1/exports/sales.csv', { preHandler: [authenticate] }, (req, reply) => exportLimit(() => streamCsv(req, reply)));
```

Untuk batas lintas instance, gunakan semaphore di Redis atau pindahkan ke job queue.

### Kuota per tenant/paket

```text
Tenant paket Basic: 50.000 request/hari, Pro: 500.000 → counter harian per tenant (INCR + EXPIRE)
Kirim peringatan saat 80%, tolak dengan kode QUOTA_EXCEEDED (403/429 sesuai kebijakan) saat habis
```

### Klien mobile menghadapi 429

```dart
Future<Response<T>> withRetryAfter<T>(Future<Response<T>> Function() call) async {
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      return await call();
    } on DioException catch (e) {
      if (e.response?.statusCode != 429) rethrow;
      final retryAfter = int.tryParse(e.response?.headers.value('retry-after') ?? '') ?? (2 << attempt);
      await Future.delayed(Duration(seconds: retryAfter) + Duration(milliseconds: Random().nextInt(500)));
    }
  }
  throw const RateLimitedFailure();
}
```

Tampilkan pesan yang jelas ("Terlalu banyak percobaan, coba lagi dalam 1 menit") dan jangan retry otomatis untuk login/OTP.

### Monitoring

```text
Metrik: jumlah 429 per route & per kunci teratas · Redis latency
Alert: lonjakan 429 (serangan atau klien bug) · banyak pengguna sah terkena (limit terlalu ketat)
Log: kunci yang dibatasi (hash/pseudonim untuk IP/nomor bila perlu privasi)
```

## Best Practices

- **Store bersama (Redis)** untuk banyak instance, operasi atomik.
- **Kunci yang tepat** per endpoint (user, IP, nomor, tenant).
- **Batas berlapis**: global per IP di gateway + per user per route di aplikasi.
- **Header Retry-After & sisa kuota**, respons 429 berformat konsisten.
- **Concurrency limit** untuk operasi berat.
- **Pantau dan sesuaikan** berdasarkan data.

## Anti-Patterns

- Counter di memori proses saat menjalankan beberapa instance.
- `req.ip` yang ternyata IP load balancer.
- Satu limit global yang sama untuk semua endpoint.
- Klien yang langsung retry setelah 429.
- Fail closed total saat Redis down (seluruh API mati). Pertimbangkan fail open dengan limit lokal sementara untuk endpoint non-kritis, dan tetap fail closed untuk endpoint sensitif seperti OTP.

## Performance Considerations

Satu round-trip Redis per request (sub-milidetik di jaringan yang sama). Gunakan script Lua agar cek dan update dalam
satu panggilan. Untuk trafik sangat tinggi, rate limit kasar di edge/gateway mengurangi beban aplikasi.

## Security Considerations

Rate limit adalah lapisan pertahanan, bukan satu-satunya. Penyerang bisa memakai banyak IP, sehingga gabungkan dengan
kunci per akun/nomor, deteksi anomali, dan integritas aplikasi. Jangan biarkan header buatan klien (mis.
`X-Forwarded-For` mentah) menentukan kunci.

## Real-World Use Cases

- API POS: 300 req/menit per user, login 10 per 15 menit per akun & 50 per jam per IP.
- Laporan berat: token bucket 1/menit burst 3 per user, plus concurrency 4 per instance.

## Interview Questions

1. Jelaskan token bucket dan bedanya dengan fixed window.
2. Bagaimana menerapkan rate limiting di banyak instance server?
3. Apa yang harus dilakukan klien saat menerima 429?
4. Apa yang terjadi bila Redis untuk rate limiting down?

## Sample Answers

1. Token bucket mengisi token dengan laju tetap hingga kapasitas tertentu. Setiap request memakai token, sehingga burst singkat diizinkan tetapi rata-rata tetap terbatas. Fixed window hanya menghitung request per jendela waktu tetap dan rentan lonjakan di batas jendela.
2. Simpan state di store bersama seperti Redis dan lakukan cek-dan-update secara atomik (INCR+EXPIRE atau script Lua), dengan kunci yang konsisten di semua instance.
3. Berhenti sementara sesuai `Retry-After` (dengan jitter), tidak me-retry agresif, menampilkan pesan yang jelas, dan untuk aksi sensitif seperti login tidak me-retry otomatis.
4. Tentukan kebijakan per endpoint: endpoint sensitif (OTP, login) sebaiknya fail closed, endpoint umum bisa fail open dengan limit lokal sementara agar layanan tetap berjalan, disertai alert.

## Practical Exercises

1. Implementasikan token bucket Lua dan uji dengan 2 instance bersamaan.
2. Tambahkan header RateLimit & Retry-After ke API Anda.
3. Buat dashboard jumlah 429 per route.

## Quick Reference

```text
Fixed window (INCR+EXPIRE) · sliding window · token bucket (burst) · concurrency limit (p-limit/semaphore)
Redis bersama + atomik (Lua) · trustProxy untuk IP asli · kunci: user/IP/nomor/tenant
429 + Retry-After + RateLimit-* · klien: tunggu + jitter, tanpa retry login/OTP
Berlapis: gateway (IP) + aplikasi (user/route) · pantau 429
```

## Related Topics

- [Secure API Design & Rate Limiting](/security/secure-api-design/)
- [Caching (Redis)](/backend/caching/)
- [Fault Tolerance](/system-design/concepts/fault-tolerance/)
