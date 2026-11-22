---
title: "Design Patterns"
description: "Design pattern Gang of Four yang paling berguna untuk mobile & backend — Factory, Builder, Singleton, Adapter, Decorator, Facade, Proxy, Observer, Strategy, Command, State — plus pattern aplikasi (Repository, DI, Result), kapan dipakai dan kapan berlebihan."
level: intermediate
status: complete
updated: 2026-11-12
tags: [fundamentals, design-patterns, gof, architecture]
---

## Overview

**Design pattern** adalah solusi umum yang sudah teruji untuk masalah desain yang berulang. Pattern bukan kode jadi,
melainkan **nama dan struktur** yang memudahkan tim berdiskusi ("pakai Strategy untuk diskon"). Katalog klasik berasal
dari buku *Design Patterns* (Gang of Four, 1994) dengan tiga kategori: creational, structural, behavioral.

## Why It Matters

Mengenali pattern membuat Anda lebih cepat memahami framework (Flutter memakai Observer, Composite, Builder di mana-mana)
dan merancang kode yang mudah diperluas. Namun pattern yang dipaksakan menambah kompleksitas tanpa manfaat.

## Core Concepts

| Kategori | Pattern | Masalah yang diselesaikan | Contoh nyata |
| --- | --- | --- | --- |
| Creational | Factory Method / Simple Factory | Memilih kelas konkret saat runtime | `PaymentMethod.fromCode('qris')`, `fromJson` |
| Creational | Builder | Objek kompleks dengan banyak opsi | `Dio(BaseOptions(...))`, query builder |
| Creational | Singleton | Satu instance bersama | Database connection via DI container |
| Structural | Adapter | Antarmuka tidak cocok | Membungkus SDK printer vendor |
| Structural | Decorator | Menambah perilaku tanpa mengubah kelas | Repository + caching/logging |
| Structural | Facade | Subsistem rumit → antarmuka sederhana | `SyncFacade.syncAll()` |
| Structural | Proxy | Kontrol akses/lazy/remote | Lazy loading, cache proxy |
| Structural | Composite | Struktur pohon diperlakukan seragam | Widget tree, menu bertingkat |
| Behavioral | Observer | Banyak pihak bereaksi pada perubahan | Stream, ChangeNotifier, Bloc, Flow |
| Behavioral | Strategy | Algoritma dapat diganti | Diskon, pajak, ongkir |
| Behavioral | Command | Aksi sebagai objek (antre, undo, retry) | Outbox event, undo editor |
| Behavioral | State | Perilaku tergantung state | Status order/tiket |
| Behavioral | Template Method | Kerangka algoritma tetap, langkah bervariasi | Base sync job |
| Behavioral | Chain of Responsibility | Request melewati rangkaian handler | Middleware Express, interceptor Dio |

Pattern tingkat aplikasi: **Repository**, **Dependency Injection**, **Unit of Work**, **Result/Either**, **Outbox**.

## How It Works

```text
Identifikasi bagian yang SERING BERUBAH → pisahkan di balik abstraksi → pilih pattern yang sesuai
  jenis objek berubah        → Factory
  algoritma berubah          → Strategy
  antarmuka luar berubah     → Adapter
  perilaku tambahan opsional → Decorator / Chain of Responsibility
  reaksi atas perubahan      → Observer
```

## Implementation

### Factory (Dart)

```dart
sealed class PaymentMethod {
  factory PaymentMethod.fromCode(String code) => switch (code) {
    'cash' => const Cash(),
    'qris' => const Qris(),
    _ => throw ArgumentError('Metode $code tidak dikenal'),
  };
}
final class Cash implements PaymentMethod { const Cash(); }
final class Qris implements PaymentMethod { const Qris(); }
```

### Builder (Kotlin)

```kotlin
class ReceiptBuilder {
    private val lines = mutableListOf<String>()
    fun header(store: String) = apply { lines += store.uppercase() }
    fun item(name: String, qty: Int, price: Long) = apply { lines += "$name x$qty  ${qty * price}" }
    fun footer(text: String) = apply { lines += text }
    fun build(): String = lines.joinToString("\n")
}
val receipt = ReceiptBuilder().header("Kopi Kita").item("Latte", 2, 25_000).footer("Terima kasih").build()
```

### Chain of Responsibility (middleware Express)

```ts
app.use(requestId);        // setiap handler memutuskan: proses, ubah, atau teruskan (next)
app.use(authenticate);
app.use(rateLimit);
app.post('/orders', validate(CreateOrder), createOrder);
app.use(errorHandler);
```

### State (status order)

