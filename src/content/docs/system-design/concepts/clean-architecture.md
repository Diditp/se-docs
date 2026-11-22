---
title: "Clean Architecture (Lintas Platform)"
description: "Clean Architecture sebagai prinsip lintas platform: entities, use cases, interface adapters, frameworks & drivers, dependency rule, ports & adapters (hexagonal), dependency inversion, alur data dan mapping DTO ↔ entity, penerapan setara di Flutter, Android (Kotlin), dan Node.js, kapan cukup sederhana, serta kritik dan jebakan over-engineering."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, clean-architecture, hexagonal, dependency-inversion, ports-adapters]
---

## Overview

**Clean Architecture** (Robert C. Martin) menyusun kode dalam lingkaran konsentris dengan satu aturan utama: **dependensi
kode hanya boleh mengarah ke dalam**. Aturan bisnis berada di tengah dan tidak tahu apa pun tentang UI, database, atau
framework. Konsep yang mirip: **Hexagonal Architecture / Ports & Adapters** (Alistair Cockburn) dan **Onion Architecture**.

Halaman ini membahas prinsipnya secara lintas platform. Penerapan detail Flutter ada di
[Clean Architecture di Flutter](/flutter/clean-architecture/).

## Why It Matters

Framework, database, dan library berganti lebih cepat daripada aturan bisnis. Bila aturan "diskon member tidak boleh
melebihi 20%" tersebar di widget dan query SQL, mengubah UI atau pindah database berarti menulis ulang logika bisnis.
Clean Architecture membuat aturan bisnis dapat dites tanpa UI/DB dan bertahan dari pergantian teknologi.

## Core Concepts

| Lingkaran | Isi | Contoh |
| --- | --- | --- |
| Entities | Aturan bisnis inti, objek domain | `Order`, `Money`, `Discount.apply()` |
| Use cases | Aturan spesifik aplikasi, orkestrasi | `CreateOrder`, `VoidOrder` |
| Interface adapters | Mapping antara use case dan dunia luar | Controller, presenter/ViewModel, repository impl, DTO mapper |
| Frameworks & drivers | Detail teknis | Flutter, Compose, Fastify, PostgreSQL, Dio, Room |

| Konsep | Penjelasan |
| --- | --- |
| Dependency rule | Lingkaran dalam tidak mengimpor/mengenal lingkaran luar |
| Port | Interface yang didefinisikan sisi dalam (mis. `OrderRepository`, `PaymentGateway`) |
| Adapter | Implementasi port di sisi luar (`PostgresOrderRepository`, `XenditGateway`) |
| Dependency inversion | Modul tingkat tinggi dan rendah sama-sama bergantung pada abstraksi |
| Composition root | Tempat merangkai implementasi konkret (DI) |

## How It Works

```text
UI/HTTP → (adapter) Controller/ViewModel → Use case → Entity
                                  │
                                  └─▶ Port (interface, didefinisikan di dalam)
                                           ▲
                         Adapter (Repository impl, HTTP client, DB) ── framework/driver
Data melintasi batas sebagai struktur sederhana: DTO di luar, entity di dalam (mapping di adapter)
```

## Implementation

### Use case & port yang sama di tiga platform

```dart
// Dart (Flutter)
abstract interface class OrderRepository {
  Future<Order?> findById(String id);
  Future<void> save(Order order);
}

final class VoidOrder {
  VoidOrder(this._orders, this._clock);
  final OrderRepository _orders;
  final DateTime Function() _clock;

  Future<Result<Order, Failure>> call(String id, String reason) async {
    final order = await _orders.findById(id);
    if (order == null) return const Err(NotFoundFailure());
    final voided = order.voidAt(_clock(), reason);          // aturan di entity (mis. batas 24 jam)
    if (voided case Err(:final error)) return Err(error);
    await _orders.save((voided as Ok<Order, Failure>).value);
    return voided;
  }
}
```

```kotlin
// Kotlin (Android)
interface OrderRepository {
    suspend fun findById(id: String): Order?
    suspend fun save(order: Order)
}

class VoidOrder(private val orders: OrderRepository, private val clock: Clock) {
    suspend operator fun invoke(id: String, reason: String): Result<Order> {
        val order = orders.findById(id) ?: return Result.failure(NotFoundException(id))
        return order.voidAt(clock.instant(), reason).onSuccess { orders.save(it) }
    }
}
```

```ts
// TypeScript (Node.js)
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

export class VoidOrder {
  constructor(private orders: OrderRepository, private clock: () => Date) {}
  async execute(id: string, reason: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError();
    const voided = order.voidAt(this.clock(), reason);       // melempar domain error bila melanggar aturan
    await this.orders.save(voided);
    return voided;
  }
}
```

Bentuknya sama: aturan di entity, alur di use case, I/O lewat port. Hanya sintaks yang berbeda.

### Adapter & mapping

