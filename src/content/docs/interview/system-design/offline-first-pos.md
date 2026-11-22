---
title: "Design an Offline-First POS Application"
description: "Latihan system design interview: aplikasi kasir (POS) offline-first — requirement, arsitektur mobile & backend, database lokal, outbox & sinkronisasi, idempotency, konflik stok, penomoran struk, keamanan perangkat, dan trade-off."
level: advanced
status: complete
updated: 2026-11-12
tags: [interview, system-design, offline-first, pos, sync, flutter]
---

## Overview

Soal: **"Rancang aplikasi kasir untuk ratusan outlet yang harus tetap bisa bertransaksi saat internet mati."** Ini
soal yang sangat relevan untuk mobile engineer: fokusnya pada **desain sisi klien** (database lokal, outbox, sinkronisasi)
dan **kontrak dengan backend** (idempotency, delta sync, resolusi konflik).

## Why It Matters

Offline-first menguji pemahaman konsistensi data terdistribusi dalam skala yang konkret. Kesalahan desain berakibat
langsung pada uang: transaksi ganda, stok salah, laporan tidak cocok.

## Core Concepts

### Requirement

| Fungsional | Non-fungsional |
| --- | --- |
| Transaksi penjualan, diskon, metode bayar | Transaksi offline tanpa batas waktu wajar (mis. 1–3 hari) |
| Cetak struk | Tidak ada transaksi hilang/ganda |
| Katalog & harga per outlet | Sinkronisasi otomatis saat online |
| Stok per outlet | Performa cepat di perangkat low-end |
| Laporan shift/harian | Data di perangkat aman (perangkat bisa hilang) |

### Prinsip

- **Local database = source of truth untuk UI**; jaringan hanya mekanisme sinkronisasi.
- **Outbox pattern** — setiap perubahan lokal dicatat sebagai event yang akan dikirim.
- **ID dibuat di klien (UUID v4/v7)** sehingga transaksi punya identitas sebelum sampai server.
- **Idempotent server** — kiriman ulang tidak menggandakan data.
- **Delta sync** — tarik hanya perubahan sejak checkpoint terakhir.

## How It Works

```text
┌──────────── Aplikasi kasir (Flutter) ────────────┐
│ UI (Bloc) ◄── Stream dari Drift (SQLite)          │
│ Use case: CreateSale → tulis sale + items + outbox │  ← satu transaksi DB lokal
│ SyncWorker (WorkManager / saat online):            │
│   PUSH: kirim outbox batch → tandai sent           │
│   PULL: GET /changes?since=checkpoint → upsert     │
└────────────────────────────┬─────────────────────┘
                             │ HTTPS (batch, gzip)
┌────────────────────────────▼─────────────────────┐
│ Sync API (Node.js) → validasi, idempotency check   │
│ PostgreSQL: sales, sale_items, stock_movements      │
│ Event → queue → laporan, notifikasi stok minimum   │
└───────────────────────────────────────────────────┘
```

## Implementation

### Skema lokal (ringkas)

```sql
CREATE TABLE sales (
  id TEXT PRIMARY KEY,               -- UUID dari perangkat
  outlet_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  receipt_no TEXT NOT NULL,          -- unik per perangkat: OUT01-DEV03-000123
  total INTEGER NOT NULL,            -- rupiah dalam integer, bukan double
  status TEXT NOT NULL,              -- completed | voided
  created_at INTEGER NOT NULL
);
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  op TEXT NOT NULL, payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'   -- pending | sent | failed
);
```

### Menyimpan transaksi secara atomik

```dart
Future<void> createSale(Sale sale) => db.transaction(() async {
  await db.into(db.sales).insert(sale.toCompanion());
  await db.batch((b) => b.insertAll(db.saleItems, sale.items.map((i) => i.toCompanion())));
  await db.into(db.outbox).insert(OutboxCompanion.insert(
    entity: 'sale', entityId: sale.id, op: 'create', payload: jsonEncode(sale.toJson()),
  ));
});
```

### Kontrak sinkronisasi

```http
POST /v1/sync/push         { "deviceId": "DEV03", "events": [ { "id": "evt-uuid", "entity": "sale", ... } ] }
→ 200 { "accepted": ["evt-uuid", ...], "rejected": [ { "id": "...", "reason": "PRICE_EXPIRED" } ] }

GET  /v1/sync/pull?since=2026-11-10T08:00:00Z&cursor=...
→ 200 { "products": [...], "prices": [...], "deleted": [...], "nextCheckpoint": "..." }
```

Server menyimpan `event id` dengan unique constraint → push berulang aman.

### Stok: event, bukan angka absolut

