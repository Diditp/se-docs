---
title: "Message Queue"
description: "Message queue dalam desain sistem: kapan memproses secara asynchronous, queue vs pub/sub vs log (RabbitMQ, SQS, Kafka, Redis Streams, BullMQ), jaminan pengiriman (at-most-once, at-least-once, efektif exactly-once dengan idempotensi), urutan pesan, retry dengan backoff, dead letter queue, backpressure, transactional outbox, dan contoh kasus mobile seperti push notification, struk, dan laporan."
level: advanced
status: complete
version: "BullMQ 5.x · RabbitMQ · Kafka · AWS SQS. Fitur bergantung produk & versi"
updated: 2026-11-13
tags: [system-design, message-queue, async, kafka, outbox, idempotency]
---

## Overview

**Message queue** memisahkan pihak yang **menghasilkan pekerjaan** (producer) dari pihak yang **mengerjakannya**
(consumer/worker). Producer menaruh pesan ke antrean lalu langsung melanjutkan, dan worker memprosesnya secara terpisah
dengan kecepatannya sendiri.

## Why It Matters

Tanpa antrean, request pengguna harus menunggu semua efek samping selesai: kirim email, push notification, generate PDF,
sinkron ke ERP. Bila salah satunya lambat atau down, seluruh request ikut gagal. Antrean membuat API **cepat dan tahan
gangguan**, dan merupakan bahasan wajib dalam interview system design.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Producer / consumer | Pengirim pesan / pemroses pesan |
| Queue (point-to-point) | Setiap pesan diproses oleh **satu** consumer (pembagian kerja) |
| Pub/Sub (topic) | Setiap pesan diterima **semua** subscriber (fan-out) |
| Log (stream) | Pesan disimpan berurutan & dapat dibaca ulang dari offset (Kafka, Redis Streams) |
| Ack | Consumer mengonfirmasi pesan selesai diproses. Tanpa ack, pesan dikirim ulang |
| Dead Letter Queue (DLQ) | Tempat pesan yang gagal berulang kali untuk diperiksa manual |
| Backpressure | Mekanisme agar producer/consumer tidak kewalahan |

### Jaminan pengiriman

| Semantik | Arti | Konsekuensi |
| --- | --- | --- |
| At-most-once | Paling banyak sekali, bisa hilang | Hanya untuk data yang boleh hilang (metrik kasar) |
| At-least-once | Pasti sampai, **bisa duplikat** | Paling umum, jadi **consumer wajib idempoten** |
| Exactly-once | Tepat sekali | Dalam praktik dicapai sebagai *efektif sekali*: at-least-once + idempotensi/deduplikasi |

### Pilihan teknologi (gambaran umum)

| Teknologi | Model | Cocok untuk |
| --- | --- | --- |
| BullMQ (Redis) | Job queue | Background job di aplikasi Node.js: email, push, laporan |
| RabbitMQ | Broker dengan exchange & routing | Routing kompleks, banyak pola kerja |
| AWS SQS / Google Pub/Sub | Managed queue / pub-sub | Tanpa operasional server, skala otomatis |
| Kafka | Log terdistribusi | Throughput sangat tinggi, event streaming, replay, banyak konsumen independen |
| Redis Streams | Log ringan | Kebutuhan stream sederhana bila Redis sudah ada |

## How It Works

```text
API: validasi → simpan order (DB) → enqueue "order.paid" → respons 201 (cepat)
Worker A (notifikasi): konsumsi → kirim push → ack
Worker B (struk): konsumsi → buat PDF → simpan → ack
Gagal → retry dengan exponential backoff → setelah N kali → DLQ + alert
```

## Implementation

### Job queue dengan BullMQ

