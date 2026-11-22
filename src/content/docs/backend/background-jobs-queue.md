---
title: "Background Jobs & Queue"
description: "Background job di Node.js dengan BullMQ: kapan memindahkan pekerjaan ke background, struktur producer/worker, job ID untuk deduplikasi, retry & backoff, job terjadwal & berulang (cron), prioritas, progress & status untuk aplikasi mobile (202 + polling/push), graceful shutdown, concurrency, monitoring, serta pola khas: email/push, laporan PDF, sinkron ERP, pembersihan data."
level: advanced
status: complete
version: "BullMQ 5.x · Redis 7 · Node.js 22"
updated: 2026-11-13
tags: [backend, background-jobs, bullmq, queue, cron, worker]
---

## Overview

**Background job** adalah pekerjaan yang dijalankan di luar siklus request-response: dikirim ke antrean oleh API, lalu
diproses oleh **worker** terpisah. Halaman ini fokus pada implementasi dengan BullMQ (berbasis Redis). Konsep
antrean secara umum (semantik pengiriman, outbox, urutan) ada di [Message Queue](/system-design/concepts/message-queue/).

## Why It Matters

Request API dari mobile sebaiknya selesai dalam hitungan ratus milidetik. Pekerjaan seperti membuat PDF laporan, mengirim
notifikasi ke ribuan perangkat, atau sinkron ke sistem akuntansi bisa memakan detik hingga menit dan dapat gagal.
Background job membuat API tetap responsif dan pekerjaan dapat di-retry dengan aman.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Queue | Antrean bernama di Redis (`notifications`, `reports`) |
| Job | Unit kerja dengan nama, data (JSON), opsi (attempts, delay, priority) |
| Worker | Proses yang mengambil & menjalankan job dengan concurrency tertentu |
| Job ID | ID unik. Job dengan ID yang sama tidak ditambahkan dua kali (deduplikasi) |
| Repeatable / scheduler | Job berulang berdasarkan cron atau interval |
| Delayed job | Dijalankan setelah jeda tertentu |
| Stalled job | Job yang worker-nya mati di tengah jalan, diambil ulang |
| Failed set | Job yang gagal setelah semua percobaan (berfungsi seperti DLQ) |

## How It Works

```text
API: validasi → simpan state awal (DB) → queue.add(name, data, opts) → 202 { jobId/statusUrl }
Worker: ambil job → proses (idempoten) → update progress/status → selesai / throw → retry dengan backoff
Klien mobile: polling status atau menerima push saat selesai
```

## Implementation

### Struktur proyek

```text
src/
  jobs/
    queues.ts            definisi queue & koneksi
    reports.worker.ts    worker laporan
    notifications.worker.ts
  worker.ts              entrypoint proses worker (dijalankan terpisah dari API)
```

API dan worker sebaiknya proses/container terpisah agar dapat diskalakan sendiri dan pekerjaan berat tidak mengganggu
latensi API.

### Queue & producer

```ts
// jobs/queues.ts
import { Queue } from 'bullmq';
export const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };   // diperlukan untuk worker BullMQ
export const reportQueue = new Queue('reports', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 24 * 3600, count: 1_000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
```

```ts
// API: minta laporan bulanan
app.post('/v1/reports/monthly', { preHandler: [authenticate] }, async (req, reply) => {
  const input = MonthlyReport.parse(req.body);
  const report = await reports.create({ tenantId: req.user.tenantId, ...input, status: 'queued' });
  await reportQueue.add('monthly-sales', { reportId: report.id }, { jobId: `report:${report.id}` });
  return reply.code(202).header('Location', `/v1/reports/${report.id}`).send({ id: report.id, status: 'queued' });
});

app.get('/v1/reports/:id', { preHandler: [authenticate] }, async (req) => {
  const r = await reports.findForTenant(req.params.id, req.user.tenantId);
  if (!r) throw new NotFoundError();
  return { id: r.id, status: r.status, progress: r.progress, downloadUrl: r.status === 'ready' ? await signedUrl(r.fileKey) : null };
});
```

Status disimpan di **database** (sumber kebenaran), bukan hanya di Redis, karena job BullMQ dihapus setelah selesai.

### Worker

```ts
// jobs/reports.worker.ts
import { Worker, UnrecoverableError } from 'bullmq';

export const reportWorker = new Worker('reports', async (job) => {
  const report = await reports.get(job.data.reportId);
  if (!report) throw new UnrecoverableError('Report not found');        // jangan retry
  if (report.status === 'ready') return;                                // idempoten

  await reports.update(report.id, { status: 'processing' });
  const rows = await salesRepo.monthly(report.tenantId, report.month);
  await job.updateProgress(50);
  const pdf = await renderPdf(rows);
  const key = `${report.tenantId}/reports/${report.id}.pdf`;
  await putObject(key, pdf, 'application/pdf');
  await reports.update(report.id, { status: 'ready', fileKey: key, progress: 100 });
  await push.sendToUser(report.requestedBy, { type: 'report_ready', reportId: report.id });
}, { connection, concurrency: 2 });

reportWorker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await reports.update(job.data.reportId, { status: 'failed' });
    logger.error({ err, jobId: job.id }, 'report job failed permanently');
  }
});
```

### Job terjadwal (cron)

