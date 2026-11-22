---
title: "Fault Tolerance"
description: "Membangun sistem yang tetap berfungsi saat komponennya gagal: jenis kegagalan, timeout, retry dengan exponential backoff & jitter, retry budget, idempotensi, circuit breaker, bulkhead, rate limiting & load shedding, fallback dan graceful degradation, cascading failure, health check, chaos testing, serta penerapannya di backend Node.js dan aplikasi Flutter."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, fault-tolerance, resilience, circuit-breaker, retry, timeout]
---

## Overview

**Fault tolerance** adalah kemampuan sistem untuk **tetap memberikan layanan (mungkin terbatas) ketika sebagian
komponennya gagal**. Dalam sistem terdistribusi, kegagalan adalah kondisi normal: jaringan putus, layanan lambat, disk
penuh, deploy bermasalah. Desain yang baik mengasumsikan kegagalan dan membatasi dampaknya.

## Why It Matters

Banyak insiden besar bukan berawal dari satu kegagalan, melainkan dari **reaksi sistem terhadap kegagalan kecil**: retry
yang membanjiri layanan yang sedang lambat, thread pool yang habis menunggu dependensi, atau ribuan aplikasi mobile yang
reconnect bersamaan. Pola resiliensi mencegah efek domino ini.

## Core Concepts

| Kegagalan | Contoh |
| --- | --- |
| Crash | Proses mati, instance hilang |
| Lambat (gray failure) | Dependensi merespons 30 detik, bukan error, sering paling berbahaya |
| Error sementara | Timeout jaringan, 503 |
| Error permanen | Data tidak valid, 400 |
| Kegagalan parsial | Sebagian request gagal, sebagian berhasil |
| Kegagalan berantai (cascading) | Satu layanan lambat → pemanggil kehabisan resource → ikut gagal |

| Pola | Tujuan |
| --- | --- |
| Timeout | Jangan menunggu selamanya |
| Retry + backoff + jitter | Atasi error sementara tanpa membanjiri |
| Idempotensi | Retry aman tanpa efek ganda |
| Circuit breaker | Berhenti memanggil dependensi yang sedang gagal, beri waktu pulih |
| Bulkhead | Isolasi resource agar satu dependensi tidak menghabiskan semuanya |
| Rate limiting / load shedding | Tolak sebagian beban agar sisanya tetap terlayani |
| Fallback / degradation | Respons alternatif saat fitur gagal |

## How It Works

```text
Panggilan ke dependensi:
bulkhead (slot tersedia?) → circuit breaker (terbuka? → fallback) → timeout
  → sukses: catat sukses
  → gagal sementara: retry (maks N, backoff + jitter, hanya bila idempoten & ada budget) → masih gagal: catat gagal
Circuit breaker: CLOSED → (gagal melewati ambang) → OPEN (tolak cepat) → setelah jeda → HALF-OPEN (uji sedikit) → CLOSED/OPEN
```

## Implementation

### Timeout di setiap panggilan

```ts
const res = await fetch(`${PAYMENT_URL}/charges`, {
  method: 'POST', body, headers,
  signal: AbortSignal.timeout(5_000),           // timeout per panggilan
});
// Atur juga: timeout query DB (statement_timeout), timeout pool, dan deadline total request
```

Timeout harus **lebih pendek dari timeout pemanggilnya** (klien mobile 30 s > gateway 25 s > API 20 s > dependensi 5 s),
supaya tidak ada pekerjaan yang terus berjalan setelah pemanggil menyerah.

### Retry dengan exponential backoff + jitter

```ts
async function withRetry<T>(fn: () => Promise<T>, { attempts = 3, baseMs = 200, maxMs = 5_000 } = {}): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1 || !isTransient(e)) throw e;       // hanya error sementara
      const cap = Math.min(maxMs, baseMs * 2 ** i);
      await sleep(Math.random() * cap);                         // "full jitter"
    }
  }
}
const isTransient = (e: unknown) => isTimeout(e) || [429, 502, 503, 504].includes(statusOf(e));
```

```text
Aturan retry:
- Hanya untuk operasi idempoten (GET, PUT, atau POST dengan Idempotency-Key)
- Retry di SATU lapisan saja (3 lapisan × 3 retry = 27× beban)
- Hormati Retry-After
- Retry budget: batasi retry, misalnya ≤ 10% dari total request, agar tidak memperparah insiden
```

### Circuit breaker (contoh dengan library opossum)

```ts
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker((req: ChargeRequest) => paymentClient.charge(req), {
  timeout: 5_000,                 // dianggap gagal bila lebih lama
  errorThresholdPercentage: 50,   // buka bila ≥ 50% gagal
  resetTimeout: 30_000,           // coba lagi (half-open) setelah 30 s
  volumeThreshold: 20,            // minimal jumlah request sebelum menilai
});
breaker.fallback(() => { throw new ServiceUnavailableError('PAYMENT_UNAVAILABLE'); });
breaker.on('open', () => logger.warn('payment circuit open'));

const result = await breaker.fire(chargeRequest);
```

### Bulkhead

```text
- Pool koneksi/HTTP agent terpisah per dependensi
- Batasi concurrency ke layanan lambat (mis. maksimal 20 panggilan laporan bersamaan)
- Worker pool terpisah untuk pekerjaan berat vs request interaktif
→ layanan laporan yang lambat tidak menghabiskan resource untuk checkout
```

### Load shedding

