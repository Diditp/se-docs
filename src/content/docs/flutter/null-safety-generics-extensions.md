---
title: "Null Safety, Generics & Extensions"
description: "Sound null safety di Dart (nullable type, late, required, flow analysis), generics untuk kode reusable yang tetap type-safe, dan extension methods — dengan pola nyata di Flutter."
level: intermediate
status: complete
version: "Dart 3.x"
updated: 2026-11-12
tags: [dart, null-safety, generics, extensions]
---

## Overview

- **Null safety** — tipe non-nullable (`String`) tidak pernah berisi `null`; tipe nullable (`String?`) harus ditangani eksplisit sebelum dipakai. Di Dart sifatnya *sound*: jaminan ini berlaku di runtime.
- **Generics** — parameter tipe (`List<T>`, `Result<T>`, `Repository<T, ID>`) agar satu kode bisa dipakai untuk banyak tipe tanpa kehilangan keamanan tipe.
- **Extensions** — menambahkan method/getter ke tipe yang sudah ada (termasuk tipe library) tanpa mewarisi atau mengubahnya.

## Why It Matters

`Null check operator used on a null value` dan `type 'Null' is not a subtype of type 'String'` adalah crash Flutter paling
umum. Null safety yang dipakai dengan benar memindahkan bug tersebut ke waktu compile. Generics menghilangkan duplikasi
(mis. satu `Result<T>` untuk semua repository) dan extension membuat kode UI lebih ringkas tanpa helper class global.

## Core Concepts

| Fitur | Arti |
| --- | --- |
| `T?` | Nullable type |
| `!` | Null assertion — "saya yakin tidak null" (crash jika salah) |
| `?.` `??` `??=` | Null-aware access, if-null, assign-if-null |
| `late` | Inisialisasi ditunda; dicek saat pertama dibaca |
| `required` | Parameter bernama wajib |
| Flow analysis (promotion) | Setelah `if (x != null)`, variabel lokal dianggap non-null |
| `<T>` | Type parameter pada class/method |
| `<T extends Bound>` | Bounded generic |
| Variance | `List<Cat>` adalah `List<Animal>` (covariant) — hati-hati saat menulis |
| `extension Name on Type` | Extension method |
| `extension type` (Dart 3.3+) | Wrapper zero-cost atas tipe lain (mis. `OrderId` di atas `String`) |

## How It Works

- **Type promotion** hanya bekerja pada **variabel lokal** dan (sejak Dart 3.2) **private final field** dalam library yang sama. Public field atau getter tidak dipromosikan karena nilainya bisa berubah di antara pengecekan dan penggunaan.
- **`late`**: compiler menyisipkan pengecekan; membaca `late` yang belum diisi melempar `LateInitializationError`. `late final x = compute();` dievaluasi malas saat pertama dibaca.
- **Generics di Dart bersifat reified**: informasi tipe tersedia saat runtime (`list is List<int>` bekerja), berbeda dengan Java yang menghapus tipe (erasure).
- **Extension di-resolve secara statis**: berdasarkan tipe statis variabel, bukan tipe runtime — dan tidak bekerja pada `dynamic`.

## Implementation

### Null safety yang benar

```dart
class Customer {
  const Customer({required this.id, required this.name, this.phone});
  final String id;
  final String name;
  final String? phone;            // memang opsional di domain
}

String contactLabel(Customer c) {
  final phone = c.phone;          // salin ke lokal → bisa dipromosikan
  if (phone == null || phone.isEmpty) return c.name;
  return '${c.name} ($phone)';    // phone sudah String (non-null)
}

// Parsing aman dari JSON
Customer customerFromJson(Map<String, dynamic> j) => Customer(
      id: j['id'] as String,
      name: (j['name'] as String?) ?? 'Tanpa nama',
      phone: j['phone'] as String?,
    );
```

