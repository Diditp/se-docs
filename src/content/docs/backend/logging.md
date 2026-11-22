---
title: "Logging"
description: "Logging di backend Node.js untuk sistem produksi: structured logging dengan pino, level & kapan dipakai, konteks (request ID, user, tenant), log per request, redaksi data sensitif, logging error yang benar, pengiriman log ke sistem terpusat, retensi & biaya, sampling, hubungan dengan metrics dan tracing (OpenTelemetry), serta audit log."
level: intermediate
status: complete
version: "Node.js 22 · pino 9.x · OpenTelemetry. Cek dokumentasi untuk API terbaru"
updated: 2026-11-13
tags: [backend, logging, pino, observability, opentelemetry, audit]
---

## Overview

**Log** adalah catatan kejadian di aplikasi. Di produksi, log yang baik memungkinkan Anda menjawab: "apa yang terjadi
pada request pengguna X pukul 12.03?" tanpa akses ke server. Kuncinya adalah **structured logging**: setiap log berupa
objek JSON dengan field konsisten yang bisa dicari dan difilter.

Sisi mobile (Crashlytics, breadcrumb) dibahas di [Logging & Error Tracking](/testing-performance/logging-error-tracking/).

## Why It Matters

Log teks bebas (`console.log("error " + e)`) sulit dicari, tidak memiliki konteks, dan sering membocorkan data sensitif.
Saat insiden, tim kehilangan waktu berharga. Log terstruktur dengan request ID membuat keluhan pengguna dapat ditelusuri
dari aplikasi mobile sampai query database.

## Core Concepts

| Level | Kapan | Contoh |
| --- | --- | --- |
| `fatal` | Proses tidak bisa berlanjut | Gagal terhubung DB saat startup |
| `error` | Operasi gagal dan perlu perhatian | Payment gateway error tak terduga |
| `warn` | Anomali yang tertangani | Retry ke-3, konfigurasi deprecated |
| `info` | Peristiwa bisnis/operasional penting | Order dibuat, job selesai, server start |
| `debug` | Detail untuk investigasi (mati di produksi secara default) | Parameter query |
| `trace` | Sangat rinci | Jarang dipakai |

| Pilar observability | Menjawab |
| --- | --- |
| Logs | Apa yang terjadi (detail per kejadian) |
| Metrics | Berapa banyak/berapa cepat (agregat, murah, untuk alert) |
| Traces | Di mana waktu dihabiskan lintas layanan |

## How It Works

```text
Request masuk → requestId (dari header atau baru) → child logger dengan konteks (requestId, userId, tenantId, route)
→ log di titik penting → respons (log akses: status, durasi)
→ stdout JSON → agen/log shipper → sistem terpusat (Loki, Elasticsearch/OpenSearch, Cloud Logging, Datadog)
→ pencarian, dashboard, alert
```

## Implementation

### Konfigurasi pino

```ts
import pino from 'pino';

export const logger = pino({
  level: env.LOG_LEVEL ?? 'info',
  base: { service: 'pos-api', version: env.APP_VERSION, env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.pin', '*.otp',
            '*.token', '*.refreshToken', '*.cardNumber', '*.nik'],
    censor: '[REDACTED]',
  },
  // Di development saja: transport pino-pretty untuk keterbacaan
});
```

Tulis ke **stdout** dalam JSON. Biarkan platform (Docker, Kubernetes, Cloud Run) mengumpulkannya. Aplikasi tidak perlu
mengelola file log.

### Konteks per request (Fastify)

```ts
const app = Fastify({
  loggerInstance: logger,
  genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
  requestIdHeader: 'x-request-id',
});

app.addHook('onRequest', async (req, reply) => {
  reply.header('x-request-id', req.id);
});
app.addHook('preHandler', async (req) => {
  if (req.user) req.log = req.log.child({ userId: req.user.id, tenantId: req.user.tenantId });
});
```

Gunakan `req.log` di handler dan teruskan logger/konteks ke service (parameter atau AsyncLocalStorage) agar log dari
lapisan dalam tetap membawa request ID.

### Apa yang dicatat

```ts
// ✅ peristiwa bisnis dengan field terstruktur
req.log.info({ orderId, outletId, total, itemCount: items.length, paymentMethod }, 'order created');

// ✅ error dengan objek error (stack) di field err, pesan singkat
req.log.error({ err, orderId, provider: 'xendit' }, 'payment charge failed');

// ❌ string gabungan, data sensitif, log di setiap baris loop
console.log('order ' + JSON.stringify(order) + ' user ' + user.email);
```

Prinsip: **catat error sekali**, di tempat error ditangani (error handler atau titik yang memutuskan). Jangan log di setiap
lapisan lalu melempar ulang, karena satu kejadian menjadi lima entri.

### Log akses

```text
Satu baris per request: method, route (pola, bukan URL dengan ID), status, durasi ms, requestId, userId, ukuran respons
Fastify/pino sudah mencatat request & response secara default. Atur agar tidak mencatat body
Kecualikan health check yang sangat sering atau catat di level debug
```

