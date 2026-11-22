---
title: "Caching (Redis)"
description: "Caching di backend Node.js dengan Redis untuk API yang melayani aplikasi mobile: lapisan cache (klien, HTTP/CDN, aplikasi, database), pola cache-aside/write-through, TTL & invalidasi, cache key berversi per tenant, cache stampede & solusinya, HTTP caching (Cache-Control, ETag), struktur data Redis (rate limit, lock, sesi), dan kapan TIDAK memakai cache."
level: advanced
status: complete
version: "Redis 7.x · ioredis/node-redis · Node.js 22 LTS"
updated: 2026-11-13
tags: [backend, caching, redis, http-cache, performance]
---

## Overview

**Caching** menyimpan hasil yang mahal dihitung atau diambil agar permintaan berikutnya lebih cepat. Redis adalah
penyimpanan in-memory yang paling umum dipakai untuk cache aplikasi, sekaligus untuk rate limiting, lock terdistribusi,
dan antrean ringan.

> "There are only two hard things in Computer Science: cache invalidation and naming things." (Phil Karlton)

## Why It Matters

Cache yang tepat menurunkan latensi API dan beban database secara drastis, misalnya untuk katalog menu yang dibaca ribuan
perangkat kasir setiap pagi. Cache yang salah menampilkan data basi (harga lama) atau bahkan data milik pengguna lain.

## Core Concepts

| Lapisan | Contoh | Catatan |
| --- | --- | --- |
| Klien (mobile) | DB lokal, cache HTTP Dio, image cache | Paling cepat. Mendukung offline |
| HTTP / CDN | `Cache-Control`, `ETag`, CDN untuk aset publik | Tanpa kode server untuk hit |
| Aplikasi (shared) | Redis | Dibagi semua instance server |
| In-process | `Map`/LRU di memori proses | Sangat cepat, tetapi tidak konsisten antar instance |
| Database | Buffer cache, materialized view | Otomatis/terencana |

| Pola | Cara kerja | Cocok untuk |
| --- | --- | --- |
| Cache-aside (lazy) | Baca cache → miss → baca DB → simpan ke cache | Default, paling umum |
| Write-through | Tulis DB lalu perbarui cache | Data yang langsung dibaca setelah ditulis |
| Write-behind | Tulis ke cache, DB disinkron belakangan | Jarang. Risiko kehilangan data |
| Refresh-ahead | Perbarui sebelum TTL habis | Data panas yang mahal dihitung |

## How It Works

```text
GET /menu → key menu:{outletId}:v{ver} ada? → hit: kembalikan (≈1 ms)
                                            → miss: query DB (≈50 ms) → SET key EX 300 → kembalikan
Update menu → tulis DB → hapus key / naikkan versi → request berikutnya membangun ulang cache
```

## Implementation

### Cache-aside dengan helper generik

```ts
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL!);

async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  const value = await load();
  const jitter = Math.floor(Math.random() * ttlSec * 0.1);          // hindari banyak key kedaluwarsa bersamaan
  await redis.set(key, JSON.stringify(value), 'EX', ttlSec + jitter);
  return value;
}

const menu = await cached(`menu:${outletId}:v${await menuVersion(outletId)}`, 300, () => menuRepo.load(outletId));
```

### Invalidasi

```ts
// Opsi A: hapus key setelah tulis berhasil
await db.tx(async (t) => { await t.products.update(...); });
await redis.del(`menu:${outletId}`);

// Opsi B: versi per tenant, cukup naikkan versi (key lama kedaluwarsa sendiri)
async function menuVersion(outletId: string) { return (await redis.get(`menu-ver:${outletId}`)) ?? '0'; }
async function bumpMenuVersion(outletId: string) { await redis.incr(`menu-ver:${outletId}`); }
```

Hapus/naikkan versi **setelah** transaksi DB commit. Bila dilakukan sebelumnya, request lain dapat mengisi ulang cache
dengan data lama.

### Cache stampede (thundering herd)

```text
Masalah: key panas kedaluwarsa → 1.000 request bersamaan miss → 1.000 query DB yang sama
Solusi:
- Single-flight: hanya satu proses yang membangun ulang (lock Redis SET key NX PX), lainnya menunggu/pakai nilai lama
- Stale-while-revalidate: simpan nilai + waktu kedaluwarsa lunak, sajikan nilai lama sambil memperbarui di belakang
- TTL jitter agar tidak serentak
```

```ts
const lock = await redis.set(`lock:${key}`, '1', 'PX', 5_000, 'NX');   // hanya satu pembangun ulang
```

### HTTP caching untuk klien mobile

```ts
reply.header('Cache-Control', 'private, max-age=60')                    // per pengguna, boleh di-cache klien 60 s
     .header('ETag', etag);
if (req.headers['if-none-match'] === etag) return reply.code(304).send();
// Aset publik (gambar produk via CDN): Cache-Control: public, max-age=31536000, immutable + nama file berhash
```

### Redis di luar cache

