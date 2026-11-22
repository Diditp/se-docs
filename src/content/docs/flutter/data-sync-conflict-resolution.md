---
title: "Data Synchronization & Conflict Resolution"
description: "Mendesain sinkronisasi dua arah antara database lokal dan server: push outbox, pull berbasis cursor, tombstone, versi, dan strategi resolusi konflik (server-wins, LWW per field, merge, ledger)."
level: advanced
status: complete
version: "Konsep lintas stack · contoh Flutter (Drift) + PostgreSQL"
updated: 2026-11-12
tags: [flutter, sync, offline-first, conflict-resolution, distributed-data]
---

## Overview

**Sinkronisasi data** menjaga agar salinan data di banyak perangkat dan server **akhirnya sama** (eventual consistency).
**Konflik** terjadi ketika data yang sama diubah di dua tempat sebelum perubahan saling diketahui — misalnya dua kasir
offline mengubah stok produk yang sama, atau admin mengubah harga saat kasir mengedit produk.

Halaman ini melengkapi [Offline-First Application](/flutter/offline-first/) dengan fokus pada **protokol sync** dan
**strategi konflik**.

## Why It Matters

Strategi konflik yang salah menyebabkan data hilang secara diam-diam — penjualan yang "tertimpa", stok tidak akurat,
catatan pelanggan kembali ke versi lama. Ini bukan masalah teknis semata: setiap entitas perlu **keputusan bisnis**
tentang siapa yang benar ketika terjadi konflik.

## Core Concepts

| Konsep | Arti |
| --- | --- |
| Push | Mengirim perubahan lokal (outbox) ke server |
| Pull | Mengambil perubahan server sejak titik terakhir (cursor) |
| Cursor / change token | Penanda posisi sync terakhir per tabel (mis. `server_seq` monoton) |
| Version / revision | Nomor versi baris yang naik setiap update (optimistic concurrency) |
| Tombstone | Penanda penghapusan (`deleted_at`) agar delete ikut tersinkron |
| Idempotency | Push ulang tidak menggandakan data |
| Server-wins / client-wins | Satu pihak selalu menang |
| LWW (last-write-wins) | Perubahan dengan waktu/versi terakhir menang |
| Field-level merge | Konflik diselesaikan per kolom, bukan per baris |
| Ledger / operation-based | Mengirim operasi (`-2 stok`), bukan nilai akhir — bebas konflik untuk penjumlahan |
| CRDT | Struktur data yang selalu bisa digabung tanpa konflik (lanjutan) |

## How It Works

### Protokol push–pull

```text
PUSH  client → POST /v1/sync/push { changes: [ {entity, id, op, base_version, data, idempotency_key} ... ] }
      server → per change: applied | duplicate | conflict { server_version, server_data } | rejected { reason }
PULL  client → GET /v1/sync/pull?entity=products&cursor=<seq>&limit=500
      server → { changes: [ {id, version, data | deleted:true} ... ], next_cursor, has_more }
```

- **Server** memberi setiap perubahan nomor urut monoton (`server_seq`, sequence/bigint) — cursor pull memakai ini, bukan jam device.
- **Client** mengirim `base_version` (versi yang ia lihat sebelum mengubah). Jika versi server berbeda → konflik terdeteksi.

### Matriks strategi per entitas

| Entitas | Siapa mengubah | Strategi | Alasan |
| --- | --- | --- | --- |
| Produk, harga, kategori (master) | Admin pusat | **Server-wins** | Satu sumber kebenaran |
| Transaksi penjualan | Device (create-only) | **Tidak ada konflik** (immutable + UUID) | Fakta yang terjadi tidak diubah |
| Stok, saldo kas | Banyak device | **Ledger** (operasi delta) | Penjumlahan komutatif |
| Catatan/profil pelanggan | Banyak user | **LWW per field** atau tampilkan konflik | Perubahan field berbeda bisa digabung |
| Status work order | Teknisi & dispatcher | **State machine** di server | Transisi tidak valid ditolak |

## Implementation

### Tabel server dengan versi & sequence (PostgreSQL)

