---
title: "Normalization & Denormalization"
description: "Normalisasi database: anomali insert/update/delete, functional dependency, 1NF, 2NF, 3NF, BCNF dengan contoh bertahap, kapan dan bagaimana melakukan denormalisasi (snapshot harga, kolom turunan, read model, materialized view) beserta cara menjaga konsistensinya."
level: intermediate
status: complete
updated: 2026-11-12
tags: [database, normalization, denormalization, 3nf, schema]
---

## Overview

**Normalisasi** adalah proses menyusun tabel untuk **menghilangkan redundansi** dan **anomali** dengan memecah data
berdasarkan ketergantungan (functional dependency). **Denormalisasi** adalah menambahkan redundansi secara sengaja untuk
performa baca atau kebutuhan historis — dengan konsekuensi menjaga konsistensinya.

## Why It Matters

Skema yang tidak ternormalisasi menyebabkan data saling bertentangan (nama produk berbeda di dua baris), sulit diubah,
dan bug laporan. Sebaliknya, normalisasi berlebihan pada beban baca tinggi bisa memperlambat query. Engineer perlu tahu
kapan memilih yang mana.

## Core Concepts

### Anomali

| Anomali | Contoh pada tabel datar `sales(order_id, date, customer_name, customer_phone, product_name, price, qty)` |
| --- | --- |
| Update | Ganti nomor HP pelanggan harus mengubah banyak baris; terlewat satu → data bertentangan |
| Insert | Tidak bisa menyimpan produk baru sebelum ada penjualan |
| Delete | Menghapus satu-satunya penjualan produk ikut menghapus informasi produk |

### Functional dependency

`A → B` berarti nilai A menentukan nilai B (mis. `product_id → product_name`).

### Bentuk normal

| Bentuk | Syarat | Pelanggaran tipikal |
| --- | --- | --- |
| 1NF | Nilai atomik, tidak ada grup berulang, ada kunci | Kolom `phones = '0812,0813'`, kolom `item1, item2, item3` |
| 2NF | 1NF + tidak ada atribut non-kunci yang bergantung pada **sebagian** kunci komposit | `order_items(order_id, product_id, product_name)` — nama hanya bergantung pada product_id |
| 3NF | 2NF + tidak ada ketergantungan **transitif** (non-kunci → non-kunci) | `orders(id, customer_id, customer_phone)` — phone bergantung pada customer_id |
| BCNF | Setiap determinan adalah candidate key | Kasus khusus dengan beberapa candidate key yang tumpang tindih |

Ringkasan klasik: setiap atribut non-kunci bergantung pada **kunci, seluruh kunci, dan hanya kunci**.

## How It Works

```text
Tabel datar (UNF)
  → 1NF: pecah item berulang menjadi baris; nilai atomik
  → 2NF: pindahkan atribut yang bergantung sebagian kunci (product_name → products)
  → 3NF: pindahkan ketergantungan transitif (customer_phone → customers)
Hasil: customers, products, orders, order_items
```

## Implementation

### Sebelum (tidak ternormalisasi)

| order_id | date | customer | phone | items |
| --- | --- | --- | --- | --- |
| 10 | 2026-11-12 | Rina | 0812… | Kopi Susu x2 @18000; Roti x1 @12000 |

### Sesudah (3NF)

```sql
CREATE TABLE customers (id uuid PRIMARY KEY, name text NOT NULL, phone text UNIQUE);
CREATE TABLE products  (id uuid PRIMARY KEY, name text NOT NULL, price numeric(12,2) NOT NULL);
CREATE TABLE orders    (id uuid PRIMARY KEY, customer_id uuid REFERENCES customers(id), created_at timestamptz NOT NULL);
CREATE TABLE order_items (
  order_id uuid REFERENCES orders(id), product_id uuid REFERENCES products(id),
  qty int NOT NULL, unit_price numeric(12,2) NOT NULL,      -- lihat catatan di bawah
  PRIMARY KEY (order_id, product_id)
);
```

**Catatan penting — `unit_price` bukan pelanggaran 3NF.** Harga di `order_items` adalah *fakta historis* "harga saat
transaksi terjadi", berbeda dengan `products.price` (harga saat ini). Menyimpannya justru benar secara bisnis.

### Denormalisasi yang disengaja

```sql
-- 1. Kolom turunan untuk performa: total order disimpan, dijaga oleh aplikasi dalam transaksi yang sama
ALTER TABLE orders ADD COLUMN total numeric(14,2) NOT NULL DEFAULT 0;

-- 2. Materialized view untuk laporan
CREATE MATERIALIZED VIEW daily_sales AS
SELECT o.created_at::date AS day, SUM(oi.qty * oi.unit_price) AS revenue
FROM orders o JOIN order_items oi ON oi.order_id = o.id
GROUP BY 1;
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales;     -- butuh UNIQUE index pada view

-- 3. Snapshot nama produk di struk (agar struk lama tetap sama walau produk diganti nama)
ALTER TABLE order_items ADD COLUMN product_name text NOT NULL DEFAULT '';
```

