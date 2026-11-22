---
title: "Security Fundamentals"
description: "Fondasi keamanan aplikasi: CIA triad, threat modeling (aset, aktor, STRIDE), attack surface, defense in depth, least privilege, secure by default, fail securely, zero trust, keamanan sebagai bagian SDLC, serta cara berpikir keamanan untuk aplikasi mobile dan backend."
level: beginner
status: complete
updated: 2026-11-13
tags: [security, fundamentals, threat-modeling, stride, least-privilege]
---

## Overview

Keamanan aplikasi bukan fitur yang ditambahkan di akhir, melainkan **cara berpikir** sejak desain: data apa yang
berharga, siapa yang mungkin menyerang, lewat jalan mana, dan kontrol apa yang mengurangi risikonya. Halaman ini
memberi kerangka yang dipakai oleh semua topik keamanan lainnya.

## Why It Matters

Mobile developer menangani token, data pribadi, pembayaran, dan lokasi. Satu celah sederhana seperti endpoint tanpa
pemeriksaan kepemilikan atau secret di dalam APK dapat membocorkan data seluruh pengguna. Interviewer sering meminta
Anda "mengidentifikasi risiko keamanan" dari sebuah desain.

## Core Concepts

### CIA triad

| Prinsip | Arti | Contoh pelanggaran |
| --- | --- | --- |
| Confidentiality | Hanya pihak berwenang yang dapat membaca | Token bocor di log |
| Integrity | Data tidak diubah tanpa izin | Harga diubah dari aplikasi termodifikasi |
| Availability | Layanan tersedia saat dibutuhkan | API dibanjiri request (DoS) |

Ditambah **authenticity** (keaslian identitas) dan **non-repudiation** (tindakan dapat dibuktikan, mis. audit log).

### Prinsip desain aman

| Prinsip | Penjelasan |
| --- | --- |
| Defense in depth | Beberapa lapisan kontrol. Bila satu gagal, yang lain menahan |
| Least privilege | Hak akses minimum untuk pengguna, layanan, token, dan database user |
| Secure by default | Konfigurasi default sudah aman (cleartext mati, debug mati) |
| Fail securely | Saat error, sistem menolak akses, bukan membuka |
| Never trust the client | Semua input dari klien (termasuk aplikasi Anda sendiri) divalidasi di server |
| Minimize attack surface | Endpoint, port, fitur, dan dependensi yang tidak perlu dihapus |
| Zero trust | Jaringan internal tidak otomatis dipercaya. Setiap permintaan diautentikasi & diotorisasi |
| Separation of duties | Aksi sensitif butuh peran/orang berbeda (mis. approve refund) |

### Threat modeling dengan STRIDE

| Ancaman | Pertanyaan | Kontrol umum |
| --- | --- | --- |
| **S**poofing | Bisakah seseorang menyamar? | Autentikasi kuat, MFA, verifikasi token |
| **T**ampering | Bisakah data diubah? | Validasi server, tanda tangan, TLS, integritas |
| **R**epudiation | Bisakah pelaku menyangkal? | Audit log yang tidak bisa diubah |
| **I**nformation disclosure | Bisakah data bocor? | Enkripsi, otorisasi, redaksi log |
| **D**enial of service | Bisakah layanan dilumpuhkan? | Rate limit, timeout, batas ukuran |
| **E**levation of privilege | Bisakah mendapat hak lebih? | Otorisasi per aksi & objek, least privilege |

## How It Works

```text
Threat modeling ringan (30–60 menit per fitur):
1. Apa yang kita bangun? Gambar alur data (aplikasi → API → DB → pihak ketiga) dan batas kepercayaan
2. Apa yang bisa salah? Telusuri STRIDE per komponen & per perpindahan data
3. Apa yang kita lakukan? Kontrol, prioritas berdasarkan dampak × kemungkinan
4. Apakah sudah cukup? Test keamanan, review, dan pantau
```

## Implementation

### Contoh: threat model fitur "refund" di aplikasi POS

```text
Aset: uang, data transaksi
Aktor: kasir nakal, penyerang dengan token curian, aplikasi termodifikasi
Ancaman & kontrol:
- Kasir me-refund transaksi outlet lain (E, BOLA) → cek kepemilikan outlet di server
- Jumlah refund diubah di request (T) → jumlah dihitung server dari transaksi asli
- Refund berulang dengan retry (T) → idempotency key + status transaksi
- Kasir menyangkal melakukan refund (R) → audit log: siapa, kapan, perangkat, alasan
- Refund besar tanpa persetujuan → separation of duties: manajer approve di atas batas tertentu
```

### Keamanan dalam SDLC

