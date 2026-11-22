---
title: "Authentication & Authorization (JWT, OAuth2)"
description: "Membedakan autentikasi dan otorisasi, session vs token, access & refresh token dengan rotasi, RBAC/ABAC, OAuth2 + PKCE untuk mobile, dan implementasi di Node.js."
level: intermediate
status: complete
version: "Node.js LTS · OAuth 2.0 / OAuth 2.1 draft · RFC 7519 (JWT)"
updated: 2026-11-07
tags: [auth, jwt, oauth2, rbac, security, nodejs]
---

## Overview

- **Authentication (authn)** — membuktikan **siapa** Anda (password, OTP, biometrik, SSO).
- **Authorization (authz)** — menentukan **apa** yang boleh Anda lakukan terhadap resource tertentu.

Authn terjadi sekali per sesi/login; authz terjadi **di setiap request** dan **untuk setiap objek** yang diakses.

## Why It Matters

Broken Access Control adalah risiko #1 OWASP Top 10, dan BOLA adalah #1 OWASP API Security Top 10. Hampir semua
kebocoran data API bukan karena kriptografi yang rusak, melainkan karena server **lupa memeriksa** apakah user berhak
atas objek yang diminta. Untuk aplikasi mobile, desain token juga menentukan UX (login berulang) dan dampak pencurian token.

## Core Concepts

- **Session-based** — server menyimpan sesi, client memegang session ID (cookie). Mudah di-revoke; butuh store bersama saat scaling.
- **Token-based (JWT)** — token self-contained ditandatangani server; diverifikasi tanpa lookup DB. Sulit di-revoke sebelum expired.
- **JWT** = `header.payload.signature` (base64url). Payload **terbaca siapa saja** — bukan tempat data rahasia.
- **Access token** — umur pendek (5–15 menit), dikirim di `Authorization: Bearer`.
- **Refresh token** — umur panjang, **opaque & disimpan di DB (hash)**, dipakai hanya ke endpoint refresh, **dirotasi** setiap dipakai.
- **RBAC** (role-based) — `kasir`, `supervisor`, `admin`. **ABAC** (attribute-based) — keputusan dari atribut user, resource, konteks (outlet, jam kerja).
- **OAuth 2.0** — framework **delegasi otorisasi** (aplikasi pihak ketiga mendapat akses terbatas). **OpenID Connect (OIDC)** — lapisan **autentikasi** di atas OAuth2 (ID token).
- **Authorization Code + PKCE** — flow yang direkomendasikan untuk aplikasi mobile/SPA (public client tanpa client secret).

## How It Works

```text
LOGIN
App ── POST /auth/login {email, password} ─► API: verifikasi hash Argon2id/bcrypt
App ◄─ {access_token (JWT 10m), refresh_token (opaque 30d)} ──
       refresh_token disimpan di DB sebagai hash + family_id + device_id

REQUEST
App ── GET /v1/orders/123  Authorization: Bearer <access> ─► API:
       1) verifikasi signature, exp, iss, aud, alg   (authn)
       2) cek role/permission                          (authz fungsi)
       3) WHERE id=123 AND outlet_id IN user.outlets   (authz objek)

REFRESH (rotation)
App ── POST /auth/refresh {refresh_token: R1} ─► API: R1 valid & belum dipakai?
       ✓ → tandai R1 used, terbitkan access baru + R2
       ✗ R1 sudah pernah dipakai → indikasi pencurian → revoke seluruh family, paksa login
```

## Implementation

### Menerbitkan & memverifikasi token (Node.js + `jose`)

```ts
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'node:crypto';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!); // ≥ 32 byte acak, dari secret manager
const ISS = 'https://api.example.com', AUD = 'pos-mobile';

export async function issueAccessToken(user: { id: string; role: Role; outletIds: string[] }) {
  return new SignJWT({ role: user.role, outlets: user.outletIds })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISS).setAudience(AUD)
    .setIssuedAt().setExpirationTime('10m')
    .sign(secret);
}

export async function issueRefreshToken(userId: string, familyId = crypto.randomUUID(), deviceId?: string) {
  const token = randomBytes(32).toString('base64url');           // opaque, bukan JWT
  await db.refreshTokens.insert({
    tokenHash: createHash('sha256').update(token).digest('hex'),  // simpan hash, bukan token
    userId, familyId, deviceId,
    expiresAt: new Date(Date.now() + 30 * 864e5),
  });
  return token;
}

export async function requireAuth(req, res, next) {
  const raw = req.headers.authorization?.replace(/^Bearer /, '');
  if (!raw) return res.status(401).json({ title: 'Missing token' });
  try {
    const { payload } = await jwtVerify(raw, secret, {
      issuer: ISS, audience: AUD, algorithms: ['HS256'],          // whitelist algoritma
    });
    req.user = { id: payload.sub!, role: payload.role as Role, outlets: payload.outlets as string[] };
    next();
  } catch {
    res.status(401).json({ title: 'Invalid or expired token' });
  }
}
```

