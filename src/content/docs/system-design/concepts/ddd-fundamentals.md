---
title: "Domain-Driven Design Fundamentals"
description: "Dasar Domain-Driven Design: ubiquitous language, bounded context & context map, subdomain (core, supporting, generic), building block taktis (entity, value object, aggregate, aggregate root, domain event, repository, domain service), invariants & batas transaksi, anti-corruption layer, serta penerapan pragmatis pada sistem POS dan aplikasi mobile."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, ddd, bounded-context, aggregate, value-object, domain-events]
---

## Overview

**Domain-Driven Design (DDD)** adalah pendekatan membangun software dengan **memodelkan domain bisnis secara eksplisit**
bersama ahli domain, lalu menjadikan model itu pusat kode. DDD terdiri dari dua bagian:

- **Strategic design**: membagi sistem besar menjadi *bounded context* dengan bahasa dan model masing-masing.
- **Tactical design**: pola untuk memodelkan di dalam satu context (entity, value object, aggregate, domain event).

## Why It Matters

Bug paling mahal sering bukan bug teknis, melainkan **salah memahami bisnis**: "stok" berarti apa, kapan order dianggap
"selesai", apakah void sama dengan refund. DDD memaksa istilah dan aturan bisnis dibuat eksplisit di kode, sehingga
developer, product, dan pengguna berbicara dengan bahasa yang sama. DDD juga menjadi dasar menentukan batas modul dan
layanan.

## Core Concepts

### Strategic

| Konsep | Penjelasan | Contoh POS |
| --- | --- | --- |
| Ubiquitous language | Istilah bisnis yang sama dipakai di percakapan, dokumen, dan kode | "Void" (batal sebelum tutup shift) ≠ "Refund" (pengembalian dana) |
| Bounded context | Batas di mana satu model & bahasa berlaku konsisten | Sales, Inventory, Payments, Loyalty, Accounting |
| Subdomain | Bagian dari bisnis | Core: penjualan & stok · Supporting: loyalty · Generic: auth, notifikasi |
| Context map | Hubungan antar context | Sales → (event) → Inventory · Payments ↔ gateway (ACL) |
| Anti-corruption layer (ACL) | Penerjemah agar model eksternal tidak "mencemari" model internal | Adapter payment gateway / ERP lama |

"Produk" di context Sales (nama, harga jual) berbeda dengan "Produk" di Inventory (SKU, satuan, lokasi gudang). Tidak
perlu satu model raksasa untuk semuanya.

### Tactical

| Pola | Penjelasan | Contoh |
| --- | --- | --- |
| Entity | Punya identitas yang bertahan meski atributnya berubah | `Order(id)` |
| Value object | Didefinisikan oleh nilainya, immutable, tanpa identitas | `Money(54000, IDR)`, `Quantity`, `Address` |
| Aggregate | Kelompok objek yang dijaga konsistensinya sebagai satu unit | `Order` + `OrderLine`s |
| Aggregate root | Satu-satunya pintu masuk untuk mengubah aggregate | `order.addLine()`, bukan `orderLine.qty = 5` |
| Invariant | Aturan yang selalu benar di dalam aggregate | Total = jumlah line, order paid tidak bisa ditambah line |
| Domain event | Fakta penting yang terjadi di domain | `OrderPaid`, `StockAdjusted` |
| Repository | Mengambil/menyimpan aggregate utuh | `OrderRepository.save(order)` |
| Domain service | Aturan yang tidak cocok di satu entity | `PricingService` yang menghitung promo lintas produk |

## How It Works

```text
1. Event storming / diskusi dengan ahli domain → daftar event, perintah, aturan, istilah
2. Kelompokkan menjadi bounded context → context map & cara integrasi
3. Di setiap context: tentukan aggregate berdasarkan invariant yang harus dijaga dalam satu transaksi
4. Implementasikan model + test aturan → antar aggregate/context berkomunikasi lewat event
```

## Implementation

### Value object

```ts
export class Money {
  private constructor(readonly amount: number, readonly currency: 'IDR') {
    if (!Number.isInteger(amount)) throw new DomainError('Money must be integer minor units');
  }
  static idr(amount: number) { return new Money(amount, 'IDR'); }
  add(o: Money) { return Money.idr(this.amount + o.amount); }
  multiply(qty: number) { return Money.idr(this.amount * qty); }
  equals(o: Money) { return this.amount === o.amount && this.currency === o.currency; }
}
```

### Aggregate dengan invariant

```ts
export class Order {
  private constructor(readonly id: string, private status: 'open' | 'paid' | 'voided', private lines: OrderLine[],
                      private readonly events: DomainEvent[] = []) {}

  static open(id: string) { return new Order(id, 'open', []); }

  addLine(productId: string, unitPrice: Money, qty: number) {
    if (this.status !== 'open') throw new DomainError('ORDER_NOT_OPEN');
    if (qty <= 0) throw new DomainError('INVALID_QTY');
    this.lines.push(new OrderLine(productId, unitPrice, qty));
  }

  get total(): Money { return this.lines.reduce((t, l) => t.add(l.subtotal), Money.idr(0)); }

  markPaid(paidAt: Date) {
    if (this.status !== 'open' || this.lines.length === 0) throw new DomainError('CANNOT_PAY');
    this.status = 'paid';
    this.events.push({ type: 'OrderPaid', orderId: this.id, total: this.total.amount, at: paidAt });
  }

  pullEvents() { return this.events.splice(0); }   // disimpan ke outbox oleh repository/use case
}
```

Kode luar tidak bisa mengubah `lines` langsung. Semua perubahan melalui method yang menjaga invariant.

