---
title: "Sensitive Data Protection & Encryption"
description: "Melindungi data sensitif dari pengumpulan sampai penghapusan: klasifikasi data, minimisasi, enkripsi in transit & at rest, enkripsi di level aplikasi (field-level, envelope encryption dengan KMS), hashing untuk pencarian, masking & tokenisasi, enkripsi database lokal mobile (SQLCipher), kebocoran di mobile (screenshot, clipboard, backup, log, cache), retensi & penghapusan, serta prinsip UU PDP."
level: advanced
status: complete
version: "AES-256-GCM · KMS (AWS/GCP) · SQLCipher. Regulasi: UU No. 27/2022 (PDP). Bukan nasihat hukum"
updated: 2026-11-13
tags: [security, encryption, privacy, kms, pdp, data-protection]
---

## Overview

Data sensitif mencakup data pribadi (nama, nomor HP, alamat, NIK, lokasi), data finansial, kredensial, dan data bisnis
rahasia. Perlindungan yang baik mengikuti **siklus hidup data**: kumpulkan seminimal mungkin, lindungi saat berpindah dan
disimpan, batasi akses, dan hapus ketika tidak lagi diperlukan.

## Why It Matters

Indonesia memiliki UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) yang mengatur dasar pemrosesan, hak
subjek data, keamanan, dan kewajiban pemberitahuan kegagalan pelindungan. Secara teknis, enkripsi dan minimisasi data
mengurangi dampak bila terjadi kebocoran. (Untuk kewajiban hukum spesifik, konsultasikan dengan tim legal.)

## Core Concepts

### Klasifikasi data (contoh)

| Kelas | Contoh | Perlakuan |
| --- | --- | --- |
| Publik | Nama produk, harga katalog | Bebas |
| Internal | Laporan penjualan outlet | Akses terbatas peran |
| Rahasia | Nomor HP, alamat, email | Enkripsi at rest, masking di UI/log |
| Sangat rahasia | NIK, foto KTP, data kartu, kredensial, lokasi riwayat | Enkripsi level aplikasi, akses minimal, audit, retensi pendek |

| Konsep | Penjelasan |
| --- | --- |
| Encryption in transit | TLS antara klien–server dan antar layanan |
| Encryption at rest | Disk/database/backup terenkripsi (biasanya fitur cloud) |
| Application-level / field-level | Field tertentu dienkripsi aplikasi sebelum disimpan, sehingga DBA/backup tidak melihat nilai asli |
| Envelope encryption | Data dienkripsi dengan data key (DEK). DEK dienkripsi oleh key encryption key (KEK) di KMS |
| Tokenisasi | Nilai asli diganti token, nilai asli di vault terpisah (umum untuk data kartu) |
| Masking | Menampilkan sebagian (`0812****5678`) |
| Blind index | Hash ber-key (HMAC) untuk mencari nilai terenkripsi dengan kesetaraan |

## How It Works

```text
Envelope encryption:
Simpan: minta/generate DEK → AES-256-GCM(data, DEK, nonce acak) → simpan {ciphertext, nonce, encryptedDEK, keyVersion}
Baca:   KMS.decrypt(encryptedDEK) → DEK → AES-GCM decrypt → data
Rotasi KEK di KMS tidak perlu mengenkripsi ulang semua data, cukup DEK-nya
```

## Implementation

### Field-level encryption (Node.js, AES-256-GCM)

```ts
import { randomBytes, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';

// DEK didapat dari KMS (didekripsi saat startup/di-cache singkat), BUKAN hardcode
export function encryptField(plain: string, dek: Buffer, aad: string) {
  const iv = randomBytes(12);                                   // nonce unik per enkripsi
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  cipher.setAAD(Buffer.from(aad));                              // ikat ke konteks, mis. "customers.nik:<id>"
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptField(blob: string, dek: Buffer, aad: string) {
  const raw = Buffer.from(blob, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', dek, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

// Mencari pelanggan berdasarkan NIK tanpa menyimpan NIK asli dalam bentuk dapat dicari
export const blindIndex = (value: string, indexKey: Buffer) =>
  createHmac('sha256', indexKey).update(value.trim()).digest('hex');
```

Gunakan library/fitur teruji bila tersedia (mis. AWS Encryption SDK, Google Tink) agar detail seperti nonce dan rotasi
kunci tidak salah.

### Minimisasi & masking

```text
- Perlu NIK atau cukup verifikasi umur? Perlu tanggal lahir lengkap atau tahun saja?
- Simpan foto KTP di bucket terpisah, terenkripsi, akses via signed URL singkat, hapus setelah verifikasi bila tidak wajib disimpan
- API mengembalikan data ter-masking secara default. Nilai lengkap hanya di endpoint khusus dengan izin & audit
- Lingkungan dev/staging memakai data sintetis atau yang dianonimkan
```

### Data kartu pembayaran

Jangan menyimpan atau memproses nomor kartu sendiri kecuali benar-benar siap memenuhi PCI DSS. Gunakan payment gateway
dengan tokenisasi atau halaman/SDK hosted, sehingga data kartu tidak melewati server Anda.

### Mobile: titik kebocoran data

| Titik | Mitigasi |
| --- | --- |
| Database lokal | SQLCipher (`sqlcipher_flutter_libs` + Drift / SQLCipher for Room) dengan kunci dari Keystore/Keychain |
| SharedPreferences/file | Jangan untuk data sensitif |
| Screenshot & recent apps | Android `FLAG_SECURE` di layar sensitif. iOS: tutupi konten saat `inactive` |
| Clipboard | Hindari menyalin data sensitif. Bila perlu, tandai sensitif / bersihkan |
| Keyboard | Matikan saran/autocorrect untuk field sensitif |
| Log & crash report | Redaksi PII & token |
| Backup | Kecualikan data sensitif (`android:dataExtractionRules`/`fullBackupContent`, atribut iOS "exclude from backup") |
| Cache HTTP & gambar | Jangan cache respons/gambar sensitif di cache publik |
| Notifikasi | Jangan tampilkan detail sensitif di layar kunci |