```ts
// BullMQ 5: job scheduler (versi lama memakai opsi `repeat` di queue.add)
await maintenanceQueue.upsertJobScheduler('cleanup-expired-uploads',
  { pattern: '0 3 * * *', tz: 'Asia/Jakarta' },           // setiap hari pukul 03.00 WIB
  { name: 'cleanup-expired-uploads', data: {} },
);
```

Scheduler di BullMQ terkoordinasi lewat Redis sehingga tidak berjalan ganda walau ada banyak worker, berbeda dengan
`node-cron` di setiap instance API.

### Fan-out notifikasi massal

```ts
// Pecah menjadi batch agar retry tidak mengulang semuanya dan rate limit FCM dihormati
for (const batch of chunk(userIds, 500)) {
  await notificationQueue.add('promo-batch', { campaignId, userIds: batch }, { jobId: `promo:${campaignId}:${batch[0]}` });
}
// Worker: limiter untuk membatasi laju
new Worker('notifications', handler, { connection, concurrency: 5, limiter: { max: 50, duration: 1_000 } });
```

### Graceful shutdown

```ts
// worker.ts
const workers = [reportWorker, notificationWorker];
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    await Promise.all(workers.map((w) => w.close()));     // tunggu job yang sedang berjalan selesai
    process.exit(0);
  });
}
```

Atur grace period orkestrator (mis. `terminationGracePeriodSeconds`) lebih lama dari durasi job tipikal. Job panjang
sebaiknya dipecah atau dibuat dapat dilanjutkan (checkpoint).

### Monitoring

```text
- Dashboard: Bull Board / Taskforce (lihat antrean, job gagal, retry manual)
- Metrik: panjang antrean (waiting), umur job tertua, job gagal per menit, durasi job p95
- Alert: antrean menumpuk > N menit, lonjakan failed, worker tidak aktif
```

## Best Practices

- **Simpan status di DB**, job hanya membawa ID.
- **Job ID deterministik** untuk deduplikasi.
- **Worker idempoten**, `UnrecoverableError` untuk kegagalan permanen.
- **Proses worker terpisah** dari API, concurrency & limiter sesuai dependensi.
- **Scheduler terkoordinasi** untuk cron, bukan cron di setiap instance.
- **Graceful shutdown** dan monitoring antrean.

## Anti-Patterns

- `setTimeout`/promise tanpa await di handler API sebagai "background job".
- Menyimpan payload besar (PDF, ribuan baris) di data job.
- Retry tak terbatas untuk error permanen.
- Cron di setiap instance API yang mengirim email ganda.
- Tidak ada cara bagi pengguna untuk mengetahui status pekerjaan.

## Performance Considerations

Concurrency worker ditentukan oleh jenis pekerjaan: CPU-bound (PDF, gambar) rendah per proses atau gunakan beberapa
proses. I/O-bound (HTTP, email) bisa lebih tinggi. Skalakan jumlah worker berdasarkan panjang antrean. Redis untuk BullMQ
sebaiknya terpisah atau dipantau ketat bila dipakai juga untuk cache (gunakan `maxmemory-policy noeviction` untuk queue).

## Security Considerations

Validasi data job di worker (job juga input), jangan menaruh secret/PII yang tidak perlu di payload, lindungi dashboard
antrean dengan autentikasi admin, dan pastikan worker tetap menegakkan batas tenant saat membaca data.

## Real-World Use Cases

- Laporan bulanan PDF: 202 + status + push saat siap, file diunduh lewat signed URL.
- Sinkron ke software akuntansi tiap 15 menit dengan scheduler dan retry saat API akuntansi down.
- Pembersihan upload kedaluwarsa setiap malam.

## Interview Questions

1. Kapan pekerjaan dipindahkan ke background job?
2. Bagaimana memberi tahu aplikasi mobile bahwa job sudah selesai?
3. Bagaimana mencegah job dijalankan dua kali?
4. Mengapa cron di setiap instance API bermasalah?

## Sample Answers

1. Saat pekerjaan lama, berat, bergantung pada sistem eksternal, perlu retry, atau tidak harus selesai sebelum respons dikirim ke pengguna.
2. API mengembalikan 202 dengan URL status. Aplikasi melakukan polling dengan interval wajar, dan server mengirim push notification saat job selesai. Status disimpan di database.
3. Gunakan job ID deterministik untuk deduplikasi saat enqueue, dan buat worker idempoten dengan memeriksa status di database sebelum memproses.
4. Setiap instance menjalankan jadwal yang sama sehingga pekerjaan berjalan berkali-kali. Gunakan scheduler terkoordinasi (BullMQ scheduler, lock) atau satu proses penjadwal.

## Practical Exercises

1. Buat endpoint laporan dengan 202, status di DB, worker, dan push saat selesai.
2. Tambahkan job pembersihan harian dengan scheduler BullMQ.
3. Pasang Bull Board dengan autentikasi dan alert untuk antrean menumpuk.

## Quick Reference

```text
API: simpan status DB → queue.add(name, {id}, {jobId}) → 202 + Location
Worker: idempoten · UnrecoverableError · updateProgress · concurrency/limiter · push saat selesai
attempts + exponential backoff · removeOnComplete/Fail · failed set = DLQ
Cron: upsertJobScheduler (terkoordinasi) · graceful shutdown worker.close()
Monitor: waiting, oldest age, failed rate, p95 durasi
```

## Related Topics

- [Message Queue](/system-design/concepts/message-queue/)
- [File Upload](/backend/file-upload/)
- [Push Notifications (Flutter)](/flutter/push-notifications/)
