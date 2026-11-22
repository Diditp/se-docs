---
title: "Cybersecurity Fundamentals"
description: "Dasar keamanan siber untuk interview: CIA triad, AAA, jenis serangan umum (phishing, malware, ransomware, DDoS, MITM, injection), kriptografi dasar, keamanan jaringan, defense in depth, dan respons insiden."
level: beginner
status: complete
updated: 2026-11-13
tags: [interview, company-prep, cybersecurity, security, cia-triad]
---

## Overview

**Cybersecurity** adalah praktik melindungi sistem, jaringan, aplikasi, dan data dari akses, perubahan, atau gangguan
yang tidak sah. Untuk perusahaan yang mengelola infrastruktur jaringan, data pelanggan dalam jumlah besar, dan layanan
yang mendukung sektor vital, keamanan adalah kompetensi dasar setiap engineer — bukan hanya tim security.

## Why It Matters

- Satu kebocoran data atau gangguan layanan berdampak ke jutaan pelanggan, reputasi, dan kewajiban hukum (mis. UU Pelindungan Data Pribadi).
- Banyak serangan berhasil karena kesalahan dasar: password lemah, patch terlambat, phishing, konfigurasi terbuka.
- Pertanyaan keamanan dasar (CIA triad, beda enkripsi vs hashing, cara mencegah SQL injection) umum di seleksi.

## Core Concepts

### CIA Triad & AAA

| Pilar | Arti | Kontrol contoh |
| --- | --- | --- |
| **Confidentiality** | Data hanya diakses pihak berwenang | Enkripsi, access control, MFA |
| **Integrity** | Data akurat & tidak diubah tanpa izin | Hashing, digital signature, audit log, checksum |
| **Availability** | Sistem tersedia saat dibutuhkan | Redundansi, backup, anti-DDoS, monitoring |

**AAA**: **Authentication** (siapa Anda) · **Authorization** (boleh apa) · **Accounting/Auditing** (apa yang dilakukan, tercatat).

### Kriptografi dasar

| Konsep | Arti | Contoh |
| --- | --- | --- |
| Symmetric encryption | Satu kunci untuk enkripsi & dekripsi | AES-256-GCM |
| Asymmetric encryption | Pasangan public/private key | RSA, ECC (ECDH/ECDSA) |
| Hashing | Fungsi satu arah, tidak bisa dibalik | SHA-256 (integritas), **Argon2id/bcrypt** (password) |
| Digital signature | Membuktikan pengirim & integritas | Tanda tangan dengan private key, verifikasi dengan public key |
| TLS | Protokol yang menggabungkan semuanya untuk komunikasi aman | HTTPS |
| Encoding | Mengubah format, **bukan** keamanan | Base64 |

### Serangan umum

| Serangan | Cara kerja singkat | Mitigasi utama |
| --- | --- | --- |
| Phishing / social engineering | Menipu user agar memberi kredensial/membuka malware | Edukasi, MFA, filter email |
| Malware / ransomware | Kode jahat; ransomware mengenkripsi data & meminta tebusan | Patch, EDR/antivirus, least privilege, **backup offline teruji** |
| DDoS | Membanjiri layanan dengan trafik | CDN/anti-DDoS, rate limiting, autoscaling |
| Man-in-the-Middle | Menyadap/mengubah komunikasi | TLS, HSTS, certificate validation |
| Brute force / credential stuffing | Menebak/menggunakan password bocor | Rate limit, lockout, MFA, password policy |
| Injection (SQL, command) | Input dieksekusi sebagai kode | Parameterized query, validasi |
| XSS | Script disisipkan ke halaman web | Output encoding, CSP |
| Broken access control / IDOR | Mengakses data user lain | Otorisasi di server per objek |
| Zero-day | Celah yang belum ada patch-nya | Defense in depth, monitoring, segmentasi |
| Supply chain | Dependency/vendor disusupi | Dependency scanning, pin versi, verifikasi |

## How It Works