```dart
// late untuk dependensi yang pasti diisi di initState
class _ScannerPageState extends State<ScannerPage> {
  late final ScannerController _controller;   // ✅ diisi sebelum dipakai
  @override
  void initState() {
    super.initState();
    _controller = ScannerController(onScan: _handle);
  }
  ...
}
```

### Generics: Result dan Repository reusable

```dart
sealed class Result<T> {
  const Result();
  R when<R>({required R Function(T) ok, required R Function(Failure) err}) => switch (this) {
        Ok<T>(:final value) => ok(value),
        Err<T>(:final failure) => err(failure),
      };
  Result<R> map<R>(R Function(T) f) => switch (this) {
        Ok<T>(:final value) => Ok(f(value)),
        Err<T>(:final failure) => Err(failure),
      };
}
final class Ok<T> extends Result<T> { const Ok(this.value); final T value; }
final class Err<T> extends Result<T> { const Err(this.failure); final Failure failure; }
```

```dart
// Bounded generic: semua entity punya id
abstract interface class Entity { String get id; }

class InMemoryRepository<T extends Entity> {
  final _items = <String, T>{};
  void save(T item) => _items[item.id] = item;
  T? findById(String id) => _items[id];
  List<T> all() => List.unmodifiable(_items.values);
}

final repo = InMemoryRepository<Product>();   // Product implements Entity
```

```dart
// Generic method dengan type inference
T firstWhereOr<T>(Iterable<T> items, bool Function(T) test, T orElse) {
  for (final i in items) { if (test(i)) return i; }
  return orElse;
}
```

### Extensions

```dart
extension ContextX on BuildContext {
  ThemeData get theme => Theme.of(this);
  TextTheme get text => Theme.of(this).textTheme;
  void showSnack(String msg) =>
      ScaffoldMessenger.of(this).showSnackBar(SnackBar(content: Text(msg)));
}

extension IterableSumX on Iterable<int> {
  int get sum => fold(0, (a, b) => a + b);
}

extension NullableStringX on String? {
  bool get isNullOrBlank => this == null || this!.trim().isEmpty;
}

// Pemakaian
context.showSnack('Tersimpan');
final total = cart.items.map((i) => i.subtotal).sum;
```

### Extension type: ID yang tidak tertukar

```dart
extension type const OrderId(String value) {}
extension type const CustomerId(String value) {}

Future<Order> loadOrder(OrderId id) async => ...;

loadOrder(OrderId('0192f...'));        // ✅
// loadOrder(CustomerId('...'));       // ❌ compile error — mencegah salah ID
```

:::caution[Version-dependent]
Extension type tersedia sejak Dart 3.3; promosi private final field sejak Dart 3.2. Cek `environment: sdk:` di `pubspec.yaml`.
:::

## Best Practices

- **Nullable hanya bila domain memang mengizinkan "tidak ada nilai"** — jangan menjadikan semua field nullable untuk "aman".
- **Salin field nullable ke variabel lokal** sebelum dicek agar dipromosikan, daripada memakai `!`.
- **`late` hanya untuk inisialisasi yang dijamin terjadi** (mis. di `initState`) atau lazy compute; jangan sebagai pengganti nullable.
- **Generics dengan bound yang bermakna** (`T extends Entity`) agar method bisa memakai properti umum.
- **Extension kecil, murni, dan mudah ditemukan** — kumpulkan di `core/utils/extensions/`, beri nama `<Type>X`.
- **Extension type untuk ID & value object** penting (OrderId, Money) — mencegah salah argumen tanpa biaya runtime.

## Anti-Patterns

- `value!` berulang di kode UI — gunakan pengecekan + early return atau default yang jelas.
- `late` untuk field yang mungkin tidak pernah diisi → `LateInitializationError` di production.
- `List<dynamic>`/`Map<String, dynamic>` mengalir sampai ke UI — parse menjadi model bertipe di data layer.
- Extension yang mengandung logika bisnis inti atau mengakses service global.
- Generics berlapis-lapis yang sulit dibaca (`Repository<Result<Page<List<T>>>>`) — sederhanakan dengan tipe bernama.

