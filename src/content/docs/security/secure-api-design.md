---
title: "Secure API Design & Rate Limiting"
description: "Mendesain API yang aman sejak awal: checklist desain (autentikasi, otorisasi objek, skema strict, DTO, versi), rate limiting (fixed window, sliding window, token bucket) per kunci yang tepat, perlindungan endpoint mahal (OTP, login, upload), idempotensi, CORS, header keamanan, batas ukuran, error yang aman, audit log, serta integrity check untuk klien mobile."
level: intermediate
status: complete
updated: 2026-11-13
tags: [security, api, rate-limiting, cors, idempotency, app-integrity]
---

## Overview

**Secure API design** berarti keamanan menjadi bagian dari kontrak API: siapa boleh memanggil, data apa yang diterima
dan dikembalikan, seberapa sering, dan apa yang dicatat. **Rate limiting** adalah salah satu kontrol terpenting:
membatasi jumlah request per kunci (pengguna, IP, perangkat) dalam rentang waktu.

## Why It Matters

API mobile adalah API publik, karena siapa pun dapat mengekstrak endpoint dari aplikasi. Tanpa rate limiting, penyerang
dapat melakukan brute force PIN/OTP, credential stuffing, scraping katalog, atau menghabiskan anggaran SMS Anda dalam
satu malam.

## Core Concepts

### Checklist desain per endpoint

| Pertanyaan | Kontrol |
| --- | --- |
| Siapa yang boleh memanggil? | Autentikasi + permission per route |
| Objek mana yang boleh diakses? | Filter tenant/owner di query |
| Input apa yang diterima? | Skema strict, batas ukuran |
| Data apa yang dikembalikan? | DTO eksplisit, tanpa field internal |
| Seberapa sering? | Rate limit sesuai sensitivitas & biaya |
| Aman bila diulang? | Idempotency key untuk operasi tulis penting |
| Apa yang dicatat? | Audit log aksi sensitif, tanpa secret |

### Algoritma rate limiting

| Algoritma | Cara | Catatan |
| --- | --- | --- |
| Fixed window | Hitung per jendela tetap (per menit) | Sederhana. Lonjakan di batas jendela |
| Sliding window | Jendela bergerak (log/counter berbobot) | Lebih halus |
| Token bucket | Token terisi dengan laju tetap, request memakai token | Mengizinkan burst terkontrol |
| Leaky bucket | Request diproses dengan laju tetap | Meratakan beban |

### Memilih kunci limit

| Endpoint | Kunci |
| --- | --- |
| Login | Per akun (email) **dan** per IP |
| Kirim OTP | Per nomor telepon, per perangkat, per IP, plus kuota global harian |
| Verifikasi OTP/PIN | Per sesi verifikasi/akun (maks 3–5 percobaan lalu kunci sementara) |
| API umum terautentikasi | Per user/token |
| Endpoint publik | Per IP (hati-hati NAT operator seluler: banyak pengguna berbagi IP) |

## How It Works

```text
Request → gateway (limit kasar per IP) → autentikasi → limit per user/endpoint (Redis)
→ melewati batas? → 429 Too Many Requests + Retry-After → (aplikasi menunggu, tidak retry agresif)
```

## Implementation

### Rate limit dengan Redis (fixed window, sederhana)

```ts
async function rateLimit(key: string, limit: number, windowSec: number) {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, windowSec);
  if (count > limit) throw new TooManyRequestsError({ retryAfter: windowSec });
}

app.post('/v1/auth/otp', async (req) => {
  const { phone } = OtpRequest.parse(req.body);
  await rateLimit(`otp:phone:${phone}`, 3, 600);        // 3 per 10 menit per nomor
  await rateLimit(`otp:ip:${req.ip}`, 20, 3600);         // 20 per jam per IP
  await rateLimit('otp:global', 50_000, 86_400);         // kuota global harian (proteksi biaya)
  await otpService.send(phone);
  return { sent: true };                                 // respons sama walau nomor tidak terdaftar
});
```

Untuk produksi gunakan library/gateway yang teruji (mis. `@fastify/rate-limit` dengan Redis store, atau fitur API gateway).

### Penguncian percobaan PIN/OTP

```text
- Maks 5 percobaan per kode OTP, lalu kode hangus
- Kunci sementara bertahap (1 → 5 → 15 menit), bukan permanen (hindari penguncian sebagai serangan DoS ke korban)
- Notifikasi pengguna saat ada percobaan gagal berulang
```

### CORS

```ts
await app.register(cors, {
  origin: ['https://admin.example.com'],      // allowlist. Aplikasi mobile native tidak memakai CORS
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});
// ❌ origin: '*' bersama credentials, atau memantulkan Origin apa pun
```

### Header keamanan & batas

```ts
const app = Fastify({ bodyLimit: 1_048_576, trustProxy: true });   // 1 MB. Upload lewat signed URL. trustProxy hanya di belakang LB tepercaya
await app.register(helmet);                                         // HSTS, X-Content-Type-Options, dll.
```

### Idempotensi untuk operasi penting

