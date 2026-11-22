---
title: "OWASP Top 10"
description: "Sepuluh kategori risiko keamanan aplikasi web paling kritis menurut OWASP, contoh nyata di backend Node.js dan aplikasi mobile, serta mitigasinya."
level: intermediate
status: complete
version: "OWASP Top 10:2021 & 2025"
updated: 2026-11-07
tags: [security, owasp, web, api, mobile]
---

## Overview

**OWASP Top 10** adalah dokumen kesadaran (*awareness document*) dari Open Worldwide Application Security Project yang
merangkum kategori risiko keamanan aplikasi web paling kritis, berdasarkan data kerentanan dari banyak organisasi dan
survei komunitas. Ia **bukan standar lengkap** — untuk verifikasi menyeluruh gunakan **OWASP ASVS** (web) dan
**OWASP MASVS** (mobile).

| # | OWASP Top 10:2021 | Inti risiko |
| --- | --- | --- |
| A01 | Broken Access Control | User bisa mengakses data/fungsi di luar haknya |
| A02 | Cryptographic Failures | Data sensitif tidak/salah dienkripsi |
| A03 | Injection (termasuk XSS) | Input dieksekusi sebagai kode/query |
| A04 | Insecure Design | Cacat di desain, bukan sekadar bug implementasi |
| A05 | Security Misconfiguration | Default tidak aman, debug aktif, header hilang |
| A06 | Vulnerable & Outdated Components | Dependency dengan CVE yang diketahui |
| A07 | Identification & Authentication Failures | Login/sesi lemah |
| A08 | Software & Data Integrity Failures | Update/pipeline/deserialisasi tanpa verifikasi integritas |
| A09 | Security Logging & Monitoring Failures | Serangan tidak terdeteksi |
| A10 | Server-Side Request Forgery (SSRF) | Server dipaksa memanggil URL internal |