### Tracing & korelasi (OpenTelemetry)

```ts
// Inisialisasi sebelum import aplikasi (mis. node --import ./otel.js dist/main.js)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
new NodeSDK({ instrumentations: [getNodeAutoInstrumentations()] }).start();
// Auto-instrumentasi HTTP, pg, redis → span. Instrumentasi pino dapat menyisipkan trace_id ke log
```

Dengan `trace_id` di log, Anda dapat melompat dari satu baris log ke trace lengkap request tersebut.

### Audit log (berbeda dari log aplikasi)

```text
Audit log = catatan siapa melakukan apa terhadap data penting (refund, ubah harga, ubah peran)
- Disimpan di tabel/penyimpanan append-only, retensi panjang sesuai kebijakan
- Field: actor, action, target, before/after (seperlunya), waktu, IP/perangkat, alasan
- Tidak dihapus oleh rotasi log biasa, akses dibatasi
```

### Retensi, biaya, sampling

```text
- Retensi log aplikasi: mis. 14–30 hari panas, arsip lebih murah bila perlu
- Level info di produksi, debug dapat diaktifkan sementara per layanan
- Sampling untuk log volume sangat tinggi (mis. 10% log akses sukses, 100% error)
- Pantau volume log per layanan: lonjakan sering berarti bug (loop log)
```

## Best Practices

- **JSON terstruktur ke stdout** dengan field konsisten.
- **Request ID** diterima dari klien/gateway dan dikembalikan di respons.
- **Child logger berkonteks** (user, tenant, route).
- **Redaksi data sensitif** secara terpusat.
- **Error dicatat sekali** dengan objek error lengkap.
- **Hubungkan log, metrics, dan traces** (trace_id).

## Anti-Patterns

- `console.log` di produksi dengan string bebas.
- Mencatat body request/respons penuh, token, password, atau data pribadi.
- Log level debug aktif permanen di produksi.
- URL dengan ID sebagai label metrik/route (kardinalitas tinggi).
- Menulis file log sendiri di container (hilang dan memenuhi disk).

## Performance Considerations

pino dirancang sangat cepat (serialisasi minimal, penulisan asinkron). Hindari `JSON.stringify` objek besar di log,
gunakan level yang tepat, dan sampling untuk volume tinggi. Pretty printing hanya di development.

## Security Considerations

Log adalah data sensitif: batasi akses, terapkan retensi, dan redaksi PII/secret sebelum keluar dari proses. Waspadai
log injection (newline dari input pengguna) yang ditangani dengan logging terstruktur. Jangan mencatat seluruh header.

## Real-World Use Cases

- Keluhan "pembayaran gagal" dengan request ID dari aplikasi → satu pencarian menampilkan log API, error gateway, dan trace.
- Alert dari lonjakan log `payment charge failed` per menit.

## Interview Questions

1. Apa itu structured logging dan mengapa penting?
2. Bagaimana menelusuri satu request lintas layanan?
3. Data apa yang tidak boleh masuk log?
4. Apa beda log aplikasi dan audit log?

## Sample Answers

1. Log sebagai objek terstruktur (JSON) dengan field konsisten seperti level, waktu, requestId, dan userId, sehingga mudah dicari, difilter, dan diagregasi dibanding teks bebas.
2. Dengan request/correlation ID yang dibuat di tepi (atau oleh aplikasi mobile), diteruskan lewat header ke semua layanan dan dicatat di setiap log, ditambah distributed tracing (OpenTelemetry) dengan trace_id di log.
3. Password, token, header Authorization/cookie, OTP/PIN, data kartu, NIK, dan data pribadi lain yang tidak diperlukan. Gunakan redaksi terpusat.
4. Log aplikasi untuk operasional dan debugging dengan retensi pendek. Audit log mencatat siapa melakukan apa terhadap data penting untuk akuntabilitas, append-only, dengan retensi lebih panjang dan akses terbatas.

## Practical Exercises

1. Ganti `console.log` dengan pino + redaksi + request ID.
2. Teruskan `X-Request-Id` dari aplikasi Flutter dan temukan request tersebut di log.
3. Buat tabel audit log untuk refund dan perubahan harga.

## Quick Reference

```text
pino JSON → stdout → log shipper → sistem terpusat
Level: fatal · error · warn · info (produksi) · debug (sementara)
genReqId dari x-request-id · child logger {userId, tenantId} · error dicatat sekali dengan {err}
redact: authorization, cookie, password, pin, otp, token, cardNumber, nik
Logs + metrics + traces (OpenTelemetry, trace_id) · audit log terpisah, append-only
```

## Related Topics

- [Logging & Error Tracking (Mobile)](/testing-performance/logging-error-tracking/)
- [Monitoring & Observability](/devops/monitoring-observability/)
- [Validation & Error Handling](/backend/validation-error-handling/)
