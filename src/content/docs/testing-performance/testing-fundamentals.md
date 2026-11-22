---
title: "Testing Fundamentals & Test Pyramid"
description: "Dasar testing untuk mobile & backend engineer: tujuan testing, test pyramid (unit, widget/component, integration, E2E), test double, karakteristik test yang baik (FIRST), AAA, apa yang perlu dites, strategi testing aplikasi Flutter/Android/Node.js, flaky test, dan testing di CI."
level: beginner
status: complete
updated: 2026-11-13
tags: [testing, test-pyramid, unit-test, integration-test, quality]
---

## Overview

**Testing** adalah cara membuktikan secara otomatis bahwa kode berperilaku sesuai harapan — sekarang dan setelah
diubah. Strategi yang umum dipakai adalah **test pyramid**: banyak test kecil yang cepat di bawah, sedikit test besar
yang lambat di atas.

## Why It Matters

"Testing" disebut di hampir separuh lowongan mobile yang kami amati. Test memungkinkan refactor tanpa takut, mempercepat
review, dan mencegah bug yang sama muncul lagi. Di interview, Anda akan ditanya *apa* yang Anda tes dan *mengapa*.

## Core Concepts

### Test pyramid

```text
            /\        E2E / UI (sedikit) — alur kritis lewat UI nyata, lambat & rapuh
           /  \       Integration — beberapa komponen nyata bersama (DB, HTTP mock server, plugin)
          /    \      Widget / Component — satu layar/komponen terisolasi (Flutter widget test, Compose UI test)
         /______\     Unit (banyak) — fungsi, use case, ViewModel/Bloc, mapper — cepat & deterministik
```

| Level | Flutter | Android | Node.js |
| --- | --- | --- | --- |
| Unit | `test` + mocktail | JUnit + MockK + coroutines-test | Vitest/Jest |
| Widget/Component | `flutter_test` (widget test), golden | Compose UI test, Robolectric | — |
| Integration | `integration_test`, DB in-memory | Room in-memory, MockWebServer | Supertest + DB test (Testcontainers) |
| E2E | `integration_test`/Patrol di perangkat | Espresso/UI Automator, Maestro | Playwright (web) / API E2E |

### Test double

| Jenis | Fungsi |
| --- | --- |
| Dummy | Mengisi parameter, tidak dipakai |
| Stub | Mengembalikan jawaban yang sudah ditentukan |
| Fake | Implementasi ringan yang berfungsi (repository in-memory) |
| Mock | Memverifikasi interaksi (dipanggil berapa kali, dengan argumen apa) |
| Spy | Objek nyata yang interaksinya direkam |

### Test yang baik (FIRST)

**F**ast · **I**ndependent (tidak bergantung urutan) · **R**epeatable (deterministik) · **S**elf-validating
(lulus/gagal jelas) · **T**imely (ditulis bersama kode).

## How It Works

```text
Arrange  → siapkan data & dependensi (fake/mock)
Act      → jalankan perilaku yang dites
Assert   → periksa hasil/efek
Berjalan di lokal saat development dan di CI setiap PR → gagal = PR tidak boleh merge
```

## Implementation

### Apa yang perlu dites (prioritas)

| Prioritas | Contoh |
| --- | --- |
| Tinggi | Perhitungan uang (total, diskon, pajak), aturan bisnis, mapper DTO, state machine, sinkronisasi/idempotency, validasi |
| Sedang | ViewModel/Bloc (state per event), repository (sukses/gagal/offline), widget penting (loading/error/empty) |
| Rendah | Getter sederhana, kode hasil generate, wrapper tipis library |

### Contoh AAA (Dart)

```dart
test('diskon member 10% dari subtotal, dibulatkan', () {
  // Arrange
  final cart = Cart(items: [CartItem(price: 18000, qty: 2), CartItem(price: 12500, qty: 1)]);
  // Act
  final total = PriceCalculator().total(cart, customer: CustomerType.member);
  // Assert
  expect(total, 43650);   // (36000 + 12500) × 0,9
});
```

### Strategi untuk aplikasi Flutter