```sql
CREATE SEQUENCE sync_seq;

CREATE TABLE customers (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  phone       text,
  note        text,
  version     integer NOT NULL DEFAULT 1,
  server_seq  bigint NOT NULL DEFAULT nextval('sync_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                      -- tombstone
);
CREATE INDEX idx_customers_tenant_seq ON customers (tenant_id, server_seq);

-- Update optimistic: hanya berhasil jika versi yang dilihat client masih sama
UPDATE customers
SET name = $3, phone = $4, note = $5,
    version = version + 1, server_seq = nextval('sync_seq'), updated_at = now()
WHERE id = $1 AND tenant_id = $2 AND version = $6
RETURNING version;
-- 0 baris → konflik: kirim versi & data server ke client
```

### Pull dengan cursor & tombstone

```sql
SELECT id, version, server_seq, name, phone, note, deleted_at
FROM customers
WHERE tenant_id = $1 AND server_seq > $2
ORDER BY server_seq
LIMIT 500;
```

### Resolusi field-level (LWW per field) di client

```dart
/// base = versi yang dilihat client sebelum edit; local = hasil edit; remote = versi server terbaru.
Map<String, Object?> mergeFields(Map<String, Object?> base, Map<String, Object?> local, Map<String, Object?> remote) {
  final merged = <String, Object?>{...remote};
  final conflicts = <String>[];
  for (final key in local.keys) {
    final localChanged = local[key] != base[key];
    final remoteChanged = remote[key] != base[key];
    if (localChanged && !remoteChanged) merged[key] = local[key];          // hanya lokal berubah → ambil lokal
    if (localChanged && remoteChanged && local[key] != remote[key]) conflicts.add(key); // keduanya berubah beda
  }
  if (conflicts.isNotEmpty) throw FieldConflict(conflicts, merged);         // tampilkan ke user / aturan bisnis
  return merged;
}
```

Ini adalah *three-way merge*: perubahan di field berbeda digabung otomatis; hanya field yang diubah kedua pihak dengan
nilai berbeda yang menjadi konflik nyata.

### Stok sebagai ledger (bebas konflik)

```dart
// Client tidak pernah mengirim "stock = 7"; ia mengirim operasi
await db.into(db.stockMovements).insert(StockMovementsCompanion.insert(
  id: uuid.v7(), productId: 'p1', delta: -2, reason: 'SALE', refId: orderId, createdAt: DateTime.now().toUtc(),
));
```

```sql
-- Server: idempotent insert; saldo = SUM(delta)
INSERT INTO stock_movements (id, outlet_id, product_id, delta, reason, ref_id, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING;
```

### Sync loop di client

```dart
Future<void> syncEntity(String entity) async {
  await pushOutbox(entity);                     // 1) kirim perubahan lokal dulu (idempotent)
  var cursor = await db.cursorFor(entity);
  while (true) {                                 // 2) tarik sampai habis, per halaman
    final page = await api.pull(entity, cursor: cursor, limit: 500);
    await db.transaction(() async {
      for (final c in page.changes) {
        if (await db.hasPendingLocalChange(entity, c.id)) {
          await conflictResolver.resolve(entity, c);       // jangan timpa perubahan lokal yang belum terkirim
        } else if (c.deleted) {
          await db.deleteById(entity, c.id);
        } else {
          await db.upsert(entity, c);
        }
      }
      await db.saveCursor(entity, page.nextCursor);       // cursor disimpan dalam transaksi yang sama
    });
    cursor = page.nextCursor;
    if (!page.hasMore) break;
  }
}
```

## Best Practices

- **Tentukan strategi konflik per entitas** bersama product owner dan dokumentasikan (ADR).
- **Cursor dari server (sequence monoton)**, bukan `updated_at` dari jam device — jam bisa salah/berubah.
- **Simpan cursor dalam transaksi yang sama** dengan data hasil pull — tidak ada data terlewat/ganda saat crash.
- **Push sebelum pull**, dan jangan menimpa baris yang masih punya perubahan lokal pending.
- **Tombstone untuk delete**, dibersihkan setelah periode retensi.
- **Transaksi = immutable**; koreksi dilakukan dengan transaksi pembalik (void/refund), bukan update.
- **Ledger untuk kuantitas** (stok, poin, saldo).
- **Pull ter-scope** (tenant/outlet/user) dan dipaginasi.
- **Observability**: lag sync per device, jumlah konflik, outbox pending.