```ts
import { Queue, Worker } from 'bullmq';
const connection = { url: process.env.REDIS_URL! };

export const notificationQueue = new Queue('notifications', { connection });

// Producer: jobId deterministik mencegah job duplikat untuk event yang sama
await notificationQueue.add('order-ready', { orderId, userId }, {
  jobId: `order-ready:${orderId}`,
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: 1_000,
  removeOnFail: false,                              // simpan job gagal untuk investigasi (DLQ sederhana)
});

// Consumer
new Worker('notifications', async (job) => {
  const { orderId, userId } = job.data;
  if (await sentLog.exists(job.id!)) return;         // idempoten: sudah pernah terkirim
  await push.sendToUser(userId, { type: 'order_ready', orderId });
  await sentLog.mark(job.id!);
}, { connection, concurrency: 20 });
```

### Masalah dual write & transactional outbox

```text
❌ Masalah: simpan order ke DB berhasil, tetapi publish ke queue gagal (atau sebaliknya) → data tidak konsisten
✅ Outbox: tulis order DAN event ke tabel outbox dalam SATU transaksi DB
   Relay (poller atau CDC) membaca outbox → publish ke broker → tandai terkirim
```

```sql
BEGIN;
INSERT INTO orders (id, outlet_id, total, status) VALUES ($1, $2, $3, 'paid');
INSERT INTO outbox (id, aggregate_id, type, payload) VALUES (gen_random_uuid(), $1, 'order.paid', $4);
COMMIT;
```

```ts
// Relay sederhana (poller). Beberapa instance aman dengan SKIP LOCKED
const rows = await db.query(`
  SELECT id, type, payload FROM outbox WHERE published_at IS NULL
  ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`);
for (const r of rows) await broker.publish(r.type, r.payload, { messageId: r.id });
await db.query('UPDATE outbox SET published_at = now() WHERE id = ANY($1)', [rows.map((r) => r.id)]);
// Jalankan dalam transaksi. Publish bisa terulang bila crash, jadi consumer harus idempoten (dedup by messageId)
```

Pola yang sama dipakai aplikasi offline-first di perangkat (outbox lokal → sinkron ke server).

### Urutan pesan

```text
Urutan global mahal. Biasanya cukup urutan per entitas:
- Kafka: partition key = orderId → semua event order yang sama berurutan dalam satu partisi
- SQS FIFO: MessageGroupId = orderId
- Consumer menolak/menunda event dengan versi lebih lama (cek version/seq di payload)
```

### Retry, DLQ, dan backpressure

| Aspek | Praktik |
| --- | --- |
| Retry | Exponential backoff + jitter. Bedakan error sementara (timeout) vs permanen (data invalid → langsung DLQ) |
| DLQ | Alert saat ada pesan masuk. Tooling untuk inspeksi & replay setelah perbaikan |
| Backpressure | Batasi concurrency worker, rate limit ke API pihak ketiga, pantau panjang antrean |
| Poison message | Pesan yang selalu membuat worker crash → batasi attempts, isolasi ke DLQ |

### Kasus khas aplikasi mobile

| Pekerjaan | Mengapa async |
| --- | --- |
| Push notification massal | Ribuan perangkat, rate limit FCM, retry |
| Generate struk PDF / laporan bulanan | CPU berat, bisa beberapa detik–menit → aplikasi diberi status "diproses" lalu notifikasi |
| Sinkron ke ERP/akuntansi | Sistem eksternal lambat/down → antrean menahan sampai pulih |
| Proses gambar upload (resize, thumbnail) | Dipicu event storage |
| Webhook pembayaran | Terima cepat (200), proses di worker secara idempoten |

## Best Practices

- **Async untuk pekerjaan yang tidak perlu ditunggu pengguna** atau bergantung sistem eksternal.
- **Consumer idempoten** (dedup berdasarkan message/job ID atau kunci bisnis).
- **Outbox** untuk menjamin konsistensi DB dan pesan.
- **Retry dengan backoff + DLQ + alert**.
- **Pesan kecil dan bertipe** (ID + versi skema). Data besar diambil dari DB/storage.
- **Pantau panjang antrean, umur pesan tertua, dan error rate**.

## Anti-Patterns

