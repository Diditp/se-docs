---
title: "OOP, SOLID & Design Patterns"
description: "Bank pertanyaan interview OOP, SOLID, dan design patterns: empat pilar OOP, composition vs inheritance, SOLID dengan contoh Dart, serta pattern yang sering ditanyakan (Singleton, Factory, Repository, Adapter, Observer, Strategy, Builder, Decorator)."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, oop, solid, design-patterns, question-bank]
---

## Overview

OOP, SOLID, dan design pattern hampir selalu ditanyakan, di hampir semua tipe perusahaan — dari startup hingga korporat. Interviewer
mencari pemahaman **mengapa** prinsip ini ada, bukan definisi hafalan — siapkan contoh dari kode Flutter/Node.js Anda.

## Why It Matters

Prinsip ini membantu kode mudah diubah, diuji, dan dipahami tim. Menjelaskan pattern dengan contoh nyata menunjukkan
Anda bisa menerapkannya dengan tepat — dan tahu kapan tidak perlu.

## Core Concepts

### Empat pilar OOP

| Pilar | Inti | Contoh |
| --- | --- | --- |
| Encapsulation | Menyembunyikan state, akses lewat method | `_items` private + `addItem()` dengan validasi |
| Abstraction | Mengekspos "apa", menyembunyikan "bagaimana" | `PaymentGateway.charge()` |
| Inheritance | Mewarisi perilaku dari kelas induk | `Discount` → `PercentDiscount` |
| Polymorphism | Satu antarmuka, banyak implementasi | `List<PaymentGateway>` dipanggil seragam |

### SOLID

| Prinsip | Ringkas |
| --- | --- |
| **S**ingle Responsibility | Satu alasan untuk berubah |
| **O**pen/Closed | Terbuka untuk ekstensi, tertutup untuk modifikasi |
| **L**iskov Substitution | Subtipe bisa menggantikan induk tanpa merusak perilaku |
| **I**nterface Segregation | Interface kecil & spesifik |
| **D**ependency Inversion | Bergantung pada abstraksi, bukan implementasi |

Detail: [SOLID Principles](/fundamentals/solid-principles/).

### Pattern yang sering ditanyakan

| Kategori | Pattern | Contoh di proyek |
| --- | --- | --- |
| Creational | Singleton, Factory, Builder | Instance Dio tunggal via DI, `fromJson` factory, builder request |
| Structural | Adapter, Decorator, Facade | Adapter SDK printer, decorator logging/caching repository, facade sync |
| Behavioral | Observer, Strategy, Command | Stream/Bloc, strategi diskon, outbox event |
| Arsitektural | Repository, MVVM/Bloc, DI | Repository di Clean Architecture |

## How It Works

```text
Masalah perubahan → identifikasi bagian yang sering berubah → sembunyikan di balik abstraksi
→ implementasi bisa ditambah/diganti (OCP, DIP) → mudah di-mock untuk test
```

## Implementation

```dart
// Strategy + Open/Closed: tambah jenis diskon tanpa mengubah Checkout
abstract interface class DiscountStrategy {
  int apply(int subtotal);
}
class NoDiscount implements DiscountStrategy { @override int apply(int s) => s; }
class PercentDiscount implements DiscountStrategy {
  PercentDiscount(this.percent);
  final int percent;
  @override int apply(int s) => s - (s * percent ~/ 100);
}
class Checkout {
  Checkout(this.discount);
  final DiscountStrategy discount;
  int total(int subtotal) => discount.apply(subtotal);
}

// Adapter: menyamakan SDK printer berbeda ke satu interface
abstract interface class ReceiptPrinter { Future<void> print(Receipt r); }
class VendorAPrinterAdapter implements ReceiptPrinter {
  VendorAPrinterAdapter(this._sdk);
  final VendorASdk _sdk;
  @override
  Future<void> print(Receipt r) => _sdk.printRaw(EscPos.encode(r));
}

// Decorator: menambah caching tanpa mengubah repository asli
class CachedProductRepository implements ProductRepository {
  CachedProductRepository(this._inner);
  final ProductRepository _inner;
  final _cache = <String, Product>{};
  @override
  Future<Product> getById(String id) async => _cache[id] ??= await _inner.getById(id);
}

// Composition over inheritance
class OrderService {
  OrderService(this._repo, this._payment, this._notifier);   // dependensi disuntikkan (DIP)
  final OrderRepository _repo;
  final PaymentGateway _payment;
  final Notifier _notifier;
}
```

## Best Practices

- **Contoh dulu, definisi kemudian** — "Di aplikasi kasir saya, strategi diskon…".
- **Composition over inheritance** untuk perilaku yang dapat digabung.
- **Sebutkan kapan pattern tidak perlu** (YAGNI) — abstraksi berlebihan juga biaya.
- Kaitkan DIP dengan testability (mock di unit test).

## Anti-Patterns

