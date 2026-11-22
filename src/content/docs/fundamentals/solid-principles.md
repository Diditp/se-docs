---
title: "SOLID Principles"
description: "Lima prinsip desain berorientasi objek dengan contoh Dart, Kotlin, dan TypeScript — kapan diterapkan dan kapan berlebihan."
level: intermediate
status: complete
updated: 2026-11-07
tags: [oop, solid, design, architecture]
---

## Overview

**SOLID** adalah lima prinsip desain dari Robert C. Martin untuk membuat kode yang mudah diubah, diuji, dan dipahami:

| Huruf | Prinsip | Inti satu kalimat |
| --- | --- | --- |
| **S** | Single Responsibility | Satu modul, satu alasan untuk berubah. |
| **O** | Open/Closed | Tambah perilaku dengan kode baru, bukan mengubah kode lama. |
| **L** | Liskov Substitution | Subtype harus bisa menggantikan supertype tanpa merusak kebenaran. |
| **I** | Interface Segregation | Jangan paksa client bergantung pada method yang tidak dipakai. |
| **D** | Dependency Inversion | Kebijakan high-level dan detail low-level sama-sama bergantung pada abstraksi. |

## Why It Matters

Biaya terbesar software ada di **perubahan**, bukan penulisan pertama. SOLID mengurangi *ripple effect*: perubahan di
satu tempat tidak merusak tempat lain. Prinsip ini juga menjadi fondasi Clean Architecture, design pattern, dan
testability — serta hampir selalu ditanyakan di interview.

## Core Concepts

- **Cohesion** — seberapa erat isi modul saling berkaitan (SRP menaikkan cohesion).
- **Coupling** — seberapa besar ketergantungan antar modul (DIP & ISP menurunkan coupling).
- **Abstraksi** — interface/abstract class yang mendefinisikan *apa*, bukan *bagaimana*.
- **Polymorphism** — mekanisme utama untuk OCP & LSP.
- **Design by contract** — precondition, postcondition, invariant (dasar LSP).

## How It Works

Setiap prinsip menjawab satu jenis rasa sakit:

| Gejala di codebase | Prinsip yang dilanggar |
| --- | --- |
| Class 1.500 baris, diubah oleh tiap tim | SRP |
| Menambah metode pembayaran = mengedit `switch` di 6 tempat | OCP |
| `if (repo is ReadOnlyRepo) ...` sebelum memanggil `save()` | LSP |
| Implementasi penuh `throw UnimplementedError()` | ISP |
| Unit test butuh database sungguhan | DIP |

## Implementation

### S — Single Responsibility (Dart)

```dart
// ❌ Satu class: hitung, simpan, cetak, kirim notifikasi
class OrderService {
  int calculateTotal(Order o) { /* ... */ }
  Future<void> saveToDb(Order o) async { /* SQL */ }
  Future<void> printReceipt(Order o) async { /* ESC/POS */ }
  Future<void> sendWhatsapp(Order o) async { /* HTTP */ }
}

// ✅ Tanggung jawab dipisah; masing-masing berubah karena alasan berbeda
class PriceCalculator { int total(Order o) => /* aturan harga & diskon */ 0; }
abstract interface class OrderRepository { Future<void> save(Order o); }
abstract interface class ReceiptPrinter { Future<void> print(Order o); }
abstract interface class CustomerNotifier { Future<void> orderPaid(Order o); }
```

### O — Open/Closed (TypeScript)

```ts
// ❌ Setiap metode baru mengubah fungsi ini
function fee(method: string, amount: number) {
  switch (method) {
    case 'qris': return amount * 0.007;
    case 'va': return 4000;
    // menambah 'ewallet' = edit + test ulang semua case
  }
}

// ✅ Strategy: metode baru = class baru, kode lama tidak disentuh
interface PaymentMethod { readonly code: string; fee(amount: number): number }
class Qris implements PaymentMethod { code = 'qris'; fee(a: number) { return Math.round(a * 0.007); } }
class VirtualAccount implements PaymentMethod { code = 'va'; fee() { return 4000; } }

const registry = new Map<string, PaymentMethod>([new Qris(), new VirtualAccount()].map((m) => [m.code, m]));
export const feeFor = (code: string, amount: number) => {
  const m = registry.get(code);
  if (!m) throw new Error(`Unsupported payment method: ${code}`);
  return m.fee(amount);
};
```

### L — Liskov Substitution (Kotlin)

```kotlin
// ❌ Subclass memperketat kontrak: caller yang memegang `Storage` akan crash
open class Storage { open fun save(key: String, value: String) { /* ... */ } }
class ReadOnlyStorage : Storage() {
    override fun save(key: String, value: String) = throw UnsupportedOperationException()
}

// ✅ Pisahkan kemampuan; tidak ada subtype yang "berbohong"
interface Readable { fun read(key: String): String? }
interface Writable { fun save(key: String, value: String) }
class CacheStorage : Readable, Writable { /* ... */ }
class BundledConfig : Readable { /* ... */ }
```

### I — Interface Segregation (Dart)

```dart
// ❌ Printer Bluetooth murah dipaksa mengimplementasikan scan & fax
abstract interface class Device { Future<void> print(Doc d); Future<Doc> scan(); Future<void> fax(Doc d); }

// ✅ Interface kecil per kemampuan
abstract interface class Printer { Future<void> print(Doc d); }
abstract interface class Scanner { Future<Doc> scan(); }
class ThermalPrinter implements Printer { @override Future<void> print(Doc d) async { /* ... */ } }
```

### D — Dependency Inversion (Dart)

