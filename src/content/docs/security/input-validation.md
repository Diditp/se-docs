---
title: "Input Validation & Sanitization"
description: "Validasi dan sanitasi input untuk backend dan mobile: semua sumber input yang tidak tepercaya, allowlist vs denylist, validasi sintaksis & semantik, kanonikalisasi, encoding output sesuai konteks, sanitasi HTML, validasi file upload, deep link & platform channel di Flutter, batas ukuran, dan kesalahan umum seperti regex DoS."
level: beginner
status: complete
updated: 2026-11-13
tags: [security, validation, sanitization, input, deep-link, file-upload]
---

## Overview

**Validasi input** memastikan data yang masuk sesuai yang diharapkan sebelum diproses. **Sanitasi/encoding** memastikan
data aman ketika digunakan di konteks tertentu (HTML, SQL, shell, URL). Keduanya berbeda: validasi menolak data yang
salah, encoding menetralkan data saat ditampilkan atau dipakai.

## Why It Matters

Sebagian besar kerentanan klasik (SQL injection, XSS, path traversal, command injection, mass assignment) berawal dari
input yang dipercaya begitu saja. Di aplikasi mobile, input tidak hanya dari form, tetapi juga deep link, notifikasi
push, QR code, file, clipboard, dan platform channel.

## Core Concepts

| Sumber input tak tepercaya | Contoh |
| --- | --- |
| Request HTTP | Body, query, path, header, cookie |
| Mobile | Deep link/app link, payload push, hasil scan QR/barcode, file yang dipilih, clipboard, intent dari app lain |
| Pihak ketiga | Respons API mitra, webhook |
| Data tersimpan | Data lama di DB yang dulu masuk tanpa validasi (second-order injection) |

| Pendekatan | Penjelasan |
| --- | --- |
| Allowlist | Hanya izinkan yang diketahui benar (tipe, format, enum, rentang). **Utamakan** |
| Denylist | Tolak pola berbahaya yang diketahui. Mudah dilewati, jangan diandalkan |
| Sintaksis | Format benar (UUID, email, tanggal ISO) |
| Semantik | Masuk akal secara bisnis (tanggal akhir ≥ awal, qty ≤ stok, outlet milik user) |
| Kanonikalisasi | Normalisasi sebelum validasi (Unicode NFC, decode URL, path absolut) |

## How It Works

```text
Input → batas ukuran → parse (JSON/form) → kanonikalisasi → validasi sintaksis (skema)
→ validasi semantik (aturan bisnis, otorisasi) → proses dengan API aman (parameterized query, tanpa shell)
→ output di-encode sesuai konteks (HTML, URL, JSON)
```

## Implementation

### Server: skema allowlist

```ts
const CreateCustomer = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().regex(/^\+?62\d{8,13}$/),                    // format jelas
  email: z.string().email().max(254).optional(),
  birthDate: z.string().date().optional(),                       // YYYY-MM-DD
  tier: z.enum(['regular', 'silver', 'gold']).default('regular'),
}).strict();                                                     // tolak field yang tidak dikenal
```

### Validasi semantik

```ts
if (input.endDate < input.startDate) throw new ValidationError('Rentang tanggal tidak valid');
if (differenceInDays(input.endDate, input.startDate) > 366) throw new ValidationError('Maksimal 1 tahun');
await authz.requireOutletMember(user.id, input.outletId);         // nilai valid ≠ boleh diakses
```

### Encoding output sesuai konteks

| Konteks | Lindungi dengan |
| --- | --- |
| SQL | Parameterized query (bukan escape manual) |
| HTML | Template engine dengan auto-escape. Sanitizer (DOMPurify) bila HTML kaya memang diizinkan |
| URL | `encodeURIComponent` untuk parameter |
| Shell | Hindari shell. Gunakan `execFile` dengan argumen array |
| Path file | Nama acak dari server, `path.resolve` + pastikan tetap di direktori dasar |
| Log | Hapus newline/karakter kontrol (log injection), redaksi data sensitif |

### Path traversal

```ts
const base = path.resolve('/srv/receipts');
const target = path.resolve(base, req.params.file);
if (!target.startsWith(base + path.sep)) throw new ForbiddenError();      // tolak ../../etc/passwd
// Lebih baik: jangan pakai nama file dari pengguna sama sekali. Cari berdasarkan ID di DB
```

### File upload

```text
- Batas ukuran di server (dan di proxy)
- Cek tipe dari isi file (magic bytes), bukan hanya ekstensi/Content-Type
- Nama file acak, simpan di object storage, bukan folder web
- Re-encode gambar (menghapus payload tersembunyi & metadata EXIF)
- Scan malware untuk file yang dibagikan ke pengguna lain
```

### Flutter: deep link, QR, dan platform channel