- God class/God widget yang melakukan semua hal (melanggar SRP).
- Hierarki inheritance dalam & rapuh.
- Singleton global yang menyembunyikan dependensi dan menyulitkan test.
- Menerapkan pattern hanya untuk terlihat "rapi" tanpa masalah nyata.
- Subclass yang melempar `UnimplementedError` untuk method induk (melanggar LSP/ISP).

## Performance Considerations

Abstraksi dan indirection biasanya murah dibanding I/O. Namun decorator/caching yang salah dapat menyebabkan data basi
atau memori membengkak — tentukan TTL dan batas ukuran.

## Security Considerations

Encapsulation membantu keamanan: validasi di satu tempat, state sensitif tidak dapat diubah dari luar. Facade/adapter
untuk SDK pihak ketiga membatasi data yang dikirim keluar.

## Real-World Use Cases

- Repository + DI di Clean Architecture Flutter.
- Strategy untuk aturan harga/diskon/pajak.
- Adapter untuk integrasi perangkat (printer, scanner, payment terminal).
- Observer melalui Stream/Bloc/Flow.

## Interview Questions

1. Jelaskan empat pilar OOP dengan contoh.
2. Apa beda abstract class dan interface (di Dart/Kotlin)?
3. Composition vs inheritance — kapan memakai masing-masing?
4. Jelaskan SOLID beserta contoh pelanggarannya.
5. Apa itu Dependency Injection dan manfaatnya?
6. Kapan Singleton tepat dan apa masalahnya?
7. Jelaskan Repository pattern.
8. Beda Factory dan Builder?
9. Jelaskan Observer pattern dan contohnya di Flutter.
10. Adapter vs Facade vs Decorator?

## Sample Answers

1. Encapsulation (state privat + method terkontrol), Abstraction (kontrak tanpa detail), Inheritance (pewarisan perilaku), Polymorphism (perilaku berbeda lewat antarmuka yang sama) — beri contoh dari kelas di proyek Anda.
2. Abstract class bisa memiliki state & implementasi parsial dan hanya satu yang di-extend; interface mendefinisikan kontrak dan bisa diimplementasi banyak. Di Dart setiap class adalah interface implisit; Dart 3 menambah modifier `interface`, `base`, `final`, `sealed`. Kotlin: `interface` bisa punya default method tetapi tanpa state.
3. Inheritance untuk relasi "is-a" yang stabil dan dangkal; composition untuk "has-a" dan perilaku yang bisa digabung/diganti saat runtime — lebih fleksibel dan mudah diuji, sehingga umumnya diutamakan.
4. S: widget yang memanggil API + menghitung harga + menyimpan DB. O: `if (type == ...)` yang terus bertambah → strategy. L: `Square extends Rectangle` yang merusak `setWidth`. I: interface besar dengan method tak relevan. D: use case yang membuat `DioClient` langsung → injeksikan abstraksi.
5. Dependensi diberikan dari luar (constructor) alih-alih dibuat di dalam; memudahkan penggantian implementasi, mocking di test, dan konfigurasi per environment. Implementasi: constructor injection + container (get_it, Riverpod, Hilt).
6. Tepat untuk resource yang memang tunggal (konfigurasi, connection pool), lebih baik dikelola oleh DI container daripada global static. Masalahnya: state global tersembunyi, sulit di-test, coupling, isu concurrency.
7. Abstraksi akses data yang menyembunyikan sumbernya (API, DB lokal, cache) di balik interface domain; use case tidak tahu data dari mana. Lihat [Repository Pattern & DI](/flutter/repository-pattern-di/).
8. Factory memilih/membuat objek (sering subtipe) dalam satu langkah; Builder menyusun objek kompleks bertahap dengan banyak parameter opsional.
9. Subject memberi tahu banyak observer saat state berubah; di Flutter: `ChangeNotifier`/`ValueNotifier`, `Stream`, Bloc — UI berlangganan dan rebuild saat state berubah.
10. Adapter mengubah antarmuka agar cocok dengan yang diharapkan; Facade menyederhanakan subsistem kompleks dengan antarmuka tunggal; Decorator membungkus objek dengan antarmuka yang sama untuk menambah perilaku (logging, caching).

## Practical Exercises

1. Refactor fungsi perhitungan harga dengan banyak `if/else` menjadi Strategy.
2. Tulis decorator `LoggingRepository` dan uji dengan fake repository.
3. Identifikasi 3 pelanggaran SOLID di proyek lama Anda dan rencana perbaikannya.

## Quick Reference

```text
OOP: Encapsulation · Abstraction · Inheritance · Polymorphism · composition > inheritance
SOLID: SRP · OCP · LSP · ISP · DIP (→ testability)
Creational: Singleton/Factory/Builder · Structural: Adapter/Decorator/Facade · Behavioral: Observer/Strategy/Command
Contoh nyata dulu · sebut kapan TIDAK perlu (YAGNI)
```

## Related Topics

- [SOLID Principles](/fundamentals/solid-principles/)
- [Clean Architecture Questions](/interview/technical/clean-architecture/)
- [Repository Pattern & DI](/flutter/repository-pattern-di/)