```text
Saat kelebihan beban, tolak cepat (503 + Retry-After) untuk trafik prioritas rendah
(prefetch, analitik, laporan) agar transaksi tetap berjalan.
Lebih baik melayani 80% dengan baik daripada 100% dengan timeout.
```

### Di aplikasi Flutter

```dart
// Timeout & retry terbatas hanya untuk operasi aman
final dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 10), receiveTimeout: const Duration(seconds: 20)));

// Jitter saat reconnect/sinkron agar ribuan perangkat tidak serentak
Duration backoff(int attempt) {
  final capMs = min(60_000, 1_000 * pow(2, attempt).toInt());
  return Duration(milliseconds: Random().nextInt(capMs));
}
```

```text
Aplikasi mobile juga bagian dari fault tolerance:
- Offline-first: operasi penting disimpan lokal dan dikirim ulang (idempoten)
- Fallback UI: tampilkan data cache + pesan "sedang gangguan"
- Kill switch fitur via Remote Config
- Jangan auto-retry tanpa batas di background
```

### Menguji ketahanan

```text
- Test unit/integrasi untuk timeout, retry, dan breaker (fake dependensi lambat/gagal)
- Fault injection di staging: tambah latensi, matikan instance, putuskan DB
- Game day / chaos testing terkontrol, lalu catat temuan di postmortem
```

## Best Practices

- **Timeout di semua panggilan jaringan**, selaras antar lapisan.
- **Retry hanya untuk error sementara pada operasi idempoten**, dengan backoff + jitter dan budget.
- **Circuit breaker untuk dependensi eksternal** yang dapat lambat/gagal.
- **Bulkhead** untuk memisahkan resource jalur kritis.
- **Fallback dan degradasi bertahap** yang dirancang sejak awal.
- **Uji jalur kegagalan**, bukan hanya jalur sukses.

## Anti-Patterns

- Tidak ada timeout (menunggu dependensi selamanya).
- Retry di setiap lapisan tanpa jitter (badai retry).
- Retry untuk POST pembayaran tanpa idempotency key.
- Fallback yang diam-diam menyembunyikan kegagalan permanen tanpa log/alert.
- Health check yang bergantung pada semua dependensi sehingga memicu restart massal.

## Performance Considerations

Timeout yang terlalu panjang menahan resource. Timeout yang terlalu pendek menggagalkan request sah. Tentukan dari p99
latensi normal dependensi ditambah margin. Circuit breaker yang terbuka justru mempercepat respons (gagal cepat) dan
memberi dependensi waktu pulih.

## Security Considerations

Pola resiliensi juga melindungi dari penyalahgunaan: rate limiting dan load shedding menahan serangan volume, dan
timeout mencegah serangan *slowloris*. Pesan fallback tidak boleh membocorkan detail internal dependensi.

## Real-World Use Cases

- Checkout: payment gateway lambat → breaker terbuka setelah 50% gagal → aplikasi menawarkan pembayaran tunai.
- Laporan berat dibatasi bulkhead sehingga transaksi kasir tidak terpengaruh.
- Setelah gangguan, perangkat kasir menyinkronkan ulang dengan jitter sehingga server tidak dibanjiri.

## Interview Questions

1. Apa itu cascading failure dan bagaimana mencegahnya?
2. Jelaskan circuit breaker dan state-nya.
3. Mengapa retry perlu exponential backoff dan jitter?
4. Kapan retry tidak boleh dilakukan?
5. Apa itu bulkhead pattern?

## Sample Answers

1. Kegagalan satu komponen yang menyebar karena pemanggilnya kehabisan resource saat menunggu atau me-retry. Cegah dengan timeout, circuit breaker, bulkhead, retry terbatas dengan jitter, dan load shedding.
2. Pembungkus panggilan yang memantau kegagalan. CLOSED: panggilan berjalan normal. OPEN: panggilan langsung ditolak/fallback setelah kegagalan melewati ambang. HALF-OPEN: setelah jeda, sebagian panggilan diuji. Bila berhasil kembali CLOSED, bila gagal kembali OPEN.
3. Backoff memberi waktu dependensi pulih dan mengurangi beban. Jitter mengacak waktu retry agar banyak klien tidak me-retry serentak (thundering herd).
4. Untuk error permanen (validasi, 4xx selain 429), operasi tidak idempoten tanpa idempotency key, ketika retry budget habis, atau ketika retry sudah dilakukan di lapisan lain.
5. Mengisolasi resource (pool koneksi, concurrency, worker) per dependensi atau jenis pekerjaan, sehingga kegagalan atau kelambatan satu bagian tidak menghabiskan resource bagian lain.

## Practical Exercises

1. Audit semua panggilan eksternal di backend Anda: apakah ada timeout?
2. Implementasikan retry dengan full jitter dan test-nya dengan dependensi palsu yang gagal sementara.
3. Pasang circuit breaker untuk payment gateway dan simulasikan gangguan.

## Quick Reference

```text
Timeout di semua panggilan (klien > gateway > API > dependensi)
Retry: error sementara + idempoten · backoff + full jitter · satu lapisan · retry budget · Retry-After
Circuit breaker: CLOSED → OPEN → HALF-OPEN · bulkhead · load shedding (503 + Retry-After)
Fallback + degradasi · mobile: offline-first, jitter reconnect, kill switch
Uji kegagalan: fault injection, chaos terkontrol
```

## Related Topics

- [Availability, Reliability & High Availability](/system-design/concepts/availability-reliability/)
- [Message Queue](/system-design/concepts/message-queue/)
- [API Performance](/testing-performance/api-performance/)
