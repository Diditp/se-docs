---
title: "ORM vs Raw SQL"
description: "Membandingkan ORM, query builder, dan raw SQL di Node.js/TypeScript dan Flutter: kelebihan, kekurangan, masalah N+1, transaksi, type safety, kapan turun ke SQL, serta pola repository yang memadukan keduanya."
level: intermediate
status: complete
updated: 2026-11-12
tags: [database, orm, sql, prisma, drift, query-builder]
---

## Overview

Ada tiga cara umum berbicara dengan database dari kode:

| Pendekatan | Contoh | Inti |
| --- | --- | --- |
| ORM | Prisma, TypeORM, Sequelize, MikroORM; Room (Android) | Memetakan tabel ↔ objek, query lewat API objek |
| Query builder | Knex, Kysely, Drizzle; Drift (Dart, juga mendukung SQL) | Menyusun SQL dengan API terprogram, dekat dengan SQL |
| Raw SQL | `pg`, `mysql2`, `sqflite` | Menulis SQL langsung dengan parameter |

Tidak ada pilihan yang selalu benar; banyak proyek memakai ORM/query builder untuk CRUD dan raw SQL untuk query
kompleks.

## Why It Matters

Pilihan ini memengaruhi produktivitas, performa, keamanan, dan kemudahan debugging. Pertanyaan "ORM atau SQL?" sering
muncul di interview backend.

## Core Concepts

| Aspek | ORM | Query builder | Raw SQL |
| --- | --- | --- | --- |
| Produktivitas CRUD | Tinggi | Sedang–tinggi | Rendah–sedang |
| Kontrol query | Rendah–sedang | Tinggi | Penuh |
| Type safety | Tinggi (Prisma) | Tinggi (Kysely/Drizzle/Drift) | Perlu definisi tipe manual |
| Query kompleks (window, CTE) | Terbatas → escape hatch | Baik | Terbaik |
| Risiko N+1 | Tinggi bila lalai | Sedang | Rendah (eksplisit) |
| Portabilitas DB | Tinggi | Sedang | Rendah |
| Kurva belajar | Belajar API ORM | Perlu paham SQL | Perlu paham SQL |
| Migrasi skema | Sering terintegrasi | Tersedia | Tool terpisah |

## How It Works

```text
ORM:            prisma.order.findMany({ include: { items: true } })  → ORM membuat SQL (1 atau beberapa query)
Query builder:  db.selectFrom('orders').innerJoin(...).select([...])  → SQL yang dapat diprediksi
Raw:            pool.query('SELECT ... WHERE id = $1', [id])          → SQL persis seperti ditulis
Semua → driver → koneksi (pool) → database
```

## Implementation

### ORM (Prisma)

```ts
const orders = await prisma.order.findMany({
  where: { outletId, status: 'PAID' },
  include: { items: { include: { product: true } } },     // eager loading, mencegah N+1
  orderBy: { createdAt: 'desc' },
  take: 20,
});

await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data: { outletId, total } });
  await tx.stockLevel.update({
    where: { productId_locationId: { productId, locationId: outletId } },
    data: { onHand: { decrement: qty } },
  });
  return order;
});
```

### Query builder (Kysely)

```ts
const rows = await db
  .selectFrom('orders as o')
  .innerJoin('order_items as oi', 'oi.order_id', 'o.id')
  .select(['o.id', db.fn.sum<number>(sql`oi.qty * oi.unit_price`).as('revenue')])
  .where('o.status', '=', 'paid')
  .groupBy('o.id')
  .execute();
```

### Raw SQL untuk laporan kompleks

```ts
const { rows } = await pool.query(
  `SELECT category, name, units FROM (
     SELECT p.category, p.name, SUM(oi.qty) AS units,
            DENSE_RANK() OVER (PARTITION BY p.category ORDER BY SUM(oi.qty) DESC) AS rnk
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.outlet_id = $1 AND o.created_at >= $2
     GROUP BY p.category, p.name) t
   WHERE rnk <= 3`,
  [outletId, since],
);
```

### Masalah N+1 dan perbaikannya

```ts
// ❌ 1 query order + N query item
const orders = await prisma.order.findMany({ take: 50 });
for (const o of orders) o.items = await prisma.orderItem.findMany({ where: { orderId: o.id } });

// ✅ eager loading / satu query batch
const orders = await prisma.order.findMany({ take: 50, include: { items: true } });
```

### Flutter: Drift (query builder + SQL bertipe)

