---
title: "Secure Coding Practices"
description: "Kebiasaan menulis kode yang aman sehari-hari untuk Flutter/Dart, Kotlin, dan Node.js/TypeScript: checklist secure coding, penanganan error & logging yang aman, kriptografi dengan library standar, randomness yang aman, deserialisasi, konkurensi & race condition (TOCTOU), konfigurasi aman, code review keamanan, SAST/linters, dan peran AI coding agent."
level: intermediate
status: complete
updated: 2026-11-13
tags: [security, secure-coding, code-review, sast, flutter, nodejs]
---

## Overview

**Secure coding** adalah kumpulan kebiasaan yang membuat kode tidak mudah disalahgunakan, sehingga keamanan tidak
hanya bergantung pada audit di akhir. Halaman ini merangkum praktik lintas bahasa dan menautkan ke topik detail
(validasi, SQL injection, token, secret).

## Why It Matters

Kerentanan sering berasal dari kesalahan kecil yang berulang: error yang membocorkan detail, `Math.random()` untuk
token, cek saldo lalu update terpisah (race condition), atau log yang berisi password. Kebiasaan yang benar mencegah
kelas kerentanan sekaligus.

## Core Concepts

### Checklist secure coding

| Area | Praktik |
| --- | --- |
| Input | Validasi skema allowlist di boundary ([Input Validation](/security/input-validation/)) |
| Output | Encoding sesuai konteks, parameterized query |
| Autentikasi & otorisasi | Di server, per request & objek, deny by default |
| Error | Pesan generik ke klien, detail di log, fail securely |
| Logging | Terstruktur, tanpa secret/PII, dengan request ID |
| Kriptografi | Library standar, algoritma modern, tanpa implementasi sendiri |
| Randomness | CSPRNG untuk token/ID/OTP |
| Konkurensi | Operasi atomik/transaksi untuk cek-lalu-ubah |
| Dependensi | Minimal, ter-update, di-scan |
| Konfigurasi | Aman secara default, debug mati di production |

## How It Works

```text
Tulis kode → lint/SAST lokal → test (termasuk kasus negatif keamanan) → PR + review keamanan
→ CI: SAST, dependency & secret scanning → deploy dengan konfigurasi aman → monitoring
```

## Implementation

### Error handling yang aman

```ts
// ❌ membocorkan struktur DB & stack trace
catch (e) { reply.code(500).send({ error: e.message, stack: e.stack }); }

// ✅ generik ke klien, detail di log dengan request ID
catch (e) {
  req.log.error({ err: e }, 'create order failed');
  reply.code(500).send({ code: 'INTERNAL', requestId: req.id });
}
```

Fail securely: bila layanan otorisasi atau verifikasi token gagal, **tolak** request, jangan izinkan.

### Randomness yang aman

```ts
import { randomInt, randomBytes, randomUUID } from 'node:crypto';
const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');   // ✅ CSPRNG
const resetToken = randomBytes(32).toString('base64url');           // ✅
// ❌ Math.random() untuk OTP, token, password sementara
```

```dart
import 'dart:math';
final rng = Random.secure();                                         // ✅ untuk nilai keamanan di Dart
```

```kotlin
val bytes = ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }
```

### Perbandingan constant-time

```ts
import { timingSafeEqual } from 'node:crypto';
const a = Buffer.from(expectedSignature, 'hex');
const b = Buffer.from(receivedSignature, 'hex');
const valid = a.length === b.length && timingSafeEqual(a, b);       // verifikasi signature webhook
```

### Race condition (TOCTOU): cek lalu ubah

```sql
-- ❌ SELECT stock → if (stock >= qty) → UPDATE stock = stock - qty  (dua request bersamaan lolos)
-- ✅ atomik dalam satu pernyataan
UPDATE products SET stock = stock - $2
WHERE id = $1 AND stock >= $2
RETURNING stock;          -- 0 baris → stok tidak cukup
```

Pola yang sama berlaku untuk saldo, kuota voucher, dan penggunaan kode sekali pakai (tandai "used" secara atomik).

### Deserialisasi & parsing

```text
- Parse JSON ke skema bertipe, jangan menggabungkan objek mentah ke objek konfigurasi (prototype pollution di JS)
- Jangan pakai eval/new Function, atau deserialisasi format yang dapat mengeksekusi kode
- Batasi ukuran & kedalaman input (JSON, XML, YAML, gambar)
- XML: nonaktifkan external entities (XXE)
```

```ts
// Prototype pollution: gabungkan hanya field yang diizinkan
const safe = UpdateSettings.parse(req.body);        // skema strict, bukan Object.assign(settings, req.body)
```

### Perintah sistem & file

```ts
import { execFile } from 'node:child_process';
execFile('convert', [inputPath, '-resize', '800x800', outputPath]);   // ✅ argumen array, tanpa shell
// ❌ exec(`convert ${req.body.file} ...`)
```

### Kotlin/Android & Flutter

```text
Android:
- Komponen (Activity/Service/Receiver/Provider) android:exported="false" kecuali memang dibutuhkan
- PendingIntent dengan FLAG_IMMUTABLE. Intent eksplisit untuk komponen internal
- Jangan log data sensitif (Log.d tertinggal di release). Gunakan Timber dengan tree release yang aman
- WebView: JavaScript & file access hanya bila perlu
Flutter:
- kDebugMode/kReleaseMode untuk memisahkan fitur debug (jangan ada endpoint/menu debug di release)
- Validasi data dari deep link, push, platform channel
- debugPrint tidak untuk data sensitif. Logger dengan redaksi
```

