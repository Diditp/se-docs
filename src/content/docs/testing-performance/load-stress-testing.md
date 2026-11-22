---
title: "Load & Stress Testing"
description: "Load, stress, spike, dan soak testing untuk backend yang melayani aplikasi mobile: menentukan target (RPS, concurrent users, p95), skenario realistis, k6 (VUs, scenarios, thresholds), membaca hasil, menemukan bottleneck, kapasitas, dan menjalankan secara aman di lingkungan staging."
level: advanced
status: complete
version: "k6 · Artillery · Locust — cek dokumentasi resmi untuk sintaks terbaru"
updated: 2026-11-13
tags: [performance, load-testing, k6, capacity, backend]
---

## Overview

**Load testing** mensimulasikan banyak pengguna/request untuk mengetahui bagaimana sistem berperilaku di bawah beban:
apakah latensi tetap dalam target, di mana batasnya, dan komponen mana yang pertama runtuh.

## Why It Matters

Aplikasi mobile sering mengalami lonjakan serentak: jam buka toko, promo, notifikasi push ke semua pengguna, atau ribuan
perangkat yang sinkron bersamaan setelah kembali online. Lebih baik menemukan batas di staging daripada saat insiden.

## Core Concepts

| Jenis | Tujuan |
| --- | --- |
| Smoke | Beban sangat kecil — memastikan skrip & sistem berjalan |
| Load | Beban yang diharapkan — apakah SLO terpenuhi |
| Stress | Naik melewati normal — di mana dan bagaimana sistem gagal |
| Spike | Lonjakan tiba-tiba — mis. setelah push notification |
| Soak (endurance) | Beban normal berjam-jam — leak memori, koneksi, disk |

| Metrik | Arti |
| --- | --- |
| RPS | Request per detik |
| VU / concurrent users | Pengguna virtual yang berjalan bersamaan |
| p95/p99 latency | Waktu respons ekor |
| Error rate | Persentase respons gagal/timeout |
| Saturasi | CPU, memori, koneksi DB, antrean |

## How It Works

```text
Tentukan target (dari data production/proyeksi) → skenario realistis (alur & proporsi endpoint, think time)
→ data test & lingkungan menyerupai production → jalankan bertahap (ramp-up)
→ amati klien (latensi, error) + server (CPU, DB, pool, GC) → temukan bottleneck → perbaiki → ulangi
```

## Implementation

### Menentukan target (contoh perhitungan)

```text
5.000 outlet aktif · jam sibuk 12.00–13.00 · rata-rata 60 transaksi/outlet/jam
→ 300.000 transaksi/jam ≈ 83 transaksi/detik
Setiap transaksi = 1 POST /orders + ~2 request lain → ~250 RPS rata-rata di jam sibuk
Pertimbangkan puncak (×2–3) → uji load 600–750 RPS, stress sampai gagal
SLO: p95 < 300 ms, error < 0,5%
```

### k6: skenario load dengan thresholds

```js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  scenarios: {
    kasir: {
      executor: 'ramping-arrival-rate',          // mengontrol RPS, bukan hanya jumlah VU
      startRate: 50, timeUnit: '1s',
      preAllocatedVUs: 200, maxVUs: 1000,
      stages: [
        { target: 250, duration: '5m' },          // ramp-up ke beban normal
        { target: 250, duration: '15m' },         // tahan
        { target: 750, duration: '5m' },          // puncak
        { target: 0, duration: '2m' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{name:create_order}': ['p(95)<300'],
  },
};

export default function () {
  const token = __ENV.TEST_TOKEN;                  // token akun test dari environment
  const res = http.post(`${__ENV.BASE_URL}/v1/orders`, JSON.stringify(randomOrder()), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
               'Idempotency-Key': uuidv4() },
    tags: { name: 'create_order' },
  });
  check(res, { 'status 201': (r) => r.status === 201 });
  sleep(1);                                         // think time
}
```

```bash
k6 run -e BASE_URL=https://staging-api.example.com -e TEST_TOKEN=$TOKEN load.js
```

### Skenario khas mobile

| Skenario | Cara simulasi |
| --- | --- |
| Push ke semua pengguna → buka app | Spike: dari 0 ke N RPS dalam detik pada endpoint startup/feed |
| Ribuan perangkat sinkron setelah offline | Burst POST sync dengan batch besar; uji jitter/backoff klien |
| Jam buka toko | Ramp-up login + katalog + order |

