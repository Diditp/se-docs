---
title: "Money & Financial Calculations"
description: "Cara aman menyimpan dan menghitung uang di aplikasi: kenapa double berbahaya, integer minor unit vs decimal, aturan pembulatan, pajak termasuk vs ditambahkan, diskon & service charge, alokasi sisa pembagian, dasar akuntansi double-entry untuk developer, ledger append-only, rekonsiliasi app vs backend, dan audit trail."
level: intermediate
status: complete
version: "Konsep lintas bahasa. Contoh: Dart, TypeScript, PostgreSQL"
updated: 2026-11-22
tags: [fundamentals, money, finance, rounding, tax, accounting, pos, fintech]
---

## Overview

Aplikasi keuangan, POS, e-commerce, dan fintech semuanya menghitung uang. Kesalahan kecil (selisih Rp1, pembulatan berbeda antara app dan server, pajak dihitung dua kali) langsung terlihat di laporan akuntan, membuat closing kasir tidak cocok, dan merusak kepercayaan klien.

Halaman ini merangkum aturan yang dipakai engineer di domain keuangan: **representasi uang**, **pembulatan**, **pajak & biaya tambahan**, **pembagian yang adil**, **pencatatan (ledger/double-entry)**, dan **rekonsiliasi**.

## Why It Matters

