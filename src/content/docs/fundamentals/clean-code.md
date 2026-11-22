---
title: "Clean Code & Code Readability"
description: "Prinsip kode yang mudah dibaca dan dirawat: penamaan, fungsi kecil, guard clause, komentar yang berguna, error handling, magic number, DRY/KISS/YAGNI, formatting & linting — dengan contoh sebelum/sesudah di Dart dan TypeScript."
level: beginner
status: complete
updated: 2026-11-12
tags: [fundamentals, clean-code, readability, naming, lint]
---

## Overview

**Clean code** adalah kode yang **mudah dibaca, dipahami, dan diubah oleh orang lain** (termasuk Anda enam bulan lagi).
Kode dibaca jauh lebih sering daripada ditulis, sehingga keterbacaan adalah investasi produktivitas tim.

## Why It Matters

- Mempercepat review, onboarding, dan debugging.
- Mengurangi bug karena maksud kode terlihat jelas.
- Membuat AI coding agent menghasilkan kode yang konsisten (lihat [AGENTS.md](/agent-instructions/)).

## Core Concepts

| Prinsip | Inti |
| --- | --- |
| Nama bermakna | Nama menjelaskan *maksud*, bukan tipe atau implementasi |
| Fungsi kecil, satu tugas | Mudah diuji dan diberi nama |
| Level abstraksi konsisten | Satu fungsi tidak mencampur logika bisnis dengan detail I/O |
| Guard clause | Keluar lebih awal untuk kasus khusus, hindari nesting dalam |
| Hindari magic number/string | Gunakan konstanta/enum bernama |
| Komentar menjelaskan *mengapa* | Kode menjelaskan *apa* |
| DRY | Jangan duplikasi *pengetahuan* (aturan bisnis) |
| KISS | Pilih solusi paling sederhana yang benar |
| YAGNI | Jangan bangun untuk kebutuhan hipotetis |
| Boy scout rule | Tinggalkan kode sedikit lebih bersih |

### Konvensi penamaan

| Bahasa | Class/Type | Variabel/fungsi | Konstanta | File |
| --- | --- | --- | --- | --- |
| Dart | `UpperCamelCase` | `lowerCamelCase` | `lowerCamelCase` | `snake_case.dart` |
| Kotlin | `UpperCamelCase` | `lowerCamelCase` | `UPPER_SNAKE_CASE` (const) | `UpperCamelCase.kt` |
| TypeScript | `UpperCamelCase` | `lowerCamelCase` | `UPPER_SNAKE_CASE` / `lowerCamelCase` | `kebab-case.ts` (umum) |

Boolean dibaca sebagai pertanyaan: `isPaid`, `hasStock`, `canVoid`. Fungsi memakai kata kerja: `calculateTotal`,
`fetchOrders`.

## How It Works

```text
Tulis agar berfungsi → tambah test → refactor agar mudah dibaca (nama, ekstrak fungsi, hapus duplikasi)
→ format & lint otomatis → review dengan fokus pada maksud dan desain
```

## Implementation

### Sebelum

```dart
double calc(List<Map<String, dynamic>> l, int t) {
  double r = 0;
  for (var i in l) {
    if (i['q'] > 0) {
      if (t == 1) {
        r += i['p'] * i['q'] * 0.9;
      } else {
        r += i['p'] * i['q'];
      }
    }
  }
  return r * 1.11;
}
```

### Sesudah

```dart
const memberDiscountRate = 0.10;
const taxRate = 0.11;   // contoh; tarif pajak nyata mengikuti aturan yang berlaku

enum CustomerType { regular, member }

int calculateTotal(List<CartItem> items, CustomerType customer) {
  final subtotal = items.where((i) => i.qty > 0).fold<int>(0, (sum, i) => sum + i.price * i.qty);
  final discounted = customer == CustomerType.member ? applyDiscount(subtotal, memberDiscountRate) : subtotal;
  return addTax(discounted, taxRate);
}

int applyDiscount(int amount, double rate) => (amount * (1 - rate)).round();
int addTax(int amount, double rate) => (amount * (1 + rate)).round();
```

Perbaikan: tipe kuat (`CartItem`, enum), nama bermakna, konstanta bernama, uang dalam integer, fungsi kecil yang
dapat diuji.

### Guard clause (TypeScript)

```ts
// ❌ nesting dalam
function voidSale(sale: Sale, user: User) {
  if (sale) {
    if (sale.status === 'paid') {
      if (user.role === 'supervisor') { /* ... */ }
    }
  }
}

// ✅ keluar lebih awal
function voidSale(sale: Sale, user: User) {
  if (sale.status !== 'paid') throw new DomainError('ONLY_PAID_CAN_BE_VOIDED');
  if (user.role !== 'supervisor') throw new ForbiddenError();
  // alur utama tanpa nesting
}
```

