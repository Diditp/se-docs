---
title: "SQL Challenges"
description: "Kumpulan soal SQL coding test bertema POS/inventory: agregasi, JOIN, subquery, CTE, window function (ranking, running total), deteksi duplikat, gap, dan pivot — dengan solusi PostgreSQL."
level: intermediate
status: complete
updated: 2026-11-12
tags: [coding-test, sql, postgresql, window-function, cte, join]
---

## Overview

Banyak coding test untuk posisi backend/full-stack/mobile menyertakan **soal SQL**. Polanya berulang: agregasi dengan
`GROUP BY`/`HAVING`, `JOIN` (termasuk mencari data yang *tidak* punya pasangan), subquery/CTE, dan **window function**
untuk ranking serta running total. Contoh di sini memakai PostgreSQL dengan skema POS sederhana.

## Why It Matters

SQL menguji pemahaman relasi data, bukan hanya sintaks. Kesalahan umum: salah memilih jenis JOIN, lupa `NULL`,
menggandakan baris setelah JOIN, dan memakai `WHERE` untuk kondisi agregat.

## Core Concepts

Skema yang dipakai:

```sql
CREATE TABLE customers (id bigint PRIMARY KEY, name text NOT NULL, city text);
CREATE TABLE products  (id bigint PRIMARY KEY, name text NOT NULL, category text NOT NULL, price numeric(12,2) NOT NULL);
CREATE TABLE orders    (id bigint PRIMARY KEY, customer_id bigint REFERENCES customers(id),
                        status text NOT NULL, created_at timestamptz NOT NULL);
CREATE TABLE order_items (order_id bigint REFERENCES orders(id), product_id bigint REFERENCES products(id),
                          qty int NOT NULL CHECK (qty > 0), unit_price numeric(12,2) NOT NULL,
                          PRIMARY KEY (order_id, product_id));
```

**Urutan logis eksekusi**: `FROM/JOIN → WHERE → GROUP BY → HAVING → SELECT (window) → DISTINCT → ORDER BY → LIMIT`.
Inilah alasan alias `SELECT` tidak bisa dipakai di `WHERE`, dan filter agregat harus di `HAVING`.

| Window function | Kegunaan |
| --- | --- |
| `ROW_NUMBER()` | Nomor unik per partisi (ambil 1 teratas, dedup) |
| `RANK()` / `DENSE_RANK()` | Ranking dengan seri (lompat / tidak lompat) |
| `SUM() OVER (ORDER BY …)` | Running total |
| `LAG()` / `LEAD()` | Bandingkan dengan baris sebelumnya/berikutnya |

## How It Works

```text
GROUP BY  : banyak baris → satu baris per grup (detail hilang)
Window    : setiap baris tetap ada + nilai hasil perhitungan atas "jendela" barisnya
LEFT JOIN + WHERE kanan IS NULL : "anti-join" → data tanpa pasangan
```

## Implementation

### 1. Omzet per bulan (hanya order selesai)

```sql
SELECT date_trunc('month', o.created_at) AS month,
       SUM(oi.qty * oi.unit_price)       AS revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'completed'
GROUP BY 1
ORDER BY 1;
```

### 2. Pelanggan yang belum pernah order (anti-join)

```sql
SELECT c.id, c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;
-- Alternatif: WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)
-- Hindari NOT IN (subquery) bila subquery bisa berisi NULL — hasilnya bisa kosong.
```

### 3. Kategori dengan omzet > 10 juta (HAVING)

```sql
SELECT p.category, SUM(oi.qty * oi.unit_price) AS revenue
FROM order_items oi
JOIN products p ON p.id = oi.product_id
GROUP BY p.category
HAVING SUM(oi.qty * oi.unit_price) > 10000000
ORDER BY revenue DESC;
```

### 4. Top 3 produk terlaris per kategori (window + CTE)

```sql
WITH sales AS (
  SELECT p.category, p.name, SUM(oi.qty) AS units
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  GROUP BY p.category, p.name
), ranked AS (
  SELECT *, DENSE_RANK() OVER (PARTITION BY category ORDER BY units DESC) AS rnk
  FROM sales
)
SELECT category, name, units, rnk
FROM ranked
WHERE rnk <= 3
ORDER BY category, rnk;
```