### Membaca hasil

```text
Latensi naik linear lalu melonjak tajam di RPS tertentu → titik jenuh (knee)
CPU app 100% → kode/serialisasi; CPU DB tinggi → query/index; pool koneksi penuh → pool/latensi query
Error 5xx/timeouts muncul → komponen pertama yang gagal = bottleneck yang harus diperbaiki dulu
Soak: memori naik terus → leak; koneksi bertambah → tidak dilepas
```

## Best Practices

- **Target berbasis data** (traffic production, proyeksi bisnis).
- **Skenario realistis**: campuran endpoint, think time, data bervariasi (hindari cache 100% hit palsu).
- **Lingkungan menyerupai production** (ukuran instance, data volume, konfigurasi).
- **Pantau sisi server** bersamaan dengan hasil klien.
- **Thresholds di skrip** agar hasil jelas lulus/gagal; jalankan berkala atau sebelum event besar.
- **Ubah satu hal** setiap iterasi perbaikan.

## Anti-Patterns

- Load test ke production tanpa koordinasi.
- Satu endpoint ringan saja (mis. `/health`) lalu menyimpulkan kapasitas.
- Generator beban di mesin lemah sehingga generator yang menjadi bottleneck.
- Mengabaikan layanan pihak ketiga (payment, SMS) — harus di-mock/sandbox.
- Hanya melihat rata-rata latensi.

## Performance Considerations

Hukum Little: `concurrency = throughput × latency` — bila latensi naik, jumlah request bersamaan dan kebutuhan koneksi juga
naik. Autoscaling butuh waktu; spike test menunjukkan apakah sistem bertahan sebelum instance baru siap.

## Security Considerations

Gunakan akun & data test, jangan data pelanggan. Beri tahu tim infrastruktur/penyedia cloud bila perlu (load test bisa
terlihat seperti serangan DDoS dan memicu proteksi). Jangan simpan token test di repositori.

## Real-World Use Cases

- Load test sebelum promo nasional menemukan pool koneksi DB 10 terlalu kecil.
- Spike test push notification menunjukkan perlunya cache pada endpoint feed dan jitter di klien.
- Soak test 8 jam menemukan leak listener di service websocket.

## Interview Questions

1. Apa beda load, stress, spike, dan soak test?
2. Bagaimana menentukan target load test?
3. Metrik apa yang Anda lihat saat load test?
4. Bagaimana menemukan bottleneck dari hasil load test?
5. Mengapa think time dan data bervariasi penting?

## Sample Answers

1. Load menguji beban yang diharapkan; stress mendorong melewati batas untuk melihat cara gagal; spike menguji lonjakan mendadak; soak menguji beban normal dalam waktu lama untuk leak dan degradasi.
2. Dari data production (RPS jam sibuk, jumlah pengguna aktif), proyeksi pertumbuhan dan event, dikalikan faktor puncak, lalu dipadukan dengan SLO latensi & error.
3. RPS, p95/p99 latency, error rate dari sisi klien; CPU, memori, koneksi DB, pool, antrean, GC dari sisi server.
4. Cari komponen yang pertama jenuh ketika latensi melonjak atau error muncul (CPU app, CPU DB, pool penuh, layanan eksternal), lalu konfirmasi dengan profiling/tracing.
5. Tanpa think time beban tidak realistis; data yang sama membuat cache selalu hit sehingga hasil terlalu optimistis.

## Practical Exercises

1. Hitung target RPS aplikasi Anda dari asumsi bisnis.
2. Tulis skrip k6 dengan skenario login → katalog → order dan thresholds.
3. Jalankan smoke lalu load test di staging dan tulis laporan bottleneck.

## Quick Reference

```text
Smoke · load · stress · spike · soak
Target dari data · skenario campuran · think time · data bervariasi · lingkungan mirip production
k6: ramping-arrival-rate · thresholds (p95, error rate) · tags per endpoint
Pantau server · Little's law · bottleneck pertama → perbaiki → ulangi
```

## Related Topics

- [API Performance](/testing-performance/api-performance/)
- [Database Performance](/testing-performance/database-performance/)
- [Performance Monitoring](/testing-performance/performance-monitoring/)
