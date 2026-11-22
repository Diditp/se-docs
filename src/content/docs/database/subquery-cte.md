---
title: "Subquery, CTE & Window Function"
description: "Subquery (scalar, IN/EXISTS, correlated, derived table), Common Table Expression termasuk CTE rekursif untuk hierarki, dan window function (ROW_NUMBER, RANK, LAG/LEAD, running total, moving average, frame) dengan contoh laporan POS."
level: intermediate
status: complete
version: "PostgreSQL 12+ (CTE inline default) · MySQL 8+ (CTE & window)"
updated: 2026-11-12
tags: [database, sql, subquery, cte, window-function, recursive]
---

## Overview

- **Subquery** — query di dalam query (di `WHERE`, `FROM`, atau `SELECT`).
- **CTE (`WITH`)** — subquery bernama yang membuat query panjang terbaca bertahap; versi **rekursif** menelusuri hierarki.
- **Window function** — menghitung nilai atas sekumpulan baris terkait **tanpa** menggabungkan baris menjadi satu
  (berbeda dengan `GROUP BY`).

## Why It Matters

Ketiganya adalah alat utama query laporan dan soal SQL interview: top-N per grup, running total, perbandingan dengan
periode sebelumnya, dan hierarki kategori.

## Core Concepts

| Jenis subquery | Contoh | Catatan |
| --- | --- | --- |
| Scalar | `(SELECT AVG(price) FROM products)` | Harus mengembalikan 1 nilai |
| `IN` / `NOT IN` | `WHERE id IN (SELECT ...)` | `NOT IN` + NULL = jebakan |
| `EXISTS` / `NOT EXISTS` | `WHERE EXISTS (SELECT 1 ...)` | Berhenti di kecocokan pertama; aman terhadap NULL |
| Correlated | Merujuk kolom query luar | Dievaluasi per baris luar (optimizer sering mengubahnya menjadi join) |
| Derived table | `FROM (SELECT ...) t` | Seperti tabel sementara |

| Window function | Fungsi |
| --- | --- |
| `ROW_NUMBER()` | Nomor unik per partisi |
| `RANK()` / `DENSE_RANK()` | Ranking dengan seri |
| `LAG()` / `LEAD()` | Nilai baris sebelumnya/berikutnya |
| `SUM/AVG/COUNT() OVER (...)` | Agregat berjalan atau per partisi |
| `FIRST_VALUE` / `LAST_VALUE` / `NTH_VALUE` | Nilai pada posisi tertentu dalam frame |
| `NTILE(n)` | Membagi ke n kelompok (kuartil, dll.) |

Sintaks: `fungsi() OVER (PARTITION BY ... ORDER BY ... ROWS BETWEEN ... AND ...)`.

## How It Works

```text
GROUP BY : 10 baris → 3 baris (per kategori)
Window   : 10 baris → 10 baris, masing-masing + nilai yang dihitung dari "jendela" barisnya
Frame default dengan ORDER BY: RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW (→ running total)
```

## Implementation

### Subquery & EXISTS

```sql
-- Produk di atas rata-rata harga
SELECT name, price FROM products WHERE price > (SELECT AVG(price) FROM products);

-- Pelanggan yang pernah membeli kategori 'coffee'
SELECT c.id, c.name
FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON p.id = oi.product_id
  WHERE o.customer_id = c.id AND p.category = 'coffee'
);
```

### CTE bertahap

```sql
WITH paid AS (
  SELECT id, outlet_id, created_at FROM orders WHERE status = 'paid'
), revenue AS (
  SELECT p.outlet_id, SUM(oi.qty * oi.unit_price) AS total
  FROM paid p JOIN order_items oi ON oi.order_id = p.id
  GROUP BY p.outlet_id
)
SELECT o.name, r.total
FROM revenue r JOIN outlets o ON o.id = r.outlet_id
ORDER BY r.total DESC;
```

### CTE rekursif: kategori bertingkat

```sql
WITH RECURSIVE tree AS (
  SELECT id, name, parent_id, 1 AS depth, name::text AS path
  FROM categories WHERE parent_id IS NULL                       -- anchor: akar
  UNION ALL
  SELECT c.id, c.name, c.parent_id, t.depth + 1, t.path || ' > ' || c.name
  FROM categories c JOIN tree t ON c.parent_id = t.id           -- langkah rekursif
)
SELECT * FROM tree ORDER BY path;     -- "Minuman > Kopi > Kopi Susu"
```

### Window function

