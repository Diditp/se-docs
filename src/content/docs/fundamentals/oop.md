---
title: "Object-Oriented Programming (OOP)"
description: "Konsep OOP: class & object, encapsulation, abstraction, inheritance, polymorphism, interface vs abstract class, composition over inheritance, dan value object — dengan contoh Dart, Kotlin, dan TypeScript."
level: beginner
status: complete
updated: 2026-11-12
tags: [fundamentals, oop, dart, kotlin, typescript]
---

## Overview

**Object-Oriented Programming (OOP)** memodelkan program sebagai kumpulan **objek** yang menggabungkan **data (state)**
dan **perilaku (method)**. Dart, Kotlin, dan TypeScript semuanya mendukung OOP, dengan dukungan fungsional yang kuat.

## Why It Matters

OOP adalah dasar desain kode di Flutter (widget, state, repository), Android (Activity, ViewModel), dan backend
(service, controller). Empat pilar OOP hampir selalu ditanyakan di interview, dan pemahamannya menjadi pondasi
[SOLID](/fundamentals/solid-principles/) dan [Design Patterns](/fundamentals/design-patterns/).

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Class | Cetak biru (blueprint) |
| Object | Instance dari class dengan state sendiri |
| Encapsulation | Menyembunyikan state internal; perubahan lewat method yang menjaga aturan (invariant) |
| Abstraction | Mengekspos kontrak "apa", menyembunyikan "bagaimana" |
| Inheritance | Class turunan mewarisi & memperluas class induk ("is-a") |
| Polymorphism | Objek berbeda merespons pesan yang sama dengan caranya masing-masing |
| Composition | Objek tersusun dari objek lain ("has-a") |
| Interface | Kontrak tanpa (atau dengan sedikit) implementasi |

### Visibilitas

| Bahasa | Privat | Catatan |
| --- | --- | --- |
| Dart | prefix `_` | Privat per **library** (file), bukan per class |
| Kotlin | `private`, `protected`, `internal` | `internal` = satu modul |
| TypeScript | `private` / `#field` | `private` hanya saat compile; `#` benar-benar privat saat runtime |

## How It Works

```text
          «interface» PaymentMethod
             pay(amount): Result
           ▲          ▲           ▲
   CashPayment   QrisPayment   CardPayment      ← polymorphism
Checkout ──has-a──► PaymentMethod                ← composition + abstraction
Cart: _items (privat) + addItem() menjaga qty > 0 ← encapsulation
```

## Implementation

### Encapsulation (Dart)

```dart
class Cart {
  final _items = <String, int>{};               // tidak bisa diubah langsung dari luar file

  Map<String, int> get items => Map.unmodifiable(_items);

  void add(String sku, {int qty = 1}) {
    if (qty <= 0) throw ArgumentError.value(qty, 'qty', 'harus > 0');
    _items.update(sku, (v) => v + qty, ifAbsent: () => qty);
  }

  int get totalQty => _items.values.fold(0, (a, b) => a + b);
}
```

### Abstraction & polymorphism (Kotlin)

```kotlin
interface PaymentMethod {
    fun pay(amount: Long): PaymentResult
}

class CashPayment(private val received: Long) : PaymentMethod {
    override fun pay(amount: Long) =
        if (received >= amount) PaymentResult.Success(change = received - amount)
        else PaymentResult.Failed("Uang kurang")
}

class QrisPayment(private val gateway: QrisGateway) : PaymentMethod {
    override fun pay(amount: Long) = gateway.charge(amount)
}

fun checkout(method: PaymentMethod, total: Long) = method.pay(total)   // tidak peduli jenisnya
```

### Inheritance vs composition (TypeScript)

```ts
// Inheritance: relasi "is-a" yang stabil
abstract class Notification {
  constructor(protected readonly userId: string) {}
  abstract render(): string;
}
class OrderShipped extends Notification {
  constructor(userId: string, private orderId: string) { super(userId); }
  render() { return `Pesanan ${this.orderId} dikirim`; }
}

// Composition: perilaku yang bisa diganti/digabung
class NotificationService {
  constructor(private sender: Sender, private logger: Logger) {}
  async send(n: Notification) { this.logger.info('send'); await this.sender.send(n.render()); }
}
```

