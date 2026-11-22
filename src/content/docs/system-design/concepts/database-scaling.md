---
title: "Database Scaling"
description: "Menskalakan database relasional secara bertahap: optimasi query & index, connection pooling, vertical scaling, read replica dan replication lag, read-your-writes, partisi tabel, sharding (kunci shard, hotspot, query lintas shard, resharding), CQRS & read model, arsip data, serta kapan mempertimbangkan database lain."
level: advanced
status: complete
version: "PostgreSQL 16+ sebagai contoh. Konsep berlaku umum"
updated: 2026-11-13
tags: [system-design, database, replication, sharding, partitioning]
---

## Overview

Database adalah komponen yang **paling sulit diskalakan** karena menyimpan state. Layer aplikasi stateless cukup ditambah
instance, sedangkan database membutuhkan strategi bertahap dengan trade-off konsistensi dan kompleksitas.

## Why It Matters

Pertanyaan "database Anda tidak kuat lagi, apa yang dilakukan?" sangat umum. Jawaban matang mengikuti urutan dari yang
paling murah dan aman, bukan langsung "sharding".

## Core Concepts

| Teknik | Mengatasi | Biaya/risiko |
| --- | --- | --- |
| Index & optimasi query | Query lambat | Rendah |
| Connection pooling | Terlalu banyak koneksi | Rendah |
| Vertical scaling | CPU/RAM/IO kurang | Rendah, ada batas |
| Cache | Baca berulang | Sedang (invalidasi) |
| Read replica | Beban baca | Replication lag |
| Partisi tabel | Tabel sangat besar, data historis | Sedang |
| CQRS / read model terpisah | Query laporan berat | Konsistensi eventual |
| Sharding | Beban tulis/ukuran melebihi satu node | Tinggi |

| Istilah | Arti |
| --- | --- |
| Replication lag | Keterlambatan replica terhadap primary |
| Synchronous vs asynchronous replication | Commit menunggu replica (aman, lambat) vs tidak (cepat, bisa lag/kehilangan data saat failover) |
| Shard key | Kolom penentu shard tempat data berada |
| Hotspot | Satu shard menerima beban jauh lebih besar |

## How It Works

```text
Urutan yang disarankan:
1. Ukur: query paling mahal (pg_stat_statements), CPU, IO, koneksi, ukuran tabel
2. Index + perbaiki query + pagination keyset
3. Pooling (PgBouncer) + vertical scaling
4. Cache untuk baca panas
5. Read replica untuk laporan/baca yang toleran lag
6. Partisi tabel besar berdasarkan waktu/tenant + arsip
7. Pisahkan read model/analitik (CQRS, data warehouse)
8. Sharding bila beban tulis/ukuran benar-benar melebihi satu primary
```

## Implementation

### Read replica & read-your-writes

```ts
// Routing sederhana: tulis & baca kritis ke primary, laporan ke replica
const primary = new Pool({ connectionString: process.env.DB_PRIMARY_URL });
const replica = new Pool({ connectionString: process.env.DB_REPLICA_URL });

async function getOrderAfterPayment(id: string) {
  return primary.query('SELECT * FROM orders WHERE id = $1', [id]);   // harus melihat tulisan terbaru
}
async function monthlyReport(outletId: string, month: string) {
  return replica.query(REPORT_SQL, [outletId, month]);                 // lag beberapa detik dapat diterima
}
```

```text
Masalah klasik: pengguna membuat order lalu membuka daftar order dari replica → order belum terlihat
Solusi: baca dari primary untuk pengguna tersebut beberapa detik setelah menulis, atau klien memakai data dari respons tulis
```

### Partisi tabel berdasarkan waktu

```sql
CREATE TABLE sales (
  id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  total bigint NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (id, created_at)                 -- kunci partisi harus bagian dari primary key
) PARTITION BY RANGE (created_at);

CREATE TABLE sales_2026_11 PARTITION OF sales FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE sales_2026_12 PARTITION OF sales FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
-- Query dengan filter created_at hanya membaca partisi relevan (partition pruning)
-- Arsip: DETACH PARTITION lama → pindahkan ke penyimpanan murah
```

### Sharding

```text
Kunci shard yang baik:
- Sebagian besar query menyertakan kunci tersebut (mis. tenant_id/outlet_id)
- Distribusi merata (hindari tenant raksasa di satu shard → bisa diberi shard khusus)
- Jarang berubah

Konsekuensi:
- Query lintas shard (laporan semua tenant) mahal → pakai data warehouse
- Transaksi lintas shard sulit → desain agar transaksi tetap dalam satu tenant
- Resharding sulit → gunakan banyak shard logis yang dipetakan ke sedikit node fisik, atau consistent hashing
- Opsi terkelola/ekstensi: Citus (PostgreSQL), Vitess (MySQL), database terdistribusi (CockroachDB, Spanner)
```

