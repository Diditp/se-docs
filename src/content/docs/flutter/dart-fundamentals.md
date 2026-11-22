---
title: "Dart Fundamentals hingga Advanced"
description: "Bahasa Dart dari dasar sampai fitur Dart 3: tipe data, variabel, fungsi, class & constructor, collection, records, patterns, sealed class, mixin, enum, dan class modifiers."
level: beginner
status: complete
version: "Dart 3.x"
updated: 2026-11-12
tags: [dart, language, oop, records, patterns, sealed]
---

## Overview

**Dart** adalah bahasa pemrograman dari Google yang bertipe statis (*sound null safety*), berorientasi objek, dan
dikompilasi **AOT** ke kode mesin (release mobile/desktop), **JIT** saat development (hot reload), dan ke JavaScript/WebAssembly
untuk web. Dart 3 menambahkan **records**, **patterns**, **sealed class**, dan **class modifiers** yang mengubah cara
menulis model dan state di Flutter.

## Why It Matters

Semua kode Flutter adalah Dart. Pemahaman bahasa yang kuat membuat Anda:

- Menulis model & state yang aman (immutable, exhaustive `switch`) tanpa bergantung pada code generation untuk semua hal.
- Memahami pesan error compiler dan analyzer dengan cepat.
- Menjawab pertanyaan interview dasar (`final` vs `const`, factory constructor, mixin) dengan tepat.

## Core Concepts

| Konsep | Ringkas |
| --- | --- |
| `var`, `final`, `const` | `var` bisa diubah; `final` sekali assign (runtime); `const` konstanta compile-time (deeply immutable) |
| Tipe | `int`, `double`, `num`, `String`, `bool`, `List`, `Set`, `Map`, `Record`, `Function`, `Object`, `dynamic`, `Never` |
| Null safety | `String` tidak bisa null; `String?` bisa null |
| Fungsi | first-class, parameter posisional/opsional/bernama (`required`), arrow `=>` |
| Class | constructor generatif, named, factory, const, initializer list, getter/setter |
| Mixin | menambahkan perilaku ke banyak class tanpa inheritance berlapis |
| Extension | menambah method ke tipe yang sudah ada |
| Records | tipe agregat anonim & immutable: `(int, String)`, `({int x, int y})` |
| Patterns | destructuring & matching di `switch`, `if-case`, deklarasi variabel |
| Class modifiers | `sealed`, `final`, `base`, `interface`, `abstract`, `mixin class` |

## How It Works

- **Compile pipeline:** debug memakai JIT di Dart VM (hot reload menyuntikkan kode baru ke VM yang berjalan); release memakai AOT sehingga startup cepat dan tanpa JIT.
- **Sound type system:** jika analyzer mengatakan tipe `String`, runtime menjamin nilainya `String` — memungkinkan optimasi compiler dan menghilangkan kelas bug.
- **Memory:** objek dialokasikan di heap milik isolate dan dibersihkan *garbage collector* generasional (alokasi objek kecil yang berumur pendek sangat murah — cocok untuk widget yang sering dibuat ulang).
- **Canonicalization `const`:** dua ekspresi `const` yang sama menghasilkan **instance yang sama** (`identical(a, b) == true`).

## Implementation

### Variabel, fungsi, dan parameter

```dart
const taxRate = 0.11;                 // compile-time constant
final createdAt = DateTime.now();     // runtime, tidak bisa di-assign ulang

int subtotal(List<int> prices) => prices.fold(0, (sum, p) => sum + p);

// Parameter bernama (wajib & opsional dengan default)
String formatRupiah(int amount, {bool withSymbol = true, String separator = '.'}) {
  final digits = amount.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => separator);
  return withSymbol ? 'Rp$digits' : digits;
}

formatRupiah(18000);                              // Rp18.000
formatRupiah(18000, withSymbol: false);           // 18.000
```

### Class, constructor, dan immutability

```dart
class Product {
  const Product({required this.id, required this.name, required this.price})
      : assert(price >= 0);                         // initializer list + assert (debug)

  // Named constructor
  const Product.free({required String id, required String name})
      : this(id: id, name: name, price: 0);

  // Factory: boleh mengembalikan instance yang sudah ada / subtipe / hasil parsing
  factory Product.fromJson(Map<String, dynamic> json) => Product(
        id: json['id'] as String,
        name: json['name'] as String,
        price: json['price'] as int,
      );

  final String id;
  final String name;
  final int price;                                  // rupiah (integer)

  Product copyWith({String? name, int? price}) =>
      Product(id: id, name: name ?? this.name, price: price ?? this.price);

  @override
  bool operator ==(Object other) =>
      other is Product && other.id == id && other.name == name && other.price == price;

  @override
  int get hashCode => Object.hash(id, name, price);
}
```

