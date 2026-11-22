---
title: "Coding Standards & Naming Conventions"
description: "Cara menyusun coding standards dan konvensi penamaan yang dipatuhi manusia maupun AI coding agent: apa yang dimasukkan ke aturan, apa yang diserahkan ke formatter/linter, konvensi per bahasa (Dart, Kotlin, TypeScript, SQL), penamaan berbasis domain, aturan yang dapat diverifikasi, dan cara menuliskannya di AGENTS.md."
level: beginner
status: complete
updated: 2026-11-13
tags: [ai, agents, coding-standards, naming, linter]
---

## Overview

**Coding standards** adalah kesepakatan tim tentang cara menulis kode: struktur, penamaan, error handling, logging, dan
gaya. Untuk AI coding agent, standar ini harus **tertulis, spesifik, dan dapat diverifikasi**, karena agent tidak
mengetahui kebiasaan tim yang tidak tertulis.

Halaman ini menjelaskan **cara berpikir dan menyusun** standar. Aturan siap pakai ada di
[AI Agent Instructions](/agent-instructions/global/).

## Why It Matters

Tanpa standar tertulis, agent akan mengikuti gaya umum dari data latihnya atau meniru file terdekat, yang bisa saja
contoh buruk. Hasilnya kode yang tidak konsisten: nama `UserManager`, `utils.dart` raksasa, campuran Bloc dan Provider.
Standar yang jelas membuat review lebih cepat dan kode dari manusia maupun agent terlihat seperti ditulis satu tim.

## Core Concepts

| Lapisan | Ditegakkan oleh | Contoh |
| --- | --- | --- |
| Format (spasi, koma, baris) | Formatter otomatis | `dart format`, `ktlint`, Prettier |
| Pola yang bisa dideteksi mesin | Linter + CI | `avoid_print`, `no-floating-promises`, detekt |
| Keputusan desain & domain | AGENTS.md + review | "Uang disimpan sebagai `int` rupiah", "state management hanya Bloc" |

Prinsip: **apa yang bisa dicek mesin, serahkan ke mesin**. AGENTS.md berisi keputusan yang tidak bisa ditangkap linter,
beserta alasannya.

### Konvensi per bahasa (ringkas)

| Elemen | Dart | Kotlin | TypeScript | SQL (PostgreSQL) |
| --- | --- | --- | --- | --- |
| Tipe/kelas | `UpperCamelCase` | `UpperCamelCase` | `UpperCamelCase` | — |
| Fungsi/variabel | `lowerCamelCase` | `lowerCamelCase` | `lowerCamelCase` | — |
| Konstanta | `lowerCamelCase` (`const`) | `UPPER_SNAKE_CASE` (`const val`) | `UPPER_SNAKE_CASE` atau `camelCase` (konsisten) | — |
| File | `snake_case.dart` | `UpperCamelCase.kt` | `kebab-case.ts` atau `camelCase.ts` (konsisten) | migrasi `0007_add_orders.sql` |
| Tabel/kolom | — | — | — | `snake_case`, tabel jamak (`orders`) |
| Private | `_prefix` | `private` | `#field` / `private` | — |

### Penamaan berbasis domain

```text
✅ Order, voidOrder, StockMovement, calculateChange, isEligibleForPromo, pendingOutbox
❌ Data, Info, Manager, Helper, Utils, process(), handle(), temp, flag2
Boolean: is/has/can/should · koleksi: jamak · async yang mengembalikan nilai: kata kerja (loadOrders)
Stream/Flow: kata benda (orders, ordersStream)
```

## How It Works

```text
1. Ambil keputusan (rapat singkat/ADR) → 2. Otomatiskan yang bisa (formatter, lint, CI)
3. Tulis sisanya di AGENTS.md dengan MUST/SHOULD + alasan + contoh
4. Agent membaca AGENTS.md sebelum menulis kode → lint & test di CI menolak pelanggaran mekanis
5. Review menemukan pelanggaran baru → tambahkan aturan atau lint rule
```

## Implementation

### Aturan yang baik: spesifik, terverifikasi, beralasan

```markdown
❌ Tulis kode yang bersih dan rapi.
❌ Gunakan nama yang bagus.

✅ **MUST** store money as `int` rupiah (minor unit); never `double`.
   *Why:* floating point rounding corrupts totals. Format only at the UI with `formatRupiah()`.
✅ **MUST NOT** create classes named `*Manager`, `*Helper`, `*Utils`; name by responsibility (`ReceiptPrinter`).
   *Why:* generic names become dumping grounds.
```

### Contoh blok standar di AGENTS.md proyek Flutter