### Komentar yang berguna

```dart
// ❌ Tambah 1 ke counter
counter++;

// ✅ Gateway mengirim callback duplikat saat timeout; abaikan bila sudah diproses (idempoten).
if (await repo.isProcessed(event.id)) return;
```

### Otomatisasi gaya

```yaml
# analysis_options.yaml (Dart)
include: package:flutter_lints/flutter.yaml
linter:
  rules:
    - prefer_const_constructors
    - avoid_print
    - prefer_final_locals
```

## Best Practices

- **Nama yang bisa diucapkan dan dicari**; hindari singkatan yang tidak umum.
- **Satu fungsi satu tugas**, parameter sedikit (gunakan objek parameter bila > 3).
- **Format & lint otomatis** di editor dan CI (`dart format`, `ktlint`, ESLint + Prettier).
- **Konsisten dengan konvensi proyek** lebih penting dari preferensi pribadi.
- **Hapus kode mati** dan kode yang dikomentari — Git menyimpan riwayatnya.

## Anti-Patterns

- Nama `data`, `temp`, `manager`, `helper`, `util` tanpa konteks.
- Fungsi ratusan baris dengan banyak flag boolean (`process(true, false, true)`).
- DRY berlebihan: menyatukan kode yang hanya kebetulan mirip sehingga perubahan satu sisi merusak sisi lain.
- Komentar yang basi dan bertentangan dengan kode.
- `catch (e) {}` yang menelan error.

## Performance Considerations

Keterbacaan dulu, optimasi berdasarkan pengukuran. Bila optimasi membuat kode lebih rumit, isolasi di satu fungsi
bernama jelas dan beri komentar alasan + angka benchmark.

## Security Considerations

Kode yang jelas lebih mudah direview untuk celah keamanan. Hindari logging data sensitif, validasi input di satu tempat,
dan gunakan lint keamanan (mis. aturan ESLint untuk `eval`, `avoid_print` di Dart).

## Real-World Use Cases

- Standar code review tim.
- Aturan di `AGENTS.md` agar AI agent menulis kode sesuai konvensi.
- Refactor modul lama sebelum menambah fitur.

## Interview Questions

1. Apa ciri clean code menurut Anda?
2. Kapan komentar diperlukan?
3. Apa itu DRY, KISS, dan YAGNI?
4. Bagaimana memberi nama yang baik?
5. Bagaimana menjaga konsistensi gaya di tim?

## Sample Answers

1. Mudah dibaca dan dipahami maksudnya, nama bermakna, fungsi kecil dengan satu tanggung jawab, tanpa duplikasi aturan bisnis, error ditangani jelas, dan didukung test.
2. Untuk menjelaskan *mengapa* (keputusan, batasan eksternal, workaround bug pihak ketiga), dokumentasi API publik, atau algoritma non-trivial — bukan untuk mengulang apa yang sudah jelas dari kode.
3. DRY: satu sumber kebenaran untuk setiap pengetahuan. KISS: solusi sesederhana mungkin. YAGNI: jangan membangun fitur/abstraksi sebelum dibutuhkan.
4. Menggambarkan maksud & domain (`unpaidOrders`, bukan `list2`), boolean berbentuk pertanyaan, fungsi berupa kata kerja, panjang sebanding dengan cakupan, konsisten dengan istilah bisnis.
5. Formatter & linter otomatis di editor dan CI, panduan gaya tertulis (termasuk di AGENTS.md), code review, dan contoh kode referensi.

## Practical Exercises

1. Ambil satu fungsi terpanjang di proyek Anda dan refactor dengan guard clause & ekstrak fungsi.
2. Cari 10 nama variabel yang tidak jelas dan ganti.
3. Aktifkan 5 aturan lint tambahan dan perbaiki pelanggarannya.

## Quick Reference

```text
Nama = maksud · fungsi kecil · guard clause · konstanta bernama · komentar = mengapa
DRY (pengetahuan) · KISS · YAGNI · boy scout rule · format + lint di CI
Dart: UpperCamelCase / lowerCamelCase / snake_case.dart · boolean: is/has/can
```

## Related Topics

- [Refactoring](/fundamentals/refactoring/)
- [SOLID Principles](/fundamentals/solid-principles/)
- [Agile, Scrum & Code Review](/fundamentals/agile-scrum-code-review/)
