---
title: "PostgreSQL vs MySQL"
description: "Perbandingan PostgreSQL dan MySQL (InnoDB): tipe data, fitur SQL, JSON, index, MVCC & isolation default, replikasi, ekstensi, ekosistem cloud, dan perbedaan sintaks yang sering membingungkan — serta cara memilih di antara keduanya."
level: intermediate
status: complete
version: "PostgreSQL 15–17 · MySQL 8.0/8.4 — fitur berubah antar versi, cek dokumentasi resmi"
updated: 2026-11-12
tags: [database, postgresql, mysql, comparison]
---

## Overview

**PostgreSQL** dan **MySQL** adalah dua database relasional open-source paling populer. Keduanya matang, cepat, dan
didukung semua penyedia cloud. Perbedaannya terutama pada **kekayaan fitur SQL**, **tipe data**, **perilaku default**,
dan **ekosistem**.

## Why It Matters

Anda mungkin bekerja dengan keduanya (proyek lama MySQL, proyek baru PostgreSQL). Mengetahui perbedaannya mencegah bug
saat migrasi dan membantu menjawab "mengapa memilih X?" di interview.

## Core Concepts

| Aspek | PostgreSQL | MySQL (InnoDB) |
| --- | --- | --- |
| Filosofi | Kepatuhan standar & fitur kaya, extensible | Sederhana, cepat untuk beban web umum |
| Isolation default | Read Committed | Repeatable Read |
| MVCC | Versi baris di tabel (butuh VACUUM) | Undo log (purge) |
| Tipe data | Kaya: `jsonb`, array, range, `uuid`, `inet`, enum, domain | `JSON`, enum, set; tipe lebih terbatas |
| JSON | `jsonb` + index GIN, operator kaya | `JSON` + generated column untuk index |
| Index | B-tree, Hash, GIN, GiST, BRIN, partial, expression, covering (`INCLUDE`) | B-tree, full-text, spatial, functional index (8.0.13+), invisible index |
| SQL lanjutan | CTE (rekursif), window, `FILTER`, `DISTINCT ON`, `RETURNING`, `LATERAL` | CTE & window (8.0+), `RETURNING` tidak tersedia (kecuali MariaDB) |
| DDL transaksional | Ya (sebagian besar DDL bisa di-rollback) | Tidak (DDL implicit commit) |
| Ekstensi | PostGIS, pg_trgm, TimescaleDB, pgvector, dll. | Plugin terbatas |
| Replikasi | Streaming (fisik) & logical replication | Binlog replication (sangat matang), Group Replication |
| Upsert | `ON CONFLICT ... DO UPDATE` | `ON DUPLICATE KEY UPDATE` |
| Auto increment | `GENERATED ... AS IDENTITY` | `AUTO_INCREMENT` |
| Case sensitivity | Identifier tanpa kutip → lowercase; perbandingan string case-sensitive | Tergantung collation (default umumnya case-insensitive) |

## How It Works

Perbedaan perilaku yang sering menjadi bug saat pindah database:

```text
- 'abc' = 'ABC'          → PG: false · MySQL (collation default _ci): true
- GROUP BY longgar        → MySQL lama mengizinkan kolom non-agregat (ONLY_FULL_GROUP_BY kini default aktif)
- Pembagian integer       → PG: 7/2 = 3 · MySQL: 7/2 = 3.5000 (gunakan DIV untuk integer)
- Concatenation           → PG: 'a' || 'b' · MySQL: CONCAT('a','b') (|| = OR kecuali mode PIPES_AS_CONCAT)
- Boolean                 → PG: boolean asli · MySQL: TINYINT(1)
- Kutip identifier        → PG: "nama" · MySQL: `nama`
```

## Implementation

### Sintaks setara

```sql
-- PostgreSQL
CREATE TABLE products (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku   text NOT NULL UNIQUE,
  attrs jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX ON products USING gin (attrs);
INSERT INTO products (sku, attrs) VALUES ('KP-001', '{"size":"L"}')
ON CONFLICT (sku) DO UPDATE SET attrs = EXCLUDED.attrs
RETURNING id;
SELECT * FROM products WHERE attrs @> '{"size":"L"}';

-- MySQL 8
CREATE TABLE products (
  id    BIGINT AUTO_INCREMENT PRIMARY KEY,
  sku   VARCHAR(64) NOT NULL UNIQUE,
  attrs JSON NOT NULL,
  size  VARCHAR(8) GENERATED ALWAYS AS (attrs->>'$.size') VIRTUAL,
  INDEX ix_products_size (size)
);
INSERT INTO products (sku, attrs) VALUES ('KP-001', '{"size":"L"}')
ON DUPLICATE KEY UPDATE attrs = VALUES(attrs);
SELECT LAST_INSERT_ID();
SELECT * FROM products WHERE size = 'L';
```