**Defense in depth** — beberapa lapisan pertahanan sehingga satu kontrol yang gagal tidak langsung menyebabkan kebocoran:

```text
Kebijakan & edukasi → Perimeter (firewall, WAF, anti-DDoS) → Jaringan (segmentasi, VPN, IDS/IPS)
→ Host (patch, hardening, EDR) → Aplikasi (authn/authz, validasi, secure coding) → Data (enkripsi, backup, masking)
→ Monitoring & respons (SIEM, alert, incident response)
```

**Zero Trust** — "never trust, always verify": setiap akses diverifikasi (identitas, perangkat, konteks) walau berasal dari
jaringan internal.

**Siklus respons insiden** (umum, mis. NIST): Preparation → Detection & Analysis → Containment → Eradication →
Recovery → Lessons Learned.

## Implementation

### Password hashing yang benar (Node.js)

```ts
import argon2 from 'argon2';
const hash = await argon2.hash(plainPassword, { type: argon2.argon2id });   // simpan hash, bukan password
const ok = await argon2.verify(hash, inputPassword);
```

### Enkripsi data sensitif (AES-256-GCM)

```ts
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export function encrypt(plain: string, key: Buffer) {             // key 32 byte dari KMS/secret manager
  const iv = randomBytes(12);                                      // IV unik setiap enkripsi
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decrypt(payload: string, key: Buffer) {
  const buf = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));                       // gagal jika data diubah (integritas)
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
```

### Checklist keamanan dasar untuk aplikasi baru

```markdown
- [ ] HTTPS everywhere + HSTS; sertifikat auto-renew
- [ ] Password: Argon2id/bcrypt; MFA untuk admin; rate limit login/OTP
- [ ] Otorisasi server per endpoint & per objek
- [ ] Input divalidasi; query berparameter; output di-encode
- [ ] Secret di secret manager; tidak ada secret di repo/app mobile
- [ ] Dependency & image discan; patch rutin
- [ ] Log audit untuk aksi sensitif; alert untuk anomali
- [ ] Backup terenkripsi, offline/immutable copy, uji restore
- [ ] Data pribadi diminimalkan, dienkripsi, akses dibatasi
```

## Best Practices

- **Least privilege** untuk user, service, dan akses jaringan.
- **Patch management** terjadwal untuk OS, library, dan perangkat jaringan.
- **MFA** untuk akses administratif dan sistem kritis.
- **Segmentasi jaringan**: pisahkan zona publik, aplikasi, database, dan manajemen.
- **Backup 3-2-1** (3 salinan, 2 media, 1 offsite/offline) dan uji restore — pertahanan utama terhadap ransomware.
- **Logging & monitoring terpusat** dengan alert yang ditindaklanjuti.
- **Security awareness** untuk semua karyawan (phishing adalah pintu masuk paling umum).
- **Secure SDLC**: threat modeling, code review, SAST/DAST, pentest.

## Anti-Patterns

- Menganggap jaringan internal pasti aman.
- Menyimpan password dengan MD5/SHA-1 atau enkripsi yang bisa dibalik.
- Menggunakan Base64 sebagai "enkripsi".
- Akun admin bersama tanpa MFA dan tanpa audit.
- Backup yang terhubung permanen ke jaringan (ikut terenkripsi ransomware) dan tidak pernah diuji.
- "Security through obscurity" sebagai satu-satunya kontrol.

## Performance Considerations

- TLS modern (1.3) menambah overhead minimal; manfaatnya jauh lebih besar.
- Hashing password sengaja lambat — jalankan async dan batasi konkurensi.
- WAF/anti-DDoS dan rate limiting justru menjaga ketersediaan saat serangan.
- Logging keamanan harus efisien (structured, terkirim async) agar tidak memperlambat aplikasi.

## Security Considerations

Halaman ini adalah ringkasan keamanan umum. Untuk penerapan di kode: [OWASP Top 10](/security/owasp-top-10/),
[Authentication & Authorization](/backend/authentication-authorization/), [Flutter Security](/flutter/security-best-practices/),
dan aturan agent [Application Security Requirements](/agent-instructions/security/).

