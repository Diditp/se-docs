---
title: "Inventory Management"
description: "Studi kasus sistem manajemen inventori multi-gudang/outlet dengan aplikasi mobile untuk staf gudang: requirement, stok sebagai ledger mutasi, satuan & konversi, penerimaan barang, transfer antar lokasi, stock opname dengan scan barcode offline, reservasi, batch & kedaluwarsa (FEFO), valuasi, laporan, konsistensi dan failure mode."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, case-study, inventory, ledger, barcode, offline-first]
---

## Overview

Sistem inventori mencatat **berapa banyak barang, di mana, dan bagaimana bergerak**: penerimaan dari supplier, penjualan,
transfer antar gudang/outlet, retur, rusak, dan penyesuaian hasil stock opname. Staf gudang memakai aplikasi mobile
(Flutter, sering di perangkat Android dengan scanner) yang harus bekerja di area dengan sinyal buruk.

## Why It Matters

Selisih stok berarti kehilangan uang, penjualan gagal, atau overselling. Desain inventori menguji pemahaman konsistensi
data, konkurensi, audit, dan offline-first. Topik ini dekat dengan aplikasi bisnis yang banyak dikerjakan mobile
developer di Indonesia (retail, F&B, distribusi).

## Core Concepts

| Fungsional | Non-fungsional |
| --- | --- |
| Master produk, SKU, barcode, satuan | Stok akurat & dapat diaudit (siapa, kapan, mengapa) |
| Stok per lokasi (gudang, outlet, rak) | Tidak boleh ada mutasi hilang/ganda saat sinkron |
| Penerimaan barang (PO → goods receipt) | Bekerja offline di gudang |
| Transfer antar lokasi (kirim/terima) | Laporan stok cepat walau mutasi jutaan baris |
| Stock opname dengan scan | Konkurensi: banyak kasir & staf mengubah stok bersamaan |
| Batch, tanggal kedaluwarsa, FEFO | Integrasi dengan POS & akuntansi |
| Laporan stok, mutasi, nilai persediaan | |

| Konsep | Penjelasan |
| --- | --- |
| Ledger mutasi | Setiap perubahan stok adalah baris mutasi append-only (+/−), stok = jumlah mutasi |
| On hand / reserved / available | Fisik / dipesan belum keluar / tersedia untuk dijual |
| Satuan dasar | Stok disimpan dalam satuan terkecil (pcs), konversi ke box/karton di UI |
| FEFO/FIFO | First Expired First Out / First In First Out |
| In-transit | Barang sudah keluar dari lokasi asal, belum diterima di tujuan |

## How It Works

```text
Aplikasi gudang (offline-first, scan barcode) ─┐
POS outlet (penjualan)                         ├─▶ API Inventory ─▶ PostgreSQL: stock_movements (ledger) + stock_levels (proyeksi)
Admin web (PO, master data)                    ─┘          │
                                                           └─ outbox → event stock.changed → laporan, akuntansi, notifikasi stok minimum
```

### Data model

```text
products(id, sku, name, base_unit)              unit_conversions(product_id, unit, factor)   -- 1 box = 24 pcs
barcodes(code, product_id, unit)                locations(id, type: warehouse|outlet|bin, parent_id)
batches(id, product_id, batch_no, expires_at)
stock_movements(id, client_op_id UNIQUE, product_id, location_id, batch_id, qty_base (+/−),
                type: receipt|sale|transfer_out|transfer_in|adjustment|return|damage,
                ref_type, ref_id, reason, created_by, device_id, occurred_at, recorded_at)
stock_levels(product_id, location_id, batch_id, on_hand, reserved, updated_at)   -- proyeksi, diperbarui di transaksi yang sama
transfers(id, from_location, to_location, status: draft|shipped|received|partially_received)
stock_counts(id, location_id, status, started_at) · stock_count_lines(count_id, product_id, batch_id, counted_qty)
```

## Implementation

### 1. Mencatat mutasi (atomik & idempoten)

```sql
BEGIN;
INSERT INTO stock_movements (id, client_op_id, product_id, location_id, batch_id, qty_base, type, ref_type, ref_id, created_by, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, 'sale', 'order', $7, $8, $9)
ON CONFLICT (client_op_id) DO NOTHING;             -- retry dari perangkat tidak menggandakan

-- hanya bila baris di atas benar-benar ditambahkan:
INSERT INTO stock_levels (product_id, location_id, batch_id, on_hand, reserved)
VALUES ($3, $4, $5, $6, 0)
ON CONFLICT (product_id, location_id, batch_id) DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand, updated_at = now();
COMMIT;
```

Ledger adalah sumber kebenaran. `stock_levels` adalah proyeksi cepat untuk dibaca dan dapat dibangun ulang dari ledger
bila terjadi keraguan.

### 2. Stok negatif?

```text
Penjualan offline di beberapa outlet bisa membuat stok sistem negatif. Pilihan kebijakan:
- Izinkan negatif + alert (penjualan yang sudah terjadi tidak dibatalkan) → umum untuk retail/F&B
- Tolak saat online bila available < qty (gudang, B2B)
Keputusan bisnis, ditulis eksplisit
```

### 3. Transfer antar lokasi

```text
Kirim: mutasi transfer_out di lokasi asal (status SHIPPED, barang in-transit)
Terima: staf scan barang di tujuan → transfer_in sesuai jumlah diterima → selisih dicatat (hilang/rusak) dengan alasan
Status partially_received bila tidak lengkap. Laporan in-transit = shipped − received
```

### 4. Stock opname dengan scan (offline)

