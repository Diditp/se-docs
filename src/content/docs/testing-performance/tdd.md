---
title: "Test-Driven Development (TDD)"
description: "Test-Driven Development dari konsep sampai praktik di Flutter: siklus red–green–refactor, contoh lengkap perhitungan pajak & service charge POS, TDD untuk BLoC dan widget, test-first untuk bug fix, kasus bersama dengan backend, gaya classicist vs mockist, kapan TDD cocok dan tidak, serta cara menjelaskannya di interview."
level: intermediate
status: complete
version: "Dart test · bloc_test · flutter_test · mocktail (konsep berlaku juga untuk JUnit5/Kotest & Vitest/Jest)"
updated: 2026-11-20
tags: [testing, tdd, unit-test, dart, flutter, bloc, red-green-refactor]
---

## Overview

**Test-Driven Development (TDD)** adalah cara menulis kode dengan urutan terbalik dari biasanya: tulis **test yang gagal** dulu, lalu tulis **kode paling sedikit** agar test itu lulus, lalu **rapikan** kodenya sambil memastikan semua test tetap hijau. Siklus pendek ini diulang terus:

```text
RED      → tulis satu test kecil untuk perilaku berikutnya; jalankan; harus GAGAL
GREEN    → tulis kode paling sederhana agar test itu LULUS (boleh "jelek")
REFACTOR → rapikan kode & test (nama, duplikasi, struktur) tanpa mengubah perilaku; semua test tetap hijau
```

TDD bukan sekadar "punya test". Test dipakai sebagai **alat desain**: menulis test lebih dulu memaksa Anda memikirkan API, input, output, dan kasus tepi sebelum implementasi.

## Why It Matters

- **Banyak lowongan menyebut "unit testing or TDD"**, dan interviewer sering bertanya "apa itu TDD" atau "pernah pakai TDD?". Jawaban yang konkret membedakan Anda dari kandidat yang hanya hafal definisi.
- **Paling berguna untuk logika yang aturannya jelas dan mahal kalau salah**: uang, pajak, diskon, pembulatan, validasi, state machine, parsing. Di aplikasi keuangan/POS, selisih Rp1 saja membuat laporan tidak cocok.
- **Mencegah regresi**: setiap perilaku punya test sejak lahir, jadi refactor berikutnya aman.
- **Desain lebih baik**: kode yang ditulis test-first cenderung punya dependency yang disuntikkan, fungsi kecil, dan efek samping terpisah, karena kode seperti itu yang mudah dites.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Red–green–refactor | Siklus inti TDD. Satu putaran idealnya beberapa menit |
| Test list | Daftar perilaku/kasus yang akan dites, ditulis sebelum mulai; dicoret satu per satu |
| Baby steps | Satu test kecil per putaran; jangan menulis 10 test sekaligus lalu 200 baris kode |
| Fake it → triangulate | Mulai dengan jawaban "palsu" (mis. `return 0`), lalu test kedua memaksa generalisasi |
| Classicist (Detroit) | Tes perilaku lewat objek asli/fake; mock hanya untuk batas I/O. Cocok untuk domain logic |
| Mockist (London) | Desain dari luar ke dalam; kolaborator di-mock dan interaksi diverifikasi |
| Outside-in vs inside-out | Mulai dari test level fitur (acceptance) turun ke unit, atau dari unit terkecil naik ke fitur |
| ATDD / BDD | Variasi TDD di level kebutuhan bisnis: acceptance test / skenario Given–When–Then ditulis bersama tim bisnis |
| Test-after | Kode dulu, test belakangan. Tetap berharga, tetapi bukan TDD |

**TDD vs unit testing:** unit testing adalah *jenis* test. TDD adalah *cara kerja* (test lebih dulu). Anda bisa punya banyak unit test tanpa TDD, dan TDD bisa juga dipakai untuk test integrasi atau widget.

## How It Works

Alur satu fitur dengan TDD:

```text
1. Pahami aturan bisnis → tulis test list (contoh nyata, termasuk kasus tepi)
2. Pilih kasus PALING SEDERHANA → RED → GREEN → REFACTOR
3. Kasus berikutnya → RED (test baru gagal) → GREEN (generalisasi) → REFACTOR
4. Ulangi sampai test list habis; tambahkan kasus baru yang ditemukan di jalan
5. Commit kecil-kecil saat hijau
```

Aturan praktis:

- Jangan menulis kode produksi kecuali untuk membuat test yang gagal menjadi lulus.
- Pastikan test benar-benar **gagal** dulu (dan gagal karena alasan yang benar). Test yang langsung hijau mungkin tidak menguji apa-apa.
- Refactor hanya saat semua test hijau.