| Kebutuhan | Struktur/perintah |
| --- | --- |
| Rate limiting | `INCR` + `EXPIRE` (fixed window) atau sorted set (sliding window) |
| Lock singkat | `SET key value NX PX ttl` + lepas dengan pemeriksaan pemilik (script Lua) |
| Idempotency key | `SET idem:{key} result NX EX 86400` |
| Leaderboard | Sorted set (`ZADD`, `ZREVRANGE`) |
| Pub/Sub / stream | `PUBLISH`, Redis Streams (antrean ringan) |

### Kapan TIDAK memakai cache

```text
- Data yang harus selalu akurat saat itu juga (saldo, stok saat checkout). Baca dari DB dengan transaksi
- Query yang sudah cepat (< beberapa ms dengan index). Cache hanya menambah kompleksitas
- Hit rate rendah (setiap request unik)
- Belum ada strategi invalidasi yang jelas
```

## Best Practices

- **Ukur dulu**: cache endpoint yang lambat dan sering dibaca.
- **Key berpola jelas** dengan tenant & versi: `menu:{outletId}:v{n}`.
- **Selalu TTL**, ditambah invalidasi eksplisit untuk perubahan penting.
- **Invalidasi setelah commit**.
- **Pantau hit rate, memori, dan eviction**. Atur `maxmemory-policy` (mis. `allkeys-lru` untuk cache murni).
- **Fallback saat Redis down**: baca DB (dengan timeout pendek ke Redis), jangan menggagalkan seluruh request.

## Anti-Patterns

- Cache tanpa TTL dan tanpa invalidasi.
- Key tanpa tenant/user untuk data pribadi (kebocoran antar pengguna).
- Menyimpan objek sangat besar di satu key.
- Memakai cache untuk menutupi query yang seharusnya diperbaiki dengan index.
- Redis sebagai satu-satunya penyimpanan data penting tanpa persistensi yang direncanakan.

## Performance Considerations

Redis cepat, tetapi tetap round-trip jaringan (~0,2–1 ms). Gunakan pipelining/`MGET` untuk banyak key, hindari perintah
`KEYS *` di production (gunakan `SCAN`), dan perhatikan biaya serialisasi JSON untuk payload besar.

## Security Considerations

Redis harus berada di jaringan privat dengan autentikasi/ACL dan TLS bila melewati jaringan tidak tepercaya. Jangan
menyimpan data sensitif tanpa perlu, dan pastikan data per pengguna memakai key per pengguna serta header
`Cache-Control: private` agar tidak di-cache CDN/proxy bersama.

## Real-World Use Cases

- Menu outlet di-cache 5 menit dengan versi per outlet. Perubahan harga menaikkan versi sehingga perangkat kasir menerima harga baru pada request berikutnya.
- Rate limit OTP per nomor telepon dengan `INCR` + `EXPIRE`.
- Idempotency key pembayaran disimpan 24 jam.

## Interview Questions

1. Jelaskan pola cache-aside.
2. Bagaimana strategi invalidasi cache Anda?
3. Apa itu cache stampede dan cara mengatasinya?
4. Kapan cache tidak boleh dipakai?
5. Apa beda `Cache-Control: private` dan `public`?

## Sample Answers

1. Aplikasi membaca cache lebih dulu. Bila miss, aplikasi mengambil dari database, menyimpan hasil ke cache dengan TTL, lalu mengembalikannya. Penulisan ke DB diikuti invalidasi key.
2. TTL sebagai pengaman, plus invalidasi eksplisit setelah commit, baik dengan menghapus key atau menaikkan versi key per tenant, sehingga data penting tidak basi lebih lama dari yang dapat diterima.
3. Banyak request bersamaan membangun ulang key yang sama setelah kedaluwarsa sehingga database kebanjiran. Atasi dengan single-flight lock, stale-while-revalidate, dan TTL jitter.
4. Untuk data yang harus akurat real-time (saldo, stok saat transaksi), query yang sudah cepat, hit rate rendah, atau bila belum ada strategi invalidasi.
5. `private` hanya boleh di-cache oleh klien (browser/aplikasi) pengguna tersebut. `public` boleh di-cache oleh CDN/proxy bersama, jadi hanya untuk data yang sama bagi semua orang.

## Practical Exercises

1. Tambahkan cache-aside pada endpoint katalog dan ukur p95 sebelum/sesudah.
2. Implementasikan invalidasi berbasis versi per outlet.
3. Simulasikan stampede dengan load test, lalu terapkan lock single-flight.

## Quick Reference

```text
Lapisan: klien → HTTP/CDN → Redis → in-process → DB
Cache-aside · TTL + jitter · invalidasi setelah commit (DEL / versi) · key {entity}:{tenant}:v{n}
Stampede: lock NX PX · stale-while-revalidate · jitter
HTTP: Cache-Control private/public · ETag/304 · immutable untuk aset berhash
Redis lain: rate limit INCR+EXPIRE · lock SET NX PX · idempotency · SCAN bukan KEYS
```

## Related Topics

- [API Performance](/testing-performance/api-performance/)
- [Rate Limiting](/backend/rate-limiting/)
- [Image Loading & Caching](/system-design/mobile/image-loading-caching/)
