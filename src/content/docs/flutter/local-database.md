---
title: "Local Database: SQLite, Drift & Hive"
description: "Memilih dan memakai penyimpanan lokal di Flutter: SharedPreferences, secure storage, key-value (Hive/Isar-style), dan relational (sqflite/Drift) — termasuk schema, query reaktif, transaksi, migrasi, dan enkripsi."
level: intermediate
status: complete
version: "Flutter 3.x · drift 2.x · sqflite 2.x"
updated: 2026-11-12
tags: [flutter, database, drift, sqlite, hive, offline]
---

## Overview

Penyimpanan lokal di Flutter terbagi beberapa kategori:

| Kebutuhan | Pilihan | Catatan |
| --- | --- | --- |
| Preferensi kecil (flag, tema) | `shared_preferences` | Key-value plain text — bukan untuk secret |
| Secret (token, PIN) | `flutter_secure_storage` | Keychain/Keystore-backed |
| Cache objek sederhana tanpa relasi | Hive / key-value NoSQL | Cepat; cek status maintenance package |
| Data relasional, query, laporan, transaksi | **SQLite** via `sqflite` (raw SQL) atau **Drift** (type-safe, reaktif) | Pilihan utama untuk POS/inventory |
| File besar (foto, PDF) | File system (`path_provider`) + path di DB | Jangan simpan blob besar di DB |

## Why It Matters

Aplikasi transaksi dan offline-first hidup atau mati di penyimpanan lokal: data harus **konsisten** (transaksi), **cepat**
di-query (index), **aman** (enkripsi), dan **bisa berevolusi** (migrasi) saat app di-update tanpa menghapus data user.

## Core Concepts

- **Schema & tabel** — struktur data relasional dengan primary key dan foreign key.
- **Query reaktif** — Drift `watch()` mengembalikan `Stream` yang emit ulang setiap tabel terkait berubah → UI otomatis update.
- **Transaksi** — beberapa operasi tulis atomik (`db.transaction`).
- **Migrasi** — `schemaVersion` + langkah migrasi dari versi lama ke baru.
- **DAO** — kelas pengelompokan query per area (Drift `@DriftAccessor`).
- **Isolate DB** — Drift dapat menjalankan database di background isolate agar query berat tidak mengganggu UI.
- **Foreign keys di SQLite** harus diaktifkan per koneksi (`PRAGMA foreign_keys = ON`).

## How It Works

SQLite adalah database file tunggal yang berjalan **di dalam proses app** (bukan server). Drift menghasilkan kode
Dart type-safe dari definisi tabel/kueri (`build_runner`), mengeksekusi SQL lewat SQLite, dan melacak tabel yang
terlibat di setiap query sehingga `watch()` tahu kapan harus emit ulang setelah insert/update/delete.

```text
UI (StreamBuilder/Bloc) ◄─ watch() stream ◄─ Drift ◄─► SQLite file (app documents dir)
          write: db.transaction { insert order; insert items; insert outbox } → semua stream terkait emit ulang
```

## Implementation

### Definisi tabel Drift

```dart
class Products extends Table {
  TextColumn get id => text()();
  TextColumn get sku => text().unique()();
  TextColumn get name => text().withLength(min: 1, max: 120)();
  IntColumn get price => integer()();                     // rupiah
  IntColumn get stock => integer().withDefault(const Constant(0))();
  DateTimeColumn get updatedAt => dateTime()();
  @override
  Set<Column> get primaryKey => {id};
}

class Orders extends Table {
  TextColumn get id => text()();
  IntColumn get total => integer()();
  DateTimeColumn get createdAt => dateTime()();
  BoolColumn get synced => boolean().withDefault(const Constant(false))();
  @override
  Set<Column> get primaryKey => {id};
}

class OrderItems extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get orderId => text().references(Orders, #id, onDelete: KeyAction.cascade)();
  TextColumn get productId => text().references(Products, #id)();
  IntColumn get qty => integer().check(qty.isBiggerThanValue(0))();
  IntColumn get unitPrice => integer()();                 // snapshot harga saat transaksi
}
```

### Database, index, migrasi, dan background isolate