```text
POST /v1/payments  Idempotency-Key: 6f1c…
Server menyimpan (key, user, hash body) → hasil. Request ulang dengan key sama → hasil yang sama, tanpa tagihan ganda
Body berbeda dengan key sama → 422
```

### Audit log

```ts
audit.log({
  action: 'refund.created', actorId: user.id, tenantId: user.tenantId,
  targetId: refund.id, amount: refund.amount, ip: req.ip, deviceId: req.headers['x-device-id'],
  at: new Date().toISOString(),
});   // simpan terpisah, append-only, tanpa token/password
```

### Integritas klien mobile (lapisan tambahan)

```text
Play Integrity API (Android) / App Attest (iOS) / Firebase App Check:
server memverifikasi token integritas untuk endpoint sensitif (registrasi, klaim promo, pembayaran)
→ menyulitkan bot & aplikasi termodifikasi. BUKAN pengganti autentikasi & otorisasi
```

## Best Practices

- **Checklist keamanan per endpoint** saat desain & review.
- **Rate limit berlapis** dengan kunci yang tepat, sangat ketat untuk OTP/login/PIN.
- **429 + Retry-After**, dan aplikasi menghormatinya.
- **CORS allowlist**, header keamanan, batas ukuran.
- **Idempotency key** untuk pembayaran & operasi tulis penting.
- **Audit log** untuk aksi sensitif.

## Anti-Patterns

- Rate limit hanya per IP (penyerang memakai banyak IP, pengguna sah di NAT operator terkena).
- Endpoint OTP tanpa kuota (SMS pumping menghabiskan biaya).
- Respons berbeda untuk "nomor terdaftar" vs "tidak terdaftar" (enumerasi akun).
- `Access-Control-Allow-Origin: *` dengan credentials.
- Penguncian akun permanen setelah beberapa percobaan gagal.

## Performance Considerations

Rate limiting dengan Redis menambah satu round-trip kecil. Gunakan pipelining atau script Lua untuk operasi atomik.
Limit di gateway/edge menahan beban sebelum mencapai aplikasi. Pantau jumlah 429 agar limit tidak mengganggu pengguna sah.

## Security Considerations

Rate limiting mengurangi, bukan menghilangkan, serangan. Kombinasikan dengan MFA, deteksi anomali, integritas aplikasi,
dan monitoring biaya (SMS/email). Simpan audit log di tempat yang tidak bisa diubah oleh akun aplikasi biasa.

## Real-World Use Cases

- Login kasir: 5 percobaan per akun per 15 menit + 50 per IP per jam, dengan notifikasi ke owner.
- Klaim voucher: satu per akun & perangkat, App Check wajib, rate limit per user.

## Interview Questions

1. Bagaimana Anda mendesain rate limiting untuk endpoint OTP?
2. Apa beda fixed window, sliding window, dan token bucket?
3. Mengapa rate limit per IP saja tidak cukup untuk aplikasi mobile?
4. Bagaimana mencegah pembayaran ganda akibat retry?
5. Apakah aplikasi mobile native terpengaruh CORS?

## Sample Answers

1. Batas berlapis: per nomor telepon (mis. 3 per 10 menit), per perangkat/IP, dan kuota global harian untuk melindungi biaya, ditambah batas percobaan verifikasi per kode, respons seragam, dan integritas aplikasi.
2. Fixed window menghitung per jendela tetap (sederhana, bisa lonjakan di batas). Sliding window menghitung pada jendela bergerak (lebih halus). Token bucket mengisi token dengan laju tetap sehingga mengizinkan burst terkontrol.
3. Banyak pengguna seluler berbagi IP publik melalui NAT operator sehingga pengguna sah ikut terblokir, sementara penyerang dapat memakai banyak IP. Diperlukan kunci per akun, perangkat, atau nomor.
4. Idempotency key per operasi pembayaran yang disimpan server bersama hasilnya, sehingga request ulang mengembalikan hasil yang sama tanpa menagih lagi.
5. Tidak. CORS adalah mekanisme browser. Aplikasi native tidak dibatasi CORS, sehingga CORS bukan kontrol keamanan untuk API mobile. Hanya untuk klien web.

## Practical Exercises

1. Buat tabel rate limit untuk semua endpoint autentikasi Anda.
2. Implementasikan idempotency key untuk endpoint pembayaran.
3. Tambahkan audit log untuk refund, void, dan ubah harga.

## Quick Reference

```text
Per endpoint: authN · authZ objek · skema strict · DTO · rate limit · idempotensi · audit
Fixed/sliding window · token bucket · leaky bucket · 429 + Retry-After
OTP: per nomor + perangkat/IP + kuota global · verifikasi maks 5 · lockout bertahap
CORS allowlist (web saja) · helmet · bodyLimit · App Check/Play Integrity/App Attest sebagai lapisan tambahan
```

## Related Topics

- [OWASP API Security Top 10](/security/owasp-api-security/)
- [Rate Limiting (Backend)](/backend/rate-limiting/)
- [API Gateway](/system-design/concepts/api-gateway/)