## Real-World Use Cases

- **Aplikasi pelanggan**: login OTP + rate limit, otorisasi per pelanggan, data pribadi dimasking di log.
- **Operasional jaringan**: akses perangkat via bastion/VPN dengan MFA, audit perintah, segmentasi manajemen.
- **Ransomware readiness**: backup immutable harian, latihan restore triwulanan, rencana respons insiden.

## Interview Questions

1. Jelaskan CIA triad dengan contoh.
2. Apa beda enkripsi, hashing, dan encoding?
3. Apa beda symmetric dan asymmetric encryption?
4. Bagaimana mencegah SQL injection dan XSS?
5. Apa itu phishing dan bagaimana organisasi mencegahnya?
6. Apa itu defense in depth dan zero trust?
7. Apa yang Anda lakukan jika menemukan data pelanggan bocor?

## Sample Answers

1. Confidentiality: hanya pihak berwenang yang bisa membaca data (enkripsi, MFA). Integrity: data tidak berubah tanpa izin (hash, signature, audit). Availability: layanan tetap tersedia (redundansi, backup, anti-DDoS).
2. Enkripsi dapat dibalik dengan kunci (menjaga kerahasiaan). Hashing satu arah (integritas & penyimpanan password dengan algoritma lambat). Encoding hanya mengubah format dan bisa dibalik siapa saja — bukan keamanan.
3. Symmetric memakai satu kunci yang sama (cepat, untuk data besar, misal AES). Asymmetric memakai pasangan public/private key (untuk pertukaran kunci dan tanda tangan, misal RSA/ECC). TLS memakai asymmetric untuk menyepakati kunci, lalu symmetric untuk data.
4. SQL injection: parameterized query, validasi input, least privilege DB user. XSS: output encoding sesuai konteks, Content-Security-Policy, hindari menyisipkan HTML mentah dari input user.
5. Upaya menipu korban (email/pesan palsu) agar memberikan kredensial atau menjalankan malware. Pencegahan: edukasi & simulasi phishing, MFA, filter email (SPF/DKIM/DMARC), prinsip least privilege.
6. Defense in depth: beberapa lapisan kontrol sehingga satu kegagalan tidak fatal. Zero trust: tidak ada kepercayaan implisit berdasarkan lokasi jaringan; setiap akses diverifikasi identitas, perangkat, dan konteksnya.
7. Ikuti prosedur respons insiden: laporkan segera ke tim security/atasan, jangan menghapus bukti, bantu containment (cabut akses/rotasi kredensial), analisis cakupan, pemulihan, notifikasi sesuai regulasi, dan lessons learned.

## Practical Exercises

1. Petakan kontrol defense in depth untuk aplikasi yang pernah Anda buat; tandai lapisan yang kosong.
2. Implementasikan hashing Argon2id dan enkripsi AES-GCM untuk satu kolom sensitif.
3. Jalankan OWASP Juice Shop dan selesaikan tantangan injection & broken access control.

## Quick Reference

```text
CIA: Confidentiality · Integrity · Availability   AAA: Authentication · Authorization · Accounting
Encrypt (bisa dibuka dgn kunci) · Hash (satu arah; password = Argon2id/bcrypt) · Encode ≠ keamanan
Symmetric AES (data) · Asymmetric RSA/ECC (kunci & tanda tangan) · TLS = gabungan
Defense in depth · Zero trust · Least privilege · MFA · Patch · Backup 3-2-1 + uji restore
IR: Prepare → Detect → Contain → Eradicate → Recover → Lessons learned
```

## Related Topics

- [OWASP Top 10](/security/owasp-top-10/)
- [Security Fundamentals](/security/security-fundamentals/)
- [HTTPS & TLS](/security/https-tls/)
- [Networking & Internet Fundamentals](/interview/company-prep/networking-internet/)
