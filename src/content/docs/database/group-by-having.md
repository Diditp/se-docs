---
title: "GROUP BY & HAVING"
description: "Agregasi SQL: fungsi agregat (COUNT, SUM, AVG, MIN, MAX), GROUP BY satu/banyak kolom, HAVING vs WHERE, perilaku NULL, COUNT DISTINCT, FILTER, ROLLUP/GROUPING SETS, dan jebakan fan-out setelah JOIN — dengan contoh laporan penjualan."
level: beginner
status: complete
version: "PostgreSQL 15+"
updated: 2026-11-12
tags: [database, sql, group-by, having, aggregation]
---

## Overview

`GROUP BY` mengelompokkan baris yang memiliki nilai sama lalu menghitung **fungsi agregat** per kelompok. `HAVING`
memfilter **kelompok** setelah agregasi, sedangkan `WHERE` memfilter **baris** sebelum agregasi.

## Why It Matters

Hampir semua laporan bisnis (omzet per hari, produk terlaris, transaksi per kasir) adalah agregasi. Kesalahan kecil —
WHERE vs HAVING, NULL, atau JOIN yang menggandakan baris — menghasilkan angka laporan yang salah tanpa error.

## Core Concepts

| Fungsi | Arti | Perilaku NULL |
| --- | --- | --- |
| `COUNT(*)` | Jumlah baris | Menghitung semua |
| `COUNT(col)` | Jumlah nilai non-NULL | Mengabaikan NULL |
| `COUNT(DISTINCT col)` | Jumlah nilai unik | Mengabaikan NULL |
| `SUM(col)` | Total | Mengabaikan NULL; semua NULL → NULL |
| `AVG(col)` | Rata-rata | Mengabaikan NULL (bukan dihitung 0) |
| `MIN`/`MAX` | Nilai terkecil/terbesar | Mengabaikan NULL |
| `string_agg`, `array_agg` | Gabung nilai (PG) | — |

**Aturan GROUP BY**: setiap kolom di `SELECT` harus berada di `GROUP BY` atau di dalam fungsi agregat (PostgreSQL
mengizinkan kolom yang bergantung fungsional pada PK yang di-group).

## How It Works

```text
FROM / JOIN → WHERE (filter baris) → GROUP BY (bentuk kelompok) → agregat
→ HAVING (filter kelompok) → SELECT → ORDER BY → LIMIT
```

## Implementation

```sql
-- Omzet & jumlah transaksi per hari (order selesai saja)
SELECT o.created_at::date              AS day,
       COUNT(DISTINCT o.id)            AS orders,
       SUM(oi.qty * oi.unit_price)     AS revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'paid'                                   -- filter baris
GROUP BY o.created_at::date
ORDER BY day;

-- Produk dengan penjualan > 100 unit bulan ini
SELECT p.name, SUM(oi.qty) AS units
FROM order_items oi
JOIN orders o   ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.created_at >= date_trunc('month', now())
GROUP BY p.id, p.name
HAVING SUM(oi.qty) > 100                                  -- filter kelompok
ORDER BY units DESC;

-- Banyak agregat bersyarat dalam satu query (FILTER, PG)
SELECT cashier_id,
       COUNT(*)                                   AS total_orders,
       COUNT(*) FILTER (WHERE status = 'voided')  AS voided,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'voided') / COUNT(*), 2) AS void_pct
FROM orders
GROUP BY cashier_id
HAVING COUNT(*) FILTER (WHERE status = 'voided') > 5;

-- Subtotal & grand total (ROLLUP)
SELECT category, payment_method, SUM(amount) AS total
FROM sales_view
GROUP BY ROLLUP (category, payment_method);              -- baris NULL = subtotal/grand total
```

### Jebakan fan-out

