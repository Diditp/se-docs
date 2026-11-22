---
title: "JOIN: INNER, LEFT, RIGHT, FULL"
description: "Cara kerja JOIN di SQL, perbedaan setiap jenis JOIN, jebakan umum (filter di WHERE vs ON, duplikasi baris), anti-join, dan algoritma join di database engine."
level: beginner
status: complete
version: "SQL standar · contoh PostgreSQL 15+"
updated: 2026-11-07
tags: [sql, join, postgresql, mysql, query]
---

## Overview

**JOIN** menggabungkan baris dari dua (atau lebih) tabel berdasarkan kondisi relasi, biasanya foreign key = primary key.
Karena data relasional dinormalisasi ke banyak tabel, JOIN adalah cara utama merekonstruksi informasi utuh
(order + customer + items + produk).

## Why It Matters

JOIN muncul di hampir setiap laporan dan endpoint list. Kesalahan JOIN tidak menimbulkan error — query tetap jalan
tetapi **hasilnya salah diam-diam**: total penjualan berlipat karena duplikasi baris, customer tanpa order hilang dari
laporan, atau LEFT JOIN yang tanpa sadar berubah menjadi INNER JOIN. Juga menjadi soal SQL wajib di coding test.

## Core Concepts

Data contoh:

```sql
customers                     orders
id | name                     id  | customer_id | total  | status
---+--------                  ----+-------------+--------+--------
1  | Andi                     101 | 1           | 50000  | PAID
2  | Budi                     102 | 1           | 20000  | VOID
3  | Citra                    103 | 2           | 75000  | PAID
                              104 | NULL        | 10000  | PAID   -- walk-in, tanpa customer
```

| JOIN | Mengembalikan | Hasil pada data contoh |
| --- | --- | --- |
| `INNER JOIN` | Hanya baris yang cocok di kedua sisi | Andi-101, Andi-102, Budi-103 |
| `LEFT JOIN` | Semua baris kiri + pasangan kanan (atau NULL) | + Citra-NULL |
| `RIGHT JOIN` | Semua baris kanan + pasangan kiri (atau NULL) | + NULL-104 |
| `FULL OUTER JOIN` | Semua baris kedua sisi | + Citra-NULL + NULL-104 |
| `CROSS JOIN` | Kartesian (setiap kiri × setiap kanan) | 3 × 4 = 12 baris |
| Self join | Tabel di-join dengan dirinya | karyawan ↔ atasan |

> MySQL tidak mendukung `FULL OUTER JOIN` secara langsung — emulasikan dengan `LEFT JOIN ... UNION ... RIGHT JOIN`.

## How It Works

Secara logika, `A JOIN B ON cond` = ambil setiap pasangan baris (a, b) dan simpan yang memenuhi `cond`; untuk outer join,
baris yang tidak punya pasangan ditambahkan dengan NULL. Secara fisik, query planner memilih algoritma:

| Algoritma | Cara kerja | Bagus ketika |
| --- | --- | --- |
| **Nested Loop** | Untuk setiap baris luar, cari pasangan di tabel dalam (idealnya via index) | Sisi luar kecil + index di kolom join sisi dalam |
| **Hash Join** | Bangun hash table dari tabel kecil, probe dengan tabel besar | Equi-join tabel besar tanpa index yang berguna |
| **Merge Join** | Kedua sisi diurutkan pada kolom join lalu digabung | Data sudah terurut (index) / hasil besar |

Lihat pilihan planner dengan `EXPLAIN ANALYZE` — [Query Optimization](/database/query-optimization/).

**Urutan evaluasi logis** (penting untuk jebakan filter):
`FROM/JOIN → ON → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT`.

## Implementation

### INNER JOIN multi tabel

```sql
SELECT o.id, c.name AS customer, p.name AS product, oi.qty, oi.price
FROM orders o
JOIN customers   c  ON c.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products    p  ON p.id = oi.product_id
WHERE o.status = 'PAID'
  AND o.created_at >= DATE '2026-11-01';
```

### LEFT JOIN + agregasi: semua customer beserta jumlah order PAID

```sql
SELECT c.id, c.name,
       COUNT(o.id)                AS paid_orders,     -- COUNT(o.id), bukan COUNT(*)
       COALESCE(SUM(o.total), 0)  AS revenue
FROM customers c
LEFT JOIN orders o
       ON o.customer_id = c.id
      AND o.status = 'PAID'                           -- filter tabel kanan di ON
GROUP BY c.id, c.name
ORDER BY revenue DESC;
-- Andi 1 50000 | Budi 1 75000 | Citra 0 0
```

### Jebakan: filter tabel kanan di WHERE

