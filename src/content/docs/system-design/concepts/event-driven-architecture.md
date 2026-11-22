---
title: "Event-Driven Architecture"
description: "Arsitektur berbasis event: event vs command, event notification vs event-carried state transfer vs event sourcing, desain skema event & versioning, choreography vs orchestration, konsistensi eventual, idempotensi & urutan, CQRS dan read model, change data capture, observability, serta penerapan pada sistem POS dan aplikasi mobile."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, event-driven, event-sourcing, cqrs, saga, cdc]
---

## Overview

Dalam **event-driven architecture (EDA)**, komponen berkomunikasi dengan **menerbitkan event**, yaitu fakta tentang
sesuatu yang **sudah terjadi** (`order.paid`, `stock.adjusted`). Komponen lain yang tertarik bereaksi tanpa perlu dikenal
oleh penerbit. Hasilnya adalah sistem yang longgar keterikatannya (*loosely coupled*) dan mudah ditambah fitur baru.

## Why It Matters

Banyak fitur bisnis adalah reaksi terhadap kejadian: setelah pembayaran, kirim struk, tambah poin loyalitas, kurangi
stok, catat jurnal akuntansi. EDA memungkinkan fitur-fitur itu ditambah tanpa mengubah alur checkout. Konsep ini juga
mendasari sinkronisasi offline dan notifikasi real-time di aplikasi mobile.

## Core Concepts

| Konsep | Arti | Contoh |
| --- | --- | --- |
| Event | Fakta masa lalu, tidak bisa ditolak | `OrderPaid` |
| Command | Permintaan melakukan sesuatu, bisa ditolak | `PayOrder` |
| Producer / consumer | Penerbit / penerima event | order-service / loyalty-service |
| Event bus/broker | Penyalur event | Kafka, RabbitMQ, Pub/Sub, EventBridge |

### Gaya event

| Gaya | Isi event | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| Event notification | ID + tipe ("order 123 dibayar") | Kecil, sederhana | Consumer harus memanggil balik untuk detail |
| Event-carried state transfer | Data yang relevan ikut | Consumer mandiri, tidak memanggil balik | Payload besar, data tersalin |
| Event sourcing | Event adalah sumber kebenaran, state dibangun ulang dari event | Audit lengkap, time travel | Kompleks: versioning, snapshot, query |

### Choreography vs orchestration

| Gaya | Cara | Cocok untuk |
| --- | --- | --- |
| Choreography | Setiap layanan bereaksi terhadap event dan menerbitkan event berikutnya | Alur sederhana, sedikit langkah |
| Orchestration | Orkestrator (saga) memerintah langkah-langkah dan menangani kompensasi | Alur panjang dengan banyak kegagalan yang harus ditangani |

## How It Works

```text
order-service: transaksi DB (order PAID + outbox) → relay → topic orders: OrderPaid v1
  ├─ receipt-service: buat struk → publish ReceiptCreated
  ├─ loyalty-service: tambah poin (idempoten by eventId)
  ├─ inventory-service: catat mutasi stok
  └─ notification-service: push ke pelanggan
Penerbit tidak tahu siapa saja consumer-nya
```

## Implementation

### Skema event yang baik

```json
{
  "eventId": "018f2c1e-…",
  "type": "order.paid",
  "version": 1,
  "occurredAt": "2026-11-13T05:12:04Z",
  "source": "order-service",
  "tenantId": "t-1",
  "subject": "order/018f2b…",
  "data": { "orderId": "018f2b…", "outletId": "o-9", "customerId": "c-77", "total": 54000, "currency": "IDR", "paymentMethod": "qris" },
  "traceId": "4bf92f35…"
}
```

```text
- Nama masa lampau (order.paid), bukan perintah
- eventId unik → deduplikasi · version → evolusi skema · traceId → tracing lintas layanan
- Evolusi: tambah field opsional (kompatibel), field wajib baru / ubah makna → versi baru (v2), terbitkan keduanya sementara
- Dokumentasikan skema (JSON Schema/AsyncAPI) dan validasi di consumer
```

### Consumer idempoten

```ts
async function onOrderPaid(event: OrderPaidV1) {
  await db.tx(async (t) => {
    const inserted = await t.query(
      'INSERT INTO processed_events (event_id, consumer) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1',
      [event.eventId, 'loyalty']);
    if (inserted.rowCount === 0) return;                       // sudah diproses
    await t.query('UPDATE loyalty_accounts SET points = points + $1 WHERE customer_id = $2',
      [Math.floor(event.data.total / 10_000), event.data.customerId]);
  });
}
```

### CQRS & read model

```text
Command side: tabel transaksi ternormalisasi (tulis)
Query side: read model yang dibangun dari event (mis. ringkasan penjualan harian per outlet)
→ dashboard owner cepat tanpa query berat di tabel transaksi
Konsekuensi: read model tertinggal beberapa detik (eventual consistency) → UI menampilkan "diperbarui hh:mm"
```

### Change Data Capture (CDC)