```dart
// Deep link: myapp://orders/<id>?ref=...
Uri? parseOrderLink(Uri uri) {
  if (uri.scheme != 'myapp' && uri.host != 'app.example.com') return null;   // asal yang diharapkan
  final segments = uri.pathSegments;
  if (segments.length != 2 || segments[0] != 'orders') return null;
  final id = segments[1];
  if (!RegExp(r'^[0-9a-f-]{36}$').hasMatch(id)) return null;                  // UUID saja
  return uri;
}
// Jangan pernah: membuka URL arbitrer dari deep link di WebView dengan JavaScript bridge,
// atau menjalankan aksi sensitif (transfer, hapus) langsung dari link tanpa konfirmasi & autentikasi
```

```dart
// QR pembayaran: validasi format & checksum, tampilkan detail ke pengguna sebelum konfirmasi
// Platform channel: validasi tipe argumen di sisi native & Dart, jangan percaya data dari plugin/app lain
```

Validasi di aplikasi tetap penting untuk **UX** (umpan balik cepat), tetapi server **selalu** memvalidasi ulang.

### Regex DoS (ReDoS)

```text
Regex dengan kuantifier bersarang, mis. /^(a+)+$/, dapat berjalan eksponensial pada input tertentu → CPU 100%
Gunakan pola sederhana, batasi panjang input SEBELUM regex, dan library validasi yang teruji
```

## Best Practices

- **Allowlist dengan skema** untuk semua input di boundary.
- **Batas panjang & ukuran** di setiap field, array, dan body.
- **Validasi semantik + otorisasi**, bukan hanya format.
- **Encoding sesuai konteks** saat output, terpisah dari validasi.
- **Perlakukan semua sumber mobile sebagai input** (deep link, push, QR, file).
- **Pesan validasi yang membantu** tanpa membocorkan detail internal.

## Anti-Patterns

- Validasi hanya di aplikasi mobile/frontend.
- Denylist seperti menghapus kata `<script>` atau `DROP`.
- "Sanitasi" input dengan menghapus karakter kutip, lalu menyusun SQL dengan string.
- Memakai nama file dari pengguna untuk path penyimpanan.
- Regex kompleks tanpa batas panjang input.

## Performance Considerations

Validasi skema murah. Tolak input buruk sedini mungkin (sebelum query DB atau panggilan eksternal). Batas ukuran mencegah
parsing JSON raksasa yang memakan memori.

## Security Considerations

Validasi input adalah satu lapisan, bukan pengganti parameterized query, encoding output, atau otorisasi. Data yang
"valid" tetap bisa berbahaya di konteks lain (nama pelanggan `<img onerror=...>` valid sebagai string, tetapi harus
di-escape di HTML struk/web dashboard).

## Real-World Use Cases

- Nama pelanggan dari aplikasi kasir ditampilkan di dashboard web owner, di-escape otomatis oleh template.
- Deep link promo hanya menerima kode promo alfanumerik 6–12 karakter dan membuka layar promo, bukan URL bebas.

## Interview Questions

1. Apa beda validasi dan sanitasi/encoding?
2. Mengapa allowlist lebih baik dari denylist?
3. Sumber input apa saja di aplikasi mobile yang harus divalidasi?
4. Bagaimana mengamankan fitur upload file?
5. Mengapa validasi di aplikasi mobile saja tidak cukup?

## Sample Answers

1. Validasi memeriksa dan menolak input yang tidak sesuai harapan. Encoding/sanitasi menetralkan data saat dipakai di konteks tertentu (HTML, SQL, URL) agar tidak ditafsirkan sebagai kode.
2. Allowlist hanya menerima bentuk yang diketahui benar sehingga variasi serangan baru otomatis tertolak. Denylist harus mengenal semua bentuk serangan dan mudah dilewati dengan encoding atau variasi.
3. Form, deep link/app link, payload push notification, hasil scan QR/barcode, file yang dipilih atau diterima, clipboard, intent dari aplikasi lain, platform channel, dan respons API.
4. Batas ukuran, verifikasi tipe dari isi file, nama acak, simpan di object storage terpisah, re-encode gambar, hapus metadata, scan malware, dan akses dengan URL bertanda tangan.
5. Penyerang dapat memanggil API langsung atau memodifikasi aplikasi sehingga validasi klien dilewati. Validasi klien hanya untuk UX.

## Practical Exercises

1. Tambahkan skema strict dengan batas panjang ke semua endpoint Anda.
2. Tulis parser deep link yang menolak semua bentuk yang tidak diharapkan, lalu test-nya.
3. Uji upload dengan file `.jpg` yang sebenarnya berisi skrip.

## Quick Reference

```text
Semua input tak tepercaya: HTTP · deep link · push · QR · file · clipboard · intent · channel · API mitra · data lama
Batas ukuran → parse → kanonikalisasi → skema allowlist (.strict) → aturan bisnis + otorisasi
Output: SQL parameterized · HTML auto-escape/DOMPurify · URL encode · execFile · path di base dir · log tanpa newline
File: ukuran, magic bytes, nama acak, object storage, re-encode · ReDoS: batasi panjang dulu
```

## Related Topics

- [SQL Injection](/security/sql-injection/)
- [XSS & CSRF](/security/xss-csrf/)
- [Validation & Error Handling (Backend)](/backend/validation-error-handling/)
