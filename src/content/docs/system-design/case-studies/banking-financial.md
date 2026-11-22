---
title: "Banking / Financial Application"
description: "Studi kasus desain aplikasi keuangan (mobile banking / e-wallet): requirement & regulasi, double-entry ledger, transfer idempoten, saga dengan sistem eksternal, konsistensi kuat vs eventual, otentikasi kuat & otorisasi transaksi (PIN, biometrik, device binding), anti-fraud, rekonsiliasi, audit, ketersediaan tinggi, serta keamanan aplikasi mobile."
level: advanced
status: complete
version: "Konsep umum. Persyaratan regulasi (mis. OJK, Bank Indonesia, PCI DSS) harus dicek ke sumber resmi"
updated: 2026-11-13
tags: [system-design, case-study, fintech, ledger, payments, security]
---

## Overview

Desain aplikasi keuangan seperti mobile banking atau dompet digital: pengguna melihat saldo dan riwayat, mentransfer
dana, membayar tagihan/QRIS, dan top-up. Ciri utamanya: **uang tidak boleh hilang atau tercipta**, setiap transaksi
dapat diaudit, dan keamanan menjadi prioritas utama.

## Why It Matters

Fintech adalah salah satu pemberi kerja mobile developer terbesar. Soal desain sistem keuangan menguji konsistensi,
idempotensi, keamanan berlapis, dan kepatuhan. Kesalahan kecil (double posting, race condition saldo) berdampak
finansial langsung.

## Core Concepts

| Fungsional | Non-fungsional |
| --- | --- |
| Registrasi & KYC (verifikasi identitas) | Konsistensi kuat untuk saldo & ledger |
| Saldo & riwayat transaksi | Tidak ada transaksi ganda (idempoten) |
| Transfer internal & antarbank | Ketersediaan tinggi, RPO ≈ 0 untuk ledger |
| Pembayaran QRIS/tagihan, top-up | Audit lengkap & tidak dapat diubah |
| Notifikasi transaksi | Keamanan kuat: MFA, device binding, anti-fraud |
| Limit transaksi, blokir kartu/akun | Kepatuhan regulasi & perlindungan data |

| Konsep | Penjelasan |
| --- | --- |
| Double-entry | Setiap transaksi = debit di satu akun dan kredit di akun lain dengan jumlah sama. Total selalu seimbang |
| Ledger immutable | Entri tidak diubah/dihapus. Koreksi dengan entri pembalik (reversal) |
| Saldo | Turunan dari entri ledger (dengan saldo berjalan/snapshot untuk performa) |
| Hold/authorization | Dana ditahan sebelum transaksi final (mis. menunggu konfirmasi bank lain) |
| Rekonsiliasi | Mencocokkan catatan internal dengan bank/switching/gateway |

## How It Works

```text
Mobile app (PIN/biometrik, device binding) → API Gateway (rate limit, WAF) → Auth service (MFA, risk score)
→ Transaction service → Ledger service (PostgreSQL, transaksi ACID, double-entry)
                      → Fraud engine (aturan + skor, sinkron untuk transaksi berisiko)
                      → Connector ke switching/bank lain (saga, idempoten, timeout)
→ outbox → notifikasi, laporan, rekonsiliasi, data warehouse
```

### Data model ledger

```text
accounts(id, owner_id, type: customer|internal|settlement|fee, currency, status)
journal_entries(id, tx_id, created_at, description)        -- satu "kejadian"
postings(id, entry_id, account_id, amount, direction: debit|credit)   -- jumlah debit = jumlah kredit per entry
account_balances(account_id, balance, version, updated_at)            -- proyeksi saldo dengan optimistic lock
transfers(id, idempotency_key UNIQUE, from_account, to_account, amount, status, external_ref, created_at)
```

## Implementation