CDC (mis. Debezium membaca WAL PostgreSQL) mengubah perubahan baris database menjadi event tanpa mengubah kode aplikasi.
Berguna untuk mengisi data warehouse/search index. Untuk event domain yang bermakna bisnis, outbox dengan skema eksplisit
biasanya lebih jelas daripada mengekspos struktur tabel internal.

### EDA dan aplikasi mobile

```text
- Event server → push notification / WebSocket ("pesanan siap")
- Sinkronisasi offline: outbox di perangkat → operasi → server menerbitkan event → perangkat lain menarik perubahan
- Aplikasi tidak berlangganan broker internal secara langsung. Selalu lewat gateway/real-time layer yang terotorisasi
```

## Best Practices

- **Event = fakta bisnis** dengan nama masa lampau dan skema berversi.
- **Outbox** untuk konsistensi DB dan event.
- **Consumer idempoten** dan tahan urutan (versi/seq).
- **Pilih orchestration** untuk proses panjang dengan kompensasi.
- **Distributed tracing & katalog event** (siapa produce/consume apa).
- **Pertimbangkan event sourcing hanya bila** audit/riwayat penuh benar-benar dibutuhkan.

## Anti-Patterns

- Event yang sebenarnya command terselubung (`send.email.now`) sehingga coupling tetap ada.
- Event berisi seluruh baris tabel internal sehingga perubahan skema merusak consumer.
- Rantai choreography panjang yang tidak ada yang memahami alurnya.
- Mengabaikan eventual consistency di UI (pengguna bingung data belum muncul).
- Event sourcing untuk CRUD sederhana.

## Performance Considerations

EDA meratakan beban dan memungkinkan consumer diskalakan terpisah. Latensi end-to-end bertambah, jadi pantau *consumer
lag* (berapa tertinggal dari event terbaru). Partisi berdasarkan kunci entitas menjaga urutan sekaligus memungkinkan
paralelisme.

## Security Considerations

Event dapat berisi data sensitif yang menyebar ke banyak layanan. Minimalkan data pribadi di payload, atur ACL per topic
(siapa boleh publish/consume), enkripsi in transit, retensi sesuai kebijakan, dan validasi skema agar event palsu atau
rusak ditolak.

## Real-World Use Cases

- POS: `order.paid` memicu struk digital, poin loyalitas, mutasi stok, dan jurnal akuntansi secara independen.
- Dashboard owner: read model ringkasan penjualan diperbarui dari event dalam hitungan detik.
- Audit: event `price.changed` disimpan untuk melacak siapa mengubah harga dan kapan.

## Interview Questions

1. Apa beda event dan command?
2. Apa beda event notification, event-carried state transfer, dan event sourcing?
3. Kapan memilih choreography dan kapan orchestration?
4. Bagaimana menangani evolusi skema event?
5. Apa itu CQRS dan apa konsekuensinya?

## Sample Answers

1. Event adalah fakta yang sudah terjadi (tidak bisa ditolak), diterbitkan tanpa tahu penerimanya. Command adalah permintaan kepada penerima tertentu untuk melakukan sesuatu, yang bisa ditolak.
2. Event notification hanya membawa ID/tipe sehingga consumer memanggil balik. Event-carried state transfer membawa data yang dibutuhkan sehingga consumer mandiri. Event sourcing menjadikan rangkaian event sebagai sumber kebenaran, dan state dibangun ulang dari event.
3. Choreography untuk alur sederhana dengan sedikit langkah karena keterikatannya paling rendah. Orchestration untuk proses panjang dengan banyak cabang kegagalan dan kompensasi, karena alurnya terlihat di satu tempat.
4. Beri versi pada setiap event, tambahkan field opsional secara kompatibel, buat versi baru untuk perubahan yang tidak kompatibel, terbitkan versi lama dan baru selama masa transisi, dokumentasikan skema, dan validasi di consumer.
5. Memisahkan model tulis dan model baca. Read model dioptimalkan untuk query dan diperbarui dari event. Konsekuensinya adalah konsistensi eventual dan infrastruktur tambahan.

## Practical Exercises

1. Daftar event domain untuk aplikasi Anda beserta producer dan consumer-nya.
2. Tulis skema `order.paid` v1 dan rencana migrasi ke v2.
3. Bangun read model ringkasan penjualan harian dari event.

## Quick Reference

```text
Event = fakta masa lalu (order.paid) · command = permintaan (PayOrder)
Notification (ID) · state transfer (data) · event sourcing (event = kebenaran)
Choreography (sederhana) vs orchestration/saga (panjang + kompensasi)
eventId + version + occurredAt + traceId · outbox · consumer idempoten · urutan per entitas
CQRS = read model terpisah (eventual) · CDC untuk warehouse/search · pantau consumer lag
```

## Related Topics

- [Message Queue](/system-design/concepts/message-queue/)
- [Monolithic vs Microservices](/system-design/concepts/monolith-vs-microservices/)
- [Offline-First & Synchronization Strategy](/system-design/concepts/offline-first-architecture/)