```kotlin
// Android: cegah screenshot pada Activity yang menampilkan data sensitif
window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
```

### Retensi & penghapusan

```text
- Tetapkan masa simpan per jenis data (mis. lokasi kurir: 30 hari, foto KTP: setelah verifikasi)
- Job terjadwal menghapus/anonimkan data kedaluwarsa, termasuk di backup sesuai siklus backup
- Fitur hapus akun: hapus/anonimkan data pribadi, pertahankan data yang wajib disimpan (mis. transaksi untuk pajak) secara terpisah
- Crypto-shredding: hapus kunci per pengguna/tenant sehingga data terenkripsi tidak dapat dibaca lagi
```

## Best Practices

- **Klasifikasikan data** dan tetapkan kontrol per kelas.
- **Kumpulkan seminimal mungkin** dan hapus sesuai retensi.
- **TLS + enkripsi at rest** sebagai dasar. **Field-level/envelope encryption** untuk data sangat rahasia.
- **Kunci di KMS**, bukan di kode/konfigurasi. Rotasi terjadwal.
- **Masking default** di API, UI, dan log.
- **Tutup titik kebocoran mobile** (DB lokal, screenshot, backup, log, clipboard).

## Anti-Patterns

- Enkripsi dengan kunci yang disimpan di repo atau di samping data.
- Algoritma/mode lemah (AES-ECB, nonce GCM dipakai ulang, enkripsi buatan sendiri).
- Data production disalin ke laptop developer atau staging.
- Menyimpan foto KTP selamanya "untuk jaga-jaga".
- Menganggap "database sudah terenkripsi at rest" berarti aman dari akses aplikasi yang bocor.

## Performance Considerations

AES-GCM sangat cepat dengan dukungan hardware. Yang mahal adalah panggilan KMS, jadi cache DEK terdekripsi di memori
dengan masa hidup singkat. Field terenkripsi tidak bisa di-index atau difilter rentang. Gunakan blind index untuk
pencarian kesetaraan dan rancang query dengan mempertimbangkannya.

## Security Considerations

Batasi siapa yang dapat memanggil KMS decrypt (IAM per layanan), catat akses data sangat rahasia di audit log, dan
siapkan prosedur respons kebocoran (deteksi, penahanan, notifikasi sesuai regulasi). Enkripsi tidak melindungi bila
aplikasi yang memegang kunci berhasil dibobol, sehingga tetap perlukan otorisasi dan least privilege.

## Real-World Use Cases

- Verifikasi merchant: foto KTP di bucket terenkripsi, NIK dienkripsi field-level dengan blind index, akses hanya tim verifikasi dengan audit.
- Aplikasi kasir: DB lokal SQLCipher, layar laporan dengan `FLAG_SECURE`, data dihapus saat logout perangkat dicabut.

## Interview Questions

1. Apa beda encryption in transit, at rest, dan field-level?
2. Apa itu envelope encryption dan manfaatnya?
3. Bagaimana mencari data yang dienkripsi?
4. Di mana saja data sensitif dapat bocor di aplikasi mobile?
5. Bagaimana menerapkan prinsip minimisasi data?

## Sample Answers

1. In transit melindungi data saat berpindah (TLS). At rest melindungi media penyimpanan (disk, backup) dari pencurian fisik. Field-level mengenkripsi nilai tertentu di aplikasi sehingga tetap terlindungi walau database atau backup dapat dibaca.
2. Data dienkripsi dengan data key, dan data key dienkripsi dengan master key di KMS. Master key tidak pernah keluar dari KMS, rotasi lebih mudah, dan akses ke kunci dapat diaudit serta dibatasi.
3. Gunakan blind index, yaitu HMAC ber-key dari nilai yang dinormalisasi, disimpan di kolom terpisah dan di-index untuk pencarian kesetaraan. Pencarian rentang/teks bebas umumnya tidak didukung.
4. Database lokal tanpa enkripsi, SharedPreferences, log dan crash report, screenshot/recent apps, clipboard, keyboard, backup, cache HTTP/gambar, dan notifikasi di layar kunci.
5. Hanya mengumpulkan data yang benar-benar dibutuhkan untuk tujuan jelas, menyimpan dalam bentuk paling ringkas (mis. tahun lahir), membatasi masa simpan, dan menghapus atau menganonimkan setelah tidak diperlukan.

## Practical Exercises

1. Buat tabel klasifikasi data aplikasi Anda beserta retensi dan kontrolnya.
2. Implementasikan field-level encryption + blind index untuk satu field sensitif.
3. Audit aplikasi mobile Anda terhadap tabel titik kebocoran di atas.

## Quick Reference

```text
Klasifikasi → minimisasi → TLS + at rest → field-level/envelope (KMS) → masking → audit → retensi & hapus
AES-256-GCM, nonce unik, AAD · DEK di-cache singkat · blind index (HMAC) untuk pencarian
Kartu → tokenisasi payment gateway · staging tanpa data asli
Mobile: SQLCipher + kunci Keystore/Keychain · FLAG_SECURE · backup exclude · log redaksi · clipboard · notifikasi
UU PDP: dasar pemrosesan, hak subjek data, keamanan, pemberitahuan insiden (konsultasi legal)
```

## Related Topics

- [Secure Token Storage](/security/secure-token-storage/)
- [Environment Secrets](/security/environment-secrets/)
- [Database Security](/database/database-security/)