```markdown
## 1. Coding Standards
- Follow `analysis_options.yaml` (very_good_analysis); `flutter analyze --fatal-infos` must pass.
- Use `AppLogger` from `lib/core/logging/`; `print`/`debugPrint` are forbidden (lint: avoid_print).
- Prefer `final`; widgets `const` where possible.
- Errors: repositories return `Result<T, Failure>`; never throw across layer boundaries.

## 4. Naming Conventions
- Feature folders: singular business nouns (`order`, `customer`).
- Cubits: `<Feature><Purpose>Cubit` (`OrderListCubit`); states: sealed class `<Feature><Purpose>State`.
- Repository interface `OrderRepository` (domain), implementation `OrderRepositoryImpl` (data).
```

### Otomatisasi

```yaml
# analysis_options.yaml (Flutter)
include: package:very_good_analysis/analysis_options.yaml
linter:
  rules:
    avoid_print: true
    prefer_final_locals: true
```

```json
// eslint (TypeScript) — contoh aturan yang menangkap bug, bukan sekadar gaya
{ "rules": { "@typescript-eslint/no-floating-promises": "error", "@typescript-eslint/no-explicit-any": "error" } }
```

```text
CI: format check + analyze/lint wajib lulus sebelum merge. Agent diminta menjalankan perintah yang sama sebelum melapor
```

### Konsistensi lebih penting dari preferensi

Bila kode lama memakai konvensi tertentu yang masuk akal, tulis "ikuti pola yang ada di `features/order/`" daripada
memaksakan gaya baru di setiap PR. Perubahan konvensi dilakukan sebagai PR khusus (refactor terpisah).

## Best Practices

- **Pisahkan** format (formatter), pola mekanis (linter), dan keputusan (AGENTS.md).
- **Setiap aturan punya alasan** agar agent bisa menerapkannya pada kasus yang tidak tertulis.
- **Contoh benar/salah** untuk aturan yang sering dilanggar.
- **Nama dari kosakata bisnis**, konsisten antara UI, kode, API, dan database.
- **Tinjau aturan** saat ada pelanggaran berulang di review.

## Anti-Patterns

- Aturan kabur ("rapi", "best practice", "clean code") yang tidak bisa diverifikasi.
- Menulis ulang aturan formatter di AGENTS.md (membuang konteks agent).
- Aturan bertentangan antara AGENTS.md dan konfigurasi linter.
- Konvensi berbeda per orang dalam satu modul.
- Rename massal yang dicampur dengan perubahan fitur.

## Performance Considerations

AGENTS.md dibaca agent di setiap tugas, sehingga panjangnya memengaruhi konteks dan biaya. Simpan aturan global yang
ringkas di root, detail per teknologi di file domain, dan serahkan sebanyak mungkin ke tool otomatis.

## Security Considerations

Masukkan aturan coding yang terkait keamanan secara eksplisit (larangan `print` data sensitif, larangan `Math.random()`
untuk token, wajib parameterized query), karena aturan seperti ini sering tidak terdeteksi formatter.

## Real-World Use Cases

- Tim POS menetapkan "uang = int rupiah" setelah bug pembulatan. Aturan masuk AGENTS.md dan dicek di review.
- Linter `avoid_print` + `AppLogger` mencegah token tercetak ke log oleh kode yang ditulis agent.

## Interview Questions

1. Bagaimana tim Anda menjaga konsistensi gaya kode?
2. Apa yang sebaiknya ditulis di AGENTS.md dan apa yang diserahkan ke linter?
3. Mengapa nama seperti `Manager` dan `Utils` dihindari?

## Sample Answers

1. Formatter dan linter otomatis di CI untuk hal mekanis, dokumen standar/AGENTS.md untuk keputusan desain dengan alasan, dan code review yang menambah aturan saat menemukan pelanggaran berulang.
2. Linter untuk pola yang dapat dideteksi otomatis (format, print, any, promise tidak di-await). AGENTS.md untuk keputusan desain dan domain yang tidak bisa dicek mesin, seperti representasi uang, pilihan state management, dan batas layer.
3. Nama generik tidak menjelaskan tanggung jawab sehingga kelas tersebut cenderung menampung segala hal dan melanggar single responsibility.

## Practical Exercises

1. Audit `analysis_options.yaml`/ESLint proyek Anda dan aktifkan aturan yang menangkap bug.
2. Tulis 5 aturan coding standards proyek dengan format MUST + alasan + contoh.
3. Buat glosarium istilah bisnis dan pastikan nama di kode mengikutinya.

## Quick Reference

```text
Formatter → format · linter → pola mekanis · AGENTS.md → keputusan + alasan + contoh
Dart: UpperCamelCase tipe, lowerCamelCase lainnya, snake_case file · Kotlin: UPPER_SNAKE const val
TS: konsisten kebab/camel file · SQL: snake_case, tabel jamak
Nama dari domain · boolean is/has/can · hindari Manager/Helper/Utils/Data
Ikuti pola yang ada · refactor konvensi di PR terpisah
```

## Related Topics

- [AGENTS.md: Konsep & Cara Menulis](/ai-engineering/guides/agents-md-fundamentals/)
- [Folder Structure Guidelines](/ai-engineering/guides/folder-structure/)
- [Clean Code Principles](/fundamentals/clean-code/)