## Implementation

### 1. Contoh lengkap: kalkulator pajak POS (Dart)

**Aturan bisnis (contoh):**

- Harga dalam **Rupiah utuh (`int`)**, bukan `double`.
- Service charge berlaku untuk semua item.
- Pajak berlaku hanya untuk item kena pajak, dihitung dari harga item + service charge-nya.
- Tarif dalam **basis point** (1% = 100 bp) agar tetap integer. Pembulatan setengah ke atas, **di level total** (harus sama dengan backend).

**Test list:**

```text
[ ] keranjang kosong → semua 0
[ ] item tidak kena pajak → pajak 0, service charge tetap dihitung
[ ] item kena pajak → pajak dari (harga + service charge)
[ ] keranjang campuran
[ ] pembulatan setengah ke atas (…,5 → naik)
[ ] qty dikalikan harga
```

**Putaran 1 — RED:** test paling sederhana.

```dart
// test/tax_calculator_test.dart
import 'package:test/test.dart';
import 'package:pos/domain/tax_calculator.dart';

void main() {
  const calc = TaxCalculator(serviceChargeBp: 500, taxBp: 1000); // 5% & 10% (contoh)

  test('empty cart has zero totals', () {
    final r = calc.calculate(const []);
    expect(r.total, 0);
  });
}
```

Test gagal karena `TaxCalculator` belum ada (gagal kompilasi juga dihitung RED).

**Putaran 1 — GREEN:** kode paling sederhana.

```dart
// lib/domain/tax_calculator.dart
class Line {
  const Line({required this.price, required this.qty, this.taxable = true});
  final int price;
  final int qty;
  final bool taxable;
}

class TaxResult {
  const TaxResult({this.subtotal = 0, this.serviceCharge = 0, this.tax = 0, this.total = 0});
  final int subtotal, serviceCharge, tax, total;
}

class TaxCalculator {
  const TaxCalculator({required this.serviceChargeBp, required this.taxBp});
  final int serviceChargeBp;
  final int taxBp;

  TaxResult calculate(List<Line> lines) => const TaxResult(); // "fake it"
}
```

**Putaran 2 — RED:** item tidak kena pajak memaksa perhitungan subtotal & service charge.

```dart
test('non-taxable item gets service charge but no tax', () {
  final r = calc.calculate(const [Line(price: 10000, qty: 2, taxable: false)]);
  expect(r.subtotal, 20000);
  expect(r.serviceCharge, 1000); // 5% dari 20.000
  expect(r.tax, 0);
  expect(r.total, 21000);
});
```

**Putaran 2 — GREEN:**

```dart
TaxResult calculate(List<Line> lines) {
  final subtotal = lines.fold<int>(0, (sum, l) => sum + l.price * l.qty);
  final service = _percent(subtotal, serviceChargeBp);
  return TaxResult(subtotal: subtotal, serviceCharge: service, total: subtotal + service);
}

static int _percent(int amount, int bp) => (amount * bp + 5000) ~/ 10000; // half-up, amount ≥ 0
```

**Putaran 3 — RED → GREEN:** item kena pajak.

```dart
test('taxable item is taxed on price plus its service charge', () {
  final r = calc.calculate(const [Line(price: 10000, qty: 1)]);
  expect(r.serviceCharge, 500);
  expect(r.tax, 1050); // 10% dari 10.500
  expect(r.total, 11550);
});
```

```dart
TaxResult calculate(List<Line> lines) {
  int amount(Line l) => l.price * l.qty;
  final subtotal = lines.fold<int>(0, (s, l) => s + amount(l));
  final taxableBase = lines.where((l) => l.taxable).fold<int>(0, (s, l) => s + amount(l));

  final service = _percent(subtotal, serviceChargeBp);
  final tax = _percent(taxableBase + _percent(taxableBase, serviceChargeBp), taxBp);

  return TaxResult(subtotal: subtotal, serviceCharge: service, tax: tax, total: subtotal + service + tax);
}
```

**Putaran 4 — kasus tepi pembulatan dan keranjang campuran** sebagai test parameterized:

```dart
group('rounding and mixed carts', () {
  final cases = <({String name, List<Line> lines, int tax, int total})>[
    (name: 'mixed cart', lines: const [Line(price: 10000, qty: 1), Line(price: 5000, qty: 2, taxable: false)],
        tax: 1050, total: 22050),
    (name: 'half rounds up', lines: const [Line(price: 1010, qty: 1)], tax: 106, total: 1167),
  ];

  for (final c in cases) {
    test(c.name, () {
      final r = calc.calculate(c.lines);
      expect(r.tax, c.tax);
      expect(r.total, c.total);
    });
  }
});
```

