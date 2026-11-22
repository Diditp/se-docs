---
title: "Distributed Systems Fundamentals"
description: "Konsep dasar sistem terdistribusi: fallacies of distributed computing, kegagalan parsial, latensi & timeout, CAP & PACELC, model konsistensi (strong, eventual, read-your-writes), replikasi, partisi, waktu & clock (NTP, logical clock), idempotensi & exactly-once, konsensus (Raft) sekilas, distributed lock & fencing token, serta relevansinya bagi aplikasi mobile yang selalu terdistribusi."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, distributed-systems, cap, consistency, consensus, clocks]
---

## Overview

**Sistem terdistribusi** adalah kumpulan komputer yang berkomunikasi lewat jaringan dan terlihat sebagai satu sistem
bagi pengguna. Aplikasi mobile + backend + database + layanan pihak ketiga **sudah merupakan sistem terdistribusi**:
jaringan bisa putus, pesan bisa terlambat atau terduplikasi, dan setiap bagian bisa gagal secara terpisah.

## Why It Matters

Banyak bug "aneh" (order ganda, stok minus, data tidak sinkron antar perangkat) berasal dari asumsi bahwa jaringan
andal dan waktu konsisten. Memahami dasar sistem terdistribusi membantu mendesain retry, sinkronisasi, dan konsistensi
dengan benar, dan merupakan topik wajib interview system design tingkat lanjut.

## Core Concepts

### Fallacies of distributed computing (asumsi yang salah)

```text
1. Jaringan andal            5. Topologi tidak berubah
2. Latensi nol               6. Ada satu administrator
3. Bandwidth tak terbatas    7. Biaya transport nol
4. Jaringan aman             8. Jaringan homogen
```

Di mobile, semua asumsi ini salah setiap hari: sinyal hilang, berpindah Wi-Fi ↔ seluler, latensi ratusan milidetik.

### Kegagalan parsial

```text
Klien mengirim request → timeout. Kemungkinan:
a) request tidak pernah sampai   b) diproses tetapi respons hilang   c) masih diproses
Klien TIDAK BISA membedakan → retry harus aman → idempotensi
```

### CAP & PACELC

| Teorema | Isi |
| --- | --- |
| CAP | Saat terjadi partisi jaringan (P), sistem harus memilih Consistency (menolak/menunggu) atau Availability (tetap melayani, mungkin data basi) |
| PACELC | Saat Partisi: pilih A atau C. **E**lse (normal): pilih **L**atency atau **C**onsistency |

Contoh: aplikasi POS offline-first memilih **availability** (tetap berjualan saat offline) lalu menyelesaikan konsistensi
saat sinkron. Transfer saldo bank memilih **consistency** (menolak bila tidak bisa memastikan).

### Model konsistensi

| Model | Jaminan | Contoh |
| --- | --- | --- |
| Strong / linearizable | Setiap baca melihat tulisan terbaru | Primary DB dalam satu transaksi |
| Read-your-writes | Pengguna melihat tulisannya sendiri | Setelah update profil |
| Monotonic reads | Tidak melihat data "mundur" | Feed tidak kembali ke versi lama |
| Causal | Urutan sebab-akibat terjaga | Balasan chat setelah pesan aslinya |
| Eventual | Akhirnya semua replika sama | Read replica, cache, sinkron offline |

## How It Works

```text
Replikasi: salinan data di beberapa node → ketersediaan & skala baca, tetapi ada lag
Partisi/sharding: data dibagi ke beberapa node → skala tulis & ukuran, tetapi query lintas partisi mahal
Konsensus (Raft/Paxos): beberapa node sepakat pada satu nilai/urutan meski sebagian gagal (mayoritas/quorum)
Dipakai oleh etcd, Consul, database terdistribusi. Developer aplikasi jarang mengimplementasikannya sendiri
```

## Implementation

### Waktu & clock

```text
- Jam antar mesin tidak pernah persis sama (NTP mengurangi, tidak menghilangkan selisih)
- Jam perangkat mobile bisa salah atau diubah pengguna
- Jangan memakai timestamp untuk menentukan urutan kejadian lintas mesin secara pasti
Solusi: sequence/versi dari satu sumber (server, DB), logical clock (Lamport), vector clock, atau hybrid logical clock
Untuk durasi gunakan monotonic clock (performance.now(), Stopwatch), bukan selisih jam dinding
```

### Idempotensi & "exactly-once"

```text
Pengiriman jaringan hanya bisa at-most-once atau at-least-once
"Exactly-once" yang dirasakan pengguna = at-least-once + efek idempoten
Teknik: idempotency key, ID dari klien (UUID), upsert, unique constraint, tabel processed_events
```

### Distributed lock & fencing token

```text
Masalah: worker A memegang lock (Redis) lalu "membeku" (GC pause) → lock kedaluwarsa → worker B mengambil lock
→ A bangun dan tetap menulis → dua penulis
Solusi: fencing token, yaitu nomor yang selalu naik setiap lock diberikan. Penyimpanan menolak tulisan dengan token lebih kecil
Atau hindari lock terdistribusi: gunakan constraint/transaksi DB, antrean dengan satu consumer per kunci
```

```sql
-- Optimistic concurrency sebagai alternatif lock
UPDATE orders SET status = 'paid', version = version + 1
WHERE id = $1 AND version = $2;          -- 0 baris → sudah diubah pihak lain, ulangi dengan data terbaru
```

### Timeout, retry, dan backpressure