```text
- Unit: domain (use case, kalkulasi), mapper, Bloc/Cubit (bloc_test)
- Widget: setiap layar dalam state loading/data/empty/error; komponen design system (golden)
- Integration: alur checkout & login di emulator/perangkat (sedikit, stabil)
- Kontrak: test parsing dengan contoh JSON nyata dari API
- CI: semua unit/widget di setiap PR; integration di main/nightly
```

### Mencegah flaky test

```text
- Suntikkan clock, random, UUID → nilai tetap di test
- Tanpa jaringan nyata; gunakan fake/mock server
- Tunggu kondisi (pumpAndSettle/idling resource), bukan sleep tetap
- Data test terisolasi per test (DB in-memory baru)
```

## Best Practices

- **Tes perilaku, bukan implementasi** (hasil yang terlihat dari luar).
- **Satu alasan gagal per test**; nama test berupa kalimat yang menjelaskan perilaku.
- **Fake untuk dependensi I/O** di unit test; mock hanya bila interaksi itu sendiri yang penting.
- **Regression test untuk setiap bug** sebelum memperbaikinya.
- **Test cepat** agar dijalankan sering.

## Anti-Patterns

- Piramida terbalik ("ice cream cone"): banyak E2E manual, sedikit unit test.
- Test yang memverifikasi detail internal (mudah patah saat refactor).
- `sleep(3)` untuk menunggu async.
- Menghapus/men-skip test yang gagal agar CI hijau.
- Test tanpa assertion bermakna demi angka coverage.

## Performance Considerations

Unit test harus berjalan dalam milidetik; suite ribuan test idealnya selesai dalam hitungan menit. Pisahkan test lambat
(integration/E2E) ke job tersendiri dan jalankan paralel/terjadwal.

## Security Considerations

Tambahkan test untuk aturan keamanan: otorisasi (user A tidak bisa mengakses data user B), validasi input, dan
penanganan token kedaluwarsa. Jangan menaruh kredensial nyata di test; gunakan data sintetis.

## Real-World Use Cases

- Test kalkulasi harga & pajak aplikasi kasir.
- Test Bloc checkout untuk semua state.
- Integration test alur login–transaksi–sinkron di CI nightly.

## Interview Questions

1. Jelaskan test pyramid.
2. Apa beda mock, stub, dan fake?
3. Apa yang Anda tes di aplikasi Flutter Anda?
4. Bagaimana menangani flaky test?
5. Apa itu regression test?

## Sample Answers

1. Strategi dengan banyak unit test cepat di dasar, lebih sedikit integration/widget test di tengah, dan sedikit E2E di puncak, karena semakin tinggi semakin lambat, mahal, dan rapuh.
2. Stub mengembalikan jawaban tetap; fake adalah implementasi ringan yang berfungsi (repository in-memory); mock memverifikasi interaksi (dipanggil dengan argumen tertentu).
3. Logika domain & kalkulasi, mapper, Bloc/Cubit untuk setiap event/state, repository untuk sukses/gagal/offline, widget layar utama di setiap state, dan beberapa integration test alur kritis.
4. Cari penyebab non-determinisme (waktu, jaringan, urutan, async), suntikkan clock/ID, gunakan fake server, tunggu kondisi alih-alih sleep, isolasi data; karantina sementara dengan tiket bila perlu, jangan diabaikan.
5. Test yang mereproduksi bug yang pernah terjadi agar perbaikan terbukti dan bug tidak muncul kembali.

## Practical Exercises

1. Petakan test yang sudah ada di proyek Anda ke piramida; temukan lapisan yang kurang.
2. Tulis 5 unit test untuk kalkulasi harga dengan kasus tepi (kosong, diskon, pembulatan).
3. Temukan satu test flaky dan perbaiki penyebabnya.

## Quick Reference

```text
Pyramid: unit (banyak) → widget/component → integration → E2E (sedikit)
Double: dummy · stub · fake · mock · spy · FIRST · AAA
Tes: uang · aturan bisnis · mapper · state · sync · validasi · otorisasi · regression per bug
Deterministik: inject clock/random/UUID · tanpa jaringan nyata · tunggu kondisi, bukan sleep
```

## Related Topics

- [Unit Testing](/testing-performance/unit-testing/)
- [Flutter Testing](/flutter/testing/)
- [Mocking & Dependency Injection](/testing-performance/mocking-di/)