```text
DTO (JSON/row DB) ↔ mapper ↔ Entity
- DTO mengikuti kontrak luar (snake_case, string tanggal)
- Entity mengikuti bahasa domain (Money, enum status, invariants)
- Mapping di lapisan data/adapter, bukan di UI dan bukan di entity
```

### Seberapa "clean" yang dibutuhkan?

| Kondisi | Rekomendasi |
| --- | --- |
| Layar/CRUD sederhana tanpa aturan | Repository + state holder. Use case boleh dilewati |
| Aturan bisnis nyata (harga, stok, status) | Entity + use case + port |
| Banyak sumber data/integrasi yang bisa berganti | Port & adapter untuk integrasi tersebut |
| Tim besar, umur proyek panjang | Struktur penuh + batas ditegakkan |

### Testing

```text
Entity & use case → unit test murni dengan fake port (cepat, tanpa framework)
Adapter → integration test (DB nyata, HTTP mock server)
UI/controller → widget/API test dengan use case palsu
```

## Best Practices

- **Aturan bisnis di entity/use case**, bebas framework.
- **Port didefinisikan oleh sisi yang membutuhkan** (domain/application).
- **Mapping DTO ↔ entity di adapter**.
- **Composition root tunggal** untuk merangkai dependensi.
- **Sesuaikan kedalaman dengan kompleksitas**.
- **Tegakkan dependency rule** dengan alat dan review.

## Anti-Patterns

- Use case yang hanya memanggil `repository.get()` untuk setiap layar tanpa aturan apa pun (boilerplate tanpa manfaat).
- Entity yang berisi anotasi JSON/ORM sehingga terikat framework.
- Interface untuk setiap kelas meski hanya ada satu implementasi dan tidak dibutuhkan untuk test.
- Domain mengimpor Flutter/Android/Express.
- Menganggap jumlah folder sebagai ukuran kualitas arsitektur.

## Performance Considerations

Mapping antar lapisan menambah alokasi objek. Biasanya tidak signifikan, tetapi untuk daftar besar (ribuan item) di
mobile, lakukan mapping di background isolate atau batasi dengan pagination. Abstraksi tidak boleh menghalangi query
efisien. Repository boleh menyediakan method spesifik (`findActiveByOutlet`) daripada mengambil semua lalu memfilter.

## Security Considerations

Use case adalah tempat alami untuk otorisasi tingkat aksi dan aturan bisnis keamanan (batas refund, hak void). Validasi
input tetap di boundary (adapter), dan adapter infrastruktur menangani secret, sehingga domain tidak pernah menyentuh
kredensial.

## Real-World Use Cases

- Aturan diskon & pajak POS dipakai bersama oleh aplikasi Flutter (offline) dan backend, dengan logika yang setara dan test yang sama skenarionya.
- Mengganti payment gateway hanya menambah adapter baru yang mengimplementasikan `PaymentGateway`.

## Interview Questions

1. Jelaskan Clean Architecture dan dependency rule.
2. Apa beda Clean Architecture dan Hexagonal Architecture?
3. Kapan Clean Architecture berlebihan?
4. Di mana mapping DTO ke entity dilakukan dan mengapa?

## Sample Answers

1. Arsitektur berlapis konsentris dengan entities dan use cases di tengah, adapter dan framework di luar. Dependency rule: kode hanya bergantung ke arah dalam, sehingga aturan bisnis tidak tahu UI, database, atau framework.
2. Intinya sama: domain di tengah, dunia luar terhubung melalui port (interface) dan adapter (implementasi). Hexagonal menekankan simetri port masuk (driving) dan keluar (driven). Clean Architecture menamai lingkaran secara lebih spesifik.
3. Untuk fitur CRUD sederhana tanpa aturan bisnis, prototipe, atau aplikasi kecil berumur pendek, di mana lapisan tambahan hanya menambah boilerplate tanpa manfaat testing atau fleksibilitas.
4. Di lapisan adapter/data, karena DTO mengikuti kontrak eksternal yang bisa berubah, sementara entity mengikuti bahasa domain. Mapping di batas menjaga domain tidak terpengaruh perubahan API/DB.

## Practical Exercises

1. Pilih satu aturan bisnis di aplikasi Anda dan pindahkan dari UI ke entity/use case dengan unit test.
2. Implementasikan use case yang sama di Dart dan TypeScript, bandingkan strukturnya.
3. Ganti satu adapter (mis. sumber data API → fake) tanpa mengubah use case.

## Quick Reference

```text
Entities → use cases → interface adapters → frameworks & drivers · dependensi ke dalam
Port (interface di dalam) + adapter (implementasi di luar) · dependency inversion · composition root
DTO ↔ mapper (adapter) ↔ entity · aturan di entity, alur di use case
Kedalaman sesuai kompleksitas · unit test domain dengan fake port
```

## Related Topics

- [Clean Architecture di Flutter](/flutter/clean-architecture/)
- [Modular & Layered Architecture](/system-design/concepts/modular-layered-architecture/)
- [SOLID Principles](/fundamentals/solid-principles/)
