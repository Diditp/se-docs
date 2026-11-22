---
title: "Backend Architecture"
description: "Arsitektur backend Node.js yang mudah dirawat: modular monolith berbasis domain, lapisan route/service/repository, dependency injection sederhana, transaksi & unit of work, domain errors, konfigurasi, background worker, integrasi eksternal lewat adapter, multi-tenancy, struktur folder lengkap, serta evolusi ketika aplikasi tumbuh."
level: advanced
status: complete
updated: 2026-11-13
tags: [backend, architecture, modular-monolith, clean-architecture, nodejs]
---

## Overview

Arsitektur backend menentukan **di mana setiap jenis kode berada** dan **bagaimana bagian-bagian berkomunikasi**.
Untuk sebagian besar produk (termasuk backend untuk aplikasi mobile), titik awal yang direkomendasikan adalah
**modular monolith**: satu aplikasi yang di-deploy sebagai satu unit, tetapi dibagi menjadi modul domain dengan batas
yang tegas.

## Why It Matters

Tanpa arsitektur yang jelas, logika bisnis tersebar di route handler, query SQL muncul di mana-mana, dan setiap perubahan
berisiko merusak fitur lain. Arsitektur yang baik membuat kode mudah dites, mudah dipahami agent maupun manusia, dan
siap dipecah bila memang dibutuhkan.

## Core Concepts

| Lapisan | Tanggung jawab | Tidak boleh |
| --- | --- | --- |
| HTTP (routes/controllers) | Autentikasi, validasi skema, mapping request/response, status code | Aturan bisnis, SQL |
| Service / use case | Aturan bisnis, orkestrasi, transaksi, otorisasi objek | Mengetahui `req`/`res` |
| Repository | Akses data (SQL/ORM), mapping baris ↔ entitas | Aturan bisnis |
| Adapter integrasi | Payment, SMS, storage, push | Bocor ke service sebagai tipe library |
| Worker | Menjalankan job (memanggil service yang sama) | Duplikasi logika |

| Konsep | Penjelasan |
| --- | --- |
| Modul domain | `orders`, `catalog`, `inventory`, `payments`: masing-masing memiliki tabel & API internal |
| Public API modul | `index.ts` yang mengekspor fungsi/tipe untuk modul lain |
| Composition root | Satu tempat merangkai dependensi (DI manual) |
| Domain error | Error bermakna bisnis (`OutOfStockError`) dipetakan ke HTTP di satu tempat |

## How It Works

```text
HTTP route → validasi → service.create(user, input)
  → db.transaction(tx => { inventory.reserve(tx, ...); orders.insert(tx, ...); outbox.add(tx, 'order.created') })
  → return entitas → route memetakan ke DTO
Modul lain bereaksi lewat event (outbox → worker), bukan memanggil internal modul secara langsung
```

## Implementation

### Struktur folder

```text
src/
  main.ts                    # start HTTP server
  worker.ts                  # start worker (proses terpisah)
  container.ts               # composition root (DI manual)
  config/env.ts              # zod env schema
  shared/
    db/ (pool, transaction helper)  errors/  logging/  auth/  http/ (error handler, plugins)
  modules/
    orders/
      index.ts               # public API: createOrdersModule, types
      orders.routes.ts
      orders.service.ts
      orders.repository.ts
      orders.schemas.ts
      orders.events.ts
    inventory/ …
    payments/
      payments.service.ts
      gateway/ (PaymentGateway interface + XenditGateway, FakeGateway)
  migrations/
test/
```

### Composition root (DI manual)

```ts
// container.ts
export function createContainer(env: Env) {
  const db = createPool(env.DATABASE_URL);
  const paymentGateway: PaymentGateway = env.PAYMENT_PROVIDER === 'fake'
    ? new FakeGateway() : new XenditGateway(env.PAYMENT_SECRET_KEY);
  const inventory = createInventoryModule({ db });
  const orders = createOrdersModule({ db, inventory: inventory.api });
  const payments = createPaymentsModule({ db, gateway: paymentGateway, orders: orders.api });
  return { db, inventory, orders, payments };
}
```

DI manual sederhana dan eksplisit. Container DI (NestJS, tsyringe) berguna saat jumlah dependensi besar.

### Service dengan transaksi

```ts
export class OrdersService {
  constructor(private db: Db, private repo: OrdersRepository, private inventory: InventoryApi) {}

  async create(user: AuthUser, input: CreateOrderInput, idempotencyKey: string): Promise<Order> {
    await this.assertOutletMember(user, input.outletId);
    return this.db.transaction(async (tx) => {
      const existing = await this.repo.findByIdempotencyKey(tx, user.tenantId, idempotencyKey);
      if (existing) return existing;
      const priced = await this.inventory.reserveAndPrice(tx, input.outletId, input.items);  // melempar OutOfStockError
      const order = await this.repo.insert(tx, { ...priced, tenantId: user.tenantId, createdBy: user.id, idempotencyKey });
      await outbox.add(tx, 'order.created', { orderId: order.id });
      return order;
    });
  }
}
```

### Adapter integrasi

