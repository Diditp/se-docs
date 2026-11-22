---
title: "Mobile Application Security"
description: "Gambaran keamanan aplikasi mobile lintas platform (Flutter, Android, iOS) berdasarkan OWASP MASVS: model ancaman mobile, penyimpanan aman, kriptografi, autentikasi & sesi, keamanan jaringan, interaksi platform, kualitas kode & dependensi, resilience, privasi, serta checklist pentest dan peta ke halaman detail."
level: advanced
status: complete
version: "OWASP MASVS v2 / MASTG — rujuk mas.owasp.org untuk versi terbaru"
updated: 2026-11-13
tags: [security, mobile, masvs, flutter, android, ios]
---

## Overview

Halaman ini adalah **peta keamanan mobile lintas platform**. Detail implementasi ada di
[Android App Security](/android/app-security/), [Keychain & iOS App Security](/ios/keychain-security/), dan
[Flutter Security Best Practices](/flutter/security-best-practices/). Kerangka rujukan industri adalah
**OWASP MASVS** (Mobile Application Security Verification Standard) beserta panduan pengujiannya **MASTG**.

## Why It Matters

Bank, fintech, e-commerce, dan aplikasi korporat/BUMN umumnya mewajibkan pentest mobile sebelum go-live. Engineer yang
memahami MASVS dapat mendesain aplikasi yang lolos pentest sejak awal, bukan menambal di akhir.

## Core Concepts

### Model ancaman mobile

```text
Penyerang dapat: memasang aplikasi di perangkat root/jailbreak · membongkar APK/IPA · mencegat traffic (proxy)
· memanipulasi runtime (hooking) · memakai aplikasi palsu/clone · mengakses perangkat yang hilang/dicuri
Maka: rahasia & keputusan penting ada di SERVER; aplikasi melindungi data lokal, komunikasi, dan mempersulit penyalahgunaan.
```

### Kategori MASVS v2 & kontrol utama

| Kategori | Kontrol utama | Flutter | Android | iOS |
| --- | --- | --- | --- | --- |
| STORAGE | Data sensitif minimal & terenkripsi; tidak di log/backup | `flutter_secure_storage`, SQLCipher | Keystore, backup rules | Keychain, data protection |
| CRYPTO | Algoritma standar, kunci di hardware-backed store | `cryptography`/platform | Android Keystore | Keychain/Secure Enclave |
| AUTH | Sesi di server, token pendek, biometrik terikat kunci | `local_auth` + server | BiometricPrompt + CryptoObject | LocalAuthentication + Keychain ACL |
| NETWORK | TLS saja, pinning (opsional), tidak menerima sertifikat sembarang | `dio`/`http` + pinning | Network Security Config | ATS |
| PLATFORM | Komponen tidak diekspos, deep link & channel divalidasi, WebView aman | validasi `go_router`, channel | `exported=false`, intent | Universal Links, URL scheme |
| CODE | Dependensi terbaru, validasi input, tanpa debug di release | `pub outdated`, lint | R8, Dependabot | — |
| RESILIENCE | Obfuscation, deteksi tamper/root, attestation diverifikasi server | `--obfuscate` | Play Integrity API | App Attest |
| PRIVACY | Minimisasi data, transparansi, kontrol pengguna | izin minimum | Data safety | App Privacy, privacy manifest |

## How It Works

```text
Desain: threat modeling fitur sensitif (login, pembayaran, data pribadi)
Implementasi: checklist MASVS per fitur + AGENTS.md security rules
CI: SAST/lint, dependency scanning, secret scanning
Pra-rilis: pengujian MASTG (internal/pentest pihak ketiga) → perbaikan → retest
Production: monitoring, respons insiden (revoke token, force update)
```

## Implementation

### Checklist keamanan mobile (ringkas)

```markdown
STORAGE
- [ ] Token/PIN hanya di secure storage; tidak di SharedPreferences/UserDefaults
- [ ] DB lokal berisi data pribadi/finansial terenkripsi; data dihapus saat logout
- [ ] Tidak ada data sensitif di log, screenshot test, clipboard, notifikasi lock screen
NETWORK
- [ ] HTTPS saja (cleartext/ATS tidak dilonggarkan); pinning dengan pin cadangan bila dipakai
AUTH
- [ ] Access token pendek, refresh token dapat dicabut; logout menghapus semua sesi lokal
- [ ] Otorisasi & aturan bisnis divalidasi server (harga, limit, status)
PLATFORM
- [ ] Deep link, platform channel, intent divalidasi; komponen internal tidak diekspor
- [ ] FLAG_SECURE / overlay privasi untuk layar sensitif
CODE & RESILIENCE
- [ ] Build release obfuscated, tanpa log debug; dependensi bebas kerentanan diketahui
- [ ] Tidak ada secret server di binary (uji dengan membongkar APK/IPA)
- [ ] Attestation (Play Integrity/App Attest) diverifikasi server untuk aplikasi berisiko tinggi
PRIVACY
- [ ] Izin minimum; Data safety & App Privacy sesuai; privacy manifest lengkap
```

