---
title: "Test Coverage"
description: "Memahami test coverage: line, branch, function coverage, cara mengukur (flutter test --coverage, lcov, Kover/JaCoCo, Vitest/Jest), mengecualikan kode generate, target yang masuk akal per layer, coverage gate di CI, serta keterbatasan coverage dan mutation testing."
level: beginner
status: complete
updated: 2026-11-13
tags: [testing, coverage, lcov, ci, quality]
---

## Overview

**Test coverage** mengukur seberapa banyak kode yang **dieksekusi** oleh test. Coverage berguna untuk menemukan bagian
yang **belum dites**, tetapi **tidak** membuktikan bahwa test-nya benar atau bermakna.

## Why It Matters

Banyak tim memasang ambang coverage di CI, dan interviewer sering bertanya "berapa coverage Anda dan apakah itu
cukup?". Jawaban matang menjelaskan **di mana** coverage penting dan keterbatasannya.

## Core Concepts

| Jenis | Mengukur |
| --- | --- |
| Line/statement | Baris yang dieksekusi |
| Branch | Cabang `if/else`, `switch`, operator `?:` yang diambil |
| Function | Fungsi yang dipanggil setidaknya sekali |
| Mutation score | Persentase mutasi kode yang "terbunuh" (terdeteksi) oleh test — mengukur kualitas test |

## How It Works

```text
Runner menginstrumentasi kode → test berjalan → mencatat baris/cabang yang tersentuh → laporan (lcov/HTML/XML)
→ CI membandingkan dengan ambang → (opsional) komentar di PR untuk baris baru yang tidak tercover
```

## Implementation

### Flutter

```bash
flutter test --coverage                                   # menghasilkan coverage/lcov.info
# Kecualikan file generate
lcov --remove coverage/lcov.info '**/*.g.dart' '**/*.freezed.dart' '**/generated/**' -o coverage/lcov.info
genhtml coverage/lcov.info -o coverage/html               # laporan HTML (paket lcov)
```

### Android (Kover)

```kotlin
// build.gradle.kts (modul)
plugins { id("org.jetbrains.kotlinx.kover") }
kover {
    reports {
        filters { excludes { classes("*Hilt_*", "*_Factory", "*.BuildConfig") } }
        verify { rule { minBound(70) } }      // gagal bila < 70% (contoh)
    }
}
// ./gradlew koverHtmlReport koverVerify
```

### Node.js (Vitest)

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      exclude: ['**/*.d.ts', 'src/generated/**', 'src/main.ts'],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
```

### Target yang masuk akal (contoh)

| Layer | Target | Alasan |
| --- | --- | --- |
| Domain/logika bisnis (kalkulasi, aturan) | Tinggi (≥ 90%) | Bug di sini paling mahal |
| ViewModel/Bloc, repository | Menengah–tinggi (70–85%) | Banyak cabang state & error |
| UI/widget | Sedang, fokus state penting | Widget/golden test untuk state utama |
| Kode generate, main, DI wiring | Dikecualikan | Tidak bernilai dites langsung |

Lebih penting dari angka total: **coverage pada kode baru/berubah** di setiap PR (diff coverage).

### Coverage tinggi ≠ test bagus

```dart
test('hitung total', () {
  PriceCalculator().total(cart);          // ❌ dieksekusi (coverage naik) tetapi tanpa assertion
});
```

Mutation testing (mis. Stryker untuk JS/TS, PIT untuk JVM) mengubah kode sedikit (`>` menjadi `>=`) dan memeriksa apakah
test gagal — cara yang lebih jujur menilai kualitas test.

## Best Practices

- **Gunakan coverage untuk menemukan celah**, bukan target buta.
- **Kecualikan kode generate** agar angka bermakna.
- **Diff coverage di PR** untuk mencegah kode baru tanpa test.
- **Fokus pada branch coverage** di logika bisnis.
- **Naikkan ambang bertahap** pada proyek lama.

## Anti-Patterns

- Mengejar 100% dengan test tanpa assertion.
- Ambang tinggi yang membuat tim menulis test sampah.
- Mengabaikan coverage pada logika uang/keamanan karena total sudah "cukup".

## Performance Considerations

Instrumentasi coverage memperlambat test; jalankan coverage penuh di CI (bukan setiap run lokal) atau hanya untuk paket
yang berubah di monorepo.

## Security Considerations

Pastikan kode keamanan (validasi, otorisasi, penanganan token) memiliki coverage dan test kasus negatif; coverage rendah
di area ini adalah risiko.

## Real-World Use Cases

- Gate CI: domain ≥ 90%, keseluruhan ≥ 70%, diff coverage ≥ 80%.
- Laporan coverage per paket di monorepo Flutter.

## Interview Questions

1. Apa itu test coverage dan jenisnya?
2. Berapa coverage yang ideal?
3. Apakah coverage 100% menjamin bebas bug?
4. Apa itu mutation testing?

## Sample Answers

1. Ukuran bagian kode yang dieksekusi test: line/statement, branch, dan function coverage.
2. Tidak ada angka universal; tinggi untuk logika bisnis kritis, lebih rendah untuk UI dan kode wiring, dengan fokus pada diff coverage kode baru.
3. Tidak — kode bisa dieksekusi tanpa assertion yang benar, dan test tidak mencakup semua kombinasi input atau kesalahan integrasi.
4. Teknik yang membuat perubahan kecil pada kode (mutan) dan memeriksa apakah test gagal; test yang baik "membunuh" mutan, sehingga mengukur kekuatan test, bukan sekadar eksekusi.

## Practical Exercises

1. Hasilkan laporan coverage proyek Anda dan kecualikan kode generate.
2. Temukan 3 cabang logika bisnis yang belum tercover dan tulis test-nya.
3. Tambahkan gate coverage di CI dengan ambang realistis.

## Quick Reference

```text
Line · branch · function · mutation score
flutter test --coverage + lcov --remove *.g.dart · Kover/JaCoCo · Vitest v8 thresholds
Tinggi untuk domain · diff coverage di PR · kecualikan generate · coverage ≠ kualitas
```

## Related Topics

- [Unit Testing](/testing-performance/unit-testing/)
- [Testing Fundamentals](/testing-performance/testing-fundamentals/)
- [GitHub Actions](/devops/github-actions/)
