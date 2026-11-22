---
title: "Security Questions"
description: "Bank pertanyaan interview keamanan aplikasi: OWASP, autentikasi vs otorisasi, hashing vs enkripsi, JWT & OAuth2, HTTPS/TLS & certificate pinning, penyimpanan data sensitif di mobile, XSS/CSRF/SQL injection, secret management, dan secure SDLC."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, security, owasp, authentication, mobile-security, question-bank]
---

## Overview

Pertanyaan keamanan semakin umum, terutama di perusahaan yang mengelola data pelanggan dan infrastruktur kritis.
Interviewer tidak mengharapkan Anda menjadi pakar security, tetapi memahami **ancaman umum** dan **praktik dasar** di
sisi mobile dan backend. Materi lengkap: [OWASP Top 10](/security/owasp-top-10/) dan
[Flutter Security Best Practices](/flutter/security-best-practices/).

:::note
Daftar OWASP diperbarui berkala (Top 10, API Security Top 10, Mobile Top 10). Sebutkan edisi yang Anda pelajari dan
rujuk owasp.org untuk versi terbaru.
:::

## Why It Matters

Satu kebocoran data dapat merugikan pengguna dan reputasi perusahaan serta berimplikasi hukum. Engineer yang memahami
keamanan mencegah kerentanan sejak desain, bukan menambalnya setelah insiden.

## Core Concepts

| Konsep | Ringkas |
| --- | --- |
| Authentication vs Authorization | Siapa Anda vs apa yang boleh Anda lakukan |
| Hashing vs Encryption vs Encoding | Satu arah (password) vs dua arah dengan kunci vs representasi (Base64, bukan keamanan) |
| CIA triad | Confidentiality, Integrity, Availability |
| Least privilege | Hak akses seminimal yang diperlukan |
| Defense in depth | Lapisan perlindungan berlapis |
| Secure by default | Konfigurasi default yang aman |

| Ancaman | Pencegahan utama |
| --- | --- |
| SQL injection | Parameterized query / ORM |
| XSS | Output encoding, CSP, sanitasi HTML |
| CSRF | SameSite cookie, CSRF token (relevan untuk auth berbasis cookie) |
| IDOR/BOLA | Cek kepemilikan objek di server |
| Broken authentication | MFA, rate limit login, token berumur pendek |
| Sensitive data exposure | TLS, enkripsi at rest, minimisasi data |
| Insecure storage (mobile) | Keystore/Keychain, secure storage, jangan simpan di SharedPreferences biasa |
| Reverse engineering (mobile) | Obfuscation, tidak ada secret di klien, validasi server |

## How It Works

```text
Mobile app ── TLS ──► API Gateway (rate limit, WAF) ──► API (authN: JWT verify → authZ: cek peran & kepemilikan)
   │                                                        │
 Secure storage (token)                               DB (parameterized, least privilege, enkripsi kolom sensitif)
 Tidak ada secret server di app                       Secret manager · audit log
```

## Implementation

```ts
// Password: hash dengan algoritma lambat + salt bawaan
const hash = await argon2.hash(password);              // atau bcrypt dengan cost yang memadai
const ok = await argon2.verify(hash, inputPassword);

// Otorisasi per objek (cegah IDOR)
const order = await db.order.findUnique({ where: { id: req.params.id } });
if (!order || order.customerId !== req.user.id) return res.status(404).end();   // jangan bocorkan keberadaan

// Parameterized query
await db.query('SELECT * FROM users WHERE email = $1', [email]);   // ✅
// await db.query(`SELECT * FROM users WHERE email = '${email}'`);  // ❌ SQL injection
```

```dart
// Mobile: token di secure storage, bukan SharedPreferences
const storage = FlutterSecureStorage();
await storage.write(key: 'refresh_token', value: token);

// Build release dengan obfuscation
// flutter build appbundle --release --obfuscate --split-debug-info=build/symbols
```

## Best Practices

- **Jangan pernah menyimpan secret server di aplikasi** (APK/IPA dapat dibongkar).
- **Validasi & otorisasi di server** — klien bisa dimanipulasi.
- **Token berumur pendek**, refresh token dapat dicabut, logout menghapus token lokal.
- **TLS di mana-mana**; pertimbangkan certificate pinning untuk aplikasi berisiko tinggi beserta rencana rotasi.
- **Log tanpa data sensitif** (password, token, data pribadi lengkap).
- **Update dependensi** dan scan kerentanan rutin.

## Anti-Patterns

- "Keamanan lewat ketidakjelasan" (endpoint tersembunyi tanpa auth).
- MD5/SHA-1 tanpa salt untuk password.
- API key pihak ketiga dengan hak penuh disematkan di aplikasi.
- Menonaktifkan validasi sertifikat SSL untuk "mengatasi error" di production.
- Pesan error yang membocorkan detail (stack trace, query SQL).

## Performance Considerations

Hashing password memang sengaja lambat — sesuaikan cost agar aman namun tetap responsif, dan lindungi endpoint login
dengan rate limit agar tidak menjadi vektor DoS. Validasi JWT lokal (signature) lebih cepat dari lookup session ke DB,
tetapi butuh strategi pencabutan.

## Security Considerations