| Teknik denormalisasi | Kapan | Cara menjaga konsistensi |
| --- | --- | --- |
| Snapshot historis | Data harus mencerminkan masa lalu | Ditulis sekali saat transaksi, tidak diubah |
| Kolom agregat (total, count) | Dibaca sangat sering | Update di transaksi yang sama / trigger, rekonsiliasi berkala |
| Materialized view | Laporan berat | Refresh terjadwal, terima data sedikit tertinggal |
| Read model / tabel terpisah | Dashboard, pencarian | Diperbarui oleh event/CDC |
| Database lokal mobile | Tampilan cepat & offline | Sinkronisasi dari server sebagai sumber kebenaran |

## Best Practices

- **Normalisasi hingga 3NF sebagai default** untuk database transaksional.
- **Denormalisasi berdasarkan bukti** (query lambat, kebutuhan historis), bukan dugaan.
- **Dokumentasikan setiap denormalisasi** dan siapa yang menjaga konsistensinya.
- **Bedakan fakta historis** (harga saat transaksi) dari data master (harga saat ini).

## Anti-Patterns

- Menyimpan list dalam satu kolom (`'1,2,3'`) — melanggar 1NF, sulit di-query dan di-index.
- Mengambil harga dari tabel produk untuk menghitung ulang transaksi lama.
- Normalisasi ekstrem sehingga satu layar butuh 12 JOIN tanpa alasan.
- Kolom turunan yang diperbarui di banyak tempat tanpa transaksi.

## Performance Considerations

Normalisasi mempercepat tulis dan menjaga ukuran data kecil; JOIN dengan index yang tepat umumnya cepat. Denormalisasi
mempercepat baca tetapi memperlambat tulis dan menambah risiko inkonsistensi. Untuk analitik besar, pisahkan ke
data warehouse dengan skema denormalisasi (star schema).

## Security Considerations

Normalisasi menempatkan data pribadi di satu tempat (mis. `customers`), sehingga lebih mudah dienkripsi, dimasking, atau
dihapus atas permintaan. Denormalisasi yang menyalin data pribadi ke banyak tabel memperluas risiko dan menyulitkan
penghapusan.

## Real-World Use Cases

- Skema POS ternormalisasi dengan snapshot harga & nama di order_items.
- Materialized view laporan penjualan harian.
- Database lokal perangkat kasir yang menyimpan salinan katalog.

## Interview Questions

1. Apa itu normalisasi dan mengapa penting?
2. Jelaskan 1NF, 2NF, dan 3NF dengan contoh.
3. Apa itu anomali update/insert/delete?
4. Kapan melakukan denormalisasi?
5. Apakah menyimpan harga di order_items melanggar normalisasi?

## Sample Answers

1. Proses menyusun tabel berdasarkan ketergantungan untuk menghilangkan redundansi dan anomali sehingga data konsisten dan mudah diubah.
2. 1NF: nilai atomik tanpa grup berulang. 2NF: tidak ada atribut yang bergantung pada sebagian kunci komposit (nama produk dipindah dari order_items ke products). 3NF: tidak ada ketergantungan transitif (telepon pelanggan dipindah dari orders ke customers).
3. Update: perubahan harus dilakukan di banyak baris dan bisa terlewat. Insert: tidak bisa menyimpan data tanpa data lain yang tidak terkait. Delete: menghapus satu fakta ikut menghapus fakta lain.
4. Ketika ada bukti kebutuhan performa baca (laporan, dashboard) atau kebutuhan historis (snapshot), dengan mekanisme menjaga konsistensi yang jelas.
5. Tidak — itu fakta berbeda (harga saat transaksi), bukan salinan harga saat ini; justru wajib disimpan agar transaksi lama tidak berubah ketika harga produk diubah.

## Practical Exercises

1. Normalisasi tabel datar data tiket gangguan (pelanggan, alamat, teknisi, status) hingga 3NF.
2. Buat materialized view laporan per kategori dan jadwalkan refresh.
3. Identifikasi denormalisasi di proyek Anda dan bagaimana konsistensinya dijaga.

## Quick Reference

```text
Anomali: update · insert · delete · FD: A → B
1NF atomik · 2NF tidak bergantung sebagian kunci · 3NF tidak transitif · BCNF determinan = candidate key
"Kunci, seluruh kunci, hanya kunci" · default 3NF untuk OLTP
Denormalisasi sadar: snapshot historis · kolom agregat · materialized view · read model
```

## Related Topics

- [ERD & Relationship Mapping](/database/erd-relationship-mapping/)
- [Database Schema Design](/database/schema-design/)
- [Query Optimization](/database/query-optimization/)