```ts
export interface PaymentGateway {
  charge(input: { orderId: string; amount: number; method: 'qris' | 'card' }): Promise<ChargeResult>;
}
// Implementasi nyata membungkus SDK pihak ketiga, menerapkan timeout, retry (idempoten), dan memetakan error
// Service hanya tahu interface → mudah dites dengan FakeGateway dan mudah ganti penyedia
```

### Multi-tenancy

| Model | Cara | Trade-off |
| --- | --- | --- |
| Shared DB, kolom `tenant_id` | Semua query difilter tenant (+ RLS opsional) | Paling umum & efisien. Disiplin filter wajib |
| Schema per tenant | Satu schema PostgreSQL per tenant | Isolasi lebih baik, migrasi lebih rumit |
| DB per tenant | Database terpisah | Isolasi tertinggi, biaya & operasional tinggi |

### Aturan dependensi antar modul

```text
- Modul hanya mengimpor `modules/<lain>/index.ts`, tidak ke file internal
- Tidak ada JOIN ke tabel milik modul lain di repository (gunakan API modul atau read model)
- Efek samping lintas modul lewat event (outbox)
- Ditegakkan dengan dependency-cruiser di CI
```

### Evolusi

```text
1. Modular monolith + satu DB
2. Pisahkan worker dari API (proses berbeda, kode sama)
3. Read model/replica untuk laporan
4. Bila satu modul butuh skala/tim/isolasi berbeda → ekstrak menjadi layanan (API modul sudah jelas, event sudah ada)
```

## Best Practices

- **Modular monolith** dengan batas modul yang ditegakkan.
- **Route tipis, service berisi aturan, repository berisi SQL**.
- **Transaksi di service**, outbox untuk event.
- **Adapter untuk integrasi eksternal** dengan fake untuk test.
- **Composition root tunggal** dan konfigurasi tervalidasi.
- **ADR untuk keputusan arsitektur**.

## Anti-Patterns

- "Fat controller" berisi validasi, aturan bisnis, SQL, dan pemanggilan SDK.
- Modul saling mengimpor file internal (spaghetti).
- Service yang menerima `req`/`res`.
- Microservices sejak hari pertama untuk tim kecil.
- Global singleton tersembunyi yang sulit diganti saat test.

## Performance Considerations

Arsitektur berlapis menambah sedikit pemanggilan fungsi, bukan overhead yang berarti. Hal yang penting: transaksi singkat,
query efisien di repository, dan pekerjaan berat di worker. Batas modul juga memudahkan mengoptimalkan atau
menskalakan bagian yang menjadi bottleneck.

## Security Considerations

Tempatkan otorisasi objek di service (dekat data), filter tenant di setiap repository, dan secret hanya di adapter yang
membutuhkannya. Arsitektur yang jelas memudahkan review keamanan karena alur data terlihat.

## Real-World Use Cases

- Backend POS: modul catalog, orders, inventory, payments, reports. Worker menjalankan struk, sinkron akuntansi, dan notifikasi.
- Mengganti payment gateway hanya dengan menambah adapter baru tanpa mengubah service orders.

## Interview Questions

1. Bagaimana Anda menyusun arsitektur backend untuk produk baru?
2. Apa tanggung jawab controller, service, dan repository?
3. Bagaimana menangani integrasi pihak ketiga agar mudah diganti dan dites?
4. Bagaimana mendesain multi-tenancy?

## Sample Answers

1. Modular monolith dengan modul berbasis domain, lapisan route/service/repository, composition root, transaksi di service, outbox untuk event, worker terpisah, dan batas modul yang ditegakkan otomatis. Siap diekstrak menjadi layanan bila ada kebutuhan terukur.
2. Controller menangani HTTP (validasi, mapping, status). Service berisi aturan bisnis, transaksi, dan otorisasi objek. Repository mengakses data dan memetakan baris ke entitas.
3. Definisikan interface (port) yang dibutuhkan service, implementasikan adapter yang membungkus SDK (dengan timeout, retry, mapping error), dan sediakan fake untuk test. Penyedia dapat diganti tanpa mengubah service.
4. Paling umum: database bersama dengan kolom `tenant_id`, tenant diambil dari token, setiap query difilter (dan Row Level Security sebagai lapisan tambahan). Untuk kebutuhan isolasi tinggi: schema atau database per tenant dengan biaya operasional lebih besar.

## Practical Exercises

1. Refactor satu route handler gemuk menjadi route + service + repository.
2. Buat adapter payment dengan fake dan test service tanpa jaringan.
3. Tambahkan aturan dependency-cruiser untuk batas antar modul.

## Quick Reference

```text
Modular monolith · modules/<domain>/{routes, service, repository, schemas, events, index}
Route tipis → service (aturan, transaksi, authZ objek) → repository (SQL)
Composition root (DI manual) · adapter + fake untuk integrasi · outbox + worker
Tenant: tenant_id dari token + filter + RLS opsional · batas modul ditegakkan CI
Evolusi: pisah worker → read model → ekstrak layanan bila terukur
```

## Related Topics

- [Monolithic vs Microservices](/system-design/concepts/monolith-vs-microservices/)
- [Clean Architecture (Lintas Platform)](/system-design/concepts/clean-architecture/)
- [Background Jobs & Queue](/backend/background-jobs-queue/)