Halaman ini sendiri adalah topik keamanan; tambahan penting: patuhi regulasi pelindungan data pribadi yang berlaku,
terapkan *secure SDLC* (threat modeling, code review keamanan, SAST/DAST, penetration test), dan siapkan prosedur
respons insiden.

## Real-World Use Cases

- Aplikasi pelanggan yang menampilkan data tagihan & layanan.
- Aplikasi internal teknisi dengan akses ke data pelanggan.
- API pembayaran & webhook.

## Interview Questions

1. Apa beda autentikasi dan otorisasi?
2. Apa beda hashing, enkripsi, dan encoding?
3. Bagaimana menyimpan password dengan benar?
4. Bagaimana JWT bekerja dan apa risikonya?
5. Apa itu OAuth2 dan PKCE?
6. Sebutkan beberapa risiko OWASP dan pencegahannya.
7. Bagaimana menyimpan token di aplikasi mobile?
8. Apa itu certificate pinning dan trade-off-nya?
9. Bagaimana mencegah API key bocor dari aplikasi mobile?
10. Apa itu IDOR dan bagaimana mencegahnya?
11. XSS vs CSRF?
12. Bagaimana Anda memasukkan keamanan ke proses pengembangan?

## Sample Answers

1. Autentikasi memverifikasi identitas (login, token); otorisasi menentukan hak akses identitas tersebut (peran, kepemilikan resource).
2. Hashing satu arah dan deterministik (verifikasi password, integritas); enkripsi dua arah dengan kunci (kerahasiaan); encoding hanya mengubah representasi tanpa keamanan (Base64).
3. Hash dengan algoritma khusus password yang lambat dan ber-salt (Argon2id, bcrypt, scrypt), jangan pernah menyimpan plain text atau hash cepat; terapkan rate limit & MFA.
4. Token berisi header, payload (claims), dan signature; server memverifikasi signature dan masa berlaku tanpa menyimpan session. Risiko: payload hanya di-encode (jangan isi data rahasia), sulit dicabut sebelum kedaluwarsa (gunakan umur pendek + refresh token + denylist bila perlu), algoritma harus dipaksa di server.
5. OAuth2 adalah framework delegasi otorisasi (aplikasi mendapat access token atas izin user). Untuk aplikasi mobile/public client gunakan Authorization Code + PKCE, yang mencegah kode otorisasi yang dicegat ditukar oleh pihak lain.
6. Contoh: Broken Access Control (cek otorisasi di server), Injection (parameterized query), Cryptographic Failures (TLS, enkripsi at rest, algoritma kuat), Security Misconfiguration (hardening, default aman), Vulnerable Components (update & scan dependensi).
7. Di secure storage berbasis Android Keystore/iOS Keychain (`flutter_secure_storage`), bukan SharedPreferences/file biasa; access token di memori bila memungkinkan; hapus saat logout.
8. Aplikasi hanya menerima sertifikat/public key tertentu sehingga mempersulit MITM walau CA dikompromikan atau perangkat memasang CA palsu. Trade-off: risiko aplikasi tidak bisa terhubung saat sertifikat dirotasi — pin public key, siapkan backup pin, dan mekanisme update.
9. Jangan simpan secret server di aplikasi; panggil layanan pihak ketiga melalui backend; untuk key yang memang publik (mis. Maps), batasi dengan restriksi package name/SHA-1 dan kuota; gunakan App Check/attestation untuk mengurangi penyalahgunaan.
10. Insecure Direct Object Reference: penyerang mengganti ID di request untuk mengakses data orang lain. Cegah dengan pengecekan kepemilikan/otorisasi pada setiap akses objek di server; ID acak (UUID) bukan pengganti otorisasi.
11. XSS: penyerang menyisipkan script yang berjalan di browser korban — cegah dengan output encoding, sanitasi, CSP. CSRF: browser korban dipaksa mengirim request terautentikasi (cookie) ke situs target — cegah dengan SameSite cookie, CSRF token, dan validasi origin.
12. Threat modeling saat desain, checklist keamanan di code review, SAST & dependency scanning di CI, secret scanning, uji penetrasi berkala, dan pelatihan tim.

## Practical Exercises

1. Audit aplikasi Anda: di mana token disimpan? Adakah secret di kode? Apakah build release di-obfuscate?
2. Uji endpoint API Anda untuk IDOR dengan dua akun berbeda.
3. Buat threat model sederhana (STRIDE) untuk fitur login.

## Quick Reference

```text
AuthN (siapa) vs AuthZ (boleh apa) · hash (password: argon2/bcrypt) · encrypt (kunci) · encode (bukan keamanan)
JWT pendek + refresh token rotasi · OAuth2 Code + PKCE untuk mobile
Mobile: secure storage · obfuscate · no secret di app · validasi di server · pinning (dengan rencana rotasi)
OWASP: access control · injection · crypto · misconfig · vulnerable deps · log tanpa data sensitif
```

## Related Topics

- [OWASP Top 10](/security/owasp-top-10/)
- [Flutter Security Best Practices](/flutter/security-best-practices/)
- [Authentication & Authorization](/backend/authentication-authorization/)
- [Cybersecurity Fundamentals](/interview/company-prep/cybersecurity/)