```dart
@DriftDatabase(tables: [Products, Orders, OrderItems], daos: [OrderDao])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  @override
  int get schemaVersion => 3;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await customStatement('CREATE INDEX idx_orders_created_at ON orders (created_at)');
        },
        onUpgrade: (m, from, to) async {
          if (from < 2) await m.addColumn(orders, orders.synced);
          if (from < 3) await customStatement('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at)');
        },
        beforeOpen: (details) async => customStatement('PRAGMA foreign_keys = ON'),
      );
}

// Buka di background isolate (drift_flutter / NativeDatabase.createInBackground)
AppDatabase openDatabase() => AppDatabase(driftDatabase(name: 'pos'));
```

### DAO: query reaktif & transaksi

```dart
@DriftAccessor(tables: [Orders, OrderItems])
class OrderDao extends DatabaseAccessor<AppDatabase> with _$OrderDaoMixin {
  OrderDao(super.db);

  Stream<List<Order>> watchToday(DateTime startUtc) =>
      (select(orders)
            ..where((o) => o.createdAt.isBiggerOrEqualValue(startUtc))
            ..orderBy([(o) => OrderingTerm.desc(o.createdAt)])
            ..limit(50))
          .watch()
          .map((rows) => rows.map((r) => r.toEntity()).toList());

  Future<void> insertOrder(OrdersCompanion order, List<OrderItemsCompanion> items) => transaction(() async {
        await into(orders).insert(order);
        await batch((b) => b.insertAll(orderItems, items));
        for (final i in items) {
          await customUpdate(
            'UPDATE products SET stock = stock - ? WHERE id = ?',
            variables: [Variable.withInt(i.qty.value), Variable.withString(i.productId.value)],
            updates: {db.products},
          );
        }
      });

  // Laporan agregasi di SQL, bukan di Dart
  Future<int> revenueBetween(DateTime fromUtc, DateTime toUtc) async {
    final sum = orders.total.sum();
    final row = await (selectOnly(orders)
          ..addColumns([sum])
          ..where(orders.createdAt.isBetweenValues(fromUtc, toUtc)))
        .getSingle();
    return row.read(sum) ?? 0;
  }
}
```

### Test migrasi & DAO

```dart
test('insertOrder mengurangi stok secara atomik', () async {
  final db = AppDatabase(NativeDatabase.memory());
  addTearDown(db.close);
  await db.into(db.products).insert(ProductsCompanion.insert(
      id: 'p1', sku: 'KOPI', name: 'Kopi', price: 18000, stock: const Value(10), updatedAt: DateTime.utc(2026)));
  await db.orderDao.insertOrder(
    OrdersCompanion.insert(id: 'o1', total: 36000, createdAt: DateTime.utc(2026)),
    [OrderItemsCompanion.insert(orderId: 'o1', productId: 'p1', qty: 2, unitPrice: 18000)],
  );
  final p = await (db.select(db.products)..where((t) => t.id.equals('p1'))).getSingle();
  expect(p.stock, 8);
});
```

Drift menyediakan tool untuk menyimpan snapshot schema (`drift_dev schema dump`) dan menghasilkan test migrasi antar versi — gunakan untuk setiap kenaikan `schemaVersion`.

:::caution[Version-dependent]
Cara membuka database (`driftDatabase` dari `drift_flutter` vs `NativeDatabase.createInBackground`) dan tooling migrasi berubah antar versi Drift.
Cek dokumentasi Drift untuk versi yang Anda pakai. Untuk Hive, periksa status maintenance sebelum memilih untuk project baru.
:::

## Best Practices

- **Relasional (Drift/sqflite) untuk data bisnis**; key-value hanya untuk cache/preferensi.
- **Transaksi untuk setiap operasi multi-tabel** — data tidak pernah setengah tersimpan.
- **Agregasi & filter di SQL**, bukan memuat semua baris ke Dart lalu dihitung.
- **Index untuk kolom filter/sort** (`created_at`, `synced`, foreign key).
- **Waktu disimpan UTC**, uang `int`.
- **Migrasi teruji** untuk setiap perubahan schema; jangan menghapus & membuat ulang database di release.
- **Database di background isolate** bila query berat.
- **Satu instance database** per app (singleton di DI) dan ditutup saat app dihentikan/test selesai.

## Anti-Patterns