```text
Setiap panggilan jaringan: timeout · retry hanya untuk operasi idempoten dengan backoff + jitter · circuit breaker
Antrean di antara komponen agar lonjakan diserap (load leveling)
Lihat Fault Tolerance untuk detail
```

### Mobile sebagai node terdistribusi

| Masalah | Pendekatan |
| --- | --- |
| Offline berjam-jam | Local-first + outbox + sinkron |
| Request di-retry setelah timeout | Idempotency key per operasi |
| Dua perangkat mengubah data yang sama | Versi per record + strategi konflik per entitas |
| Jam perangkat salah | Urutan berdasarkan sequence server |
| Notifikasi tiba sebelum data | Push sebagai sinyal → aplikasi mengambil data via API |

## Best Practices

- **Asumsikan jaringan & node gagal**, rancang untuk kegagalan parsial.
- **Idempotensi untuk setiap operasi yang bisa diulang**.
- **Pilih model konsistensi per kebutuhan bisnis**, tidak semua harus strong.
- **Hindari bergantung pada jam lintas mesin** untuk urutan.
- **Gunakan constraint/transaksi DB** sebelum lock terdistribusi.
- **Timeout, retry terbatas, backpressure** di setiap batas.

## Anti-Patterns

- Menganggap timeout berarti operasi gagal lalu mengulang operasi non-idempoten.
- Distributed lock tanpa fencing untuk data penting.
- Sinkronisasi berdasarkan `updated_at` jam perangkat.
- Transaksi terdistribusi (2PC) lintas layanan untuk alur bisnis biasa.
- Menuntut strong consistency di semua tempat sehingga sistem lambat dan rapuh.

## Performance Considerations

Konsistensi kuat lintas node membutuhkan koordinasi (round-trip, quorum) sehingga menambah latensi. Konsistensi
eventual memungkinkan latensi rendah dan ketersediaan tinggi dengan biaya data sementara tidak sinkron. Pilih berdasarkan
dampak bisnis, bukan preferensi teknis.

## Security Considerations

Jaringan tidak aman: autentikasi dan enkripsi antar layanan (mTLS/token), validasi pesan antar komponen, dan
perlindungan terhadap replay (nonce, timestamp + idempotency). Node yang dikompromikan tidak boleh otomatis dipercaya
oleh node lain (zero trust).

## Real-World Use Cases

- POS memilih availability saat offline dan menyelesaikan konflik stok dengan ledger saat sinkron.
- Pembayaran memakai idempotency key dan status dari webhook gateway untuk mengatasi timeout yang ambigu.
- Optimistic concurrency (`version`) mencegah dua admin menimpa perubahan harga satu sama lain.

## Interview Questions

1. Apa itu teorema CAP dan contoh penerapannya?
2. Mengapa exactly-once delivery sulit dan bagaimana mengatasinya?
3. Mengapa jam (timestamp) tidak bisa diandalkan untuk urutan kejadian?
4. Apa masalah distributed lock dan apa itu fencing token?
5. Bagaimana aplikasi mobile menangani timeout pada request pembayaran?

## Sample Answers

1. Saat partisi jaringan, sistem harus memilih tetap konsisten (menolak/menunggu) atau tetap tersedia (melayani dengan data mungkin basi). Contoh: POS offline-first memilih availability, transfer bank memilih consistency.
2. Pengirim tidak bisa membedakan pesan hilang dari ack yang hilang, sehingga harus mengirim ulang dan duplikasi mungkin terjadi. Solusinya at-least-once delivery ditambah pemrosesan idempoten (idempotency key, deduplikasi, upsert).
3. Jam antar mesin berbeda dan dapat melompat (NTP, pengaturan pengguna), sehingga urutan berdasarkan timestamp bisa salah. Gunakan sequence dari satu sumber, versi, atau logical clock.
4. Pemegang lock dapat terhenti sementara hingga lock kedaluwarsa lalu tetap menulis setelah pemegang baru mengambil lock. Fencing token adalah angka yang naik setiap lock diberikan, dan penyimpanan menolak tulisan dengan token lama.
5. Kirim dengan idempotency key yang sama saat retry, tampilkan status "sedang diproses", tanyakan status pembayaran ke server (yang mendapat konfirmasi dari webhook gateway), dan jangan membuat pembayaran baru sebelum status jelas.

## Practical Exercises

1. Identifikasi semua operasi di aplikasi Anda yang tidak aman bila diulang, lalu buat idempoten.
2. Terapkan optimistic concurrency (`version`) pada satu entitas yang diedit beberapa pengguna.
3. Tentukan model konsistensi yang dibutuhkan untuk 5 fitur aplikasi Anda.

## Quick Reference

```text
Fallacies: jaringan tidak andal, latensi > 0, tidak aman · kegagalan parsial → timeout ambigu
CAP (saat partisi: C vs A) · PACELC (normal: latency vs consistency)
Konsistensi: strong · read-your-writes · monotonic · causal · eventual
Waktu: jangan andalkan jam lintas mesin · sequence/versi/logical clock · monotonic untuk durasi
Exactly-once = at-least-once + idempoten · lock + fencing token / optimistic version · hindari 2PC
```

## Related Topics

- [Fault Tolerance](/system-design/concepts/fault-tolerance/)
- [Offline-First & Synchronization Strategy](/system-design/concepts/offline-first-architecture/)
- [Database Scaling](/system-design/concepts/database-scaling/)