```text
❌ Perangkat mengirim "stok kopi = 7"      → saling timpa antar perangkat
✅ Perangkat mengirim "kopi −2 (sale X)"   → server menjumlah stock_movements
```

Stok di perangkat adalah **perkiraan**; server adalah sumber kebenaran. Jika stok negatif setelah sinkron (dua perangkat
menjual barang terakhir), sistem membuat alert untuk penyesuaian, bukan menolak transaksi yang sudah terjadi.

### Penomoran struk offline

Nomor berurutan global tidak mungkin tanpa koordinasi. Gunakan **prefix outlet + device + counter lokal**
(`OUT01-DEV03-000123`), counter disimpan di DB lokal dalam transaksi yang sama dengan sale.

## Best Practices

- **Satu transaksi lokal** untuk sale + items + outbox.
- **Uang dalam integer** (rupiah/sen), bukan `double`.
- **Retry dengan exponential backoff + jitter**, batch kecil, berhenti saat baterai lemah bila perlu.
- **Status sinkron terlihat** di UI (jumlah pending, terakhir sinkron).
- **Versi skema & migrasi** diuji dari semua versi lama.
- **Kebijakan harga**: harga disalin ke sale_items saat transaksi; server bisa menolak/menandai bila aturan bisnis dilanggar.

## Anti-Patterns

- UI langsung memanggil API dan menyimpan lokal sebagai "cache" saja.
- ID auto-increment dari server untuk entitas yang dibuat offline.
- Last-write-wins untuk stok.
- Sinkronisasi seluruh data setiap kali (full sync).
- Menghapus outbox sebelum server mengonfirmasi.

## Performance Considerations

- Index lokal untuk pencarian produk (nama, barcode); FTS untuk pencarian teks.
- Query laporan harian dengan agregasi di SQLite, bukan di Dart.
- Batch upsert saat pull; jalankan parsing besar di isolate.
- Kompresi payload sinkron; pagination untuk pull katalog besar.

## Security Considerations

- Enkripsi database lokal (mis. SQLCipher) dan token di secure storage.
- Login kasir dengan PIN + peran (kasir vs supervisor untuk void/diskon besar).
- Device binding & kemampuan remote revoke perangkat yang hilang.
- Audit log untuk void, refund, dan perubahan harga.
- Server memvalidasi ulang semua data (jangan percaya total dari klien begitu saja).

## Real-World Use Cases

- POS ritel/F&B multi-outlet.
- Aplikasi petugas lapangan (survei, pencatatan meter, inspeksi) di area sinyal lemah.
- Aplikasi gudang dengan scanner barcode.

## Interview Questions

1. Bagaimana memastikan transaksi tidak hilang atau ganda?
2. Bagaimana menangani stok yang dijual dua perangkat saat offline?
3. Bagaimana membuat nomor struk unik saat offline?
4. Kapan dan bagaimana sinkronisasi dijalankan?
5. Bagaimana menangani perubahan harga saat perangkat offline lama?

## Sample Answers

1. Tulis sale + outbox dalam satu transaksi lokal; ID UUID dari klien; push dengan event id yang idempoten di server (unique constraint); outbox dihapus/ditandai hanya setelah konfirmasi.
2. Kirim pergerakan stok (delta) bukan nilai absolut; server menjumlah; konflik (stok negatif) dideteksi dan ditangani lewat alert/penyesuaian karena penjualan fisik sudah terjadi.
3. Kombinasi kode outlet + kode perangkat + counter lokal yang bertambah dalam transaksi DB yang sama.
4. Saat aplikasi online (listener konektivitas), periodik via WorkManager, dan manual; push dulu lalu pull; dengan backoff dan batching.
5. Harga punya masa berlaku; perangkat memakai harga terakhir yang diketahui dan menyalinnya ke transaksi; server menerima transaksi sesuai kebijakan (mis. toleransi waktu) dan menandai selisih untuk ditinjau; batas offline maksimum memaksa sinkron.

## Practical Exercises

1. Rancang alur void/refund yang aman saat offline.
2. Tentukan apa yang terjadi bila satu event outbox selalu ditolak server (poison message).
3. Gambar sequence diagram push–pull untuk dua perangkat di outlet yang sama.

## Quick Reference

```text
Local DB = source of truth UI · UUID klien · outbox dalam transaksi yang sama · idempotent push
Delta sync (since checkpoint) · stok = event delta · nomor struk = outlet+device+counter
Uang = integer · enkripsi lokal · audit log · server validasi ulang
```

## Related Topics

- [Offline-First & Synchronization Strategy](/system-design/concepts/offline-first-architecture/)
- [POS / ERP Case Study](/system-design/case-studies/pos-erp/)
- [Flutter Offline-First](/flutter/offline-first/)
- [Design an Inventory Management System](/interview/system-design/inventory-system/)