```dart
// ❌ High-level policy terikat ke detail
class CheckoutBloc { final api = DioClient(); final db = SqfliteDb(); }

// ✅ Bergantung pada abstraksi, detail di-inject dari composition root
class CheckoutBloc {
  CheckoutBloc(this._createOrder);
  final CreateOrder _createOrder;           // use case → bergantung pada OrderRepository (interface)
}
// test: CheckoutBloc(CreateOrder(FakeOrderRepository(), ...))
```

## Best Practices

- **Terapkan saat ada rasa sakit nyata atau variasi yang jelas akan datang.** Alasannya: abstraksi punya biaya (indirection, file lebih banyak).
- **SRP berdasarkan aktor/alasan perubahan**, bukan "satu method per class".
- **OCP lewat polymorphism/strategy/registry**, bukan inheritance berlapis.
- **LSP: pikirkan kontrak**, bukan hanya tipe. Jika subclass harus melempar "not supported", desainnya salah.
- **ISP: interface didefinisikan dari sisi pemakai** (role interface), bukan dari sisi implementasi.
- **DIP + composition root:** rakit dependency di satu tempat (get_it, Hilt, NestJS DI container).

## Anti-Patterns

- **Over-engineering:** interface untuk setiap class, factory untuk objek yang tidak pernah bervariasi.
- **God class / God service** — `Utils`, `Helper`, `Manager` yang terus tumbuh.
- **Inheritance untuk reuse kode** → hierarki rapuh; lebih baik composition.
- **Menyamakan DIP dengan DI framework** — DI framework hanyalah alat; DIP adalah arah dependency.
- **Interface "header" 1:1** yang meniru semua method implementasi tanpa memikirkan client.

## Performance Considerations

Dampak runtime SOLID umumnya dapat diabaikan (virtual dispatch, objek kecil). Di hot path yang sangat sensitif
(rendering per frame, loop jutaan iterasi) ukur dulu — tetapi optimasi seperti itu jarang membutuhkan pelanggaran SOLID.
Manfaat tidak langsung: kode yang terisolasi lebih mudah di-*profile* dan dioptimasi lokal.

## Security Considerations

- **SRP untuk security logic:** autentikasi, otorisasi, dan kriptografi di modul khusus yang direview ketat — bukan tersebar.
- **DIP memudahkan mengganti implementasi rentan** (mis. algoritma hashing) tanpa menyentuh logika bisnis.
- **LSP pada security:** subclass "bypass" (mis. `NoAuthClient` untuk testing) jangan sampai ter-wire di build production.

## Real-World Use Cases

- **Metode pembayaran POS** (tunai, QRIS, EDC, e-wallet) sebagai strategy — OCP.
- **Printer struk berbeda vendor** di balik interface `ReceiptPrinter` — DIP + ISP.
- **Repository remote/lokal** yang bisa ditukar untuk offline-first dan testing — DIP.

## Interview Questions

1. **(Fundamental)** Jelaskan kelima prinsip SOLID secara singkat.
2. **(Intermediate)** Apa beda Dependency Inversion dan Dependency Injection?
3. **(Intermediate)** Beri contoh pelanggaran LSP yang pernah Anda temui.
4. **(Intermediate)** Bagaimana OCP diterapkan di Flutter/Node.js?
5. **(Advanced)** Kapan menerapkan SOLID justru merugikan?

## Sample Answers

1. **S:** satu alasan untuk berubah. **O:** perluas tanpa memodifikasi. **L:** subtype dapat menggantikan supertype tanpa merusak perilaku. **I:** interface kecil sesuai kebutuhan client. **D:** modul high-level dan low-level bergantung pada abstraksi.
2. DIP adalah prinsip tentang **arah** dependency (menuju abstraksi). DI adalah **teknik** memberikan dependency dari luar (constructor injection). DI membantu menerapkan DIP, tetapi Anda bisa memakai DI tanpa DIP (inject class konkret).
3. Repository `ReadOnly` yang melempar exception di `save()`, atau subclass yang mengharuskan parameter tidak null padahal parent menerima null (memperketat precondition). Solusi: pecah interface berdasarkan kemampuan.
4. Strategy/registry untuk metode pembayaran; di Flutter, `PaymentMethod` abstrak dengan implementasi per metode yang didaftarkan di DI; di NestJS, provider per metode + token injection.
5. Saat requirement belum jelas dan abstraksi dibuat spekulatif; pada script/prototype singkat; saat menambah indirection membuat alur sulit diikuti. Prinsipnya: tunggu variasi kedua sebelum mengabstraksi (*rule of three*).

## Practical Exercises

1. Ambil satu class terbesar di project Anda, daftar alasan perubahannya, lalu pecah berdasarkan SRP.
2. Refactor `switch` metode pembayaran menjadi strategy + registry dan tulis unit test per strategy.
3. Temukan satu interface yang implementasinya punya `throw UnimplementedError()` — pecah dengan ISP.
4. Buat use case yang bisa diuji dengan fake repository tanpa framework (DIP).

## Quick Reference

- **S** — satu aktor, satu alasan berubah.
- **O** — fitur baru = kode baru (strategy/polymorphism).
- **L** — jangan memperketat precondition / memperlemah postcondition.
- **I** — role interface kecil dari sudut pandang client.
- **D** — bergantung ke abstraksi; rakit di composition root.
- Abstraksi punya biaya → terapkan saat variasi nyata.

## Related Topics

- [Object-Oriented Programming](/fundamentals/oop/)
- [Design Patterns](/fundamentals/design-patterns/)
- [Clean Architecture di Flutter](/flutter/clean-architecture/)
- [Repository Pattern & Dependency Injection](/flutter/repository-pattern-di/)
- [OOP, SOLID & Design Patterns — Interview](/interview/technical/oop-solid-patterns/)