### Contoh: transaksi bernilai uang

```text
❌ App menghitung total & diskon → kirim "total = 10.000" → server percaya
✅ App kirim item + kode promo → server menghitung ulang harga, validasi promo & stok → simpan → kembalikan total resmi
   + idempotency key + otorisasi kepemilikan outlet + audit log
```

## Best Practices

- **Server sebagai sumber kebenaran** untuk semua keputusan bernilai.
- **Pertahanan berlapis**: storage aman + TLS + obfuscation + validasi server + monitoring.
- **MASVS sebagai checklist desain**, bukan hanya alat pentest.
- **Aturan keamanan di AGENTS.md** agar AI agent dan tim konsisten.
- **Uji seperti penyerang** sebelum rilis.

## Anti-Patterns

- "Aman karena kode di-obfuscate."
- API key pihak ketiga berhak penuh di aplikasi.
- Deteksi root di klien sebagai satu-satunya pengaman.
- Menonaktifkan validasi sertifikat untuk debugging lalu lupa di release.

## Performance Considerations

Enkripsi lokal, pinning, dan attestation menambah sedikit biaya; letakkan di jalur yang tepat (attestation saat login
atau transaksi penting, bukan setiap request) dan cache hasil yang aman untuk di-cache.

## Security Considerations

Halaman ini adalah topik keamanan. Sertakan rencana respons insiden mobile: revoke token di server, rotasi kunci API,
naikkan minimum supported version, dan komunikasi ke pengguna.

## Real-World Use Cases

- Persiapan pentest aplikasi kasir untuk klien korporat.
- Aplikasi fintech dengan attestation, biometrik terikat kunci, dan pinning.
- Audit keamanan aplikasi Flutter yang sudah berjalan memakai checklist MASVS.

## Interview Questions

1. Apa itu OWASP MASVS?
2. Mengapa "jangan percaya klien" penting di mobile?
3. Bagaimana mengamankan token di Flutter untuk Android dan iOS?
4. Apa yang Anda lakukan agar aplikasi lolos pentest?
5. Apakah obfuscation cukup untuk melindungi aplikasi?

## Sample Answers

1. Standar verifikasi keamanan aplikasi mobile dari OWASP yang mengelompokkan persyaratan ke storage, crypto, auth, network, platform, code, resilience, dan privacy; MASTG adalah panduan pengujiannya.
2. Aplikasi dapat dibongkar, dimodifikasi, dan traffic-nya dimanipulasi, sehingga validasi, otorisasi, dan perhitungan bernilai harus dilakukan di server.
3. `flutter_secure_storage` (Keystore di Android, Keychain di iOS dengan kelas aksesibilitas yang tepat), access token berumur pendek di memori, refresh token yang dapat dicabut, dihapus saat logout, tidak pernah di log.
4. Mendesain dengan checklist MASVS, menguji sendiri (bongkar binary, proxy traffic, perangkat root), memperbaiki temuan, dan menyiapkan bukti kontrol (konfigurasi, kebijakan) untuk tim pentest.
5. Tidak — obfuscation hanya mempersulit analisis; perlindungan utama tetap tidak menyimpan rahasia di aplikasi dan menegakkan aturan di server.

## Practical Exercises

1. Jalankan checklist di atas pada aplikasi Anda dan catat temuan.
2. Bongkar APK/IPA release Anda dan cari string sensitif.
3. Tulis threat model satu fitur (mis. void transaksi) dan kontrol untuk setiap ancaman.

## Quick Reference

```text
MASVS: STORAGE · CRYPTO · AUTH · NETWORK · PLATFORM · CODE · RESILIENCE · PRIVACY
Jangan percaya klien · secret di server · secure storage · TLS (+pinning) · validasi input platform
Obfuscation + attestation (verifikasi server) · privasi & izin minimum · uji seperti penyerang
```

## Related Topics

- [Android App Security](/android/app-security/)
- [Keychain & iOS App Security](/ios/keychain-security/)
- [Flutter Security Best Practices](/flutter/security-best-practices/)
- [OWASP Top 10](/security/owasp-top-10/)
