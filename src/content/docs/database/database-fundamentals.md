---
title: "Database Fundamentals"
description: "Dasar database: DBMS, jenis database (relasional, dokumen, key-value, wide-column, graph, time-series, search), OLTP vs OLAP, cara memilih database, komponen DBMS, serta database lokal di aplikasi mobile."
level: beginner
status: complete
updated: 2026-11-12
tags: [database, fundamentals, sql, nosql, oltp, olap]
---

## Overview

**Database** adalah kumpulan data terorganisasi yang disimpan dan dikelola oleh **DBMS (Database Management System)**
seperti PostgreSQL, MySQL, SQLite, MongoDB, atau Redis. DBMS menangani penyimpanan, query, konkurensi, keamanan, dan
pemulihan — sehingga aplikasi tidak perlu mengelola file data sendiri.

## Why It Matters

Hampir semua aplikasi bergantung pada database: transaksi, pengguna, stok, laporan. Memilih jenis database yang tepat dan
memahami cara kerjanya menentukan kebenaran data, performa, dan biaya.

## Core Concepts

### Jenis database

| Jenis | Model data | Contoh | Cocok untuk |
| --- | --- | --- | --- |
| Relasional (RDBMS) | Tabel, baris, kolom, relasi, SQL | PostgreSQL, MySQL, SQLite, SQL Server | Transaksi, data terstruktur & berelasi |
| Dokumen | Dokumen JSON/BSON | MongoDB, Firestore | Data semi-terstruktur, skema berubah |
| Key-value | Kunci → nilai | Redis, DynamoDB (juga dokumen) | Cache, session, counter, rate limit |
| Wide-column | Baris dengan kolom dinamis per partisi | Cassandra, ScyllaDB | Tulis sangat tinggi, time-series besar |
| Graph | Node & edge | Neo4j | Relasi kompleks (jaringan, rekomendasi) |
| Time-series | Data bertimestamp | TimescaleDB, InfluxDB | Metrik, sensor, monitoring |
| Search engine | Indeks teks terbalik | Elasticsearch/OpenSearch, Meilisearch | Pencarian teks, faceting |

### OLTP vs OLAP

| | OLTP | OLAP |
| --- | --- | --- |
| Tujuan | Operasional harian (transaksi) | Analitik & laporan |
| Query | Banyak, kecil, baca/tulis baris | Sedikit, besar, agregasi jutaan baris |
| Desain | Ternormalisasi | Denormalisasi (star schema), kolumnar |
| Contoh | PostgreSQL untuk POS | Data warehouse (BigQuery, ClickHouse) |

### Komponen DBMS

Query processor (parser, planner/optimizer, executor) · storage engine (page, index, buffer pool) · transaction
manager (ACID, MVCC, lock) · log (WAL) & recovery · manajemen pengguna & hak akses.

## How It Works

```text
Aplikasi → driver/ORM → koneksi (pool) → DBMS
  parse SQL → buat rencana eksekusi (pakai statistik & index) → eksekusi di storage engine
  → baca page dari buffer/disk → hasil → aplikasi
Perubahan: tulis ke WAL (durable) → ubah page di memori → flush ke disk belakangan
```

## Implementation

### Memilih database (alur keputusan sederhana)

```text
Data berelasi + butuh transaksi & konsistensi kuat?   → PostgreSQL/MySQL (default yang aman)
Butuh cache/sesi/counter super cepat?                 → Redis (pelengkap, bukan sumber kebenaran utama)
Pencarian teks penuh dengan relevansi?                → Search engine (disinkron dari DB utama)
Data lokal di aplikasi mobile (offline)?              → SQLite (Drift/Room) atau DB lokal lain sesuai kebutuhan
Analitik berat atas data besar?                       → Data warehouse/kolumnar terpisah
```

### Contoh: satu sistem, beberapa database (polyglot persistence)

```text
PostgreSQL  : order, stok, pelanggan (sumber kebenaran)
Redis       : cache katalog, rate limit, session
Meilisearch : pencarian produk
SQLite      : database lokal aplikasi kasir (offline)
Warehouse   : laporan & analitik historis
```