### Collection & operator berguna

```dart
final items = [for (final p in products) if (p.price > 0) p.name];   // collection for/if
final all = [...defaults, ...?maybeExtras];                           // spread & null-aware spread
final byId = {for (final p in products) p.id: p};                    // Map comprehension
final unique = {...tags};                                             // Set

final total = cart.items.where((i) => i.qty > 0).map((i) => i.qty * i.price).fold(0, (a, b) => a + b);

final label = user?.name ?? 'Tamu';                                   // null-aware access & if-null
final controller = TextEditingController()..text = 'awal'..selection = const TextSelection.collapsed(offset: 4); // cascade
```

### Dart 3: records & patterns

```dart
// Record sebagai nilai kembalian ganda — tanpa class tambahan
(int total, int count) summarize(List<Order> orders) =>
    (orders.fold(0, (s, o) => s + o.total), orders.length);

final (total, count) = summarize(todayOrders);            // destructuring

// Pattern matching pada JSON
String describe(Map<String, Object?> json) => switch (json) {
      {'type': 'qris', 'amount': int a} => 'QRIS Rp$a',
      {'type': 'cash', 'amount': int a} when a > 1000000 => 'Tunai besar Rp$a',
      {'type': 'cash', 'amount': int a} => 'Tunai Rp$a',
      _ => 'Tidak dikenal',
    };

if (response case {'data': {'token': String token}}) {
  saveToken(token);
}
```

### Sealed class: state yang exhaustive

```dart
sealed class PaymentResult {}
final class PaymentSuccess extends PaymentResult { PaymentSuccess(this.reference); final String reference; }
final class PaymentPending extends PaymentResult {}
final class PaymentFailed extends PaymentResult { PaymentFailed(this.reason); final String reason; }

String message(PaymentResult r) => switch (r) {   // compiler error jika ada subtipe yang lupa ditangani
      PaymentSuccess(:final reference) => 'Berhasil ($reference)',
      PaymentPending() => 'Menunggu pembayaran',
      PaymentFailed(:final reason) => 'Gagal: $reason',
    };
```

### Mixin, extension, dan enhanced enum

```dart
mixin Auditable {
  final List<String> _logs = [];
  void audit(String action) => _logs.add('${DateTime.now().toUtc().toIso8601String()} $action');
  List<String> get logs => List.unmodifiable(_logs);
}
class CashDrawer with Auditable { void open() => audit('drawer opened'); }

extension RupiahX on int {
  String get rupiah => formatRupiah(this);
}
print(18000.rupiah);   // Rp18.000

enum PaymentMethod {
  cash('Tunai', requiresOnline: false),
  qris('QRIS', requiresOnline: true),
  edc('Kartu (EDC)', requiresOnline: true);

  const PaymentMethod(this.label, {required this.requiresOnline});
  final String label;
  final bool requiresOnline;
}
```

### Class modifiers (Dart 3)

| Modifier | Bisa di-`extends` luar library? | Bisa di-`implements` luar library? | Dipakai untuk |
| --- | --- | --- | --- |
| `abstract` | ✓ | ✓ | Kontrak dengan implementasi sebagian |
| `interface` | ✗ | ✓ | Kontrak murni (mis. repository) |
| `base` | ✓ | ✗ | Memastikan implementasi dasar selalu diwarisi |
| `final` | ✗ | ✗ | Tipe tertutup, aman dari subclass luar |
| `sealed` | ✗ (hanya di library yang sama) | ✗ | Hierarki tertutup → `switch` exhaustive |

## Best Practices

- **Default ke `final`**, `const` bila mungkin — immutability mencegah mutasi tak sengaja dan memungkinkan optimasi widget.
- **Uang sebagai `int`** (rupiah/sen), bukan `double` — floating point menyebabkan selisih pembulatan.
- **Sealed class untuk state & result** — compiler memaksa semua kasus ditangani.
- **Records untuk nilai kembalian lokal/sementara**, class untuk konsep domain yang punya nama dan perilaku.
- **Parameter bernama + `required`** untuk constructor dengan lebih dari 2 parameter — panggilan lebih jelas dan aman saat urutan berubah.
- **Override `==` dan `hashCode` bersamaan** (atau gunakan `equatable`/`freezed`) untuk value object.
- **Aktifkan lint ketat** (`flutter_lints`/`very_good_analysis`) dan perlakukan info sebagai error di CI.

## Anti-Patterns

- `dynamic` di mana-mana → kehilangan keamanan tipe; gunakan `Object?` + type check bila tipe benar-benar tidak diketahui.
- `!` untuk "menenangkan" compiler → crash runtime.
- Mutable public fields pada model (`String name;`) → state berubah tanpa terdeteksi UI.
- Mixin untuk berbagi state yang kompleks → coupling tersembunyi; lebih baik composition.
- Extension yang menyembunyikan logika bisnis penting (sulit ditemukan) — extension untuk utilitas kecil saja.
- `double` untuk uang; `DateTime.now()` lokal untuk data yang disimpan (gunakan UTC).

