---
title: "JWT Security"
description: "Menggunakan JSON Web Token dengan aman: struktur header.payload.signature, HS256 vs RS256/ES256/EdDSA, verifikasi lengkap (algoritma whitelist, iss, aud, exp, nbf), serangan umum (alg none, algorithm confusion, kid injection), masa berlaku & pencabutan, JWKS & rotasi kunci, isi payload yang aman, serta implementasi dengan library `jose` di Node.js."
level: intermediate
status: complete
version: "RFC 7519 (JWT) · RFC 8725 (JWT BCP) · jose (Node.js) 5.x/6.x"
updated: 2026-11-13
tags: [security, jwt, authentication, nodejs, jwks]
---

## Overview

**JWT (JSON Web Token)** adalah format token ringkas yang membawa *claims* (pernyataan tentang pengguna) dan
**ditandatangani** agar tidak bisa diubah. JWT banyak dipakai sebagai access token API karena server dapat memverifikasinya
tanpa query database.

Ingat: JWT standar (JWS) **ditandatangani, bukan dienkripsi**. Siapa pun dapat membaca isinya dengan base64-decode.

## Why It Matters

Kesalahan verifikasi JWT sering berakibat fatal: menerima token tanpa tanda tangan, salah algoritma, atau tidak memeriksa
`aud` sehingga token untuk layanan lain diterima. Interviewer juga sering menanyakan "bagaimana mencabut JWT?".

## Core Concepts

```text
eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0 . eyJzdWIiOiJ1XzEyMyIsImV4cCI6...} . SflKxwRJSMeKKF2QT4fw...
          header (alg, kid, typ)                payload (claims)                   signature
```

| Claim | Arti | Diverifikasi? |
| --- | --- | --- |
| `iss` | Penerbit token | Ya, harus sama dengan yang diharapkan |
| `aud` | Penerima yang dituju (API ini) | Ya. Mencegah token layanan lain dipakai di sini |
| `sub` | Subjek (ID pengguna) | Dipakai sebagai identitas |
| `exp` | Waktu kedaluwarsa | Ya |
| `nbf` / `iat` | Belum berlaku sebelum / waktu terbit | Ya (dengan toleransi clock skew kecil) |
| `jti` | ID unik token | Untuk blocklist/anti-replay bila perlu |

| Algoritma | Kunci | Cocok untuk |
| --- | --- | --- |
| HS256 (HMAC) | Satu secret bersama untuk tanda tangan & verifikasi | Satu layanan yang menerbitkan sekaligus memverifikasi |
| RS256 / PS256 (RSA) | Private key menandatangani, public key memverifikasi | Banyak layanan memverifikasi. Public key dibagikan via JWKS |
| ES256 / EdDSA | Kunci elliptic curve | Sama seperti RSA, tanda tangan lebih kecil & cepat |

## How It Works

```text
Auth server: header+payload → tanda tangani dengan private key (kid=k1) → token
API: terima token → parse header → pilih kunci berdasarkan kid DARI JWKS TEPERCAYA
→ verifikasi tanda tangan dengan algoritma yang DIIZINKAN → cek iss, aud, exp, nbf → claims dipercaya
```

## Implementation

### Menerbitkan access token (Node.js, `jose`)

```ts
import { SignJWT, importPKCS8 } from 'jose';

const privateKey = await importPKCS8(process.env.JWT_PRIVATE_KEY_PEM!, 'ES256');

export async function signAccessToken(user: { id: string; tenantId: string; roles: string[] }) {
  return new SignJWT({ tid: user.tenantId, roles: user.roles })   // minimal, tanpa data pribadi
    .setProtectedHeader({ alg: 'ES256', kid: process.env.JWT_KID!, typ: 'at+jwt' })
    .setSubject(user.id)
    .setIssuer('https://auth.example.com')
    .setAudience('pos-api')
    .setIssuedAt()
    .setExpirationTime('10m')
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}
```

### Memverifikasi dengan benar

```ts
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://auth.example.com/.well-known/jwks.json'));   // di-cache library

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'https://auth.example.com',
    audience: 'pos-api',
    algorithms: ['ES256'],            // whitelist. Jangan percaya `alg` dari header begitu saja
    clockTolerance: 30,               // detik
    typ: 'at+jwt',
  });
  return { userId: payload.sub!, tenantId: payload.tid as string, roles: payload.roles as string[] };
}
```

### Serangan umum dan pencegahannya

| Serangan | Cara kerja | Pencegahan |
| --- | --- | --- |
| `alg: none` | Token tanpa tanda tangan diterima | Whitelist algoritma. Library modern menolak `none` |
| Algorithm confusion | Server RS256 menerima HS256 dengan public key sebagai secret HMAC | Whitelist algoritma yang sesuai jenis kunci |
| `kid` injection / `jku` palsu | Header menunjuk kunci milik penyerang | Ambil kunci hanya dari JWKS tepercaya yang dikonfigurasi. Abaikan `jku`/`x5u` dari token |
| Secret HS256 lemah | Brute force offline | Secret acak ≥ 256 bit, atau gunakan kunci asimetris |
| Token audiens lain | Token layanan A dipakai di layanan B | Verifikasi `aud` (dan `iss`) |
| Pencurian token | Token dipakai penyerang sampai kedaluwarsa | Masa berlaku pendek, TLS, penyimpanan aman, tidak di URL/log |

### Pencabutan (revocation)

JWT bersifat stateless sehingga tidak bisa "dihapus". Strategi yang umum:

