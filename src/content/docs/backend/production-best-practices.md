---
title: "Deployment & Production Best Practices"
description: "Menyiapkan backend Node.js untuk produksi: checklist production readiness, konfigurasi & secret, container image, health check, graceful shutdown, migrasi database yang aman (expand-contract), zero-downtime deploy, observability (logs, metrics, traces, alert), keamanan runtime, backup, rollback, feature flag, dan runbook."
level: advanced
status: complete
updated: 2026-11-13
tags: [backend, production, deployment, observability, migration, nodejs]
---

## Overview

Kode yang berjalan di laptop belum tentu siap produksi. **Production readiness** mencakup cara aplikasi dikonfigurasi,
di-deploy, dipantau, dipulihkan, dan diamankan saat melayani pengguna sungguhan, termasuk aplikasi mobile yang tidak bisa
diperbarui seketika.

## Why It Matters

Banyak insiden produksi bukan karena logika bisnis salah, tetapi karena hal operasional: migrasi yang mengunci tabel,
deploy yang memutus request, secret yang hilang, atau tidak ada alert sehingga gangguan diketahui dari keluhan pengguna.

## Core Concepts

| Area | Pertanyaan kunci |
| --- | --- |
| Konfigurasi | Apakah semua konfigurasi dari env/secret manager dan divalidasi saat start? |
| Build | Apakah image reproducible, kecil, non-root, dan ter-scan? |
| Deploy | Apakah tanpa downtime dan bisa di-rollback cepat? |
| Database | Apakah migrasi kompatibel mundur dan aman untuk tabel besar? |
| Observability | Apakah ada log terstruktur, metrik, trace, dan alert berbasis SLO? |
| Ketahanan | Timeout, retry, circuit breaker, rate limit? |
| Data | Backup otomatis dan restore teruji? |
| Keamanan | Least privilege, patch, TLS, header, scanning? |
| Proses | Runbook, on-call, postmortem? |

## How It Works

```text
PR → CI (lint, test, scan, build image) → deploy staging → smoke test → approval
→ migrasi (expand) → rolling deploy produksi (readiness + draining) → health check & pantau metrik
→ (masalah) rollback image / matikan feature flag → (stabil) contract migration di rilis berikutnya
```

## Implementation

### Dockerfile produksi (ringkas)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

Detail optimasi image ada di [Docker Image Optimization](/devops/docker-image-optimization/). Pin versi base image (atau
digest) dan scan image di CI.

### Startup & shutdown

```ts
const env = Env.parse(process.env);                       // gagal cepat bila konfigurasi salah
const app = await buildApp(env);
await app.listen({ host: '0.0.0.0', port: env.PORT });

let shuttingDown = false;
app.get('/health/ready', async (_req, reply) => (shuttingDown ? reply.code(503).send() : { status: 'ready' }));

process.on('SIGTERM', async () => {
  shuttingDown = true;                                     // LB berhenti mengirim trafik baru
  await new Promise((r) => setTimeout(r, 5_000));          // beri waktu LB memperbarui pool
  await app.close();                                       // selesaikan request berjalan
  await db.end();
  process.exit(0);
});
process.on('unhandledRejection', (err) => { logger.fatal({ err }, 'unhandled rejection'); process.exit(1); });
```

### Migrasi aman: expand → migrate → contract

```text
Mengganti kolom `total` (integer) menjadi `total_amount` + `currency`:
1. EXPAND (rilis N): tambah kolom baru nullable. Aplikasi menulis ke keduanya, membaca kolom lama
2. BACKFILL: isi kolom baru secara bertahap (batch) untuk data lama
3. SWITCH (rilis N+1): aplikasi membaca kolom baru
4. CONTRACT (rilis N+2): hapus kolom lama setelah tidak ada kode/versi yang memakainya
Setiap langkah aman di-rollback ke rilis sebelumnya
```

```sql
-- Aman untuk tabel besar
CREATE INDEX CONCURRENTLY idx_orders_outlet_created ON orders (outlet_id, created_at DESC);
ALTER TABLE orders ADD COLUMN currency text;                      -- tanpa default berat (PG 11+ menangani default konstan dengan cepat)
-- Hindari pada tabel besar di jam sibuk: ALTER TYPE kolom, ADD CONSTRAINT tanpa NOT VALID, VACUUM FULL
ALTER TABLE orders ADD CONSTRAINT orders_currency_check CHECK (currency IN ('IDR')) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_currency_check;     -- terpisah, lock lebih ringan
SET lock_timeout = '5s';                                          -- gagal cepat daripada mengantre lock lama
```

### Observability minimum

```text
Logs: JSON + requestId + level info · redaksi
Metrics (RED): Rate, Errors, Duration per route · USE: CPU, memori, koneksi DB, panjang antrean
Traces: OpenTelemetry untuk HTTP, DB, Redis, panggilan eksternal
Alert (berbasis gejala/SLO): error rate > X% 5 menit, p95 > Y ms, antrean job menumpuk, sertifikat hampir kedaluwarsa
Dashboard per layanan + per versi rilis
```