### Database lokal di Flutter (SQLite via Drift)

```dart
@DriftDatabase(tables: [Products, Sales, SaleItems])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);
  @override
  int get schemaVersion => 3;
}
```

Detail: [Local Database (Flutter)](/flutter/local-database/).

## Best Practices

- **Mulai dengan database relasional** kecuali ada alasan kuat yang lain.
- **Satu sumber kebenaran** per data; database lain (cache, search) adalah turunan.
- **Gunakan constraint** untuk menjaga integritas.
- **Connection pooling** di backend.
- **Backup & uji restore** sejak awal.

## Anti-Patterns

- Memilih NoSQL "karena lebih scalable" tanpa memahami pola akses.
- Menyimpan semuanya sebagai JSON tanpa struktur.
- Menjalankan query analitik berat di database transaksional saat jam sibuk.
- Redis sebagai satu-satunya penyimpanan data penting tanpa persistensi/backup.

## Performance Considerations

Performa database ditentukan oleh desain skema, index, pola query, ukuran data, dan konkurensi. Pisahkan beban OLTP dan
OLAP, gunakan read replica untuk beban baca, dan ukur dengan `EXPLAIN ANALYZE`. Lihat [Indexing](/database/indexing/).

## Security Considerations

Jangan buka database ke internet publik, gunakan akun dengan hak minimum, enkripsi koneksi (TLS) dan data sensitif,
backup terenkripsi, dan audit akses. Lihat [Database Security](/database/database-security/).

## Real-World Use Cases

- PostgreSQL sebagai database utama aplikasi POS/ERP.
- SQLite di perangkat kasir untuk transaksi offline.
- Redis untuk cache dan rate limiting API.

## Interview Questions

1. Apa itu DBMS?
2. SQL vs NoSQL — kapan memilih masing-masing?
3. Apa beda OLTP dan OLAP?
4. Apa itu polyglot persistence?
5. Database apa yang Anda pakai di aplikasi mobile dan mengapa?

## Sample Answers

1. Perangkat lunak yang mengelola penyimpanan, query, konkurensi, keamanan, dan pemulihan data, mis. PostgreSQL, MySQL, SQLite.
2. Relasional untuk data terstruktur yang berelasi dan butuh transaksi ACID serta query fleksibel. NoSQL untuk pola akses spesifik: skema fleksibel (dokumen), akses kunci super cepat (key-value), tulis masif (wide-column), relasi graf. Keputusan berdasarkan pola akses dan kebutuhan konsistensi.
3. OLTP melayani transaksi operasional kecil dan sering dengan desain ternormalisasi; OLAP melayani analitik besar dengan agregasi, biasanya di penyimpanan kolumnar dan skema denormalisasi.
4. Memakai beberapa jenis database dalam satu sistem sesuai kebutuhan masing-masing (PostgreSQL untuk transaksi, Redis untuk cache, search engine untuk pencarian), dengan satu sumber kebenaran.
5. Mis. SQLite melalui Drift: relasional, mendukung transaksi & query agregat, migrasi eksplisit, dan teruji — cocok untuk transaksi offline.

## Practical Exercises

1. Petakan data aplikasi Anda: data mana yang cocok di DB relasional, cache, dan search.
2. Install PostgreSQL via Docker dan buat database latihan.
3. Bandingkan query agregat 1 juta baris di PostgreSQL vs SQLite.

## Quick Reference

```text
DBMS = penyimpanan + query + transaksi + keamanan + recovery
Relasional (default) · dokumen · key-value (cache) · wide-column · graph · time-series · search
OLTP (transaksi, normalisasi) vs OLAP (analitik, kolumnar) · satu sumber kebenaran
```

## Related Topics

- [Relational Database Concepts](/database/relational-concepts/)
- [PostgreSQL vs MySQL](/database/postgresql-mysql/)
- [Local Database (Flutter)](/flutter/local-database/)
