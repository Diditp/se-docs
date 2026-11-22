---
title: "Clean Architecture Questions"
description: "Bank pertanyaan interview Clean Architecture: layer & dependency rule, entity/use case/repository, mapping DTO, error handling lintas layer, feature-first vs layer-first, testing, serta kapan Clean Architecture berlebihan — dengan contoh Flutter."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, clean-architecture, architecture, flutter, question-bank]
---

## Overview

"Jelaskan arsitektur aplikasi Anda" adalah pertanyaan standar. Bila Anda menyebut Clean Architecture, siapkan diri untuk
digali: **dependency rule**, isi tiap layer, alasan pemisahan, cara testing, dan **trade-off**-nya.

## Why It Matters

Arsitektur menentukan seberapa mudah aplikasi diubah dan diuji ketika tim dan fitur bertambah. Interviewer ingin tahu
apakah Anda memahami prinsipnya, bukan sekadar menyalin struktur folder.

## Core Concepts

```text
        ┌─────────────── Presentation (Widget, Bloc/ViewModel) ───────────────┐
        │                         │ memanggil                                  │
        │                         ▼                                            │
        │            Domain (Entity, Use Case, Repository interface)           │
        │                         ▲ diimplementasi oleh                        │
        │                         │                                            │
        └──────────── Data (Repository impl, DTO, API client, DB) ────────────┘
Dependency rule: dependensi kode selalu mengarah ke dalam (ke Domain). Domain tidak mengenal Flutter, Dio, Drift.
```

| Layer | Isi | Boleh bergantung pada |
| --- | --- | --- |
| Domain | Entity, value object, use case, repository interface, failure | Tidak ada (Dart murni) |
| Data | DTO/model, data source (remote/local), repository impl, mapper | Domain |
| Presentation | Widget, state management, view model/UI state | Domain (dan DI) |

## How It Works

```text
Tap "Bayar" → Bloc → PayOrderUseCase(params)
  → OrderRepository (interface) → OrderRepositoryImpl
      → RemoteDataSource (Dio) / LocalDataSource (Drift) → DTO → mapper → Entity
  ← Result<Order, Failure> → Bloc emit state → Widget render
```

## Implementation

```dart
// domain/
class Order { const Order({required this.id, required this.total, required this.status}); final String id; final int total; final OrderStatus status; }

abstract interface class OrderRepository {
  Future<Result<Order, Failure>> pay(String orderId, PaymentMethod method);
}

class PayOrder {
  PayOrder(this._repo);
  final OrderRepository _repo;
  Future<Result<Order, Failure>> call(String orderId, PaymentMethod method) {
    if (orderId.isEmpty) return Future.value(Err(const ValidationFailure('orderId kosong')));
    return _repo.pay(orderId, method);
  }
}

// data/
class OrderRepositoryImpl implements OrderRepository {
  OrderRepositoryImpl(this._remote);
  final OrderRemoteDataSource _remote;
  @override
  Future<Result<Order, Failure>> pay(String id, PaymentMethod m) async {
    try {
      final dto = await _remote.pay(id, m.code);
      return Ok(dto.toEntity());                       // mapping DTO → Entity di layer data
    } on DioException catch (e) {
      return Err(e.toFailure());                        // exception teknis → Failure domain
    }
  }
}

// test domain tanpa Flutter/Dio
test('PayOrder menolak id kosong', () async {
  final r = await PayOrder(FakeOrderRepository())('', PaymentMethod.cash);
  expect(r, isA<Err<Order, Failure>>());
});
```

## Best Practices

- **Domain murni Dart** — dapat diuji tanpa emulator.
- **Mapping di batas layer** (DTO ↔ Entity) agar perubahan API tidak menyebar.
- **Error teknis diterjemahkan** menjadi `Failure` domain di layer data.
- **Feature-first** di level atas (`features/checkout/{domain,data,presentation}`) untuk aplikasi besar.
- **Aturan dependensi diuji otomatis** (lint/arsitektur test) agar tidak tergerus.
- **Sesuaikan ketebalan**: use case tipis boleh digabung bila hanya meneruskan panggilan.

## Anti-Patterns