### Code review keamanan (pertanyaan cepat)

```text
□ Input dari mana dan divalidasi di mana?
□ Siapa yang boleh melakukan ini, dan apakah objeknya milik mereka?
□ Apa yang terjadi bila request ini diulang atau dikirim bersamaan?
□ Apa yang dicatat di log, dan apakah ada secret/PII?
□ Apa yang dilihat klien saat error?
□ Ada dependensi baru? Mengapa?
□ Ada secret/URL internal yang tertanam?
```

### SAST & linters

```text
- ESLint (plugin security), TypeScript strict
- Semgrep dengan aturan OWASP untuk JS/TS, Kotlin, Dart (aturan komunitas/kustom)
- Android Lint (security checks), detekt
- dart analyze dengan aturan ketat (mis. avoid_print)
Jalankan di CI dan tangani temuan seperti bug
```

### AI coding agent

Kode dari AI agent diperlakukan sama dengan kode manusia: direview, dites, dan dipindai. Aturan di
`docs/agents/security/AGENTS.md` membantu agent menghindari pola tidak aman, tetapi tidak menggantikan review.

## Best Practices

- **Gunakan API aman secara default** (parameterized query, auto-escape, execFile).
- **CSPRNG** untuk semua nilai keamanan.
- **Operasi atomik** untuk cek-lalu-ubah.
- **Error generik, log terstruktur tanpa secret**.
- **Review keamanan** dengan checklist singkat di setiap PR.
- **SAST & scanning otomatis** di CI.

## Anti-Patterns

- Kriptografi buatan sendiri atau mode lemah.
- `Math.random()`/`Random()` untuk token.
- Kode debug, endpoint uji, atau bypass login yang ikut ke production.
- `catch` yang menelan error lalu melanjutkan seolah sukses.
- Mengandalkan "tidak ada yang tahu endpoint ini".

## Performance Considerations

Praktik aman jarang mahal: CSPRNG, perbandingan constant-time, dan validasi berbiaya kecil. Operasi atomik di database
justru mengurangi round-trip dibanding cek-lalu-ubah terpisah.

## Security Considerations

Secure coding adalah lapisan pencegahan. Lengkapi dengan threat modeling saat desain, pengujian keamanan (DAST, pentest),
monitoring, dan respons insiden. Ukur dengan menurunnya temuan berulang dari review dan scanning.

## Real-World Use Cases

- Pengurangan stok atomik mencegah penjualan melebihi stok saat dua kasir menjual item terakhir bersamaan.
- Semgrep di CI menolak PR yang menyusun SQL dengan template literal.

## Interview Questions

1. Sebutkan praktik secure coding yang Anda terapkan sehari-hari.
2. Mengapa `Math.random()` tidak boleh dipakai untuk OTP?
3. Apa itu race condition TOCTOU dan contoh pencegahannya?
4. Bagaimana menangani error tanpa membocorkan informasi?
5. Apa yang Anda periksa saat code review dari sisi keamanan?

## Sample Answers

1. Validasi skema di boundary, parameterized query, otorisasi per objek di server, error generik dengan log terstruktur, CSPRNG untuk token, operasi atomik untuk saldo/stok, tanpa secret di kode, dan dependensi minimal yang di-scan.
2. `Math.random()` bukan generator acak kriptografis sehingga nilainya dapat diprediksi. Gunakan `crypto.randomInt`/`randomBytes` (Node), `Random.secure()` (Dart), atau `SecureRandom` (Kotlin).
3. Time-of-check to time-of-use: kondisi diperiksa lalu diubah dalam langkah terpisah sehingga request bersamaan bisa lolos. Cegah dengan update atomik bersyarat (`UPDATE ... WHERE stock >= qty`), constraint, atau lock dalam transaksi.
4. Kembalikan pesan generik dan kode error stabil ke klien, catat detail lengkap di log dengan request ID, dan gagal secara aman (menolak akses saat ragu).
5. Sumber dan validasi input, otorisasi objek, idempotensi dan konkurensi, isi log, respons error, dependensi baru, secret tertanam, serta konfigurasi debug.

## Practical Exercises

1. Cari semua penggunaan `Math.random()`/`Random()` untuk nilai keamanan di kode Anda dan ganti.
2. Temukan satu alur cek-lalu-ubah dan ubah menjadi operasi atomik dengan test konkurensi.
3. Pasang Semgrep di CI dengan aturan keamanan dasar.

## Quick Reference

```text
Validasi masuk · encode keluar · authZ server · error generik · log aman · CSPRNG · constant-time compare
Atomik: UPDATE ... WHERE stock >= qty RETURNING · tandai kode sekali pakai secara atomik
Tanpa eval/shell (execFile) · skema strict (prototype pollution) · batas ukuran input · XXE off
Android: exported=false, FLAG_IMMUTABLE · Flutter: kDebugMode, validasi deep link/channel
Review checklist · ESLint/Semgrep/Android Lint/dart analyze di CI · kode AI tetap direview
```

## Related Topics

- [Security Fundamentals](/security/security-fundamentals/)
- [Input Validation & Sanitization](/security/input-validation/)
- [Dependency Vulnerability Scanning](/security/dependency-scanning/)