### Aturan ukuran aggregate

```text
- Aggregate sekecil mungkin yang tetap menjaga invariant dalam satu transaksi
- Referensi aggregate lain dengan ID, bukan objek (Order menyimpan productId, bukan objek Product)
- Satu transaksi mengubah satu aggregate. Perubahan lintas aggregate → domain event (konsistensi eventual)
Contoh: stok bukan bagian aggregate Order. OrderPaid → Inventory mencatat mutasi stok
```

### Anti-corruption layer

```ts
// Payment gateway mengembalikan status seperti "SETTLEMENT", "PENDING", "EXPIRE"
// ACL menerjemahkan ke bahasa domain kita
function toPaymentStatus(external: string): PaymentStatus {
  switch (external) {
    case 'SETTLEMENT': case 'CAPTURE': return 'succeeded';
    case 'PENDING': return 'pending';
    case 'EXPIRE': case 'CANCEL': case 'DENY': return 'failed';
    default: return 'unknown';
  }
}
```

### DDD pragmatis untuk aplikasi mobile

```text
- Ubiquitous language: nama class, layar, field API, dan kolom DB memakai istilah yang sama dengan pengguna
- Value object di Dart (freezed/sealed) untuk Money, Quantity, status
- Aturan inti yang harus jalan offline (harga, pajak) dimodelkan di domain aplikasi dan divalidasi ulang server
- Domain event lokal (outbox) untuk sinkronisasi
DDD penuh (event sourcing, banyak context) tidak wajib. Ambil bagian yang mengurangi kebingungan
```

## Best Practices

- **Bahasa yang sama** di bisnis, dokumen, dan kode, dengan glosarium.
- **Bounded context** untuk menghindari satu model raksasa.
- **Value object** untuk konsep bernilai (uang, kuantitas, periode).
- **Aggregate kecil**, invariant dijaga oleh root, referensi lewat ID.
- **Domain event** untuk konsistensi lintas aggregate/context.
- **ACL** untuk sistem eksternal dan legacy.

## Anti-Patterns

- *Anemic domain model*: entity hanya getter/setter, semua aturan di service.
- Aggregate raksasa yang memuat ratusan objek (lambat & konflik transaksi).
- Satu model `Product` untuk semua kebutuhan semua tim.
- Memakai istilah teknis yang tidak dipahami bisnis (`OrderStatus.STATE_3`).
- Menerapkan semua pola DDD untuk aplikasi CRUD sederhana.

## Performance Considerations

Aggregate kecil mengurangi lock dan konflik konkurensi. Memuat aggregate utuh untuk setiap operasi bisa mahal, jadi untuk
kebutuhan baca (laporan, daftar) gunakan read model/query terpisah (CQRS ringan) tanpa harus memuat aggregate.

## Security Considerations

Invariant domain melindungi integritas data (mis. order paid tidak bisa diubah totalnya), tetapi bukan pengganti
otorisasi. Pemeriksaan "siapa boleh void" tetap di use case/application service. ACL juga menjadi tempat validasi data
dari sistem eksternal yang tidak tepercaya.

## Real-World Use Cases

- Memisahkan istilah "void" dan "refund" menghilangkan bug laporan keuangan yang menghitung keduanya sama.
- Context Inventory memakai ledger mutasi stok, Sales hanya menerbitkan `OrderPaid`.

## Interview Questions

1. Apa itu bounded context dan mengapa penting?
2. Apa beda entity dan value object?
3. Apa itu aggregate dan bagaimana menentukan batasnya?
4. Apa itu anti-corruption layer?
5. Apakah semua proyek perlu DDD?

## Sample Answers

1. Batas di mana satu model dan bahasa berlaku konsisten. Penting agar istilah yang sama dengan makna berbeda di bagian bisnis lain tidak dipaksakan menjadi satu model raksasa, dan menjadi dasar batas modul/layanan.
2. Entity memiliki identitas yang bertahan meski atributnya berubah. Value object didefinisikan oleh nilainya, immutable, dan dua value object dengan nilai sama dianggap sama.
3. Kelompok objek yang dijaga konsistensinya sebagai satu unit melalui aggregate root. Batasnya ditentukan oleh invariant yang harus selalu benar dalam satu transaksi, dibuat sekecil mungkin, dan aggregate lain dirujuk dengan ID.
4. Lapisan penerjemah antara model kita dan model sistem eksternal/legacy, agar konsep dan bentuk data eksternal tidak bocor ke domain.
5. Tidak. Strategic design dan bahasa yang sama hampir selalu bermanfaat, tetapi pola taktis lengkap cocok untuk domain dengan aturan bisnis kompleks, bukan aplikasi CRUD sederhana.

## Practical Exercises

1. Buat glosarium 15 istilah bisnis aplikasi Anda bersama product/pengguna.
2. Gambar context map sistem Anda.
3. Refactor satu entity anemic menjadi aggregate dengan method yang menjaga invariant.

## Quick Reference

```text
Strategic: ubiquitous language · bounded context · subdomain (core/supporting/generic) · context map · ACL
Tactical: entity (identitas) · value object (nilai, immutable) · aggregate + root (invariant) · domain event · repository · domain service
Aggregate kecil · referensi ID · satu transaksi = satu aggregate · lintas aggregate via event
Pragmatis: ambil yang mengurangi kebingungan, bukan semua pola
```

## Related Topics

- [Event-Driven Architecture](/system-design/concepts/event-driven-architecture/)
- [Clean Architecture (Lintas Platform)](/system-design/concepts/clean-architecture/)
- [POS / ERP Application](/system-design/case-studies/pos-erp/)