- Menganggap broker memberi exactly-once sehingga consumer tidak idempoten.
- Publish ke queue di luar transaksi tanpa outbox (dual write).
- Retry tanpa batas yang membanjiri sistem saat dependensi down.
- Memakai queue untuk operasi yang pengguna perlukan hasilnya seketika (mis. validasi stok saat checkout).
- Menaruh payload besar (file base64) di pesan.

## Performance Considerations

Antrean meratakan lonjakan (load leveling): API tetap cepat, worker diskalakan sesuai panjang antrean. Latensi
end-to-end menjadi lebih panjang, jadi tentukan SLA per jenis job (push < 10 detik, laporan < 5 menit). Throughput
dibatasi oleh dependensi paling lambat, misalnya rate limit layanan push atau email.

## Security Considerations

Broker berada di jaringan privat dengan autentikasi dan TLS. Validasi skema pesan di consumer karena pesan juga input.
Jangan menaruh secret atau data pribadi yang tidak perlu di payload, terapkan retensi, dan batasi siapa yang boleh
publish ke topic sensitif.

## Real-World Use Cases

- POS: order dibayar → outbox → event `order.paid` → worker cetak struk digital, update loyalty point, sinkron ke akuntansi.
- Laporan bulanan: request `POST /reports` → job → PDF di storage → push "laporan siap" dengan signed URL.
- Promo: push ke 200.000 pengguna dibagi batch dengan rate limit agar tidak terkena throttle.

## Interview Questions

1. Kapan Anda memakai message queue?
2. Apa beda queue, pub/sub, dan log (Kafka)?
3. Apa itu at-least-once delivery dan konsekuensinya?
4. Apa itu transactional outbox dan masalah apa yang diselesaikannya?
5. Bagaimana menjaga urutan pesan?
6. Bagaimana menangani pesan yang terus gagal?

## Sample Answers

1. Untuk pekerjaan yang tidak harus selesai dalam request pengguna, yang lambat, bergantung sistem eksternal, perlu retry, atau perlu meratakan lonjakan beban.
2. Queue membagi pesan ke satu consumer. Pub/sub mengirim salinan ke semua subscriber. Log menyimpan pesan berurutan secara persisten sehingga banyak consumer membaca dengan offset masing-masing dan dapat replay.
3. Pesan dijamin terkirim tetapi bisa lebih dari sekali (misalnya bila ack hilang). Konsekuensinya, consumer harus idempoten atau melakukan deduplikasi.
4. Event ditulis ke tabel outbox dalam transaksi yang sama dengan perubahan data, lalu relay mem-publish-nya. Ini menyelesaikan masalah dual write, yaitu data tersimpan tetapi event tidak terkirim atau sebaliknya.
5. Jamin urutan per kunci entitas (partition key Kafka, message group SQS FIFO), proses satu kunci secara serial, dan sertakan versi/seq agar consumer bisa menolak event usang.
6. Batasi retry dengan backoff, bedakan error permanen, pindahkan ke DLQ dengan alert, perbaiki penyebabnya, lalu replay pesan dari DLQ.

## Practical Exercises

1. Pindahkan pengiriman push dari request handler ke BullMQ worker dengan retry dan job ID deterministik.
2. Implementasikan outbox + relay dengan `FOR UPDATE SKIP LOCKED`, lalu uji crash di tengah publish.
3. Gambar diagram alur `order.paid` ke tiga consumer berbeda.

## Quick Reference

```text
Async untuk: lambat · eksternal · retry · lonjakan · fan-out
Queue (1 consumer) · pub/sub (semua) · log/stream (replay, offset)
At-least-once → consumer idempoten · exactly-once = at-least-once + dedup
Outbox (DB + event satu transaksi) + relay SKIP LOCKED
Urutan per entitas (partition key) · retry backoff+jitter · DLQ + alert · batasi concurrency
Pesan kecil: ID + versi skema
```

## Related Topics

- [Event-Driven Architecture](/system-design/concepts/event-driven-architecture/)
- [Background Jobs & Queue](/backend/background-jobs-queue/)
- [Offline-First & Synchronization Strategy](/system-design/concepts/offline-first-architecture/)