## Anti-Patterns

- LWW berbasis `DateTime.now()` device untuk semua entitas.
- Sinkronisasi "angka akhir" stok/saldo dari banyak device.
- Pull seluruh tabel setiap kali (tanpa cursor).
- Hard delete tanpa tombstone → data yang dihapus "hidup lagi" dari device lain.
- Menyelesaikan konflik diam-diam tanpa jejak (audit) untuk data penting.
- Cursor disimpan sebelum data berhasil ditulis.

## Performance Considerations

- Index `(tenant_id, server_seq)` untuk pull; batch 200–1000 baris per halaman.
- Kompresi payload dan field minimal; delta, bukan full object, bila memungkinkan.
- Throttle sync (debounce setelah perubahan, interval minimum) untuk menghemat baterai & kuota.
- Proses pull besar di background isolate; tulis per batch dalam transaksi.

## Security Considerations

- Server memvalidasi setiap perubahan push seperti request API biasa: autentikasi, otorisasi objek (tenant), validasi data, aturan bisnis.
- Jangan percaya `version`/`server_seq`/harga dari client.
- Pull hanya data yang berhak dilihat device/user tersebut.
- Audit log untuk resolusi konflik pada data finansial.

## Real-World Use Cases

- **POS multi-kasir**: transaksi immutable, stok ledger, master produk server-wins.
- **CRM lapangan**: field-level merge untuk data pelanggan, konflik nyata ditampilkan ke sales.
- **Work order teknisi**: status mengikuti state machine server (mis. `ASSIGNED → ON_SITE → DONE`); transisi yang tidak valid ditolak dan client menarik status terbaru.

## Interview Questions

1. Apa itu eventual consistency dalam konteks aplikasi offline?
2. Mengapa cursor sync sebaiknya berasal dari server, bukan timestamp device?
3. Jelaskan strategi resolusi konflik yang Anda ketahui dan kapan memakainya.
4. Bagaimana menangani delete pada sinkronisasi?
5. Bagaimana mencegah stok tidak akurat saat banyak device offline?

## Sample Answers

1. Semua salinan data tidak selalu sama setiap saat, tetapi akan konvergen ke kondisi yang sama setelah perubahan tersinkron dan konflik diselesaikan.
2. Jam device bisa tidak akurat, diubah user, atau berbeda zona; dua perubahan bisa punya timestamp sama. Sequence monoton dari server memberi urutan total yang andal sehingga tidak ada perubahan terlewat.
3. Server-wins untuk master data; client-wins jarang; LWW berbasis versi untuk data sederhana; field-level three-way merge untuk dokumen yang diedit banyak pihak; ledger/operasi untuk kuantitas; state machine untuk alur status; konflik nyata ditampilkan ke user bila data penting.
4. Soft delete dengan tombstone (`deleted_at`) yang ikut tersinkron melalui pull, lalu dibersihkan setelah semua device dipastikan menerima (periode retensi).
5. Kirim pergerakan stok (delta) dengan ID unik ke server secara idempotent; saldo dihitung dari ledger, dan stok minus akibat offline dilaporkan untuk opname.

## Practical Exercises

1. Implementasikan endpoint push/pull untuk tabel `customers` dengan versi, sequence, dan tombstone.
2. Implementasikan `mergeFields` dan uji kasus: field berbeda (auto-merge), field sama nilai sama, field sama nilai beda (konflik).
3. Simulasikan dua device offline menjual produk yang sama; buktikan ledger menghasilkan stok benar.

## Quick Reference

```text
Push (outbox, idempotent) → Pull (cursor server_seq, paginasi, tombstone) · cursor disimpan dalam transaksi
Konflik: master → server-wins · transaksi → immutable · kuantitas → ledger · dokumen → 3-way merge per field · status → state machine
Jangan timpa baris yang punya perubahan lokal pending · validasi & otorisasi di server untuk setiap perubahan
```

## Related Topics

- [Offline-First Application](/flutter/offline-first/)
- [Local Database](/flutter/local-database/)
- [Background Processing](/flutter/background-processing/)
- [Offline-First & Synchronization Strategy](/system-design/concepts/offline-first-architecture/)
- [Locking & Concurrency](/database/locking-concurrency/)