### 5. Harga produk tertinggi ke-2 (tanpa LIMIT/OFFSET yang rapuh terhadap duplikat)

```sql
SELECT MAX(price) AS second_highest
FROM products
WHERE price < (SELECT MAX(price) FROM products);
-- atau: DENSE_RANK() OVER (ORDER BY price DESC) = 2
```

### 6. Running total omzet harian

```sql
WITH daily AS (
  SELECT o.created_at::date AS day, SUM(oi.qty * oi.unit_price) AS revenue
  FROM orders o JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status = 'completed'
  GROUP BY 1
)
SELECT day, revenue,
       SUM(revenue) OVER (ORDER BY day) AS running_total,
       revenue - LAG(revenue) OVER (ORDER BY day) AS diff_vs_yesterday
FROM daily
ORDER BY day;
```

### 7. Order terakhir setiap pelanggan

```sql
SELECT DISTINCT ON (customer_id) customer_id, id AS order_id, created_at
FROM orders
ORDER BY customer_id, created_at DESC;            -- khusus PostgreSQL

-- Portabel:
SELECT customer_id, order_id, created_at FROM (
  SELECT customer_id, id AS order_id, created_at,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn
  FROM orders
) t WHERE rn = 1;
```

### 8. Deteksi & hapus duplikat (sisakan id terkecil)

```sql
-- Temukan
SELECT name, category, COUNT(*) FROM products GROUP BY name, category HAVING COUNT(*) > 1;

-- Hapus (jalankan dalam transaksi & cek dulu dengan SELECT!)
DELETE FROM products p
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY name, category ORDER BY id) AS rn FROM products
) d
WHERE p.id = d.id AND d.rn > 1;
```

### 9. Persentase kontribusi tiap kategori

```sql
SELECT p.category,
       SUM(oi.qty * oi.unit_price) AS revenue,
       ROUND(100.0 * SUM(oi.qty * oi.unit_price) / SUM(SUM(oi.qty * oi.unit_price)) OVER (), 2) AS pct
FROM order_items oi JOIN products p ON p.id = oi.product_id
GROUP BY p.category
ORDER BY revenue DESC;
```

### 10. Pivot status order per bulan (FILTER)

```sql
SELECT date_trunc('month', created_at) AS month,
       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
       COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       COUNT(*)                                     AS total
FROM orders
GROUP BY 1 ORDER BY 1;
-- Portabel: SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)
```

### 11. Hari tanpa transaksi (gap) dalam satu bulan

```sql
SELECT d::date AS day
FROM generate_series(date '2026-10-01', date '2026-10-31', interval '1 day') AS d
LEFT JOIN orders o ON o.created_at::date = d::date
WHERE o.id IS NULL;
```

## Best Practices

- **Klarifikasi definisi**: omzet termasuk order dibatalkan? zona waktu tanggal? seri dihitung bagaimana?
- **Bangun bertahap dengan CTE** — mudah dibaca dan diuji per langkah.
- **Hitung baris sebelum & sesudah JOIN** untuk mendeteksi duplikasi (fan-out).
- **Gunakan `NOT EXISTS`** untuk anti-join; hati-hati `NOT IN` dengan NULL.
- **`COUNT(*)` vs `COUNT(col)`**: yang kedua mengabaikan NULL.
- **Simpan harga transaksi di `order_items.unit_price`**, jangan menghitung dari harga produk saat ini.

## Anti-Patterns

- Filter agregat di `WHERE` (error) atau filter baris biasa di `HAVING` (lambat).
- `SELECT *` di soal/produksi; kolom non-agregat yang tidak ada di `GROUP BY`.
- Menjumlah setelah JOIN ke dua tabel one-to-many sekaligus → angka berlipat.
- `ORDER BY ... LIMIT 1 OFFSET 1` untuk "nilai tertinggi ke-2" saat ada duplikat nilai.
- Membungkus kolom ber-index dengan fungsi di `WHERE` (`created_at::date = ...`) pada tabel besar — gunakan rentang `>= ... AND < ...`.

## Performance Considerations