- Developer yang paham alur uang lebih jarang ditemukan daripada developer yang hanya paham framework. Fintech, bank, ERP, dan POS mencari orang yang bisa dipercaya memegang logika ini.
- Bug uang sering tidak menyebabkan crash. Ia diam-diam menghasilkan angka salah sampai ada yang mengaudit.
- Pertanyaan "kenapa tidak pakai double untuk uang?" adalah pertanyaan interview klasik.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Minor unit | Satuan terkecil mata uang: sen untuk USD (2 desimal), Rupiah biasanya tanpa desimal (0), beberapa mata uang 3 desimal. Simpan sebagai integer dalam satuan ini |
| Floating point | `double`/`float` menyimpan bilangan biner; 0,1 tidak bisa direpresentasikan persis, sehingga 0,1 + 0,2 ≠ 0,3 |
| Decimal | Tipe angka desimal berbasis 10 (mis. `numeric` di PostgreSQL, package `decimal` di Dart, `BigDecimal` di Kotlin) |
| Rounding mode | Aturan pembulatan: half-up, half-even (banker's), down/truncate, up |
| Rounding point | Di mana pembulatan dilakukan: per baris item atau di total. Harus disepakati |
| Tax-exclusive | Harga belum termasuk pajak; pajak ditambahkan di atas harga |
| Tax-inclusive | Harga sudah termasuk pajak; pajak "diekstrak" dari harga |
| Basis point (bp) | 1/100 persen. 10% = 1000 bp. Membuat tarif tetap integer |
| Double-entry | Setiap transaksi dicatat minimal di dua akun: total debit = total kredit |
| Ledger | Catatan transaksi append-only; saldo = jumlah entri, bukan kolom yang ditimpa |
| Reconciliation | Mencocokkan dua sumber data (app vs server, sistem vs mutasi bank) dan menjelaskan selisihnya |

## How It Works

```text
Input harga (string/angka dari UI/API)
→ parse ke integer minor unit (atau Decimal) di batas sistem
→ hitung: subtotal → diskon → service charge → pajak → total (urutan sesuai aturan bisnis)
→ pembulatan di titik yang disepakati, dengan mode yang disepakati
→ simpan integer/decimal + mata uang + rincian (bukan hanya total)
→ catat ke ledger (append-only) → laporan & rekonsiliasi
→ format ke tampilan (Rp 12.500) HANYA di layer UI
```

## Implementation

### 1. Kenapa `double` berbahaya

```dart
print(0.1 + 0.2);            // 0.30000000000000004
print(1.10 * 3);             // 3.3000000000000003
print((2.675 * 100).round()); // 267, bukan 268 (2.675 tersimpan sebagai 2.67499999…)
```

Error kecil ini menumpuk di penjumlahan banyak item, dan hasil pembulatan bisa berbeda dengan backend yang memakai decimal.

### 2. Representasi: integer minor unit atau Decimal

```dart
// Value object sederhana dengan integer minor unit
class Money {
  const Money(this.minor, this.currency);
  final int minor;        // Rp 12.500 → 12500 (IDR, 0 desimal); USD 12.50 → 1250
  final String currency;  // 'IDR', 'USD'

  Money operator +(Money o) {
    assert(currency == o.currency, 'Tidak boleh menjumlah mata uang berbeda');
    return Money(minor + o.minor, currency);
  }

  Money times(int qty) => Money(minor * qty, currency);
}
```

Pilihan representasi:

| Pilihan | Kapan |
| --- | --- |
| `int` minor unit | Paling umum di app & API; cepat; cocok bila tarif dalam bp dan pembulatan eksplisit |
| `Decimal` (`package:decimal`, `BigDecimal`) | Perhitungan dengan banyak pembagian/persen pecahan, kurs, bunga |
| `numeric(p,s)` / `bigint` di database | `numeric` untuk nilai berdesimal; `bigint` untuk minor unit. Jangan `float`/`real` |
| String di JSON | Untuk decimal agar tidak di-parse jadi double oleh klien (mis. `"12500.50"`) |

Jangan pernah menyimpan uang yang sudah diformat (`"Rp 12.500"`) sebagai data.

### 3. Pembulatan eksplisit

```dart
/// Persentase dengan basis point dan pembulatan half-up. amount harus ≥ 0.
int percentHalfUp(int amount, int bp) => (amount * bp + 5000) ~/ 10000;

/// Half-even (banker's rounding): .5 dibulatkan ke angka genap terdekat.
int percentHalfEven(int amount, int bp) {
  final q = (amount * bp) ~/ 10000;
  final r = (amount * bp) % 10000;
  if (r > 5000 || (r == 5000 && q.isOdd)) return q + 1;
  return q;
}
```

Yang wajib disepakati dan ditulis (dengan tim backend dan bisnis/akuntan):

1. **Mode** pembulatan (half-up paling umum di retail; half-even sering dipakai sistem keuangan untuk mengurangi bias).
2. **Titik** pembulatan: per item atau di total. Hasilnya bisa berbeda Rp1–beberapa rupiah.
3. **Urutan** perhitungan: diskon → service charge → pajak, atau lainnya.
4. Pembulatan akhir untuk pembayaran tunai (mis. ke kelipatan Rp100), dan ke mana selisihnya dicatat.

### 4. Pajak termasuk vs ditambahkan

```dart
// Tax-exclusive: harga 10.000, pajak 10% → total 11.000
int taxExclusive(int price, int bp) => percentHalfUp(price, bp);

// Tax-inclusive: harga 11.000 sudah termasuk pajak 10% → DPP 10.000, pajak 1.000
({int base, int tax}) taxInclusive(int gross, int bp) {
  final base = (gross * 10000 + (10000 + bp) ~/ 2) ~/ (10000 + bp); // gross / (1 + rate), half-up
  return (base: base, tax: gross - base);
}
```

Pada harga termasuk pajak, hitung **pajak = harga − dasar** (bukan dasar × tarif), supaya dasar + pajak selalu sama persis dengan harga yang dibayar pelanggan.

Tarif dan aturan pajak berbeda per jenis usaha dan daerah, dan bisa berubah. Simpan sebagai **konfigurasi dari server** (tarif + tanggal berlaku), bukan konstanta di kode.

### 5. Membagi uang tanpa kehilangan rupiah (allocation)

Membagi Rp100 ke 3 orang dengan pembulatan biasa menghasilkan 33 + 33 + 33 = 99. Satu rupiah hilang.

```dart
/// Membagi total ke n bagian; sisa dibagikan ke bagian pertama satu per satu.
List<int> allocate(int total, int parts) {
  final base = total ~/ parts;
  final rest = total % parts;
  return List.generate(parts, (i) => base + (i < rest ? 1 : 0));
}
// allocate(100, 3) → [34, 33, 33]  (jumlah tetap 100)
```

Pola yang sama dipakai untuk membagi diskon nota ke tiap item (proporsional menurut nilai item) atau membagi pembayaran ke beberapa invoice.

### 6. Dasar akuntansi untuk developer: double-entry & ledger

Contoh penjualan tunai Rp11.000 (harga 10.000 + pajak 1.000):

| Akun | Debit | Kredit |
| --- | --- | --- |
| Kas | 11.000 | |
| Pendapatan penjualan | | 10.000 |
| Utang pajak | | 1.000 |
| **Total** | **11.000** | **11.000** |

```sql
CREATE TABLE ledger_entries (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id  uuid        NOT NULL,           -- satu transaksi bisnis
  account     text        NOT NULL,
  debit       bigint      NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit      bigint      NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency    char(3)     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Invariant per journal: SUM(debit) = SUM(credit), dicek di service/transaction sebelum commit.
-- Koreksi = entri pembalik (reversal), BUKAN UPDATE/DELETE entri lama.
```

Prinsip yang dipakai sistem keuangan:

- **Append-only:** transaksi tidak diubah atau dihapus; kesalahan dikoreksi dengan entri pembalik.
- **Saldo dihitung dari entri** (atau disimpan sebagai cache yang bisa dibangun ulang dari ledger).
- **Idempotensi:** setiap transaksi punya ID unik dari klien agar retry tidak mencatat dua kali.

### 7. Rekonsiliasi app vs backend

Saat app menghitung offline dan server menghitung ulang:

1. Kirim **rincian** (harga, qty, diskon, tarif yang dipakai, versi aturan), bukan hanya total.
2. Server menghitung ulang dengan aturan yang sama dan membandingkan.
3. Bila berbeda: catat selisih + input lengkap untuk investigasi; tentukan kebijakan (tolak, terima angka server, atau tandai untuk review).
4. Kunci aturan dengan **kasus uji bersama** (file fixture yang dijalankan di app dan server). Lihat [TDD](/testing-performance/tdd/).

### 8. Format tampilan hanya di UI

```dart
import 'package:intl/intl.dart';

final idr = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
idr.format(12500); // "Rp 12.500"
```

Parsing input pengguna (`"12.500"` vs `"12,500"`) juga harus sadar locale dan divalidasi sebelum jadi integer.

## Best Practices

- Uang = **integer minor unit** atau **decimal**, selalu bersama **kode mata uang**.
- **Satu sumber rumus** (satu class/fungsi kalkulator) yang dipakai semua layar dan dites.
- Mode, titik, dan urutan pembulatan **ditulis di dokumen** dan disepakati dengan backend & akuntan.
- Tarif pajak/biaya sebagai **konfigurasi berversi** dari server.
- Simpan **rincian perhitungan** di transaksi agar bisa diaudit dan direkonsiliasi.
- Ledger **append-only** dengan entri pembalik untuk koreksi.
- Format mata uang hanya di layer presentasi.

## Anti-Patterns

- `double` untuk harga, total, atau saldo.
- Menghitung ulang total di banyak tempat dengan rumus berbeda-beda.
- Membulatkan di tengah perhitungan secara acak.
- Menimpa saldo dengan `UPDATE balance = ...` tanpa riwayat.
- Menghapus transaksi untuk "membetulkan" kesalahan.
- Menyimpan teks berformat (`"Rp 12.500"`) atau mencampur mata uang dalam satu angka.
- Tarif pajak di-hardcode di aplikasi mobile sehingga perubahan tarif butuh rilis baru.

## Performance Considerations

Operasi integer sangat cepat; decimal lebih lambat tetapi jarang menjadi bottleneck kecuali untuk jutaan baris. Untuk laporan besar, agregasi di database (`SUM` pada `bigint`/`numeric`) dan materialized view/read model lebih efisien daripada menjumlah di aplikasi. Saldo yang sering dibaca boleh di-cache, asalkan bisa dibangun ulang dari ledger.

## Security Considerations

- **Server adalah sumber kebenaran.** Harga, diskon, dan total dari klien harus dihitung ulang dan divalidasi di server; jangan percaya total yang dikirim app.
- Cegah transaksi ganda dengan **idempotency key**.
- Batasi siapa yang boleh membatalkan transaksi, memberi diskon manual, atau mengubah tarif (role/privilege) dan catat di **audit trail** (siapa, kapan, sebelum/sesudah).
- Lindungi data keuangan di perangkat (enkripsi penyimpanan, kunci layar aplikasi bila perlu).

## Real-World Use Cases

- **POS:** pajak per produk (kena/tidak kena pajak), service charge, diskon nota yang dialokasikan ke item, pembulatan tunai, closing shift yang harus cocok dengan laporan server.
- **Aplikasi akuntansi:** pencatatan kas masuk/keluar sebagai jurnal double-entry, petty cash, invoice dengan beberapa jenis pajak.
- **Fintech/wallet:** saldo dari ledger, transfer idempoten, rekonsiliasi harian dengan bank/payment gateway.

## Interview Questions

1. Kenapa `double` tidak boleh dipakai untuk uang? Apa alternatifnya?
2. Apa beda harga termasuk pajak dan belum termasuk pajak, dan bagaimana menghitung pajaknya?
3. Bagaimana membagi Rp100 ke tiga pihak tanpa kehilangan satu rupiah?
4. Bagaimana memastikan perhitungan di aplikasi offline sama dengan di backend?
5. Kenapa sistem keuangan memakai ledger append-only?

## Sample Answers

1. `double` adalah floating point biner yang tidak bisa merepresentasikan banyak pecahan desimal secara persis (0,1 + 0,2 ≠ 0,3), sehingga error menumpuk dan pembulatan bisa berbeda. Gunakan integer dalam satuan terkecil (mis. rupiah atau sen) atau tipe decimal, dengan aturan pembulatan yang eksplisit.
2. Harga belum termasuk pajak: pajak = harga × tarif lalu ditambahkan. Harga termasuk pajak: dasar = harga ÷ (1 + tarif) lalu pajak = harga − dasar, supaya dasar + pajak tetap sama dengan harga yang dibayar.
3. Hitung bagian dasar dengan pembagian bulat (33), lalu bagikan sisa (1) ke bagian pertama: 34, 33, 33. Pola alokasi ini juga dipakai untuk membagi diskon nota ke item.
4. Satu sumber rumus di masing-masing sisi dengan aturan yang sama (representasi, urutan, mode & titik pembulatan, tarif berversi dari server), kasus uji bersama yang dijalankan di app dan server, mengirim rincian perhitungan, dan server menghitung ulang serta mencatat selisih untuk investigasi.
5. Agar riwayat lengkap dan bisa diaudit: saldo bisa dibuktikan dari entri, kesalahan dikoreksi dengan entri pembalik tanpa menghilangkan jejak, dan memudahkan rekonsiliasi.

## Practical Exercises

1. Buat value object `Money` (integer minor unit + currency) dengan operasi tambah, kali qty, dan format, beserta unit test.
2. Implementasikan pajak termasuk dan belum termasuk pajak, dan uji 10 kasus (termasuk pembulatan .5).
3. Implementasikan alokasi diskon nota Rp1.000 ke 3 item proporsional terhadap harga, pastikan totalnya tetap Rp1.000.
4. Rancang tabel ledger double-entry untuk penjualan tunai, refund, dan koreksi kesalahan input.

## Quick Reference

```text
Uang = int minor unit atau Decimal + currency · JANGAN double/float · DB: bigint / numeric
Tarif dalam basis point · pembulatan: mode + titik + urutan DISEPAKATI & ditulis
Exclusive: tax = base × rate · Inclusive: base = gross / (1+rate), tax = gross − base
Bagi uang: allocate (sisa ke bagian pertama) · jumlah selalu sama dengan total
Ledger append-only · debit = kredit · koreksi = entri pembalik · idempotency key
App offline vs server: satu rumus, kasus uji bersama, kirim rincian, server hitung ulang
Format "Rp 12.500" hanya di UI
```

## Related Topics

- [Test-Driven Development (TDD)](/testing-performance/tdd/)
- [Banking / Financial Application](/system-design/case-studies/banking-financial/)
- [POS / ERP Application](/system-design/case-studies/pos-erp/)
- [Offline-First Application](/flutter/offline-first/)