| Tahap | Aktivitas |
| --- | --- |
| Desain | Threat modeling, kebutuhan keamanan (MASVS/ASVS) |
| Kode | Secure coding, review, lint/SAST |
| Build | Dependency scanning, secret scanning, build reproducible |
| Test | Test otorisasi negatif, DAST, pentest berkala |
| Rilis | Konfigurasi aman, obfuscation, signing |
| Operasi | Monitoring, alert anomali, patch, respons insiden |

### Batas kepercayaan aplikasi mobile

```text
[Perangkat pengguna: TIDAK tepercaya] ── TLS ──> [API: penegak aturan] ──> [DB, layanan internal]
Apa pun di perangkat (kode, secret, logika harga, flag "isPremium") bisa dibaca dan diubah oleh penyerang
yang mengendalikan perangkatnya. Aplikasi melindungi PENGGUNA dari pihak lain. Server melindungi SISTEM dari pengguna.
```

## Best Practices

- **Threat modeling ringan** untuk setiap fitur yang menyentuh uang, data pribadi, atau izin.
- **Server menegakkan semua aturan penting**.
- **Least privilege** di semua lapisan (peran, token scope, akun database, IAM cloud).
- **Lapisan kontrol berganda**, bukan satu kontrol "sakti".
- **Gunakan standar**: OWASP Top 10, API Security Top 10, MASVS, ASVS.
- **Rencanakan respons insiden** sebelum terjadi.

## Anti-Patterns

- *Security through obscurity* sebagai satu-satunya pertahanan (mis. endpoint "tersembunyi").
- Mengandalkan validasi di aplikasi mobile saja.
- Akun database aplikasi dengan hak superuser.
- "Nanti saja keamanannya setelah fitur jadi."
- Fail open: bila layanan otorisasi down, akses diizinkan.

## Performance Considerations

Kontrol keamanan ada biayanya (hashing, enkripsi, pemeriksaan otorisasi), tetapi biasanya kecil dibanding I/O. Jangan
menonaktifkan kontrol demi performa. Optimalkan implementasinya (cache keputusan otorisasi kasar, index untuk filter
kepemilikan).

## Security Considerations

Prioritaskan risiko berdasarkan dampak dan kemungkinan: kebocoran data massal dan pengambilalihan akun jauh lebih penting
daripada temuan kosmetik. Dokumentasikan risiko yang diterima (dengan tanggal tinjau ulang) agar keputusan dapat
dipertanggungjawabkan.

## Real-World Use Cases

- Review desain fitur pembayaran QRIS dengan STRIDE sebelum implementasi.
- Pentest tahunan + checklist MASVS sebelum rilis aplikasi finansial.

## Interview Questions

1. Apa itu CIA triad?
2. Apa itu threat modeling dan bagaimana Anda melakukannya?
3. Jelaskan defense in depth dan least privilege dengan contoh.
4. Mengapa "never trust the client" penting untuk aplikasi mobile?

## Sample Answers

1. Confidentiality (data hanya dibaca yang berwenang), Integrity (data tidak diubah tanpa izin), dan Availability (layanan tersedia saat dibutuhkan), sebagai tiga tujuan dasar keamanan informasi.
2. Proses terstruktur untuk menemukan ancaman sejak desain: gambar alur data dan batas kepercayaan, identifikasi ancaman (misalnya dengan STRIDE), tentukan kontrol dan prioritas, lalu verifikasi.
3. Defense in depth: token berumur pendek, TLS, otorisasi server, dan audit log sekaligus, sehingga satu kontrol yang gagal tidak membuka sistem. Least privilege: kasir hanya bisa membuat order di outletnya, dan akun DB aplikasi tidak bisa DROP tabel.
4. Penyerang dapat memodifikasi aplikasi, mem-bypass validasi UI, dan memanggil API langsung dengan data apa pun. Semua aturan bisnis dan otorisasi harus ditegakkan di server.

## Practical Exercises

1. Buat threat model STRIDE untuk fitur login dan checkout aplikasi Anda.
2. Audit hak akses akun database dan IAM cloud proyek Anda.
3. Petakan batas kepercayaan aplikasi Anda dalam satu diagram.

## Quick Reference

```text
CIA: confidentiality · integrity · availability (+ authenticity, non-repudiation)
Defense in depth · least privilege · secure by default · fail securely · never trust the client · zero trust
STRIDE: spoofing · tampering · repudiation · info disclosure · DoS · elevation of privilege
Threat model: apa dibangun → apa bisa salah → kontrol → verifikasi
Standar: OWASP Top 10, API Top 10, MASVS, ASVS
```

## Related Topics

- [OWASP Top 10](/security/owasp-top-10/)
- [Mobile Application Security](/security/mobile-app-security/)
- [Secure Coding Practices](/security/secure-coding/)