```text
1. Mulai sesi opname per lokasi → aplikasi mengunduh daftar produk & barcode (snapshot)
2. Staf scan & input jumlah secara offline → disimpan lokal (Drift) per baris + device_id
3. Submit → server menghitung selisih: counted − (stok sistem saat cut-off ± mutasi selama opname)
4. Supervisor review → disetujui → mutasi adjustment dibuat dengan alasan "opname"
Mutasi yang terjadi selama opname dicatat terpisah agar selisih tidak salah
```

```dart
// Scan barcode → produk & satuan → simpan lokal dengan id operasi dari klien
Future<void> onScanned(String code) async {
  final match = await localDb.findBarcode(code);                 // tabel barcode lokal hasil sinkron
  if (match == null) return showUnknownBarcode(code);
  await localDb.incrementCountLine(sessionId, match.productId, qtyBase: match.unitFactor, opId: uuidV7());
  HapticFeedback.selectionClick();
}
```

### 5. Batch & FEFO

```text
Saat mengambil barang (picking/penjualan): pilih batch dengan expires_at terdekat yang masih layak
Laporan barang mendekati kedaluwarsa (mis. 30 hari) → notifikasi ke manajer outlet
```

### 6. Laporan & valuasi

```text
Stok saat ini → stock_levels (cepat)
Stok per tanggal / kartu stok → ledger dengan index (product_id, location_id, occurred_at) atau snapshot harian
Nilai persediaan (rata-rata tertimbang/FIFO) → dihitung di read model/job, bukan di setiap request
Integrasi akuntansi → event dari outbox, idempoten
```

## Best Practices

- **Ledger append-only + proyeksi** yang diperbarui dalam transaksi yang sama.
- **ID operasi dari klien** untuk sinkron idempoten.
- **Satuan dasar** untuk penyimpanan, konversi di batas.
- **Alasan & pelaku** di setiap mutasi (audit).
- **Proses opname dengan cut-off** dan persetujuan.
- **Kebijakan stok negatif tertulis**.

## Anti-Patterns

- Menyimpan stok hanya sebagai satu angka yang di-UPDATE tanpa riwayat.
- Sinkron stok dengan mengirim "stok = 50" dari perangkat (last-write-wins).
- Menyimpan stok dalam box di satu tempat dan pcs di tempat lain.
- Menghapus mutasi yang salah (gunakan mutasi koreksi).
- Menghitung laporan nilai persediaan dari jutaan mutasi pada setiap request.

## Performance Considerations

Ledger tumbuh cepat: partisi berdasarkan waktu, index `(product_id, location_id, occurred_at)`, dan snapshot stok
harian untuk laporan historis. Proyeksi `stock_levels` membuat baca stok O(1). Sinkron katalog barcode ke perangkat
secara delta.

## Security Considerations

Otorisasi per lokasi (staf hanya mengubah stok gudangnya), persetujuan untuk adjustment besar, audit log yang tidak dapat
diubah, dan deteksi pola mencurigakan (penyesuaian negatif berulang oleh orang yang sama) untuk mencegah kecurangan.

## Real-World Use Cases

- Jaringan F&B: bahan baku dipotong otomatis dari resep saat penjualan POS, opname mingguan dengan aplikasi scan.
- Distributor: gudang pusat → transfer ke cabang dengan status in-transit dan penerimaan parsial.

## Interview Questions

1. Mengapa stok sebaiknya dimodelkan sebagai ledger mutasi?
2. Bagaimana menyinkronkan perubahan stok dari banyak perangkat offline?
3. Bagaimana mendesain stock opname yang akurat saat toko tetap berjualan?
4. Bagaimana menangani satuan berbeda (pcs, box, karton)?

## Sample Answers

1. Ledger memberi audit lengkap (siapa, kapan, mengapa), memungkinkan stok per tanggal, aman untuk konkurensi karena hanya menambah baris, dan proyeksi stok dapat dibangun ulang bila terjadi kesalahan.
2. Perangkat mengirim mutasi (+/−) dengan ID operasi unik, bukan nilai stok akhir. Server menyimpan secara idempoten, memperbarui proyeksi secara atomik, dan menerapkan kebijakan stok negatif yang disepakati.
3. Tetapkan cut-off saat sesi dimulai, catat mutasi yang terjadi selama opname, hitung selisih terhadap stok sistem pada cut-off ditambah mutasi tersebut, lalu terapkan adjustment setelah persetujuan supervisor.
4. Simpan semua stok dalam satuan dasar terkecil, simpan faktor konversi per produk dan barcode per satuan, dan konversi hanya saat input/tampilan.

## Practical Exercises

1. Implementasikan tabel ledger + proyeksi dan uji 100 mutasi bersamaan.
2. Rancang alur transfer dengan penerimaan parsial.
3. Buat aplikasi scan opname offline dengan Drift dan sinkron idempoten.

## Quick Reference

```text
Ledger stock_movements (append-only, client_op_id unik) + stock_levels (proyeksi, transaksi sama)
on_hand · reserved · available · in-transit · satuan dasar + konversi + barcode per satuan
Transfer: out → in-transit → in (parsial + selisih beralasan) · opname: cut-off → scan offline → selisih → approval → adjustment
Batch + FEFO · laporan via snapshot/read model · audit & otorisasi per lokasi
```

## Related Topics

- [POS / ERP Application](/system-design/case-studies/pos-erp/)
- [Offline-First & Synchronization Strategy](/system-design/concepts/offline-first-architecture/)
- [Secure Coding Practices](/security/secure-coding/)