## Performance Considerations

- `const` widget/objek di-canonicalize → tidak dialokasikan ulang dan Flutter melewati rebuild subtree tersebut.
- Hindari membuat closure/collection besar di loop panas; gunakan `StringBuffer` untuk menggabung string banyak.
- `List.generate(growable: false)` / `List.filled` untuk list berukuran tetap.
- Ingat bahwa `Iterable` dari `where`/`map` bersifat **lazy** — dievaluasi ulang setiap iterasi; panggil `.toList()` sekali jika hasilnya dipakai berkali-kali.

## Security Considerations

- Validasi dan cast eksplisit saat parsing JSON (`json['price'] as int`) — jangan percaya bentuk data dari server/deep link.
- Jangan menyimpan secret sebagai `const` di kode — string literal mudah diekstrak dari binary.
- `toString()` pada model sensitif (token, PIN) jangan mengeluarkan nilai aslinya — override untuk me-mask.

## Real-World Use Cases

- **Model transaksi POS** immutable dengan `copyWith`, uang `int`, dan `fromJson` factory.
- **Hasil pembayaran** sebagai sealed class (`Success/Pending/Failed`) yang ditangani exhaustive di UI.
- **Enum metode pembayaran** dengan properti (label, butuh online) untuk menonaktifkan opsi saat offline.

## Interview Questions

1. Apa beda `var`, `final`, dan `const`?
2. Apa itu factory constructor dan kapan dipakai?
3. Apa itu mixin? Bedanya dengan inheritance dan interface?
4. Jelaskan records dan patterns di Dart 3.
5. Apa manfaat `sealed` class?
6. Apa beda JIT dan AOT di Dart?

## Sample Answers

1. `var` variabel biasa yang bisa di-assign ulang. `final` hanya bisa di-assign sekali, nilainya bisa ditentukan saat runtime. `const` konstanta compile-time yang immutable sampai ke dalam dan di-canonicalize sehingga instance yang sama dipakai ulang.
2. Constructor yang tidak wajib membuat instance baru — bisa mengembalikan instance dari cache, subtipe, atau hasil parsing (`fromJson`). Dipakai untuk parsing, singleton/cache, dan memilih implementasi.
3. Mixin menambahkan method/field ke class lain via `with` tanpa membentuk hubungan "is-a" bertingkat; satu class bisa memakai banyak mixin. Inheritance (`extends`) hanya satu parent; `implements` hanya mewajibkan kontrak tanpa membawa implementasi.
4. Records adalah tipe agregat immutable tanpa nama class (`(int, String)` atau dengan field bernama), cocok untuk mengembalikan beberapa nilai. Patterns memungkinkan destructuring dan pencocokan bentuk data di `switch`, `if-case`, dan deklarasi variabel — termasuk guard `when`.
5. Hierarki tertutup: semua subtipe diketahui compiler sehingga `switch` atas sealed type dicek exhaustive — menambah state baru akan menimbulkan error di setiap tempat yang belum menanganinya.
6. JIT mengompilasi saat runtime (cepat untuk development, mendukung hot reload). AOT mengompilasi sebelum dijalankan ke kode mesin (startup cepat, performa stabil) — dipakai untuk build release.

## Practical Exercises

1. Buat model `Order` immutable dengan `copyWith`, `==`, `hashCode`, `fromJson`, `toJson`, dan uang dalam `int`.
2. Ubah state halaman dari beberapa boolean menjadi sealed class dan tangani dengan `switch` expression.
3. Parse respons JSON bersarang dengan patterns + `if-case` dan tangani bentuk yang tidak valid.
4. Buat extension `DateTime.toLocalLabel()` dan enum `PaymentMethod` dengan properti.

## Quick Reference

```text
final > var · const bila bisa · int untuk uang · UTC untuk waktu
Named params + required · factory untuk parsing/cache · copyWith + ==/hashCode untuk value object
Records (a, b) untuk multi-return · switch expression + patterns · sealed untuk state exhaustive
mixin = perilaku bersama · extension = utilitas kecil · enum bisa punya field & method
```

## Related Topics

- [Null Safety, Generics & Extensions](/flutter/null-safety-generics-extensions/)
- [Async Programming](/flutter/async-programming/)
- [State Management](/flutter/state-management/)
- [OOP](/fundamentals/oop/) · [SOLID Principles](/fundamentals/solid-principles/)
- Referensi resmi: [Dart language tour](https://dart.dev/language), [Patterns](https://dart.dev/language/patterns), [Class modifiers](https://dart.dev/language/class-modifiers).