### Kapan memilih

| Situasi | Pilihan umum |
| --- | --- |
| Proyek baru dengan logika data kaya, laporan, JSON, geospasial | PostgreSQL |
| Tim/infrastruktur sudah berpengalaman MySQL, beban web baca-berat sederhana | MySQL |
| Butuh ekstensi (PostGIS, pgvector, TimescaleDB) | PostgreSQL |
| Aplikasi warisan (WordPress/PHP lama) | MySQL/MariaDB |
| Layanan terkelola tertentu | Keduanya tersedia di cloud besar |

## Best Practices

- **Pilih berdasarkan kebutuhan & keahlian tim**, bukan popularitas.
- **Tulis SQL standar** di bagian yang mungkin dipindahkan; isolasi fitur spesifik di repository.
- **Pahami default** (isolation, collation, mode SQL) sebelum migrasi.
- **Uji migrasi data** pada salinan data nyata (encoding, collation, tipe tanggal).

## Anti-Patterns

- Berpindah database "karena lebih cepat" tanpa benchmark beban nyata.
- Mengandalkan perilaku longgar MySQL lama (`GROUP BY`, konversi tipe implisit) lalu terkejut di PostgreSQL.
- Menyimpan semua data di kolom JSON hanya karena tersedia.

## Performance Considerations

Keduanya sangat cepat bila skema dan index tepat. PostgreSQL membutuhkan autovacuum yang sehat; MySQL perlu perhatian
pada ukuran buffer pool dan purge. Kinerja lebih ditentukan oleh desain query dan index daripada pilihan DBMS.

## Security Considerations

Keduanya mendukung TLS, role/privilege granular, dan enkripsi at rest (di layanan terkelola). PostgreSQL menyediakan
Row Level Security bawaan yang berguna untuk multi-tenant; di MySQL isolasi tenant biasanya ditegakkan di aplikasi/view.

## Real-World Use Cases

- PostgreSQL untuk sistem POS/ERP dengan laporan kompleks dan JSONB.
- MySQL untuk aplikasi web dengan ekosistem PHP/CMS.
- Migrasi MySQL → PostgreSQL untuk memanfaatkan fitur analitik/ekstensi.

## Interview Questions

1. Apa perbedaan utama PostgreSQL dan MySQL?
2. Apa default isolation level masing-masing?
3. Bagaimana menyimpan & meng-index JSON di keduanya?
4. Apa yang perlu diwaspadai saat migrasi MySQL → PostgreSQL?
5. Mengapa Anda memilih PostgreSQL/MySQL di proyek Anda?

## Sample Answers

1. PostgreSQL unggul dalam fitur SQL lanjutan, tipe data kaya, ekstensi, dan DDL transaksional; MySQL dikenal sederhana, sangat umum di ekosistem web, dan replikasi binlog yang matang. Default perilaku (isolation, collation) juga berbeda.
2. PostgreSQL: Read Committed; MySQL InnoDB: Repeatable Read.
3. PostgreSQL: kolom `jsonb` dengan index GIN atau expression index. MySQL: kolom `JSON` dengan generated column yang di-index (atau functional index).
4. Perbedaan collation/case sensitivity, tipe data (boolean, unsigned, datetime), sintaks (backtick, `AUTO_INCREMENT`, upsert, `LIMIT` di UPDATE), `GROUP BY` longgar, pembagian integer, dan encoding — plus uji performa query.
5. Kaitkan dengan kebutuhan: mis. PostgreSQL karena butuh window function untuk laporan, `jsonb` untuk metadata integrasi, RLS untuk multi-tenant, dan tim sudah familiar.

## Practical Exercises

1. Jalankan PostgreSQL dan MySQL di Docker; bandingkan hasil `SELECT 'abc' = 'ABC'` dan `SELECT 7/2`.
2. Implementasikan tabel produk dengan atribut JSON yang ter-index di keduanya.
3. Tulis daftar perbedaan sintaks yang ditemui saat memindahkan 5 query dari MySQL ke PostgreSQL.

## Quick Reference

```text
PG: RC default · jsonb+GIN · RETURNING · ON CONFLICT · IDENTITY · DDL transaksional · ekstensi · RLS
MySQL: RR default · JSON+generated column · ON DUPLICATE KEY · AUTO_INCREMENT · binlog replication
Jebakan: collation/case · 7/2 · || vs CONCAT · boolean · kutip identifier · GROUP BY
```

## Related Topics

- [Database Fundamentals](/database/database-fundamentals/)
- [Isolation Levels](/database/isolation-levels/)
- [Database Schema Design](/database/schema-design/)
