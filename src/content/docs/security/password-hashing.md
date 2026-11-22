---
title: "Password Hashing"
description: "Menyimpan password dengan benar: hashing vs enkripsi, mengapa SHA-256 tidak cukup, algoritma yang disarankan (Argon2id, scrypt, bcrypt) dan parameternya, salt & pepper, verifikasi constant-time, rehash saat parameter naik, migrasi dari hash lama, kebijakan password (NIST), breach check, rate limiting login, serta PIN di aplikasi mobile."
level: intermediate
status: complete
version: "OWASP Password Storage Cheat Sheet · NIST SP 800-63B · argon2 (Node.js). Rekomendasi parameter dapat diperbarui"
updated: 2026-11-13
tags: [security, password, argon2, bcrypt, authentication]
---

## Overview

Password **tidak pernah disimpan** dalam bentuk asli atau terenkripsi yang bisa dibalik. Yang disimpan adalah **hash
lambat dengan salt**, sehingga bila database bocor, penyerang harus menebak setiap password satu per satu dengan biaya
komputasi tinggi.

## Why It Matters

Kebocoran database terjadi lebih sering daripada yang diharapkan. Password yang di-hash dengan MD5/SHA-256 biasa dapat
dipecahkan dalam jumlah besar dengan GPU, dan karena orang memakai ulang password, kebocoran Anda bisa membobol akun
mereka di layanan lain.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Hashing | Fungsi satu arah, tidak bisa dibalik |
| Enkripsi | Dua arah dengan kunci. **Bukan** untuk password |
| Salt | Nilai acak unik per password, disimpan bersama hash. Mencegah rainbow table & hash sama untuk password sama |
| Pepper | Secret tambahan di luar database (secret manager). Opsional, menambah perlindungan bila hanya DB yang bocor |
| Work factor | Parameter biaya (waktu/memori) yang membuat hashing sengaja lambat |
| Memory-hard | Algoritma yang butuh banyak memori sehingga mahal untuk GPU/ASIC |

| Algoritma | Status |
| --- | --- |
| Argon2id | Pilihan utama (memory-hard) |
| scrypt | Baik (memory-hard) |
| bcrypt | Masih dapat diterima untuk sistem lama. Batas input 72 byte |
| PBKDF2 | Bila dibutuhkan kepatuhan FIPS, dengan iterasi tinggi |
| MD5, SHA-1, SHA-256 (polos) | **Jangan**: terlalu cepat |

## How It Works

```text
Registrasi: password → Argon2id(password, salt acak, parameter) → simpan string PHC
            $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>   (algoritma, parameter, salt, hash dalam satu string)
Login: ambil string → hitung ulang dengan salt & parameter yang sama → bandingkan constant-time
```

## Implementation

### Node.js dengan argon2

```ts
import argon2 from 'argon2';

const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };   // contoh minimum OWASP

export async function hashPassword(plain: string) {
  return argon2.hash(plain, HASH_OPTIONS);                    // salt acak dibuat otomatis
}

export async function verifyPassword(stored: string, plain: string) {
  const ok = await argon2.verify(stored, plain);              // perbandingan aman
  const needsRehash = ok && argon2.needsRehash(stored, HASH_OPTIONS);
  return { ok, needsRehash };
}
```

```ts
async function login(email: string, password: string) {
  const user = await users.findByEmail(email);
  // Tetap lakukan verifikasi dummy bila user tidak ada → waktu respons serupa (kurangi enumerasi akun)
  const { ok, needsRehash } = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || !ok) throw new UnauthorizedError('Email atau password salah');   // pesan generik
  if (needsRehash) await users.updatePasswordHash(user.id, await hashPassword(password));
  return issueTokens(user);
}
```

### Menyesuaikan parameter

Targetkan waktu hashing yang dapat ditoleransi server (sering sekitar ratusan milidetik) dengan memori sesuai kapasitas.
Ukur di hardware produksi. Hashing berjalan di thread pool libuv, sehingga lonjakan login dapat menghabiskan pool, maka
batasi concurrency/rate login.

### Migrasi dari hash lama (mis. SHA-1)

```text
Opsi A (saat login): verifikasi dengan hash lama → bila benar, simpan Argon2id baru → hapus hash lama
Opsi B (langsung untuk semua): argon2id(sha1_lama) → tandai skema "argon2(sha1)" → saat login, hitung ulang ke argon2id murni
Opsi B melindungi semua akun segera, termasuk yang jarang login
```

### Kebijakan password modern (ringkas NIST SP 800-63B)