- Index pada kolom JOIN (`order_items.order_id`, `orders.customer_id`) dan filter (`orders(status, created_at)`).
- Filter rentang waktu: `created_at >= '2026-10-01' AND created_at < '2026-11-01'` agar index terpakai.
- Periksa rencana eksekusi dengan `EXPLAIN (ANALYZE, BUFFERS)`.
- Window function di atas data besar butuh sort — filter data sedini mungkin di CTE.

## Security Considerations

Di aplikasi, selalu gunakan **parameterized query**/query builder — jangan menyusun SQL dengan konkatenasi input user
(SQL injection). Batasi hak akses user database (least privilege) dan jangan jalankan `DELETE`/`UPDATE` massal tanpa
transaksi dan `WHERE` yang sudah diuji.

## Real-World Use Cases

- Laporan omzet harian/bulanan dan kontribusi kategori di dashboard POS.
- Ranking produk terlaris per outlet.
- Pembersihan data duplikat hasil sinkronisasi offline.
- Mendeteksi hari tanpa transaksi untuk audit outlet.

## Interview Questions

1. Apa beda `WHERE` dan `HAVING`?
2. Bagaimana menemukan pelanggan yang belum pernah order?
3. Apa beda `ROW_NUMBER`, `RANK`, dan `DENSE_RANK`?
4. Ambil nilai tertinggi ke-N.
5. Mengapa total penjualan bisa berlipat setelah JOIN?
6. Bagaimana mencari dan menghapus data duplikat dengan aman?

## Sample Answers

1. `WHERE` memfilter baris sebelum agregasi; `HAVING` memfilter grup setelah agregasi sehingga bisa memakai fungsi agregat.
2. `LEFT JOIN orders` lalu `WHERE orders.id IS NULL`, atau `NOT EXISTS` — keduanya anti-join; hindari `NOT IN` bila subquery bisa mengandung NULL.
3. Untuk nilai seri: `ROW_NUMBER` tetap memberi nomor unik (1,2,3), `RANK` memberi nomor sama lalu melompat (1,1,3), `DENSE_RANK` sama tanpa lompat (1,1,2).
4. `DENSE_RANK() OVER (ORDER BY value DESC)` lalu filter `= N` di subquery/CTE; untuk N=2 juga bisa `MAX` dengan syarat `< MAX`.
5. JOIN ke tabel one-to-many menggandakan baris induk; jika menjumlah kolom induk atau menggabungkan dua relasi one-to-many sekaligus, nilai terhitung berulang. Solusi: agregasi di subquery/CTE dulu, baru JOIN.
6. Temukan dengan `GROUP BY ... HAVING COUNT(*) > 1`; hapus dengan `ROW_NUMBER() OVER (PARTITION BY kunci ORDER BY id)` dan sisakan `rn = 1`, di dalam transaksi setelah verifikasi dengan `SELECT`; lalu tambah `UNIQUE` constraint agar tidak terulang.

## Practical Exercises

1. Tampilkan pelanggan yang order di bulan ini tetapi tidak di bulan lalu.
2. Hitung rata-rata nilai order (AOV) per kota.
3. Temukan produk yang harganya di atas rata-rata kategorinya.
4. Hitung retensi: pelanggan yang kembali order dalam 30 hari setelah order pertama.

<details>
<summary>Petunjuk solusi nomor 3</summary>

```sql
SELECT name, category, price
FROM (
  SELECT name, category, price, AVG(price) OVER (PARTITION BY category) AS avg_cat
  FROM products
) t
WHERE price > avg_cat;
```
</details>

## Quick Reference

```text
Urutan: FROM/JOIN → WHERE → GROUP BY → HAVING → SELECT/window → ORDER BY → LIMIT
Anti-join: LEFT JOIN ... IS NULL / NOT EXISTS · Top-N per grup: ROW_NUMBER/DENSE_RANK + PARTITION BY
Running total: SUM() OVER (ORDER BY) · Banding baris: LAG/LEAD · Pivot: COUNT(*) FILTER (WHERE)
Agregasi dulu baru JOIN · rentang waktu >= ... < ... · parameterized query
```

## Related Topics

- [Joins](/database/joins/)
- [Indexing](/database/indexing/)
- [Transactions & ACID](/database/transactions-acid/)
- [Problem Solving Framework](/interview/coding-test/problem-solving-framework/)