Hitung manual kasus pembulatan sebelum menulis angka di test (1010 → service 50,5 → 51; basis pajak 1010 + 51 = 1061 → pajak 106,1 → 106; total 1010 + 51 + 106 = 1167). Kalau angka test berasal dari menjalankan kode, itu bukan TDD; itu hanya memotret perilaku yang mungkin salah.

**REFACTOR:** setelah semua hijau, misalnya pindahkan `_percent` ke value object `Money`, beri nama yang jelas pada aturan ("service charge dulu, lalu pajak"), dan hapus duplikasi di test. Jalankan ulang: harus tetap hijau.

### 2. Kasus bersama dengan backend (agar hasil app = server)

Untuk aturan uang yang dihitung di dua tempat (app offline dan backend), sepakati **daftar kasus** bersama tim backend, misalnya file `tax_cases.json` berisi input dan output yang diharapkan. Kedua sisi menjalankan test dari file yang sama.

```dart
// test/tax_cases_test.dart (import 'dart:convert' dan 'dart:io')
final cases = jsonDecode(File('test/fixtures/tax_cases.json').readAsStringSync()) as List;
for (final c in cases) {
  test(c['name'] as String, () {
    final lines = (c['lines'] as List).map((j) => Line(price: j['price'], qty: j['qty'], taxable: j['taxable'])).toList();
    expect(calc.calculate(lines).total, c['expectedTotal']);
  });
}
```

Setiap kali ditemukan selisih di produksi, tambahkan transaksi itu sebagai kasus baru **sebelum** memperbaiki kode.

### 3. Test-first untuk bug fix

```text
1. Reproduksi bug dalam test → test GAGAL (membuktikan bug ada)
2. Perbaiki kode → test LULUS
3. Test tetap di repo sebagai regression test
```

Ini bentuk TDD paling mudah dimulai di tim yang belum terbiasa.

### 4. TDD untuk BLoC

Tulis `blocTest` lebih dulu untuk transisi state yang diinginkan, baru implementasikan event handler.

```dart
blocTest<CartBloc, CartState>(
  'adding a taxable item updates the total',
  build: () => CartBloc(calculator: const TaxCalculator(serviceChargeBp: 500, taxBp: 1000)),
  act: (bloc) => bloc.add(const ItemAdded(Line(price: 10000, qty: 1))),
  expect: () => [isA<CartState>().having((s) => s.total, 'total', 11550)],
);
```

Kalkulator disuntikkan lewat constructor, sehingga BLoC mudah dites dan aturan pajak tetap di satu tempat.

### 5. TDD untuk widget

Untuk UI, TDD paling berguna pada perilaku, bukan tata letak piksel.

```dart
testWidgets('pay button is disabled when cart is empty', (tester) async {
  await tester.pumpWidget(MaterialApp(home: CheckoutPage(state: CartState.empty())));
  final button = tester.widget<FilledButton>(find.byKey(const Key('pay-button')));
  expect(button.onPressed, isNull);
});
```

### 6. Di bahasa lain (ringkas)

| Stack | Alat | Catatan |
| --- | --- | --- |
| Dart/Flutter | `test`, `flutter_test`, `bloc_test`, `mocktail` | `flutter test --watch` belum ada bawaan; jalankan test per file agar cepat |
| Kotlin/Android | JUnit5/Kotest, MockK, Turbine | Domain di modul JVM murni → test sangat cepat |
| TypeScript/Node | Vitest/Jest | `vitest --watch` cocok untuk siklus TDD |

## Best Practices

- **Mulai dari test list** dan kasus paling sederhana.
- **Satu perilaku per test**, nama test menjelaskan perilaku (`'non-taxable item gets service charge but no tax'`).
- **Angka harapan dihitung manual atau dari aturan bisnis**, bukan disalin dari output kode.
- **Uang selalu integer** (unit terkecil) dan aturan pembulatan ditulis eksplisit.
- **Test harus cepat** (milidetik). Pisahkan I/O; domain logic tanpa Flutter/DB.
- **Refactor test juga**, bukan hanya kode produksi.
- **Commit saat hijau** agar mudah kembali bila refactor salah arah.

## Anti-Patterns

- Menulis banyak test sekaligus lalu kode besar sekaligus (kehilangan umpan balik cepat).
- Test yang tidak pernah terlihat gagal.
- Menguji detail implementasi (method privat, urutan panggilan internal) sehingga refactor memecahkan test.
- Mock berlebihan pada domain logic; cukup objek asli atau fake.
- "TDD" untuk tata letak UI piksel per piksel (lebih cocok golden test setelah desain stabil).
- Melewatkan langkah refactor sehingga kode "green" tetapi berantakan.