```text
1. Access token pendek (5–15 menit) + refresh token opaque di DB yang dapat dicabut (utama)
2. Blocklist jti (Redis, TTL = sisa umur token) untuk kasus darurat (akun dibobol, logout paksa)
3. "token version"/"sessions_valid_after" per user. Token dengan iat lebih lama ditolak (butuh lookup)
```

### Rotasi kunci dengan JWKS

```text
1. Buat kunci baru k2, publikasikan di JWKS bersama k1
2. Mulai menandatangani dengan k2 (kid=k2)
3. Tunggu > umur maksimum token (mis. 10 menit + cache JWKS)
4. Hapus k1 dari JWKS
```

### Isi payload yang aman

```text
✅ sub, tid (tenant), roles/scopes, exp, iat, jti
❌ email, nomor HP, NIK, alamat, saldo, izin yang sering berubah, secret apa pun
Payload bisa dibaca siapa saja, dan ukuran token ikut di setiap request
```

## Best Practices

- **Gunakan library matang** (`jose`), jangan menulis parser/verifikasi sendiri.
- **Whitelist algoritma** dan verifikasi `iss`, `aud`, `exp`, `nbf`.
- **Kunci asimetris + JWKS** bila ada lebih dari satu layanan yang memverifikasi.
- **Access token pendek**, refresh token opaque yang bisa dicabut.
- **Payload minimal** tanpa PII.
- **Otorisasi tetap memeriksa data**: token berisi peran, tetapi kepemilikan objek dicek di server.

## Anti-Patterns

- `jwt.decode()` (tanpa verifikasi) untuk keputusan otorisasi.
- Access token berumur 30 hari tanpa mekanisme pencabutan.
- Secret HS256 seperti `"secret"` atau yang di-commit ke repo.
- Menyimpan JWT di URL query string (tercatat di log, riwayat, header Referer).
- Memakai JWT sebagai pengganti sesi untuk semua hal, termasuk data yang sering berubah.

## Performance Considerations

Verifikasi tanda tangan lokal cepat dan tidak butuh DB, itulah keunggulan JWT. Cache JWKS (library melakukannya), pilih
ES256/EdDSA untuk token lebih kecil, dan jaga payload tetap kecil karena dikirim di setiap request mobile.

## Security Considerations

Lindungi private key (KMS/secret manager), rotasi berkala, dan pantau kegagalan verifikasi yang meningkat (indikasi
serangan). Di mobile, JWT tetap harus disimpan sesuai aturan *secure token storage*. Untuk API finansial, pertimbangkan
token yang terikat ke kunci klien (DPoP/mTLS) agar token curian tidak bisa dipakai di perangkat lain.

## Real-World Use Cases

- Auth service menerbitkan ES256 access token. Beberapa microservice memverifikasi lewat JWKS tanpa memanggil auth service.
- Akun dibobol: refresh family dicabut, `jti` access token aktif dimasukkan blocklist sampai kedaluwarsa.

## Interview Questions

1. Apa isi JWT dan apakah isinya rahasia?
2. Apa beda HS256 dan RS256/ES256, dan kapan memakai masing-masing?
3. Claim apa yang wajib diverifikasi?
4. Bagaimana mencabut JWT sebelum kedaluwarsa?
5. Sebutkan serangan terhadap JWT dan pencegahannya.

## Sample Answers

1. Header (algoritma, kid), payload (claims), dan tanda tangan, masing-masing base64url. Isinya tidak rahasia, hanya dijamin tidak diubah, jadi jangan memasukkan data sensitif.
2. HS256 memakai satu secret bersama (cocok bila penerbit dan pemverifikasi sama). RS256/ES256 memakai pasangan kunci sehingga banyak layanan bisa memverifikasi dengan public key tanpa bisa menerbitkan token.
3. Tanda tangan dengan algoritma yang diizinkan, `iss`, `aud`, `exp`, `nbf` (dengan toleransi waktu kecil), dan bila dipakai `typ`/`jti`.
4. Pada dasarnya tidak bisa. Gunakan access token berumur pendek dengan refresh token yang dapat dicabut di DB, ditambah blocklist `jti` atau versi sesi per pengguna untuk pencabutan segera.
5. `alg: none`, algorithm confusion, injeksi `kid`/`jku`, secret lemah, dan token yang dipakai di audiens lain. Cegah dengan whitelist algoritma, kunci hanya dari sumber tepercaya, secret kuat/kunci asimetris, dan verifikasi `aud`/`iss`.

## Practical Exercises

1. Buat penerbitan & verifikasi ES256 dengan `jose` dan JWKS lokal.
2. Tulis test yang memastikan token `alg: none`, `aud` salah, dan token kedaluwarsa ditolak.
3. Lakukan simulasi rotasi kunci k1 → k2 tanpa memutus pengguna.

## Quick Reference

```text
JWT = header.payload.signature · ditandatangani, BUKAN dienkripsi · payload minimal tanpa PII
Verifikasi: algorithms whitelist · iss · aud · exp/nbf (+clockTolerance) · kunci dari JWKS tepercaya
HS256 = shared secret · RS256/ES256/EdDSA = asimetris + JWKS + kid
Access pendek + refresh opaque bisa dicabut · blocklist jti untuk darurat · rotasi kunci via JWKS
Jangan: decode tanpa verify · token di URL · secret lemah · token panjang umur
```

## Related Topics

- [Secure Token Storage](/security/secure-token-storage/)
- [Authentication vs Authorization](/security/authn-vs-authz/)
- [Authentication & Authorization (Backend)](/backend/authentication-authorization/)