```text
✅ Panjang minimum (≥ 8, lebih baik ≥ 12 untuk akun penting), izinkan panjang (≥ 64) & semua karakter
✅ Tolak password yang ada di daftar bocor/umum (mis. layanan k-anonymity Have I Been Pwned)
✅ Rate limiting & proteksi brute force, MFA/passkey
❌ Aturan komposisi rumit (wajib simbol) dan rotasi berkala paksa tanpa indikasi kebocoran
❌ Batas panjang maksimal yang pendek atau memotong password diam-diam
```

### PIN di aplikasi mobile

```text
PIN 6 digit hanya punya 1 juta kemungkinan → hashing saja tidak cukup
- Verifikasi PIN di server dengan rate limit & penguncian, atau
- PIN lokal membuka kunci Keystore/Keychain (hardware membatasi percobaan), bukan dibandingkan dengan hash di SharedPreferences
```

## Best Practices

- **Argon2id** (atau scrypt/bcrypt untuk sistem lama) dengan parameter yang diukur.
- **Simpan format PHC** agar parameter bisa dinaikkan dan di-rehash saat login.
- **Pesan login generik** dan waktu respons serupa.
- **Rate limit & deteksi credential stuffing**, plus MFA.
- **Breach check** saat registrasi/ganti password.
- **Jangan log password** (termasuk body request login).

## Anti-Patterns

- MD5/SHA-256 tanpa salt atau dengan satu salt global.
- Enkripsi password agar "bisa dikirim ulang ke pengguna".
- Membuat algoritma hashing sendiri.
- Membandingkan hash dengan `===` pada implementasi manual (rentan timing).
- Mengirim password lewat email atau menyimpannya di log.

## Performance Considerations

Hashing yang lambat adalah tujuan, tetapi dapat menjadi vektor DoS. Batasi rate login per IP/akun, gunakan antrean atau
batas concurrency, dan pertimbangkan instance khusus autentikasi bila beban tinggi.

## Security Considerations

Hashing hanya melindungi password saat database bocor. Tetap perlukan TLS, rate limiting, MFA, deteksi login
mencurigakan, dan alur reset password yang aman (token sekali pakai, berumur pendek, disimpan sebagai hash).

## Real-World Use Cases

- Migrasi sistem lama ber-SHA-1 ke Argon2id dengan pembungkusan langsung semua hash.
- Login karyawan POS dengan PIN yang diverifikasi server, dikunci setelah 5 percobaan gagal.

## Interview Questions

1. Bagaimana cara menyimpan password dengan benar?
2. Mengapa SHA-256 tidak cocok untuk password?
3. Apa fungsi salt dan pepper?
4. Bagaimana menaikkan parameter hashing tanpa memaksa semua pengguna reset password?
5. Apa kebijakan password yang Anda sarankan?

## Sample Answers

1. Hash dengan algoritma lambat dan memory-hard seperti Argon2id, salt acak unik per password, parameter yang diukur, disimpan dalam format yang menyertakan parameter, dan diverifikasi dengan fungsi bawaan library.
2. SHA-256 dirancang cepat sehingga GPU dapat mencoba miliaran tebakan per detik. Password membutuhkan fungsi yang sengaja lambat dan mahal memori.
3. Salt membuat setiap hash unik walau password sama dan mencegah rainbow table. Pepper adalah secret di luar database yang membuat hash tidak bisa ditebak bila hanya database yang bocor.
4. Simpan parameter dalam string hash. Saat pengguna berhasil login, periksa apakah parameternya sudah usang, lalu hash ulang password dengan parameter baru.
5. Panjang minimum yang memadai, izinkan password panjang dan semua karakter, tolak password yang bocor/umum, tanpa rotasi paksa berkala, ditambah rate limiting dan MFA/passkey.

## Practical Exercises

1. Implementasikan registrasi/login dengan Argon2id dan rehash otomatis.
2. Ukur waktu hashing dengan beberapa parameter di server Anda.
3. Rancang migrasi dari hash lama ke Argon2id.

## Quick Reference

```text
Argon2id (utama) · scrypt · bcrypt (lama, 72 byte) · PBKDF2 (FIPS) · bukan MD5/SHA polos
Salt unik otomatis · pepper opsional di secret manager · format PHC · needsRehash saat login
Login: verify dummy bila user tidak ada · pesan generik · rate limit · MFA
NIST: panjang > komposisi · cek password bocor · tanpa rotasi paksa
PIN: verifikasi server + lockout, atau buka kunci Keystore/Keychain
```

## Related Topics

- [Authentication vs Authorization](/security/authn-vs-authz/)
- [Secure Token Storage](/security/secure-token-storage/)
- [Authentication & Authorization (Backend)](/backend/authentication-authorization/)