## Performance Considerations

Siklus TDD bergantung pada umpan balik cepat. Jaga suite unit test domain tetap di bawah beberapa detik: tanpa I/O nyata, tanpa `Future.delayed` asli (pakai `fakeAsync`), dan jalankan test per file saat mengerjakan satu fitur. Test integrasi dan E2E yang lambat dijalankan di CI, bukan di setiap putaran.

## Security Considerations

TDD efektif untuk aturan keamanan yang bisa dinyatakan sebagai perilaku: validasi input, pengecekan izin/role, batas nominal transaksi, dan isolasi data antar tenant. Tulis test "harus ditolak" lebih dulu (mis. user role kasir tidak boleh membatalkan transaksi), lalu implementasikan pengecekannya. Jangan menaruh data pelanggan atau secret nyata di fixture test.

## Real-World Use Cases

- **POS offline:** perhitungan pajak dan service charge dikembangkan test-first dengan kasus bersama backend, sehingga transaksi yang dikirim dari perangkat selalu cocok dengan perhitungan server.
- **Aplikasi keuangan:** fungsi pembulatan, konversi mata uang, dan alokasi pembayaran piutang ditulis dengan TDD karena kesalahannya langsung terlihat di laporan akuntan.
- **Bug produksi:** setiap crash/selisih direproduksi dulu dalam test sebelum diperbaiki.

## Interview Questions

1. Apa itu TDD dan bagaimana siklusnya?
2. Apa bedanya TDD dengan sekadar menulis unit test?
3. Kapan TDD tidak cocok dipakai?
4. Bagaimana Anda menerapkan TDD di proyek Flutter dengan BLoC?
5. Apa bedanya pendekatan classicist dan mockist?

## Sample Answers

1. TDD berarti menulis test yang gagal lebih dulu, lalu kode paling sedikit agar lulus, lalu merapikan kode dengan test tetap hijau (red–green–refactor), diulang dalam siklus pendek.
2. Unit test adalah jenis test; TDD adalah cara kerja di mana test ditulis sebelum kode dan dipakai untuk mendorong desain. Unit test bisa ditulis setelah kode tanpa TDD.
3. Saat eksplorasi/prototipe yang kemungkinan dibuang, tata letak UI yang masih berubah-ubah, atau integrasi dengan sistem eksternal yang perilakunya belum jelas. Di situ lebih praktis membuat spike dulu, lalu menambahkan test setelah arah jelas.
4. Saya memulai dari domain logic murni (mis. kalkulator pajak) dengan unit test, lalu `blocTest` untuk transisi state sebelum menulis event handler, dan widget test untuk perilaku penting seperti tombol bayar nonaktif saat keranjang kosong. Dependency disuntikkan agar semuanya mudah dites.
5. Classicist menguji hasil/perilaku memakai objek asli atau fake dan hanya memalsukan batas I/O; mockist mendesain dari luar ke dalam dengan memalsukan kolaborator dan memverifikasi interaksi. Untuk domain logic saya cenderung classicist karena test lebih tahan refactor.

## Practical Exercises

1. Kembangkan `TaxCalculator` di atas dengan TDD, tambahkan diskon per item (diskon sebelum service charge) dan kasus diskon 100%.
2. Pilih satu bug lama di proyek Anda, reproduksi dalam test yang gagal, lalu perbaiki.
3. Tulis `blocTest` lebih dulu untuk `CartBloc` (tambah item, hapus item, ubah qty), lalu implementasikan.
4. Buat `tax_cases.json` berisi 5 kasus dan jalankan dari test Dart.

## Quick Reference

```text
RED (test gagal) → GREEN (kode minimal) → REFACTOR (rapikan, tetap hijau) · siklus menit
Test list · kasus paling sederhana dulu · fake it → triangulate · satu perilaku per test
Uang = int (unit terkecil) · tarif basis point · aturan pembulatan eksplisit · kasus bersama backend
Bug fix: test gagal dulu → perbaiki → regression test
Flutter: domain unit test → blocTest → widget test perilaku · inject dependency
Cocok: aturan bisnis jelas (uang, pajak, validasi, state). Kurang cocok: prototipe, UI yang masih berubah
```

## Related Topics

- [Unit Testing](/testing-performance/unit-testing/)
- [Mocking & Dependency Injection](/testing-performance/mocking-di/)
- [Unit, Widget & Integration Testing (Flutter)](/flutter/testing/)
- [Test Coverage](/testing-performance/test-coverage/)