```dart
// Builder
final paid = await (select(sales)..where((s) => s.status.equals('paid'))).get();

// SQL di file .drift — dicek saat build dan menghasilkan kode bertipe
// dailyRevenue: SELECT date(created_at) AS day, SUM(total) AS revenue FROM sales GROUP BY day;
```

### Pola repository: sembunyikan pilihan di satu tempat

```ts
interface OrderRepository {
  findRecent(outletId: string, limit: number): Promise<Order[]>;
  topProducts(outletId: string, since: Date): Promise<TopProduct[]>;   // implementasi boleh raw SQL
}
```

## Best Practices

- **Pahami SQL yang dihasilkan** — aktifkan logging query di development.
- **ORM/query builder untuk CRUD**, raw SQL untuk laporan/kinerja kritis.
- **Selalu parameterized**, termasuk di escape hatch ORM (`$queryRaw` dengan template tag, bukan `$queryRawUnsafe` dengan input user).
- **Eager loading/batching** untuk relasi; pantau jumlah query per request.
- **Bungkus akses data dalam repository** agar pilihan teknis tidak menyebar ke domain.

## Anti-Patterns

- Menganggap ORM membebaskan dari kebutuhan memahami SQL dan index.
- Lazy loading tanpa sadar di dalam loop (N+1).
- Interpolasi string pada raw query.
- Memaksa query analitik rumit lewat API ORM sehingga SQL yang dihasilkan tidak efisien.
- Mengambil seluruh entitas besar hanya untuk satu kolom.

## Performance Considerations

ORM dapat menghasilkan query berlebih (N+1, `SELECT *`, join berlebihan). Ukur jumlah dan durasi query per endpoint,
pilih kolom yang diperlukan, dan gunakan raw SQL/view untuk query berat. Lihat [Query Optimization](/database/query-optimization/).

## Security Considerations

ORM dan query builder memparameterisasi nilai secara default — risiko muncul saat memakai raw/unsafe API dengan input
pengguna, atau saat nama kolom/urutan (`ORDER BY`) diambil dari input tanpa allowlist.

## Real-World Use Cases

- Prisma untuk CRUD API + raw SQL untuk dashboard laporan.
- Kysely/Drizzle untuk tim yang ingin SQL eksplisit dengan type safety.
- Drift di Flutter untuk database lokal bertipe dengan query SQL kompleks.

## Interview Questions

1. Apa kelebihan dan kekurangan ORM?
2. Apa itu masalah N+1 di ORM dan cara mengatasinya?
3. Kapan Anda menulis raw SQL walaupun memakai ORM?
4. Apakah ORM otomatis aman dari SQL injection?
5. Apa beda ORM dan query builder?

## Sample Answers

1. Kelebihan: produktivitas CRUD, type safety, migrasi terintegrasi, portabilitas. Kekurangan: kontrol query terbatas, abstraksi bocor, risiko N+1 dan query tidak efisien, sulit untuk query analitik kompleks.
2. Query daftar diikuti satu query per item untuk relasi. Atasi dengan eager loading (`include`/`JOIN`), batching (`WHERE id IN`), atau DataLoader, dan pantau jumlah query.
3. Untuk laporan/agregasi kompleks (window function, CTE), query yang performanya kritis, atau fitur khusus database yang tidak didukung ORM.
4. Untuk API standar ya (nilai diparameterisasi), tetapi tidak untuk raw/unsafe query dengan interpolasi string atau nama kolom dinamis dari input pengguna.
5. ORM memetakan tabel ke objek/entitas dan mengelola relasi; query builder hanya membantu menyusun SQL secara terprogram dengan kontrol yang lebih dekat ke SQL.

## Practical Exercises

1. Aktifkan logging query Prisma/TypeORM dan hitung query per endpoint utama Anda.
2. Temukan dan perbaiki satu kasus N+1.
3. Tulis laporan top produk per kategori dengan query builder dan dengan raw SQL; bandingkan keterbacaannya.

## Quick Reference

```text
ORM (produktif, abstraksi) · query builder (kontrol + tipe) · raw SQL (kontrol penuh)
CRUD → ORM/builder · laporan/kritis → raw SQL/view · repository menyembunyikan pilihan
Waspada N+1 → include/JOIN/batching · raw query tetap parameterized · log SQL saat dev
```

## Related Topics

- [SQL CRUD](/database/sql-crud/)
- [Query Optimization](/database/query-optimization/)
- [Backend & Node.js Questions](/interview/technical/backend-nodejs/)