```sql
-- ❌ Citra hilang: WHERE membuang baris dengan o.status NULL → efektif INNER JOIN
SELECT c.name, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'PAID';
```

### Anti-join: customer yang belum pernah order

```sql
-- Pilihan 1: LEFT JOIN ... IS NULL
SELECT c.* FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;

-- Pilihan 2 (sering paling jelas & efisien): NOT EXISTS
SELECT c.* FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- ⚠ Hindari NOT IN jika subquery bisa berisi NULL — hasilnya kosong!
-- SELECT * FROM customers WHERE id NOT IN (SELECT customer_id FROM orders);  -- order 104 punya NULL
```

### Jebakan: duplikasi baris ("fan-out") saat menjumlah

```sql
-- ❌ total order terhitung berkali-kali: 1 order × N items × M payments
SELECT o.id, SUM(o.total) FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN payments pay   ON pay.order_id = o.id
GROUP BY o.id;

-- ✅ agregasi tiap sisi dulu, baru join
WITH items AS (SELECT order_id, SUM(qty * price) AS items_total FROM order_items GROUP BY order_id),
     pays  AS (SELECT order_id, SUM(amount)      AS paid        FROM payments    GROUP BY order_id)
SELECT o.id, i.items_total, COALESCE(p.paid, 0) AS paid
FROM orders o
JOIN items i ON i.order_id = o.id
LEFT JOIN pays p ON p.order_id = o.id;
```