### Refresh token rotation dengan deteksi reuse

```ts
export async function refresh(presented: string) {
  const hash = createHash('sha256').update(presented).digest('hex');
  return db.transaction(async (tx) => {
    const rt = await tx.refreshTokens.findByHashForUpdate(hash);
    if (!rt || rt.expiresAt < new Date() || rt.revokedAt) throw new HttpError(401, 'Invalid refresh token');

    if (rt.usedAt) {                                   // token lama dipakai lagi → kemungkinan dicuri
      await tx.refreshTokens.revokeFamily(rt.familyId);
      throw new HttpError(401, 'Refresh token reuse detected');
    }
    await tx.refreshTokens.markUsed(rt.id);
    const user = await tx.users.get(rt.userId);
    return {
      access_token: await issueAccessToken(user),
      refresh_token: await issueRefreshToken(user.id, rt.familyId, rt.deviceId),
    };
  });
}
```

### Otorisasi: fungsi (RBAC) + objek (ownership/tenant)

```ts
const can = {
  'order:void': ['supervisor', 'admin'],
  'report:read': ['supervisor', 'admin'],
  'order:create': ['kasir', 'supervisor', 'admin'],
} as const satisfies Record<string, readonly Role[]>;

export const requirePermission = (perm: keyof typeof can) => (req, res, next) =>
  (can[perm] as readonly Role[]).includes(req.user.role) ? next() : res.status(403).json({ title: 'Forbidden' });

router.post('/v1/orders/:id/void', requireAuth, requirePermission('order:void'), async (req, res, next) => {
  try {
    // Object-level authorization: scope query ke outlet milik user (cegah BOLA/IDOR)
    const order = await orders.findOne({ id: req.params.id, outletId: { in: req.user.outlets } });
    if (!order) return res.status(404).json({ title: 'Not found' });
    res.json({ data: await orderService.void(order, req.user, req.body.reason) });
  } catch (e) { next(e); }
});
```

### Sisi Flutter: penyimpanan & refresh

```dart
// Simpan refresh token di secure storage (Keystore/Keychain), access token di memory.
const storage = FlutterSecureStorage();
await storage.write(key: 'refresh_token', value: tokens.refresh);
// Interceptor Dio: saat 401 → refresh SEKALI (single-flight) → retry request asli; jika refresh gagal → logout.
```

## Best Practices

- **Hash password dengan Argon2id/bcrypt**, jangan SHA/MD5 — lihat [Password Hashing](/security/password-hashing/).
- **Access token pendek + refresh token rotasi** — membatasi jendela penyalahgunaan token yang bocor.
- **Refresh token opaque disimpan sebagai hash di DB** — bisa di-revoke per device, dan kebocoran DB tidak langsung membocorkan token.
- **Verifikasi `alg`, `iss`, `aud`, `exp`** secara eksplisit; tolak `alg: none`.
- **Otorisasi deny-by-default** dan dipusatkan (middleware/policy), plus **scope setiap query** ke user/tenant.
- **Untuk login pihak ketiga/SSO di mobile: Authorization Code + PKCE** melalui system browser (bukan WebView), jangan Implicit/ROPC flow.
- **Rate limit & lockout bertahap** pada login/OTP; pesan error generik ("email atau password salah").
- **Revoke sesi** saat ganti password, logout, atau device hilang.

## Anti-Patterns

- Menyimpan password/PII di payload JWT.
- Access token berumur 30 hari tanpa refresh/revocation.
- Mengandalkan UI untuk menyembunyikan tombol sebagai "otorisasi".
- Memercayai `role`/`userId` yang dikirim di body request.
- Secret JWT pendek/di-hardcode di repo; secret yang sama untuk semua environment.
- Token di query string (`?token=`) → tercatat di log server/proxy.

## Performance Considerations

- Verifikasi JWT (HMAC/ECDSA) murah dan tanpa I/O — itu keunggulan utama dibanding session lookup.
- Hindari query DB tambahan per request untuk permission; cache permission/role per user (dengan invalidasi saat berubah) atau masukkan claim minimal ke token.
- Hashing password sengaja lambat (~100–500 ms) — jalankan async dan batasi konkurensi; jangan hash ulang di setiap request.

## Security Considerations