```sql
-- ❌ total order ikut terhitung berkali-kali karena JOIN ke items (satu order → banyak item)
SELECT SUM(o.total) FROM orders o JOIN order_items oi ON oi.order_id = o.id;

-- ✅ agregasi di level yang benar
SELECT SUM(total) FROM orders;
-- atau agregasi anak dulu di subquery/CTE, baru JOIN
WITH item_counts AS (SELECT order_id, SUM(qty) AS items FROM order_items GROUP BY order_id)
SELECT o.id, o.total, ic.items FROM orders o JOIN item_counts ic ON ic.order_id = o.id;
```

## Best Practices

- **Filter baris di `WHERE`**, hanya kondisi agregat di `HAVING`.
- **Group by kunci (id) + label** agar dua produk bernama sama tidak tergabung.
- **Waspadai NULL**: `COALESCE(SUM(x), 0)`; `AVG` mengabaikan NULL.
- **Agregasi sebelum JOIN** saat menggabungkan beberapa relasi one-to-many.
- **Hitung persentase dengan `100.0`** (numeric) agar tidak terjadi pembagian integer.

## Anti-Patterns

- `WHERE SUM(x) > 100` (error) atau `HAVING status = 'paid'` (benar tetapi tidak efisien & membingungkan).
- Group by nama saja tanpa id.
- Menjumlah kolom induk setelah JOIN ke tabel anak.
- Agregasi di aplikasi setelah mengambil ribuan baris dari database.

## Performance Considerations

Filter `WHERE` mengurangi data sebelum agregasi — tempatkan di sana sebanyak mungkin, dengan index pada kolom filter
(mis. `orders(status, created_at)`). Untuk laporan berat yang sering dibuka, gunakan materialized view atau tabel
ringkasan harian.

## Security Considerations

Laporan agregat tetap harus menghormati otorisasi (filter `tenant_id`/`outlet_id` sesuai hak pengguna). Agregat atas
kelompok sangat kecil dapat membocorkan data individu — pertimbangkan batas minimum ukuran kelompok untuk laporan publik.

## Real-World Use Cases

- Omzet harian/bulanan per outlet.
- Persentase void per kasir untuk deteksi kecurangan.
- Subtotal per kategori dan metode bayar.

## Interview Questions

1. Apa beda WHERE dan HAVING?
2. Apa beda COUNT(*), COUNT(col), dan COUNT(DISTINCT col)?
3. Mengapa total bisa berlipat setelah JOIN?
4. Bagaimana AVG memperlakukan NULL?
5. Bagaimana menghitung beberapa kondisi agregat dalam satu query?

## Sample Answers

1. WHERE memfilter baris sebelum pengelompokan; HAVING memfilter kelompok setelah agregasi sehingga dapat memakai fungsi agregat.
2. COUNT(*) menghitung semua baris; COUNT(col) hanya nilai non-NULL; COUNT(DISTINCT col) nilai unik non-NULL.
3. JOIN ke tabel one-to-many menggandakan baris induk, sehingga kolom induk dijumlah berkali-kali; agregasi di level yang tepat atau agregasi anak terlebih dahulu.
4. Mengabaikan NULL — rata-rata dihitung dari nilai yang ada saja; gunakan `COALESCE(col, 0)` bila NULL harus dianggap nol.
5. Agregat bersyarat dengan `FILTER (WHERE ...)` (PostgreSQL) atau `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` yang portabel.

## Practical Exercises

1. Hitung omzet per outlet per bulan, hanya outlet dengan omzet > Rp50 juta.
2. Hitung rata-rata nilai order (AOV) per metode pembayaran.
3. Buat laporan ROLLUP kategori × outlet dan tandai baris subtotal.

## Quick Reference

```text
WHERE (baris) → GROUP BY → agregat → HAVING (kelompok)
COUNT(*) vs COUNT(col) vs COUNT(DISTINCT) · NULL diabaikan agregat · COALESCE(SUM(x),0)
FILTER (WHERE ...) · ROLLUP/GROUPING SETS · agregasi dulu baru JOIN · 100.0 untuk persen
```

## Related Topics

- [SQL CRUD](/database/sql-crud/)
- [Subquery, CTE & Window Function](/database/subquery-cte/)
- [SQL Challenges](/interview/coding-test/sql-challenges/)