## Performance Considerations

- Null safety yang sound memungkinkan compiler menghapus banyak pengecekan null → kode AOT lebih kecil & cepat.
- Extension method dan extension type di-resolve statis — **tanpa overhead runtime** dibanding memanggil fungsi biasa.
- Generics reified berarti `is List<int>` memerlukan pengecekan tipe elemen saat runtime pada cast collection — hindari `cast<T>()` berulang pada list besar; parse sekali ke tipe yang benar.

## Security Considerations

- Validasi null/tipe pada data dari luar (API, deep link, platform channel) di boundary; jangan biarkan `as` cast gagal di tengah UI.
- Extension type `OrderId`/`TenantId` membantu mencegah bug otorisasi akibat salah meneruskan ID di client — tetapi otorisasi tetap di server.

## Real-World Use Cases

- `Result<T>` generik untuk semua repository di Clean Architecture.
- `extension ContextX` untuk akses theme, l10n, dan snackbar yang konsisten.
- `OrderId`/`ProductId` extension type pada aplikasi POS untuk mencegah tertukarnya ID di fungsi sync.

## Interview Questions

1. Apa itu sound null safety?
2. Kapan memakai `late`, dan apa risikonya?
3. Mengapa field publik nullable tidak bisa dipromosikan setelah dicek?
4. Apa itu bounded generic? Beri contoh.
5. Bagaimana extension method di-resolve? Bisakah dipakai pada `dynamic`?

## Sample Answers

1. Sistem tipe menjamin bahwa ekspresi bertipe non-nullable tidak pernah bernilai null saat runtime, sehingga null error dipindahkan ke compile time dan compiler bisa mengoptimasi kode.
2. Untuk variabel non-nullable yang inisialisasinya ditunda tetapi pasti terjadi sebelum dibaca (mis. di `initState`), atau untuk inisialisasi malas (`late final x = compute()`). Risikonya `LateInitializationError` saat dibaca sebelum diisi.
3. Getter/field publik bisa di-override atau nilainya berubah di antara pengecekan dan pemakaian, sehingga compiler tidak bisa menjamin tetap non-null. Solusinya salin ke variabel lokal (atau gunakan private final field di Dart 3.2+).
4. Type parameter yang dibatasi supertype, mis. `class Repository<T extends Entity>`, sehingga di dalam class kita bisa memakai `item.id` karena semua `T` dijamin punya `id`.
5. Secara statis berdasarkan tipe yang diketahui compiler, bukan tipe runtime. Tidak bekerja pada ekspresi bertipe `dynamic` karena compiler tidak tahu tipenya.

## Practical Exercises

1. Cari semua `!` di project Anda dan ganti dengan pengecekan/promotion atau default yang tepat.
2. Implementasikan `Result<T>` dengan `map`, `flatMap`, dan `when`; gunakan di dua repository.
3. Buat `InMemoryRepository<T extends Entity>` untuk test fake.
4. Buat extension type `Money` di atas `int` dengan operator `+` dan getter `formatted`.

## Quick Reference

```text
T? nullable · ! = crash jika null (hindari) · ?. ?? ??= · late = pasti diisi sebelum dibaca
Promosi: variabel lokal (dan private final field Dart 3.2+)
Generics: <T>, <T extends Bound>, reified · Result<T> untuk semua repository
extension XOn on Type {...} — statis, tanpa overhead · extension type = wrapper zero-cost
```

## Related Topics

- [Dart Fundamentals](/flutter/dart-fundamentals/)
- [Error Handling](/flutter/error-handling/)
- [Repository Pattern & DI](/flutter/repository-pattern-di/)
- Referensi resmi: [Sound null safety](https://dart.dev/null-safety), [Generics](https://dart.dev/language/generics), [Extension methods](https://dart.dev/language/extension-methods), [Extension types](https://dart.dev/language/extension-types).