- Domain mengimpor `package:flutter` atau `dio`.
- Widget memanggil API/DB langsung.
- Entity = DTO JSON yang sama (perubahan API merusak seluruh app).
- Clean Architecture penuh untuk aplikasi kecil/prototipe (boilerplate tanpa manfaat).
- Use case yang hanya memanggil repository tanpa logika di semua tempat tanpa pertimbangan.

## Performance Considerations

Mapping dan layer tambahan berdampak kecil dibanding I/O. Perhatikan konversi data besar (ribuan item) — lakukan di
isolate bila perlu, dan hindari mapping berulang di dalam `build`.

## Security Considerations

Pemisahan layer memudahkan menempatkan logika keamanan di satu tempat: penyimpanan token di data source lokal yang
aman, interceptor autentikasi di layer data, validasi aturan bisnis di domain.

## Real-World Use Cases

- Aplikasi POS/transaksi multi-fitur dengan tim beberapa orang.
- Aplikasi yang mengganti backend/penyimpanan (REST → GraphQL, Hive → Drift) tanpa mengubah UI.
- Berbagi domain logic antar aplikasi (kasir & admin) via package.

## Interview Questions

1. Jelaskan layer Clean Architecture dan dependency rule.
2. Apa beda Entity dan DTO/Model?
3. Apa fungsi use case? Apakah selalu diperlukan?
4. Bagaimana error mengalir antar layer?
5. Feature-first vs layer-first?
6. Bagaimana Anda menguji tiap layer?
7. Kapan Clean Architecture berlebihan?
8. Bagaimana DI diterapkan dalam arsitektur ini?

## Sample Answers

1. Presentation, Domain, Data; dependensi kode hanya mengarah ke Domain sehingga logika bisnis tidak bergantung framework, UI, atau sumber data. Data mengimplementasi interface milik Domain (dependency inversion). Lihat [Clean Architecture (Flutter)](/flutter/clean-architecture/).
2. Entity adalah model bisnis yang stabil dan bebas framework; DTO merepresentasikan format eksternal (JSON/tabel) dan dipetakan ke Entity di layer data.
3. Mengenkapsulasi satu aksi bisnis (PayOrder, SyncSales) dengan aturan dan orkestrasi repository; memberi titik yang jelas untuk test. Untuk operasi trivial, sebagian tim memanggil repository langsung dari state management — yang penting konsisten dan disepakati.
4. Data source melempar exception teknis; repository menangkap dan memetakan ke `Failure` domain dalam `Result`; presentation memetakan `Failure` ke pesan/UI state. Lihat [Error Handling](/flutter/error-handling/).
5. Layer-first (folder `data/`, `domain/` global) sederhana untuk app kecil tetapi menyebar perubahan satu fitur ke banyak folder. Feature-first mengelompokkan per fitur dengan layer di dalamnya — lebih mudah dikembangkan paralel dan dipisah menjadi package. Lihat [Feature-First Architecture](/flutter/feature-first-architecture/).
6. Domain: unit test dengan fake repository. Data: test repository dengan mock data source dan test mapping/serialisasi. Presentation: bloc test dan widget test dengan use case palsu. Integration test untuk alur kritis.
7. Prototipe, aplikasi kecil dengan sedikit logika bisnis, atau tim yang belum siap — gunakan struktur lebih ringan (feature folder + repository) dan tingkatkan saat kompleksitas tumbuh.
8. Constructor injection di setiap kelas; container (get_it/injectable, Riverpod) merakit implementasi data ke interface domain di composition root; test mengganti dengan fake/mock.

## Practical Exercises

1. Gambar arsitektur aplikasi Anda dan tandai setiap pelanggaran dependency rule.
2. Pindahkan satu fitur dari widget-heavy menjadi domain/data/presentation dengan test.
3. Tulis test arsitektur yang gagal bila domain mengimpor package Flutter.

## Quick Reference

```text
Presentation → Domain ← Data · Domain = Dart murni (entity, use case, repo interface, failure)
DTO ↔ Entity di data · exception → Failure → UI state · feature-first untuk app besar
Test: domain (fake) · data (mock source) · presentation (bloc/widget) · jangan overkill
```

## Related Topics

- [Clean Architecture (Flutter)](/flutter/clean-architecture/)
- [Feature-First Architecture](/flutter/feature-first-architecture/)
- [OOP, SOLID & Design Patterns](/interview/technical/oop-solid-patterns/)