- Menyimpan token/PIN di SharedPreferences atau DB tanpa enkripsi.
- JSON string besar dalam satu kolom untuk data yang perlu di-query.
- Memuat seluruh tabel lalu filter di Dart (`select(...).get()` lalu `.where`).
- `watch()` pada query tanpa `limit` untuk tabel besar → emit ulang mahal setiap perubahan.
- Mengubah schema tanpa menaikkan `schemaVersion` & migrasi → crash di device user.
- Membuka banyak instance database ke file yang sama.

## Performance Considerations

- Batch insert dalam satu transaksi (ribuan kali lebih cepat dari insert satu per satu karena fsync).
- Index tepat + `EXPLAIN QUERY PLAN` untuk query lambat.
- Pagination (`limit/offset` atau keyset) untuk list panjang.
- Background isolate untuk import data besar.
- `VACUUM` sesekali setelah menghapus data besar (mis. pembersihan transaksi lama).

## Security Considerations

- Data pribadi/finansial: enkripsi database (SQLCipher, mis. `sqlcipher_flutter_libs`) dengan kunci acak yang disimpan di secure storage.
- File DB berada di sandbox app, tetapi device yang di-root/backup bisa membacanya — jangan menganggap aman tanpa enkripsi.
- Atur backup rules Android untuk mengecualikan database sensitif.
- Query dengan parameter (Drift otomatis; `sqflite` gunakan `?` arguments) — jangan concatenation string.
- Hapus database user saat logout bila kebijakan mengharuskan.

## Real-World Use Cases

- **POS offline**: produk, transaksi, item, outbox, shift — semua di Drift dengan query laporan harian.
- **Field service**: work order + foto (path file) + status sync.
- **Cache katalog**: tabel produk dengan `updatedAt` untuk delta sync.

## Interview Questions

1. Kapan memilih SharedPreferences, secure storage, Hive, dan SQLite/Drift?
2. Apa keuntungan Drift dibanding sqflite?
3. Bagaimana menangani perubahan schema di app yang sudah dipakai user?
4. Bagaimana membuat UI otomatis update saat data lokal berubah?
5. Bagaimana mengamankan data lokal yang sensitif?

## Sample Answers

1. SharedPreferences untuk preferensi kecil non-sensitif; secure storage untuk secret; Hive/key-value untuk cache objek sederhana tanpa relasi; SQLite/Drift untuk data relasional, transaksi, dan query/laporan.
2. Drift type-safe (query dicek compiler), query reaktif `watch()`, migrasi terstruktur & tooling test, DAO, dan dukungan background isolate; sqflite memerlukan SQL string manual dan mapping sendiri.
3. Naikkan `schemaVersion`, tulis langkah migrasi bertahap per versi (`if (from < n)`), uji migrasi dari setiap versi lama, dan hindari operasi destruktif; data user harus tetap ada.
4. Gunakan query `watch()` yang mengembalikan `Stream`, dikonsumsi Bloc/StreamBuilder; Drift emit ulang saat tabel yang terlibat berubah.
5. Enkripsi database (SQLCipher) dengan kunci di Keystore/Keychain, token di secure storage, atur backup rules, dan hapus data saat logout bila perlu.

## Practical Exercises

1. Buat schema Drift untuk produk, order, order_items dengan foreign key & index; tulis DAO laporan harian.
2. Tambahkan kolom baru (`synced`) dengan migrasi versi 1 → 2 dan test migrasinya.
3. Bandingkan waktu insert 10.000 baris dengan dan tanpa transaksi/batch.
4. Aktifkan enkripsi SQLCipher dan simpan kunci di secure storage.

## Quick Reference

```text
Prefs → shared_preferences · Secret → secure storage · Relasional → Drift/sqflite · File besar → filesystem
Drift: tabel → build_runner → DAO · watch() reaktif · transaction() · batch()
schemaVersion + MigrationStrategy + test migrasi · PRAGMA foreign_keys = ON
Index kolom filter/sort · agregasi di SQL · background isolate · enkripsi untuk data sensitif
```

## Related Topics

- [Offline-First Application](/flutter/offline-first/)
- [Data Synchronization & Conflict Resolution](/flutter/data-sync-conflict-resolution/)
- [Transactions & ACID](/database/transactions-acid/)
- [Indexing](/database/indexing/)
- Referensi: [Drift documentation](https://drift.simonbinder.eu/), [sqflite](https://pub.dev/packages/sqflite), [Flutter persistence cookbook](https://docs.flutter.dev/cookbook/persistence).
