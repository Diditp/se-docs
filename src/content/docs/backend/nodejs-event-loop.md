---
title: "Node.js Runtime & Event Loop"
description: "Arsitektur Node.js (V8 + libuv), fase event loop, microtask, thread pool, worker threads, dan cara menghindari blocking di server production."
level: intermediate
status: complete
version: "Node.js LTS (22/24)"
updated: 2026-11-07
tags: [nodejs, event-loop, libuv, performance, concurrency]
---

## Overview

Node.js adalah runtime JavaScript di server yang dibangun dari **V8** (engine JS) dan **libuv** (event loop + I/O
asinkron lintas platform). Kode JavaScript Anda berjalan di **satu thread utama**; konkurensi dicapai dengan
**non-blocking I/O** — bukan dengan banyak thread per request seperti model tradisional.

## Why It Matters

- Satu fungsi sinkron yang lambat **memblokir semua request** di proses tersebut — latency semua user naik.
- Memahami event loop menjelaskan perilaku `setTimeout`, `Promise`, `process.nextTick`, dan bug urutan eksekusi.
- Menentukan kapan Node.js cocok (I/O-bound: API, gateway, real-time) dan kapan tidak (CPU-bound berat tanpa worker).

## Core Concepts

- **Call stack** — tempat kode sinkron dieksekusi.
- **libuv event loop** — memproses callback per fase.
- **Microtask queue** — `process.nextTick` (diproses lebih dulu) dan Promise reaction; dikosongkan setelah setiap callback.
- **libuv thread pool** — default 4 thread (`UV_THREADPOOL_SIZE`) untuk `fs`, `dns.lookup`, sebagian `crypto` (pbkdf2, scrypt), `zlib`.
- **Network I/O** — memakai mekanisme OS (epoll/kqueue/IOCP), tidak memakai thread pool.
- **worker_threads** — thread JS terpisah untuk kerja CPU-bound.
- **Cluster / multiple process** — memanfaatkan banyak core (atau jalankan beberapa replika di container orchestrator).

## How It Works

```text
   ┌───────────────────────────┐
┌─>│           timers          │  setTimeout / setInterval yang jatuh tempo
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │  callback I/O tertunda (mis. error TCP)
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │  internal
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           poll            │  ambil event I/O baru, jalankan callback-nya
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           check           │  setImmediate
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      close callbacks      │  socket.on('close')
   └───────────────────────────┘
 Setelah SETIAP callback: kosongkan nextTick queue → lalu Promise microtask queue
```

```js
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
console.log('sync');
// sync → nextTick → promise → (timeout & immediate: urutan tidak dijamin di main module)
// Di dalam callback I/O, setImmediate SELALU sebelum setTimeout(0).
```

## Implementation

### Request handler yang memblokir vs tidak

```ts
import express from 'express';
import { readFile } from 'node:fs/promises';
const app = express();

// ❌ CPU-bound di main thread: semua request lain menunggu
app.get('/report/blocking', (_req, res) => {
  let sum = 0;
  for (let i = 0; i < 5e9; i++) sum += i;       // beberapa detik → server "hang"
  res.json({ sum });
});

// ✅ I/O async: thread utama bebas selama menunggu disk/DB
app.get('/config', async (_req, res, next) => {
  try {
    res.type('json').send(await readFile('./config.json', 'utf8'));
  } catch (e) { next(e); }
});
```

### Memindahkan kerja CPU ke worker thread (dengan pool)

```ts
// report.worker.ts
import { parentPort } from 'node:worker_threads';
parentPort!.on('message', (rows: SaleRow[]) => {
  parentPort!.postMessage(aggregate(rows));   // komputasi berat
});
```

```ts
// pakai library pool (mis. piscina) daripada spawn worker per request
import Piscina from 'piscina';
const pool = new Piscina({ filename: new URL('./report.worker.js', import.meta.url).href });

app.post('/reports/monthly', async (req, res, next) => {
  try {
    const rows = await salesRepo.forMonth(req.body.month);   // I/O
    res.json(await pool.run(rows));                           // CPU di worker
  } catch (e) { next(e); }
});
```

> Untuk laporan yang sangat berat, lebih baik jadikan **background job** (queue) dan kembalikan `202 Accepted` — lihat [Background Jobs & Queue](/backend/background-jobs-queue/).

### Memantau event loop lag

```ts
import { monitorEventLoopDelay } from 'node:perf_hooks';
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  const p99ms = h.percentile(99) / 1e6;
  if (p99ms > 100) logger.warn({ p99ms }, 'event loop lag tinggi');
  h.reset();
}, 10_000).unref();
```

## Best Practices

- **Jangan pernah memakai API `*Sync`** (`readFileSync`, `bcrypt.hashSync`, `crypto.pbkdf2Sync`) di jalur request — hanya saat startup.
- **Kerja CPU > ~10–50 ms** → worker thread pool, background job, atau service terpisah.
- **Batasi ukuran payload** (`express.json({ limit: '1mb' })`) — `JSON.parse` body besar memblokir loop.
- **Stream data besar** (export CSV, file) alih-alih memuat ke memory.
- **Selalu tangani Promise rejection** dan pasang handler `unhandledRejection` yang me-log lalu **mematikan proses dengan tertib** (biarkan orchestrator me-restart).
- **Skala horizontal** dengan beberapa proses/replika (container, PM2 cluster) — satu proses Node hanya memakai satu core untuk JS.
- **Pantau event loop lag** sebagai metrik kesehatan utama.