```sql
-- Top 3 produk per kategori
SELECT * FROM (
  SELECT p.category, p.name, SUM(oi.qty) AS units,
         DENSE_RANK() OVER (PARTITION BY p.category ORDER BY SUM(oi.qty) DESC) AS rnk
  FROM order_items oi JOIN products p ON p.id = oi.product_id
  GROUP BY p.category, p.name
) t WHERE rnk <= 3;

-- Omzet harian, running total, pertumbuhan vs kemarin, rata-rata bergerak 7 hari
WITH daily AS (
  SELECT created_at::date AS day, SUM(total) AS revenue
  FROM orders WHERE status = 'paid' GROUP BY 1
)
SELECT day, revenue,
       SUM(revenue) OVER (ORDER BY day)                                        AS running_total,
       revenue - LAG(revenue) OVER (ORDER BY day)                              AS diff_vs_prev,
       AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_7d
FROM daily ORDER BY day;

-- Porsi tiap outlet terhadap total (window tanpa ORDER BY = seluruh partisi)
SELECT outlet_id, SUM(total) AS revenue,
       ROUND(100.0 * SUM(total) / SUM(SUM(total)) OVER (), 2) AS pct
FROM orders GROUP BY outlet_id;
```

## Best Practices

- **CTE untuk keterbacaan**; beri nama yang menjelaskan langkah.
- **`EXISTS`/`NOT EXISTS`** untuk cek keberadaan dan anti-join.
- **Window function** daripada self-join atau subquery berkorelasi untuk ranking & running total.
- **Tentukan frame eksplisit** (`ROWS BETWEEN ...`) untuk moving average.
- **Batasi rekursi** (kolom `depth` + kondisi) agar data bersiklus tidak membuat query tak berujung.

## Anti-Patterns

- `NOT IN (subquery)` yang bisa berisi NULL.
- Subquery scalar berkorelasi di `SELECT` untuk ribuan baris (N+1 di dalam SQL) bila bisa diganti JOIN/window.
- Menggunakan `LAST_VALUE` dengan frame default (hasil sering tidak sesuai harapan).
- CTE sangat panjang tanpa struktur atau komentar.

## Performance Considerations

Sejak PostgreSQL 12, CTE non-rekursif yang dirujuk sekali di-*inline* oleh optimizer; gunakan `MATERIALIZED` /
`NOT MATERIALIZED` untuk mengontrolnya. Window function membutuhkan sort per partisi — index yang sesuai dengan
`PARTITION BY ... ORDER BY` dan filter data lebih awal membantu. Verifikasi dengan `EXPLAIN ANALYZE`.

## Security Considerations

Query laporan kompleks tetap wajib memakai parameter untuk nilai dari pengguna. CTE rekursif atas data yang dapat diubah
pengguna (mis. struktur organisasi) perlu batas kedalaman untuk mencegah query berat yang disalahgunakan.

## Real-World Use Cases

- Ranking produk per outlet/kategori.
- Laporan omzet dengan running total & perbandingan periode.
- Navigasi kategori bertingkat atau struktur organisasi.
- Deduplikasi data dengan `ROW_NUMBER()`.

## Interview Questions

1. Apa beda subquery dan CTE?
2. Apa beda window function dan GROUP BY?
3. Kapan memakai EXISTS dibanding IN?
4. Bagaimana mengambil baris terbaru per grup?
5. Bagaimana menelusuri data hierarki di SQL?

## Sample Answers

1. Keduanya query bersarang; CTE memberi nama dan dapat dirujuk beberapa kali serta lebih mudah dibaca, dan mendukung rekursi. Secara performa, optimizer modern sering memperlakukannya setara.
2. GROUP BY meringkas banyak baris menjadi satu per kelompok; window function mempertahankan setiap baris dan menambahkan hasil perhitungan atas jendela barisnya.
3. EXISTS untuk cek keberadaan (berhenti di kecocokan pertama) dan aman terhadap NULL pada bentuk NOT; IN cocok untuk daftar nilai kecil yang pasti tidak NULL. Optimizer modern sering menghasilkan rencana yang sama untuk IN/EXISTS positif.
4. `ROW_NUMBER() OVER (PARTITION BY grup ORDER BY waktu DESC)` lalu ambil `rn = 1`, atau `DISTINCT ON` di PostgreSQL.
5. CTE rekursif: anchor untuk akar, lalu bagian rekursif yang JOIN ke hasil sebelumnya, dengan batas kedalaman.

## Practical Exercises

1. Tampilkan untuk setiap order: total, total order sebelumnya dari pelanggan yang sama, dan selisihnya.
2. Hitung kuartil (NTILE 4) pelanggan berdasarkan total belanja.
3. Tulis CTE rekursif yang menampilkan semua sub-kategori dari satu kategori.

## Quick Reference

```text
Subquery: scalar · IN/EXISTS · correlated · derived table · NOT EXISTS > NOT IN
CTE: WITH a AS (...), b AS (...) · rekursif: anchor UNION ALL recursive + batas depth
Window: f() OVER (PARTITION BY .. ORDER BY .. ROWS BETWEEN ..) · ROW_NUMBER/RANK/DENSE_RANK · LAG/LEAD · running SUM
```

## Related Topics

- [GROUP BY & HAVING](/database/group-by-having/)
- [Query Optimization](/database/query-optimization/)
- [SQL Challenges](/interview/coding-test/sql-challenges/)