- **Token theft:** simpan di secure storage (mobile) atau cookie `HttpOnly; Secure; SameSite` (web). Jangan `localStorage` untuk token sensitif di web.
- **Replay & reuse:** rotasi refresh token + deteksi reuse; bind refresh token ke device id.
- **Key rotation:** gunakan `kid` di header dan JWKS bila memakai algoritma asimetris (RS256/ES256), terutama jika banyak service memverifikasi token.
- **CSRF** relevan bila token disimpan di cookie; Bearer di header tidak dikirim otomatis oleh browser.
- **Audit log** untuk aksi sensitif (void, refund, ubah harga): siapa, kapan, dari device mana.

## Real-World Use Cases

- **POS multi-outlet:** role kasir/supervisor/owner + scope outlet; void transaksi butuh PIN supervisor (step-up authorization).
- **Aplikasi pelanggan:** login OTP/SSO via OIDC, refresh token per device, daftar "perangkat aktif" yang bisa di-logout.
- **Integrasi B2B:** OAuth2 Client Credentials untuk server-to-server dengan scope terbatas.

## Interview Questions

1. **(Fundamental)** Apa beda authentication dan authorization?
2. **(Fundamental)** Apa isi JWT dan apakah payload-nya terenkripsi?
3. **(Intermediate)** Mengapa butuh refresh token? Bagaimana rotasi bekerja?
4. **(Intermediate)** Session vs JWT — kapan memilih masing-masing?
5. **(Intermediate)** Bagaimana mencegah user mengakses order milik outlet lain?
6. **(Advanced)** OAuth2 vs OIDC, dan mengapa mobile app harus memakai PKCE?
7. **(Advanced)** Bagaimana me-revoke JWT sebelum expired?

## Sample Answers

1. Authentication memverifikasi identitas (siapa Anda); authorization menentukan izin (apa yang boleh Anda lakukan). 401 untuk gagal authn, 403 untuk gagal authz.
2. Header (alg, typ, kid), payload (claims: sub, iss, aud, exp, iat, custom), signature. Payload hanya base64url — siapa pun bisa membacanya; signature menjamin integritas, bukan kerahasiaan (kecuali memakai JWE).
3. Agar access token bisa berumur pendek tanpa memaksa login berulang. Setiap refresh menghasilkan refresh token baru dan menandai yang lama terpakai; jika token lama dipakai lagi, server menganggapnya dicuri dan me-revoke seluruh family.
4. Session: web tradisional, butuh revocation instan, satu domain — sederhana dan aman dengan cookie HttpOnly. JWT: API untuk mobile/multi-service, verifikasi stateless — dengan konsekuensi revocation lebih sulit (diatasi dengan expiry pendek + refresh token yang stateful).
5. Object-level authorization: setiap query menyertakan scope (`WHERE id = ? AND outlet_id IN (?)`), bukan hanya mengecek role. Tambahkan test otomatis untuk akses lintas tenant.
6. OAuth2 untuk otorisasi delegasi (mendapat access token ke API); OIDC menambahkan ID token & userinfo untuk autentikasi. Mobile adalah public client (tidak bisa menyimpan client secret), sehingga PKCE mencegah authorization code yang dicegat dapat ditukar oleh aplikasi lain.
7. Expiry pendek (pilihan utama), denylist `jti` di Redis sampai token expired, atau `token_version` di user yang dibandingkan dengan claim (butuh lookup). Refresh token yang di-revoke mencegah token baru diterbitkan.

## Practical Exercises

1. Implementasikan login + refresh rotation + reuse detection di Node.js + PostgreSQL; tulis test untuk skenario token dicuri.
2. Buat middleware `requirePermission` dan test BOLA: user outlet A mencoba mengakses order outlet B.
3. Implementasikan Dio interceptor Flutter dengan single-flight refresh dan uji 10 request paralel yang mendapat 401.
4. Tambahkan halaman "Perangkat aktif" dan endpoint untuk me-revoke refresh token per device.

## Quick Reference

- Authn = **siapa** (401) · Authz = **boleh apa** (403) — cek **fungsi dan objek**.
- Access token: JWT, 5–15 menit, di memory. Refresh token: opaque, hash di DB, rotasi + reuse detection, secure storage.
- Verifikasi: `alg` whitelist, `iss`, `aud`, `exp`.
- Password: Argon2id/bcrypt. Login: rate limit + pesan generik.
- Mobile SSO: Authorization Code + **PKCE** via system browser.

## Related Topics

- [JWT Security](/security/jwt-security/)
- [Authentication vs Authorization](/security/authn-vs-authz/)
- [Secure Token Storage](/security/secure-token-storage/)
- [OWASP API Security Top 10](/security/owasp-api-security/)
- [RESTful API Design](/backend/restful-api-design/)
- Referensi: [RFC 7519 JWT](https://www.rfc-editor.org/rfc/rfc7519), [RFC 7636 PKCE](https://www.rfc-editor.org/rfc/rfc7636), [OAuth 2.0 for Native Apps (RFC 8252)](https://www.rfc-editor.org/rfc/rfc8252), [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
