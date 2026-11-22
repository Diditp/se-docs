---
title: "Design an Inventory Management System"
description: "Latihan system design interview: sistem inventory multi-gudang/outlet — requirement, model data berbasis stock movement (ledger), reservasi stok, transfer antar lokasi, concurrency control, laporan, integrasi, dan trade-off."
level: advanced
status: complete
updated: 2026-11-12
tags: [interview, system-design, inventory, ledger, concurrency, postgresql]
---

## Overview

Soal: **"Rancang sistem inventory untuk perusahaan dengan beberapa gudang dan puluhan outlet."** Inti soal ini adalah
**akurasi stok**: bagaimana mencatat pergerakan barang, mencegah overselling saat banyak permintaan bersamaan, dan
menghasilkan laporan yang dapat diaudit.

## Why It Matters

Inventory adalah domain klasik aplikasi enterprise (ERP, POS, e-commerce). Interviewer menguji pemodelan data,
transaksi database, concurrency, dan pemahaman proses bisnis.

## Core Concepts

### Requirement

| Fungsional | Non-fungsional |
| --- | --- |
| Penerimaan barang (purchase receipt) | Stok akurat & dapat diaudit |
| Penjualan / pengeluaran barang | Tidak ada overselling pada order online |
| Transfer antar gudang/outlet | Laporan stok cepat |
| Stock opname & penyesuaian | Integrasi dengan POS & e-commerce |
| Reservasi stok untuk order | Riwayat tidak bisa diubah (append-only) |
| Laporan stok, mutasi, nilai persediaan | |

### Prinsip desain: stok sebagai ledger

Seperti buku besar akuntansi: **setiap perubahan stok adalah baris `stock_movements` yang tidak diubah**.
Saldo (`stock_levels`) adalah turunan yang bisa dihitung ulang.

## How It Works

```text
POS / e-commerce / admin web
        │
Inventory API (Node.js)
  ├─ ReceiveGoods / Sell / Transfer / Adjust / Reserve
  ├─ satu transaksi DB: insert movement + update stock_levels (dengan lock/kondisi)
  └─ publish event "StockChanged" → queue
        │
PostgreSQL: products, locations, stock_movements (append-only), stock_levels, reservations
        │
Worker: notifikasi stok minimum, sinkron ke channel penjualan, materialized view laporan
```

## Implementation

### Data model

```sql
CREATE TABLE locations (id bigint PRIMARY KEY, code text UNIQUE NOT NULL, type text NOT NULL); -- warehouse|outlet

CREATE TABLE stock_movements (
  id bigserial PRIMARY KEY,
  product_id bigint NOT NULL,
  location_id bigint NOT NULL REFERENCES locations(id),
  qty int NOT NULL,                  -- + masuk, − keluar
  type text NOT NULL,                -- RECEIPT | SALE | TRANSFER_OUT | TRANSFER_IN | ADJUSTMENT | RETURN
  ref_type text, ref_id text,        -- dokumen sumber (PO, order, transfer)
  idempotency_key text UNIQUE,
  created_by bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_levels (
  product_id bigint, location_id bigint,
  on_hand int NOT NULL DEFAULT 0,
  reserved int NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, location_id),
  CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)
);
```

`available = on_hand − reserved`.

### Mengurangi stok tanpa overselling (atomic conditional update)

```sql
BEGIN;
UPDATE stock_levels
SET reserved = reserved + $qty
WHERE product_id = $p AND location_id = $l
  AND on_hand - reserved >= $qty;        -- gagal (0 baris) bila stok tidak cukup
-- cek row count: 0 → ROLLBACK & kembalikan "stok tidak cukup"
INSERT INTO reservations (order_id, product_id, location_id, qty, expires_at) VALUES (...);
COMMIT;
```

Alternatif: `SELECT ... FOR UPDATE` lalu cek di aplikasi. Conditional update lebih sederhana dan meminimalkan waktu
lock. Untuk produk sangat populer (flash sale), pertimbangkan antrian per produk atau counter di Redis dengan
rekonsiliasi.

### Transfer antar lokasi

```text
Transfer dibuat (DRAFT) → dikirim: movement TRANSFER_OUT (−) di gudang asal, status IN_TRANSIT
→ diterima: movement TRANSFER_IN (+) di outlet tujuan (qty diterima bisa berbeda → selisih dicatat ADJUSTMENT)
```

### Reservasi kedaluwarsa