### 1. Transfer internal (satu database, ACID)

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
-- Kunci saldo dalam urutan ID yang konsisten untuk menghindari deadlock
SELECT account_id, balance FROM account_balances WHERE account_id IN ($from, $to) ORDER BY account_id FOR UPDATE;
-- cek saldo cukup & limit di aplikasi
INSERT INTO journal_entries (id, tx_id, description) VALUES ($entry, $tx, 'Transfer');
INSERT INTO postings (entry_id, account_id, amount, direction) VALUES ($entry, $from, $amt, 'debit'), ($entry, $to, $amt, 'credit');
UPDATE account_balances SET balance = balance - $amt, version = version + 1 WHERE account_id = $from;
UPDATE account_balances SET balance = balance + $amt, version = version + 1 WHERE account_id = $to;
UPDATE transfers SET status = 'completed' WHERE id = $tx;
INSERT INTO outbox (type, payload) VALUES ('transfer.completed', $payload);
COMMIT;
```

Request dari aplikasi membawa `Idempotency-Key`. Retry mengembalikan hasil transfer yang sama.

### 2. Transfer antarbank (saga)

```text
1. Buat transfer PENDING + HOLD dana (posting ke akun hold) dalam transaksi lokal
2. Kirim ke switching/bank tujuan dengan referensi unik (idempoten), timeout jelas
3a. Sukses → finalisasi: hold → akun settlement · status COMPLETED
3b. Gagal pasti → reversal hold → dana kembali · status FAILED
3c. Timeout/tidak pasti → status UNKNOWN → inquiry status berkala → selesaikan sesuai jawaban, JANGAN kirim ulang sebagai transaksi baru
4. Rekonsiliasi harian dengan laporan settlement → selisih ditangani manual dengan jejak audit
```

### 3. Autentikasi & otorisasi transaksi

```text
Login: password/PIN + device binding (kunci di Keystore/Secure Enclave terdaftar ke akun) + biometrik untuk membuka kunci
Transaksi: PIN/biometrik per transaksi yang menandatangani request dengan kunci perangkat (challenge-response)
Risk-based: perangkat baru, lokasi tidak biasa, nominal besar → langkah tambahan (OTP, cooling period)
Sesi singkat, re-auth untuk aksi sensitif (ubah nomor HP, tambah penerima)
```

```text
Device binding (garis besar):
Registrasi: app membuat pasangan kunci di Keystore/Secure Enclave (non-exportable, butuh biometrik) → kirim public key ke server
Transaksi: server mengirim challenge (nonce + detail transaksi) → app menandatangani setelah biometrik → server verifikasi dengan public key
```

### 4. Anti-fraud

```text
Aturan: velocity (jumlah transfer per jam), nominal tidak biasa, penerima baru + nominal besar, perangkat ter-root/emulator
Skor risiko → izinkan / minta verifikasi tambahan / tahan untuk review / tolak
Sinyal perangkat: Play Integrity, App Attest, deteksi root/jailbreak (sebagai sinyal, bukan satu-satunya kontrol)
```

### 5. Aplikasi mobile

```text
- Saldo & riwayat dari server (cache singkat untuk tampilan offline dengan label "terakhir diperbarui")
- Tidak ada transaksi uang offline (memilih consistency)
- FLAG_SECURE pada layar sensitif · tanpa data sensitif di notifikasi layar kunci
- Certificate pinning dengan rencana rotasi · obfuscation · tanpa secret di aplikasi
- Status transaksi tidak pasti ditampilkan jujur ("sedang diproses") dan diperbarui via push/polling
```

## Best Practices

- **Double-entry ledger immutable** sebagai sumber kebenaran.
- **Idempotensi end-to-end** (klien → layanan → sistem eksternal).
- **Status tidak pasti ditangani dengan inquiry**, bukan pengiriman ulang.
- **Rekonsiliasi rutin** dengan pihak eksternal.
- **Autentikasi berlapis & otorisasi transaksi berbasis kunci perangkat**.
- **Audit lengkap** dan pemisahan tugas untuk operasi manual.

## Anti-Patterns

- Kolom `balance` yang di-UPDATE tanpa ledger.
- Menghapus atau mengedit transaksi yang salah.
- Retry transfer antarbank setelah timeout sebagai transaksi baru.
- Uang dalam tipe floating point.
- Mengandalkan deteksi root saja sebagai keamanan.

## Performance Considerations

Ledger membutuhkan konsistensi kuat, sehingga gunakan transaksi singkat, index tepat, dan urutan lock konsisten. Untuk
akun dengan transaksi sangat sering (akun settlement/internal), gunakan teknik seperti sub-akun/bucket atau batching agar
tidak terjadi hot row. Riwayat transaksi dibaca dari read model/replica dengan pagination.

## Security Considerations

Defense in depth: TLS + pinning, device binding, MFA, risk engine, rate limit, enkripsi data sensitif, pemisahan
jaringan, HSM/KMS untuk kunci, audit immutable, monitoring anomali 24/7, dan kepatuhan standar (OWASP MASVS L2,
regulasi otoritas keuangan setempat, PCI DSS bila memproses kartu).

## Real-World Use Cases

- E-wallet: saldo pengguna sebagai akun ledger, top-up via VA bank, pembayaran QRIS, rekonsiliasi harian per mitra.
- Mobile banking: transfer antarbank via switching dengan status UNKNOWN yang diselesaikan oleh inquiry otomatis.

## Interview Questions

1. Mengapa sistem keuangan memakai double-entry ledger?
2. Bagaimana mencegah saldo menjadi negatif saat dua transfer bersamaan?
3. Apa yang dilakukan bila transfer ke bank lain timeout?
4. Bagaimana mengamankan otorisasi transaksi di aplikasi mobile?

## Sample Answers

1. Setiap transaksi tercatat sebagai debit dan kredit yang seimbang sehingga uang tidak hilang atau tercipta, kesalahan mudah terdeteksi, audit lengkap tersedia, dan koreksi dilakukan dengan entri pembalik tanpa mengubah riwayat.
2. Dalam satu transaksi database, kunci baris saldo (`SELECT ... FOR UPDATE` dengan urutan konsisten) atau gunakan update bersyarat/optimistic version, periksa saldo dan limit, lalu catat posting dan perbarui saldo secara atomik.
3. Tandai status UNKNOWN, tahan dana, lakukan inquiry status ke sistem tujuan dengan referensi yang sama, lalu finalisasi atau reversal sesuai hasil, dan cocokkan dalam rekonsiliasi. Jangan mengirim ulang sebagai transaksi baru.
4. Device binding dengan kunci non-exportable di Keystore/Secure Enclave yang membutuhkan biometrik/PIN, challenge-response yang menandatangani detail transaksi, risk-based authentication, sesi singkat, serta perlindungan aplikasi (pinning, obfuscation, integrity check).

## Practical Exercises

1. Implementasikan tabel ledger double-entry dan transfer dengan uji konkurensi.
2. Rancang state machine transfer antarbank termasuk status UNKNOWN.
3. Gambar alur device binding dan otorisasi transaksi.

## Quick Reference

```text
Double-entry immutable (journal + postings) · saldo = proyeksi + optimistic/row lock · reversal untuk koreksi
Idempotency-Key end-to-end · saga: hold → kirim → finalize/reversal · UNKNOWN → inquiry, bukan resend
Rekonsiliasi harian · uang integer · audit immutable
Auth: PIN/biometrik + device binding (Keystore/Secure Enclave) + challenge-response + risk engine
Mobile: tanpa transaksi offline · FLAG_SECURE · pinning · status jujur
```

## Related Topics

- [Distributed Systems Fundamentals](/system-design/concepts/distributed-systems/)
- [Secure Token Storage](/security/secure-token-storage/)
- [Transactions & ACID](/database/transactions-acid/)