```dart
sealed class OrderState {
  OrderState pay() => throw StateError('Tidak bisa bayar di $runtimeType');
  OrderState cancel() => throw StateError('Tidak bisa batal di $runtimeType');
}
class Pending extends OrderState {
  @override OrderState pay() => Paid();
  @override OrderState cancel() => Cancelled();
}
class Paid extends OrderState {}
class Cancelled extends OrderState {}
```

### Command untuk outbox (aksi bisa diantre & di-retry)

```ts
interface Command { id: string; type: string; payload: unknown }
async function enqueue(cmd: Command) { await db.outbox.insert(cmd); }          // simpan dulu
async function process(cmd: Command) { await handlers[cmd.type](cmd.payload); } // eksekusi kemudian, idempoten by id
```

Contoh Strategy, Adapter, dan Decorator ada di [OOP, SOLID & Design Patterns (interview)](/interview/technical/oop-solid-patterns/).

## Best Practices

- **Mulai dari masalah**, bukan dari pattern.
- **Gunakan nama pattern di kode/diskusi** bila memang dipakai (`PriceStrategy`, `PrinterAdapter`).
- **Pilih bentuk paling sederhana** — di Dart/Kotlin/TS, fungsi first-class sering cukup untuk Strategy/Command.
- **Gabungkan dengan DI** agar implementasi mudah diganti di test.

## Anti-Patterns

- *Pattern-itis*: Factory untuk satu kelas yang tidak akan pernah bertambah.
- Singleton global yang diakses dari mana saja (hidden dependency).
- Service Locator di dalam domain/logika bisnis.
- Decorator berlapis-lapis yang sulit di-debug.

## Performance Considerations

Indirection pattern hampir selalu murah. Yang perlu diwaspadai: Observer yang tidak dilepas (memory leak), Decorator
cache tanpa batas/TTL, dan Proxy lazy-loading yang memicu N+1 query.

## Security Considerations

Chain of Responsibility (middleware/interceptor) adalah tempat ideal untuk autentikasi, otorisasi, validasi, dan
rate limiting — pastikan urutannya benar (auth sebelum handler) dan tidak ada jalur yang melewatinya.

## Real-World Use Cases

- Interceptor Dio (Chain of Responsibility) untuk token & retry.
- Bloc/Stream (Observer) untuk state UI.
- Adapter untuk printer/scanner/payment terminal berbagai vendor.
- State pattern untuk siklus hidup tiket atau order.

## Interview Questions

1. Apa itu design pattern dan kategorinya?
2. Jelaskan pattern yang paling sering Anda pakai.
3. Apa masalah Singleton?
4. Pattern apa yang dipakai middleware Express atau interceptor Dio?
5. Beda Strategy dan State?
6. Kapan pattern menjadi berlebihan?

## Sample Answers

1. Solusi umum untuk masalah desain berulang; creational (pembuatan objek), structural (komposisi objek), behavioral (interaksi & tanggung jawab).
2. Contoh: Repository + DI untuk akses data, Strategy untuk aturan diskon, Observer melalui Bloc/Stream, Adapter untuk SDK printer — jelaskan masalah yang diselesaikan.
3. State global tersembunyi, coupling tinggi, sulit di-mock di test, potensi masalah concurrency. Lebih baik satu instance yang dikelola DI container.
4. Chain of Responsibility — setiap handler memproses lalu meneruskan ke handler berikutnya atau menghentikan rantai.
5. Strategy: algoritma dipilih dari luar dan bisa ditukar; State: objek berganti perilaku sendiri saat state internal berubah (transisi dikelola state).
6. Saat tidak ada variasi atau perubahan yang diantisipasi secara realistis, sehingga abstraksi hanya menambah file dan indirection (YAGNI).

## Practical Exercises

1. Identifikasi 5 pattern yang dipakai Flutter framework (petunjuk: Composite, Observer, Builder, Strategy pada `ScrollPhysics`, Decorator pada `DecoratedBox`).
2. Implementasikan State pattern untuk status tiket.
3. Refactor kode yang memanggil 3 SDK berbeda menjadi Adapter + Factory.

## Quick Reference

```text
Creational: Factory · Builder · Singleton(DI)
Structural: Adapter · Decorator · Facade · Proxy · Composite
Behavioral: Observer · Strategy · Command · State · Template Method · Chain of Responsibility
Aplikasi: Repository · DI · Result · Outbox · mulai dari masalah, bukan pattern
```

## Related Topics

- [OOP](/fundamentals/oop/)
- [SOLID Principles](/fundamentals/solid-principles/)
- [Repository Pattern & DI](/flutter/repository-pattern-di/)