## Anti-Patterns

- Regex rawan **catastrophic backtracking** pada input user (ReDoS) — memblokir loop.
- `await` di dalam loop untuk operasi independen (serial) — gunakan `Promise.all` dengan batas konkurensi.
- Menaikkan `UV_THREADPOOL_SIZE` sembarangan untuk menutupi masalah desain.
- `process.nextTick` rekursif → *I/O starvation*.
- Menyimpan state sesi di memory proses → rusak saat scaling horizontal.

## Performance Considerations

- **Konkurensi terbatas** untuk panggilan keluar (DB pool, HTTP ke pihak ketiga): `p-limit` atau batching.
- **Connection pooling** ke database — membuat koneksi per request sangat mahal.
- `bcrypt`/`argon2` versi async berjalan di thread pool; dengan beban login tinggi, thread pool (4) bisa jadi bottleneck → ukur dan sesuaikan.
- Gunakan profiler (`node --cpu-prof`, Clinic.js, `--inspect` + Chrome DevTools) untuk menemukan hot path.

## Security Considerations

- **ReDoS & payload besar** adalah serangan DoS yang efektif terhadap model single-thread: batasi ukuran input, gunakan regex aman, set timeout.
- **Rate limiting** di depan endpoint mahal.
- Jangan menjalankan kode/regex dari input user; hindari `eval`/`new Function`.
- Perbarui Node ke rilis LTS yang masih didukung (patch keamanan).

## Real-World Use Cases

- **API gateway / BFF** untuk aplikasi mobile — banyak I/O ke service lain, sedikit komputasi: sangat cocok.
- **Real-time** (WebSocket notifikasi, status transaksi) — ribuan koneksi idle dengan biaya rendah.
- **Laporan PDF/Excel besar** — dijalankan di worker/queue agar API tetap responsif.

## Interview Questions

1. **(Fundamental)** Node.js single-threaded — bagaimana ia menangani ribuan request bersamaan?
2. **(Intermediate)** Jelaskan fase event loop.
3. **(Intermediate)** Apa beda `process.nextTick`, `setImmediate`, dan `setTimeout(fn, 0)`?
4. **(Intermediate)** Operasi apa yang memakai libuv thread pool?
5. **(Advanced)** Endpoint laporan membuat semua endpoint lain lambat. Bagaimana Anda menyelidiki dan memperbaikinya?
6. **(Advanced)** Kapan memakai worker_threads vs cluster vs queue?

## Sample Answers

1. Kode JS berjalan di satu thread, tetapi I/O didelegasikan ke OS (network) atau thread pool libuv (fs, dns, crypto). Selama menunggu, event loop memproses request lain; saat I/O selesai, callback dijadwalkan. Jadi konkurensi tinggi untuk I/O-bound, bukan paralelisme CPU.
2. timers → pending callbacks → idle/prepare → poll (I/O) → check (`setImmediate`) → close callbacks. Setelah setiap callback, nextTick queue lalu Promise microtask dikosongkan.
3. `nextTick` dijalankan segera setelah operasi saat ini sebelum Promise microtask; `setImmediate` di fase check; `setTimeout(0)` di fase timers (minimal ~1 ms). Di dalam callback I/O, `setImmediate` selalu lebih dulu dari `setTimeout(0)`.
4. `fs`, `dns.lookup`, sebagian `crypto` (pbkdf2, scrypt, randomBytes async), `zlib`. Network socket tidak memakai thread pool.
5. Ukur event loop lag dan CPU profile; jika laporan melakukan agregasi besar di JS, pindahkan agregasi ke SQL (`GROUP BY`), worker pool, atau background job dengan `202 Accepted` + polling/notifikasi. Tambahkan pagination/streaming dan cache hasil.
6. worker_threads untuk komputasi CPU dalam request/proses yang sama dengan berbagi data via message. Cluster/replika untuk memanfaatkan banyak core bagi throughput request. Queue untuk pekerjaan lama/tidak harus sinkron, butuh retry dan durabilitas.

## Practical Exercises

1. Prediksi lalu jalankan urutan output kombinasi `nextTick`, Promise, `setTimeout`, `setImmediate` di main module dan di dalam `fs.readFile` callback.
2. Buat endpoint CPU-bound, ukur latency endpoint lain dengan `autocannon`, lalu pindahkan ke `piscina` dan ukur ulang.
3. Tambahkan metrik event loop lag p99 ke endpoint `/metrics`.
4. Ubah export 1 juta baris menjadi streaming CSV dan bandingkan pemakaian memory.

## Quick Reference

- JS di **1 thread**; I/O non-blocking via **libuv**.
- Urutan: **sync → nextTick → Promise → fase loop** (timers → poll → check …).
- Thread pool (4): fs, dns.lookup, crypto, zlib.
- CPU berat → **worker pool / queue**; throughput → **lebih banyak proses/replika**.
- Hindari `*Sync`, payload besar, regex rawan ReDoS.
- Pantau **event loop lag**.

## Related Topics

- [JavaScript & TypeScript Fundamentals](/backend/js-ts-fundamentals/)
- [Background Jobs & Queue](/backend/background-jobs-queue/)
- [API Performance](/testing-performance/api-performance/)
- [Async Programming di Dart](/flutter/async-programming/) — model event loop yang mirip.
- Referensi resmi: [The Node.js Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick), [Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop).