### Pisahkan beban analitik

```text
OLTP (transaksi aplikasi) ≠ OLAP (laporan besar)
Replikasi/CDC ke data warehouse (BigQuery, ClickHouse) untuk dashboard & analitik lintas tenant
Materialized view untuk ringkasan yang sering dibaca (refresh terjadwal)
```

### Connection pooling

```text
Setiap koneksi PostgreSQL memakan memori. 20 instance × pool 20 = 400 koneksi → terlalu banyak
Gunakan PgBouncer (transaction pooling) di depan DB, dan pool kecil per instance
```

## Best Practices

- **Ikuti urutan termurah dulu**; sharding paling akhir.
- **Ukur sebelum dan sesudah** setiap langkah.
- **Tentukan data mana yang boleh dibaca dari replica**.
- **Partisi data berbasis waktu** yang terus tumbuh (transaksi, log, event).
- **Pisahkan analitik dari database transaksi**.
- **Desain skema dengan tenant_id** sejak awal agar sharding/partisi mudah nanti.

## Anti-Patterns

- Sharding sebelum mengoptimalkan query dan index.
- Membaca data yang baru ditulis dari replica.
- Laporan berat langsung di primary pada jam sibuk.
- Pool koneksi besar di setiap instance yang menghabiskan `max_connections`.
- Kunci shard yang tidak muncul di query utama.

## Performance Considerations

Replica menambah kapasitas baca tetapi bukan tulis. Partisi mempercepat query yang memfilter kunci partisi dan
mempermudah penghapusan data lama, tetapi query tanpa filter itu bisa lebih lambat. Pantau replication lag sebagai metrik
dan alert.

## Security Considerations

Replica dan data warehouse berisi data yang sama sensitifnya, sehingga terapkan kontrol akses, enkripsi, dan masking
data pribadi untuk analitik. Backup dan uji restore untuk setiap shard/partisi.

## Real-World Use Cases

- POS: tabel `sales` dipartisi bulanan, laporan dari replica, dashboard owner dari materialized view.
- SaaS multi-tenant besar: sharding berdasarkan `tenant_id`, tenant enterprise di shard khusus.

## Interview Questions

1. Database Anda kewalahan. Apa langkah-langkahnya?
2. Apa itu replication lag dan bagaimana menangani read-your-writes?
3. Apa beda partisi dan sharding?
4. Bagaimana memilih shard key?
5. Mengapa laporan sebaiknya tidak dijalankan di database utama?

## Sample Answers

1. Ukur query termahal dan sumber beban, optimalkan index dan query, gunakan pooling, vertical scaling, cache untuk baca panas, replica untuk baca yang toleran lag, partisi tabel besar, pisahkan analitik, dan baru sharding bila tulis atau ukuran melebihi satu node.
2. Replica tertinggal beberapa milidetik sampai detik dari primary. Untuk read-your-writes, baca dari primary setelah pengguna menulis (untuk jangka waktu singkat), atau gunakan data hasil respons tulis di klien.
3. Partisi membagi tabel menjadi bagian-bagian di dalam satu database. Sharding membagi data ke beberapa database/server berbeda, sehingga menambah kapasitas tulis tetapi menambah kompleksitas query dan transaksi.
4. Pilih kolom yang ada di sebagian besar query, mendistribusikan data merata, jarang berubah, dan menjaga transaksi tetap dalam satu shard. Contohnya tenant_id atau user_id.
5. Query laporan memindai banyak data dan dapat mengunci atau menghabiskan IO/CPU, sehingga memperlambat transaksi pengguna. Gunakan replica, materialized view, atau data warehouse.

## Practical Exercises

1. Identifikasi 5 query termahal di database Anda dan rencana perbaikannya.
2. Partisi tabel transaksi berdasarkan bulan dan ukur query satu bulan.
3. Rancang strategi sharding untuk SaaS dengan 10.000 tenant.

## Quick Reference

```text
Urutan: ukur → index/query → pooling → vertical → cache → replica → partisi → analitik terpisah → sharding
Replica = skala baca, ada lag → read-your-writes dari primary
Partisi (satu DB, data waktu, pruning, arsip) vs shard (banyak node, skala tulis)
Shard key: ada di query, merata, stabil · lintas shard → warehouse
PgBouncer untuk banyak instance
```

## Related Topics

- [Database Performance](/testing-performance/database-performance/)
- [Indexing](/database/indexing/)
- [Scalability](/system-design/concepts/scalability/)