### Self join: karyawan dan atasannya

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
```

## Best Practices

- **Selalu tulis kondisi JOIN eksplisit dengan `ON`** dan alias pendek yang konsisten.
- **Tempatkan filter tabel opsional (kanan) di `ON`** saat memakai LEFT JOIN; filter tabel utama di `WHERE`.
- **Gunakan `COUNT(kolom_kanan)`** bukan `COUNT(*)` setelah LEFT JOIN — `COUNT(*)` menghitung baris NULL sebagai 1.
- **Agregasi sebelum join** saat menggabungkan beberapa relasi one-to-many.
- **Index kolom foreign key** (PostgreSQL tidak membuatnya otomatis; MySQL InnoDB membuatnya).
- **Pilih `NOT EXISTS`** untuk anti-join; hindari `NOT IN` pada kolom nullable.
- **Hindari `SELECT *`** pada query join — kolom ambigu & payload membengkak.

## Anti-Patterns

- `FROM a, b WHERE a.id = b.a_id` (implicit join) — mudah lupa kondisi dan menghasilkan CROSS JOIN tak sengaja.
- `RIGHT JOIN` yang bisa ditulis ulang sebagai `LEFT JOIN` — membingungkan pembaca.
- `DISTINCT` untuk "menyembunyikan" duplikasi akibat join yang salah.
- JOIN pada kolom dengan tipe berbeda (`varchar` vs `int`) → cast implisit, index tidak terpakai.
- N+1 query di aplikasi alih-alih satu JOIN.

## Performance Considerations

- Index pada kolom join (FK) memungkinkan nested loop dengan index scan — biasanya kunci performa.
- Filter seawal mungkin agar set yang di-join kecil.
- Hash join butuh memory (`work_mem` di PostgreSQL); jika tidak cukup, data di-*spill* ke disk.
- Terlalu banyak join (> 8–10 tabel) dapat membuat planner memakai heuristik — pertimbangkan CTE/materialized view untuk laporan.

## Security Considerations

- Gunakan parameterized query untuk nilai filter — JOIN tidak kebal terhadap [SQL Injection](/security/sql-injection/).
- Pada sistem multi-tenant, **setiap tabel** dalam join perlu kondisi tenant (atau Row-Level Security), bukan hanya tabel pertama.
- Jangan mengembalikan kolom sensitif dari tabel yang di-join (mis. `users.password_hash`) — pilih kolom eksplisit.

## Real-World Use Cases

- **Struk/invoice:** orders ⨝ order_items ⨝ products ⨝ outlets.
- **Laporan produk tidak laku:** products LEFT JOIN order_items ... WHERE oi.id IS NULL.
- **Rekonsiliasi pembayaran:** FULL OUTER JOIN transaksi internal vs settlement payment gateway untuk menemukan selisih di kedua sisi.

## Interview Questions

1. **(Fundamental)** Jelaskan perbedaan INNER, LEFT, RIGHT, dan FULL JOIN.
2. **(Fundamental)** Bagaimana mencari data di tabel A yang tidak punya pasangan di tabel B?
3. **(Intermediate)** Mengapa filter di WHERE bisa mengubah LEFT JOIN menjadi INNER JOIN?
4. **(Intermediate)** Mengapa `SUM` bisa berlipat setelah JOIN dan bagaimana memperbaikinya?
5. **(Advanced)** Jelaskan nested loop, hash join, dan merge join.
6. **(Advanced)** Mengapa `NOT IN` berbahaya dengan NULL?

## Sample Answers

1. INNER: hanya pasangan yang cocok. LEFT: semua baris kiri, kanan NULL jika tak cocok. RIGHT: kebalikannya. FULL: semua baris kedua sisi dengan NULL di sisi yang tak cocok.
2. `LEFT JOIN B ... WHERE B.id IS NULL` atau `WHERE NOT EXISTS (SELECT 1 FROM B WHERE B.a_id = A.id)`.
3. LEFT JOIN menghasilkan NULL untuk kolom kanan pada baris tanpa pasangan; kondisi `WHERE kanan.kolom = 'x'` bernilai UNKNOWN untuk NULL sehingga baris dibuang. Pindahkan kondisi ke klausa ON.
4. Join ke dua relasi one-to-many sekaligus menggandakan baris (fan-out): setiap item dipasangkan dengan setiap payment. Agregasi masing-masing relasi di subquery/CTE dulu, lalu join hasilnya.
5. Nested loop: iterasi tabel luar, lookup di tabel dalam (cepat dengan index, untuk set kecil). Hash join: build hash table dari sisi kecil, probe dengan sisi besar (equi-join besar). Merge join: dua input terurut digabung linear (cocok saat data sudah terurut via index).
6. `x NOT IN (1, NULL)` setara `x <> 1 AND x <> NULL`; perbandingan dengan NULL menghasilkan UNKNOWN sehingga seluruh kondisi tidak pernah TRUE dan query mengembalikan nol baris.

## Practical Exercises

1. Buat tabel contoh di atas dan jalankan semua jenis JOIN; tebak hasil sebelum menjalankan.
2. Tulis laporan "penjualan per kategori per hari" termasuk kategori tanpa penjualan (nilai 0).
3. Reproduksi bug fan-out dengan order_items + payments, lalu perbaiki dengan CTE.
4. Bandingkan `EXPLAIN ANALYZE` anti-join `LEFT JOIN IS NULL` vs `NOT EXISTS` pada 1 juta baris.

<details>
<summary>Solusi latihan 2</summary>

```sql
WITH days AS (
  SELECT generate_series(DATE '2026-11-01', DATE '2026-11-07', INTERVAL '1 day')::date AS d
),
paid_items AS (                         -- filter & join sisi transaksi dulu
  SELECT o.created_at::date AS d, p.category_id, oi.qty * oi.price AS amount
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p     ON p.id = oi.product_id
  WHERE o.status = 'PAID'
    AND o.created_at >= DATE '2026-11-01'
    AND o.created_at <  DATE '2026-11-08'
)
SELECT d.d, c.name AS category, COALESCE(SUM(pi.amount), 0) AS revenue
FROM days d
CROSS JOIN categories c                 -- semua kombinasi hari × kategori
LEFT JOIN paid_items pi ON pi.d = d.d AND pi.category_id = c.id
GROUP BY d.d, c.name
ORDER BY d.d, c.name;
```

Kuncinya: bangun "kerangka" lengkap (hari × kategori) dengan `CROSS JOIN`, lalu `LEFT JOIN` ke data transaksi yang
sudah difilter sehingga kombinasi tanpa penjualan tetap muncul dengan nilai 0. Perhatikan zona waktu: `created_at::date`
memakai timezone sesi — untuk laporan per outlet, konversi dulu ke zona waktu outlet (mis. `AT TIME ZONE 'Asia/Makassar'`).
</details>

## Quick Reference

- INNER = irisan · LEFT = semua kiri · FULL = semua · CROSS = kartesian.
- LEFT JOIN: filter kanan di **ON**; hitung dengan **COUNT(kolom_kanan)**.
- Anti-join: **NOT EXISTS** (hindari NOT IN dengan NULL).
- Banyak one-to-many: **agregasi dulu, join kemudian**.
- Index FK. Cek `EXPLAIN ANALYZE`.

## Related Topics

- [Primary Key, Foreign Key & Jenis Relasi](/database/keys-relationships/)
- [GROUP BY & HAVING](/database/group-by-having/)
- [Subquery, CTE & Window Function](/database/subquery-cte/)
- [Indexing](/database/indexing/)
- [SQL Query Challenges](/interview/coding-test/sql-challenges/)
- Referensi resmi: [PostgreSQL — Joins Between Tables](https://www.postgresql.org/docs/current/tutorial-join.html).