Order online yang tidak dibayar dalam N menit → worker melepas reservasi (`reserved -= qty`) secara idempoten.

### Laporan

- Saldo saat ini: `stock_levels` (cepat).
- Kartu stok/mutasi: query `stock_movements` per produk & rentang tanggal (index `(product_id, location_id, created_at)`).
- Nilai persediaan (FIFO/average cost): dihitung oleh job terpisah dan disimpan sebagai snapshot.

## Best Practices

- **Append-only ledger** + saldo turunan; koreksi selalu lewat movement baru (ADJUSTMENT), bukan edit.
- **Satu transaksi DB** untuk movement + saldo.
- **Constraint di database** (`CHECK`, `UNIQUE idempotency_key`) sebagai jaring pengaman terakhir.
- **Dokumen sumber** untuk setiap movement (PO, order, transfer, opname).
- **Rekonsiliasi berkala**: jumlahkan movement vs `stock_levels`.

## Anti-Patterns

- Menyimpan stok hanya sebagai satu kolom angka yang di-update tanpa riwayat.
- Read-modify-write di aplikasi tanpa lock (`stok = stok − 1` dari nilai yang dibaca sebelumnya) → race condition.
- Menghapus/mengubah movement lama untuk "membetulkan" stok.
- Stok di klien (POS) dianggap kebenaran mutlak.

## Performance Considerations

- Hot row pada produk populer → kurangi durasi transaksi, pertimbangkan sharding stok per lokasi atau bucket.
- Partisi `stock_movements` per bulan untuk tabel sangat besar.
- Materialized view/snapshot harian untuk laporan berat.
- Index komposit sesuai filter laporan.

## Security Considerations

- Role-based access: penyesuaian stok & opname hanya untuk peran tertentu, dengan approval untuk selisih besar.
- Audit trail lengkap (siapa, kapan, dokumen apa).
- Validasi semua input dari POS/integrasi; API key per channel dengan rate limit.

## Real-World Use Cases

- ERP distribusi & ritel multi-gudang.
- Stok gabungan untuk POS dan marketplace (omnichannel).
- Inventory perangkat/material untuk tim teknisi lapangan.

## Interview Questions

1. Bagaimana mencegah overselling saat banyak order bersamaan?
2. Kenapa memakai ledger (stock movements) dan bukan satu kolom stok?
3. Bagaimana memodelkan transfer antar gudang?
4. Bagaimana menangani stock opname yang menemukan selisih?
5. Bagaimana sinkronisasi stok dengan marketplace eksternal?

## Sample Answers

1. Reservasi/pengurangan dengan conditional update atomik (`WHERE available >= qty`) atau row lock dalam transaksi, ditambah CHECK constraint dan idempotency key untuk retry.
2. Ledger memberi audit trail, kemampuan menghitung ulang saldo, laporan mutasi, dan koreksi tanpa menghapus sejarah; saldo tetap disimpan untuk performa.
3. Dokumen transfer dengan status; movement keluar di asal saat dikirim dan movement masuk di tujuan saat diterima; selisih penerimaan dicatat sebagai adjustment.
4. Hasil opname dibandingkan dengan saldo sistem; selisih dicatat sebagai movement ADJUSTMENT dengan alasan dan approval; transaksi selama opname diatur (freeze atau cut-off time).
5. Event StockChanged → worker menghitung available per channel (bisa dengan buffer stok) → update via API marketplace dengan retry & rate limit; rekonsiliasi berkala karena integrasi eksternal bisa gagal.

## Practical Exercises

1. Tulis query kartu stok (saldo awal, masuk, keluar, saldo akhir) untuk satu produk per hari.
2. Rancang alur retur penjualan.
3. Desain ulang untuk flash sale 10.000 order per menit pada 1 produk.

## Quick Reference

```text
Ledger append-only (stock_movements) + saldo turunan (stock_levels: on_hand, reserved)
Anti-oversell: UPDATE ... WHERE on_hand - reserved >= qty · CHECK constraint · idempotency key
Transfer: OUT (asal) → IN_TRANSIT → IN (tujuan) · koreksi = ADJUSTMENT · rekonsiliasi berkala
```

## Related Topics

- [Transactions & ACID](/database/transactions-acid/)
- [Inventory Management (case study)](/system-design/case-studies/inventory-management/)
- [Design an Offline-First POS Application](/interview/system-design/offline-first-pos/)
- [SQL Challenges](/interview/coding-test/sql-challenges/)