### Value object (immutable) di Dart

```dart
class Money {
  const Money(this.amount) : assert(amount >= 0);
  final int amount;                               // rupiah, integer
  Money operator +(Money o) => Money(amount + o.amount);
  @override
  bool operator ==(Object o) => o is Money && o.amount == amount;
  @override
  int get hashCode => amount.hashCode;
}
```

## Best Practices

- **Jaga invariant** di dalam class (validasi di constructor/method), bukan di pemanggil.
- **Composition over inheritance**; inheritance hanya untuk "is-a" yang jelas dan dangkal.
- **Program ke interface**, bukan implementasi, agar mudah diganti dan diuji.
- **Immutable by default** untuk model data (`final`, `val`, `readonly`).
- **Class kecil dengan satu tanggung jawab**.

## Anti-Patterns

- Class dengan semua field publik dan logika di luar class (anemic model yang tidak disengaja).
- Hierarki inheritance dalam (lebih dari 2–3 level).
- God object yang mengetahui dan melakukan segalanya.
- Getter/setter untuk setiap field tanpa alasan (encapsulation semu).
- Subclass yang mematikan perilaku induk (melanggar Liskov).

## Performance Considerations

Overhead method virtual dan objek kecil umumnya tidak signifikan dibanding I/O. Di Flutter, immutability dan `const`
constructor justru membantu performa karena widget dapat digunakan ulang.

## Security Considerations

Encapsulation membantu keamanan: data sensitif tidak terekspos, validasi terpusat. Hindari `toString()` yang mencetak
token/password ke log; override bila perlu.

## Real-World Use Cases

- Entity & value object di domain layer (Order, Money, Sku).
- Strategi pembayaran/diskon dengan polymorphism.
- Widget Flutter sebagai komposisi widget kecil.

## Interview Questions

1. Jelaskan empat pilar OOP.
2. Apa beda class dan object?
3. Apa beda abstract class dan interface?
4. Kapan memakai inheritance dan kapan composition?
5. Apa itu polymorphism? Beri contoh.
6. Bagaimana privasi bekerja di Dart?

## Sample Answers

1. Encapsulation (menyembunyikan state, akses terkontrol), Abstraction (kontrak tanpa detail), Inheritance (pewarisan perilaku), Polymorphism (satu antarmuka, banyak implementasi).
2. Class adalah definisi/blueprint; object adalah instance konkret dengan state sendiri di memori.
3. Abstract class dapat memiliki state dan implementasi sebagian, dan hanya satu yang dapat di-extend. Interface mendefinisikan kontrak yang dapat diimplementasi banyak class. Di Dart setiap class juga interface implisit; Dart 3 menambah modifier `interface`, `base`, `sealed`, `final`.
4. Inheritance untuk relasi "is-a" stabil dan berbagi implementasi inti; composition untuk perilaku yang bisa diganti/digabung — umumnya lebih fleksibel dan mudah diuji.
5. Kemampuan memanggil method yang sama pada tipe berbeda dengan hasil sesuai tipe, mis. `PaymentMethod.pay()` pada Cash, QRIS, dan Card.
6. Identifier berawalan `_` privat untuk library (file) tempat ia dideklarasikan, bukan per class; `part`/`part of` berbagi privasi dalam library yang sama.

## Practical Exercises

1. Modelkan `Order` dengan invariant: tidak boleh ada item qty ≤ 0, total tidak negatif.
2. Ganti `if (type == 'cash') ... else if ...` dengan polymorphism.
3. Ubah hierarki inheritance 3 level di proyek Anda menjadi composition.

## Quick Reference

```text
Encapsulation · Abstraction · Inheritance · Polymorphism
Composition > inheritance · program ke interface · immutable model · jaga invariant di dalam class
Dart: _privat per library · Kotlin: private/protected/internal · TS: private (compile) vs #field (runtime)
```

## Related Topics

- [SOLID Principles](/fundamentals/solid-principles/)
- [Design Patterns](/fundamentals/design-patterns/)
- [Dart Fundamentals](/flutter/dart-fundamentals/)
- [OOP, SOLID & Design Patterns (interview)](/interview/technical/oop-solid-patterns/)