### Feature flag & rollback

```text
- Fitur berisiko di balik flag (default off), dinyalakan bertahap (internal → 10% → 100%)
- Rollback cepat: deploy ulang image sebelumnya (tag immutable), atau matikan flag
- Migrasi harus kompatibel dengan image sebelumnya agar rollback aman
```

### Checklist production readiness

```text
□ Env divalidasi · secret dari secret manager · tidak ada nilai default berbahaya
□ Image non-root, ter-scan, versi ter-pin
□ /health/live & /health/ready · graceful shutdown · ≥ 2 instance
□ Timeout di semua panggilan keluar · rate limit · body limit · helmet/CORS
□ Migrasi expand-contract · lock_timeout · index CONCURRENTLY
□ Log terstruktur · metrik RED/USE · trace · alert SLO · dashboard
□ Backup otomatis + uji restore · RPO/RTO tertulis
□ Runbook: deploy, rollback, insiden, restore · on-call jelas
□ Kompatibel dengan versi aplikasi mobile yang masih didukung
```

## Best Practices

- **Konfigurasi tervalidasi & secret terkelola**.
- **Image kecil, non-root, ter-scan, immutable tag**.
- **Zero-downtime deploy** dengan readiness, draining, dan graceful shutdown.
- **Migrasi expand-contract** dan kompatibel mundur.
- **Observability sebelum launch**, alert berbasis gejala.
- **Rollback & feature flag** sebagai rencana standar.

## Anti-Patterns

- `npm start` dengan `ts-node` di produksi.
- Migrasi yang menghapus/mengganti kolom dalam rilis yang sama dengan perubahan kode.
- Deploy hari Jumat sore tanpa rencana rollback.
- Alert untuk setiap error tunggal (alert fatigue).
- Konfigurasi produksi diedit manual di server.

## Performance Considerations

Pantau performa per rilis: bandingkan p95 dan error rate sebelum dan sesudah deploy (canary). Atur ukuran pool koneksi
sesuai jumlah instance, dan jalankan backfill data dalam batch kecil di luar jam sibuk agar tidak membebani database.

## Security Considerations

Jalankan sebagai non-root, minimalkan paket di image, patch base image rutin, batasi akses jaringan antar layanan,
aktifkan audit akses produksi dengan MFA, dan jangan pernah membuka port database ke internet.

## Real-World Use Cases

- Rilis dengan perubahan skema uang dilakukan dalam tiga tahap expand-contract tanpa downtime dan tanpa merusak aplikasi versi lama.
- Canary 10% menunjukkan p95 naik 3×, rollback otomatis dalam 5 menit.

## Interview Questions

1. Apa saja yang Anda periksa sebelum layanan masuk produksi?
2. Bagaimana melakukan migrasi database tanpa downtime?
3. Bagaimana deploy tanpa memutus request yang sedang berjalan?
4. Metrik apa yang Anda pantau untuk API?

## Sample Answers

1. Konfigurasi dan secret, image yang aman, health check dan graceful shutdown, redundansi, timeout/rate limit, migrasi aman, observability dan alert, backup teruji, runbook, serta kompatibilitas dengan klien lama.
2. Pola expand-contract: tambah struktur baru yang kompatibel, tulis ke keduanya, backfill bertahap, pindahkan pembacaan, lalu hapus struktur lama di rilis berikutnya. Gunakan index CONCURRENTLY, constraint NOT VALID lalu VALIDATE, dan lock_timeout.
3. Rolling deploy dengan readiness check untuk instance baru, connection draining di load balancer, dan graceful shutdown pada SIGTERM yang menyelesaikan request berjalan sebelum proses berhenti.
4. RED per route (request rate, error rate, durasi p95/p99) dan USE untuk resource (CPU, memori, koneksi DB, panjang antrean), ditambah metrik bisnis penting dan semuanya dibandingkan per versi rilis.

## Practical Exercises

1. Audit layanan Anda dengan checklist production readiness.
2. Implementasikan graceful shutdown dan readiness yang mengembalikan 503 saat shutdown.
3. Rencanakan migrasi expand-contract untuk satu perubahan kolom.

## Quick Reference

```text
Env zod + secret manager · image non-root, pinned, scanned · ≥ 2 instance
live/ready · SIGTERM: ready=503 → tunggu → app.close() → db.end()
Migrasi: expand → backfill → switch → contract · CONCURRENTLY · NOT VALID + VALIDATE · lock_timeout
Observability: logs + RED/USE + traces + alert SLO · dashboard per rilis
Feature flag · rollback image immutable · runbook · backup + restore teruji
```

## Related Topics

- [Server Deployment](/devops/server-deployment/)
- [Rollback Strategy](/devops/rollback-strategy/)
- [Availability, Reliability & High Availability](/system-design/concepts/availability-reliability/)