:::caution[Version-dependent]
OWASP merilis edisi **2025**. Broken Access Control tetap di posisi #1; perubahan penting yang perlu Anda ketahui antara lain
munculnya kategori **Software Supply Chain Failures** (perluasan dari komponen rentan), **Mishandling of Exceptional Conditions**
(penanganan error yang tidak aman), serta naiknya **Security Misconfiguration**, sementara SSRF digabung ke Broken Access Control.
Selalu cocokkan urutan dan nama kategori terbaru di [owasp.org/Top10](https://owasp.org/Top10/) sebelum interview.
:::

## Why It Matters

- Menjadi "bahasa bersama" antara developer, security team, dan auditor.
- Banyak perusahaan (terutama BUMN, perbankan, telekomunikasi) mensyaratkan aplikasi lolos *penetration test* yang mengacu ke OWASP.
- Sebagian besar kategori dapat dicegah dengan **kebiasaan coding & desain** yang benar — tanggung jawab developer, bukan hanya tim security.

## Core Concepts

- **Defense in depth** — beberapa lapisan kontrol; satu gagal, yang lain menahan.
- **Least privilege** — beri hak minimum yang dibutuhkan (user, service account, DB user, token scope).
- **Deny by default** — akses ditolak kecuali diizinkan eksplisit.
- **Never trust the client** — semua input dan semua klaim dari client (termasuk aplikasi mobile Anda sendiri) harus divalidasi di server.
- **Secure by design** — threat modeling sejak desain (STRIDE), bukan menambal setelah rilis.

## How It Works

Kebanyakan serangan mengikuti pola yang sama: **penyerang mengendalikan input** (URL, body, header, file, token) →
aplikasi **memercayai** input itu di tempat sensitif (query, perintah OS, keputusan otorisasi, HTML, URL fetch) →
input berubah menjadi **aksi** yang tidak dimaksudkan. Mitigasi berpusat pada: validasi & encoding di boundary,
otorisasi di setiap akses, dan konfigurasi yang aman secara default.

## Implementation

### A01 — Broken Access Control (IDOR/BOLA)

```ts
// ❌ siapa pun yang login bisa membaca invoice siapa saja dengan mengganti ID
router.get('/invoices/:id', requireAuth, async (req, res) => {
  res.json(await db.invoice.findUnique({ where: { id: req.params.id } }));
});

// ✅ scope ke pemilik/tenant + 404 agar tidak membocorkan keberadaan
router.get('/invoices/:id', requireAuth, async (req, res) => {
  const inv = await db.invoice.findFirst({ where: { id: req.params.id, customerId: req.user.id } });
  if (!inv) return res.status(404).end();
  res.json(inv);
});
```

### A02 — Cryptographic Failures

- TLS untuk semua trafik; HSTS.
- Password: Argon2id/bcrypt — **bukan** MD5/SHA-1/SHA-256 polos.
- Data sensitif at rest (NIK, nomor rekening): enkripsi kolom/disk dengan kunci dari KMS/secret manager.
- Jangan membuat algoritma kripto sendiri; gunakan library teruji (libsodium, WebCrypto, `node:crypto` dengan AES-256-GCM).

### A03 — Injection

```ts
// ❌ SQL injection
await db.query(`SELECT * FROM users WHERE email = '${req.body.email}'`);
// ✅ parameterized query
await db.query('SELECT id, email FROM users WHERE email = $1', [req.body.email]);

// ❌ Command injection
exec(`convert ${req.query.file} out.png`);
// ✅ hindari shell; gunakan API/argumen terpisah + allowlist
execFile('convert', [safePath(req.query.file), 'out.png']);
```

XSS: encode output sesuai konteks (framework template melakukannya otomatis), hindari `innerHTML`/`dangerouslySetInnerHTML`
dengan data user, pasang **Content-Security-Policy**.

### A04 — Insecure Design

Contoh: reset password via OTP 4 digit tanpa rate limit (bisa di-brute force 10.000 kombinasi), atau diskon yang dihitung
di client. Mitigasi: threat modeling, *abuse case* di user story, rate limit by design, server-side business rules.

### A05 — Security Misconfiguration

```ts
import helmet from 'helmet';
app.disable('x-powered-by');
app.use(helmet());                              // security headers (CSP, HSTS, X-Content-Type-Options, ...)
app.use(cors({ origin: ['https://admin.example.com'], credentials: true }));   // bukan origin: '*' + credentials
// NODE_ENV=production: tanpa stack trace di response, tanpa endpoint debug/swagger publik
```

Mobile: `android:debuggable=false`, `usesCleartextTraffic=false`, tidak ada `allowBackup` untuk data sensitif, Firebase rules tidak `allow read, write: if true`.

### A06 — Vulnerable & Outdated Components

```bash
npm audit --omit=dev            # Node.js
flutter pub outdated            # Dart/Flutter
# + Dependabot/Renovate, OWASP Dependency-Check / Trivy di CI, lockfile wajib di-commit
```

### A07 — Identification & Authentication Failures

Rate limit & lockout bertahap, MFA untuk admin, session/token expiry, rotasi refresh token, tidak ada kredensial default,
pesan error generik, cek password terhadap daftar password bocor. Lihat [Authentication & Authorization](/backend/authentication-authorization/).

### A08 — Software & Data Integrity Failures

- CI/CD: pin versi action/image (by digest), proteksi branch, review pipeline changes, signed artifacts.
- Jangan deserialisasi data tak tepercaya ke objek dengan perilaku (`eval`, `node-serialize`, YAML unsafe load).
- Verifikasi signature untuk update/OTA (mis. code push) dan webhook (HMAC signature dari payment gateway).

```ts
// Verifikasi webhook HMAC dengan perbandingan constant-time
const expected = createHmac('sha256', process.env.WEBHOOK_SECRET!).update(rawBody).digest('hex');
const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(req.header('X-Signature') ?? ''));
```

### A09 — Security Logging & Monitoring Failures

Log event keamanan (login gagal, perubahan role, akses ditolak, void/refund) dengan `user_id`, IP, `request_id`;
**tanpa** password/token/PII penuh. Kirim ke sistem terpusat dengan alert (mis. 50 login gagal/menit dari satu IP).

### A10 — SSRF

```ts
// ❌ fitur "import gambar dari URL" → penyerang memakai http://169.254.169.254/ (metadata cloud) atau http://localhost:6379
await fetch(req.body.imageUrl);
// ✅ allowlist skema & domain, resolve DNS lalu tolak IP privat/loopback/link-local, timeout & batas ukuran,
//    jalankan fetcher di network segment tanpa akses ke layanan internal
```

## Best Practices

- **Validasi input dengan schema di setiap boundary** (Zod/class-validator) dan **encode output** sesuai konteks.
- **Otorisasi terpusat + scope di query** untuk setiap akses objek.
- **Secure defaults** dalam template project & [AGENTS.md](/agent-instructions/template-nodejs-backend/) agar setiap fitur baru aman sejak awal.
- **Automasi**: SAST (CodeQL/Semgrep), dependency scanning, secret scanning, DAST (OWASP ZAP) di pipeline.
- **Threat modeling ringan** untuk fitur berisiko (pembayaran, upload, reset password, integrasi URL eksternal).
- **Patch rutin** — jadwalkan update dependency, jangan hanya saat ada insiden.

## Anti-Patterns

- "Endpoint ini hanya dipakai aplikasi kami, jadi aman" — API selalu bisa dipanggil langsung.
- Security hanya dicek di akhir proyek oleh pentester.
- Menyembunyikan tombol sebagai otorisasi; menyimpan API key rahasia di aplikasi mobile.
- Blacklist karakter berbahaya alih-alih parameterized query/allowlist.
- Error 500 yang menampilkan stack trace dan query SQL.

## Performance Considerations

Kontrol keamanan umumnya murah dibanding biaya insiden. Yang perlu diukur: biaya hashing password (sengaja lambat —
batasi konkurensi), validasi schema pada payload besar (batasi ukuran), dan logging berlebihan (gunakan sampling untuk
log non-keamanan). Rate limiting justru **melindungi** performa dari abuse.

## Security Considerations

Halaman ini adalah tentang security; tambahan praktis untuk konteks mobile + backend:

- Gunakan **OWASP MASVS/MASTG** untuk aplikasi Flutter/Android (penyimpanan, kriptografi, network, platform interaction, resilience).
- Gunakan **OWASP API Security Top 10** untuk REST API — BOLA, broken authentication, BOPLA (mass assignment/excessive data exposure), unrestricted resource consumption.

## Real-World Use Cases

- **Aplikasi pelanggan utilitas/telekomunikasi:** IDOR pada endpoint tagihan (`/bills/{customerId}`) adalah temuan pentest yang sangat umum — mitigasi dengan mengambil `customerId` dari token, bukan dari URL.
- **POS:** diskon/harga divalidasi server; void transaksi butuh role supervisor + audit log.
- **Webhook payment gateway:** verifikasi signature + idempotency untuk mencegah notifikasi palsu/duplikat.

## Interview Questions

1. **(Fundamental)** Apa itu OWASP Top 10? Sebutkan beberapa kategorinya.
2. **(Fundamental)** Bagaimana mencegah SQL injection?
3. **(Intermediate)** Apa itu IDOR/BOLA dan bagaimana mencegahnya?
4. **(Intermediate)** Apa beda XSS dan CSRF?
5. **(Intermediate)** Apa itu SSRF dan contoh fiturnya yang rawan?
6. **(Advanced)** Bagaimana Anda memasukkan keamanan ke dalam SDLC tim?

## Sample Answers

1. Dokumen kesadaran OWASP tentang 10 kategori risiko keamanan aplikasi web paling kritis — mis. Broken Access Control (#1), Injection, Cryptographic Failures, Security Misconfiguration, Vulnerable Components, Authentication Failures. Saya juga merujuk ASVS/MASVS untuk checklist detail.
2. Parameterized query/prepared statement (input dikirim terpisah dari struktur query), ORM yang memakai parameter, allowlist untuk identifier dinamis, dan DB user least-privilege.
3. Insecure Direct Object Reference / Broken Object Level Authorization: server mengembalikan objek berdasarkan ID dari client tanpa memeriksa kepemilikan. Cegah dengan scope query ke user/tenant di setiap akses, policy terpusat, dan test otomatis lintas user.
4. XSS menyisipkan script ke halaman sehingga berjalan di browser korban; dicegah dengan output encoding & CSP. CSRF memanfaatkan browser yang otomatis mengirim cookie untuk melakukan aksi atas nama korban; dicegah dengan SameSite cookie, CSRF token, dan cek Origin.
5. Server dipaksa membuat request ke tujuan yang dipilih penyerang, sering ke jaringan internal/metadata cloud. Fitur rawan: import dari URL, webhook URL yang bisa diatur user, preview link, PDF generator dari HTML. Mitigasi: allowlist, blok IP privat setelah resolve DNS, segmentasi jaringan.
6. Security requirement & threat modeling saat desain, secure defaults di template project, review checklist keamanan di PR, SAST/dependency/secret scanning di CI, DAST di staging, pentest berkala, dan logging + alert di production; plus pelatihan singkat rutin.

## Practical Exercises

1. Jalankan OWASP Juice Shop secara lokal (Docker) dan selesaikan tantangan per kategori.
2. Audit satu API Anda: daftar semua endpoint yang menerima ID dan pastikan ada pemeriksaan kepemilikan + test-nya.
3. Tambahkan `helmet`, rate limit login, `npm audit`, dan CodeQL ke project Node.js latihan.
4. Buat threat model STRIDE sederhana untuk fitur "upload foto KTP pelanggan".

## Quick Reference

- **#1 Broken Access Control** → scope setiap query ke user/tenant; deny by default.
- Injection → parameterized query, encoding output, hindari shell.
- Crypto → TLS, Argon2id/bcrypt, AES-GCM, kunci di KMS.
- Misconfig → helmet, CORS ketat, tanpa debug/stack trace di prod.
- Komponen → lockfile + Dependabot + `npm audit`/`pub outdated`.
- Integrity → verifikasi signature (webhook, update), pin dependency CI.
- Logging → event keamanan + alert, tanpa secret.
- SSRF → allowlist + blok IP internal.

## Related Topics

- [OWASP API Security Top 10](/security/owasp-api-security/)
- [SQL Injection](/security/sql-injection/) · [XSS & CSRF](/security/xss-csrf/)
- [Mobile Application Security](/security/mobile-app-security/)
- [Authentication & Authorization](/backend/authentication-authorization/)
- [Security Questions — Interview](/interview/technical/security/)
- Referensi resmi: [OWASP Top 10](https://owasp.org/Top10/), [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org), [OWASP MASVS](https://mas.owasp.org/MASVS/).
