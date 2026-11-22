---
title: "Monitoring, Logging & Observability"
description: "Observability untuk backend yang melayani aplikasi mobile: monitoring vs observability, tiga pilar (logs, metrics, traces), metode RED/USE dan golden signals, OpenTelemetry, Prometheus & Grafana, alerting berbasis SLO dan error budget burn rate, dashboard, uptime/synthetic check, korelasi dengan monitoring mobile, on-call & runbook, serta biaya."
level: advanced
status: complete
version: "OpenTelemetry · Prometheus · Grafana · Loki/Tempo. Atau layanan terkelola (Cloud Monitoring, Datadog, New Relic, Grafana Cloud)"
updated: 2026-11-13
tags: [devops, observability, monitoring, opentelemetry, prometheus, alerting]
---

## Overview

- **Monitoring**: memantau hal yang sudah diketahui dapat salah (CPU tinggi, error rate naik) dan memberi alert.
- **Observability**: kemampuan memahami **mengapa** sistem berperilaku tertentu dari data yang dihasilkannya, termasuk masalah yang belum pernah diprediksi.

Observability dibangun dari **logs**, **metrics**, dan **traces** yang saling terhubung.

## Why It Matters

Tanpa observability, gangguan diketahui dari keluhan pengguna atau ulasan bintang satu, dan investigasi berubah menjadi
tebak-tebakan. Dengan data yang tepat, tim dapat menjawab "apa yang rusak, sejak kapan, untuk siapa, dan mengapa" dalam
hitungan menit.

## Core Concepts

| Pilar | Bentuk | Kegunaan | Biaya |
| --- | --- | --- | --- |
| Metrics | Angka agregat berlabel dari waktu ke waktu | Dashboard, alert, tren | Murah (bila kardinalitas label terkendali) |
| Logs | Kejadian terstruktur | Detail per kejadian, debugging | Sedang–mahal (volume) |
| Traces | Span bersarang lintas layanan | Menemukan di mana waktu dihabiskan | Sedang (sampling) |

| Kerangka | Isi |
| --- | --- |
| RED (layanan) | **R**ate, **E**rrors, **D**uration per endpoint |
| USE (resource) | **U**tilization, **S**aturation, **E**rrors untuk CPU, memori, disk, koneksi DB, antrean |
| Golden signals (Google SRE) | Latency, traffic, errors, saturation |

| Istilah | Arti |
| --- | --- |
| SLI / SLO | Indikator terukur / target (lihat [Availability](/system-design/concepts/availability-reliability/)) |
| Error budget burn rate | Seberapa cepat budget kegagalan terpakai. Dasar alert yang baik |
| Kardinalitas | Jumlah kombinasi nilai label. Label `userId` di metrik = ledakan biaya |
| Synthetic check | Probe terjadwal dari luar (uptime, alur login) |

## How It Works

```text
Aplikasi (OpenTelemetry SDK) → metrics (Prometheus/OTLP), logs (stdout JSON), traces (OTLP)
→ collector (OTel Collector/agent) → backend: Prometheus/Mimir, Loki, Tempo atau layanan terkelola
→ Grafana/console: dashboard + alert rules → notifikasi (Slack, PagerDuty, Opsgenie) → on-call + runbook
Korelasi: trace_id di log, exemplar di metrik, request ID dari aplikasi mobile
```

## Implementation

### Metrik RED dengan prom-client

```ts
import client from 'prom-client';
client.collectDefaultMetrics();                                   // CPU, memori, event loop lag Node

const httpDuration = new client.Histogram({
  name: 'http_server_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

app.addHook('onResponse', async (req, reply) => {
  httpDuration.observe(
    { method: req.method, route: req.routeOptions.url ?? 'unmatched', status: String(reply.statusCode) },
    reply.elapsedTime / 1000);
});
app.get('/metrics', async (_req, reply) => reply.type(client.register.contentType).send(await client.register.metrics()));
// /metrics hanya untuk jaringan internal/scraper, bukan publik
```

Alternatif: OpenTelemetry metrics SDK dengan exporter OTLP, sehingga satu SDK untuk metrik dan trace.

### Query & alert (PromQL)

```text
# Error rate 5xx per route (5 menit)
sum by (route) (rate(http_server_request_duration_seconds_count{status=~"5.."}[5m]))
  / sum by (route) (rate(http_server_request_duration_seconds_count[5m]))

# p95 latency
histogram_quantile(0.95, sum by (le, route) (rate(http_server_request_duration_seconds_bucket[5m])))
```

```yaml
# Alert berbasis burn rate SLO 99,9% (contoh multi-window sederhana)
- alert: ApiErrorBudgetBurnFast
  expr: |
    (sum(rate(http_server_request_duration_seconds_count{status=~"5.."}[5m]))
      / sum(rate(http_server_request_duration_seconds_count[5m]))) > (14.4 * 0.001)
    and
    (sum(rate(http_server_request_duration_seconds_count{status=~"5.."}[1h]))
      / sum(rate(http_server_request_duration_seconds_count[1h]))) > (14.4 * 0.001)
  for: 2m
  labels: { severity: page }
  annotations:
    summary: "API menghabiskan error budget dengan cepat"
    runbook: "https://wiki.example.com/runbooks/api-high-error-rate"
```

Faktor 14,4 berarti budget bulanan akan habis dalam ~2 hari bila laju ini berlanjut, sehingga layak membangunkan on-call.
Burn rate yang lebih lambat cukup menjadi tiket.

### Dashboard minimum per layanan

```text
Baris 1: traffic (rps), error rate, p50/p95/p99 latency, per route teratas
Baris 2: saturation: CPU, memori, event loop lag, koneksi DB terpakai/maks, panjang antrean job
Baris 3: dependensi: latency & error ke DB, Redis, payment gateway
Baris 4: deploy markers & versi revisi, metrik bisnis (order/menit)
```

### Synthetic & uptime

```text
- Probe /health/ready dari beberapa region tiap 1 menit
- Synthetic transaction: login akun uji → ambil katalog → (opsional) order sandbox, tiap 5–15 menit
- Cek kedaluwarsa sertifikat TLS & domain
```

### Menghubungkan dengan monitoring mobile

```text
Mobile: crash-free, ANR, startup, HTTP latency di perangkat (Crashlytics/Firebase Performance/Sentry)
Backend: RED per route
Korelasi: X-Request-Id dari aplikasi → log & trace backend · versi aplikasi sebagai atribut
Contoh: lonjakan timeout di aplikasi 2.5.0 + p95 /v1/sync naik → masalah backend, bukan aplikasi
```

### On-call & alert yang sehat

```text
- Alert hanya untuk gejala yang berdampak ke pengguna dan butuh tindakan, setiap alert punya runbook
- Severity: page (segera) vs ticket (jam kerja)
- Tinjau alert berisik secara rutin. Alert yang selalu diabaikan harus diperbaiki atau dihapus
- Postmortem tanpa menyalahkan setelah insiden
```

### Mengendalikan biaya

```text
Metrik: hindari label kardinalitas tinggi (userId, orderId, URL mentah) · histogram bucket secukupnya
Log: level info di produksi, sampling log sukses, retensi bertingkat
Trace: sampling (head 5–10% + tail sampling untuk error/lambat)
```

## Best Practices

- **RED per layanan, USE per resource**, dan metrik bisnis kunci.
- **OpenTelemetry** sebagai standar instrumentasi.
- **Alert berbasis SLO/burn rate**, dengan runbook.
- **Korelasi** log–trace–metrik dan request ID dari mobile.
- **Dashboard dengan penanda deploy** untuk melihat regresi per rilis.
- **Kendalikan kardinalitas & volume**.

## Anti-Patterns

- Alert untuk CPU 80% yang tidak berdampak ke pengguna (alert fatigue).
- Hanya memantau rata-rata latensi.
- Label metrik berisi ID pengguna atau URL lengkap.
- `/metrics` terbuka ke publik.
- Dashboard banyak tetapi tidak ada yang tahu harus dilihat saat insiden.

## Performance Considerations

Instrumentasi menambah overhead kecil. Histogram dan auto-instrumentation umumnya aman, tetapi trace 100% untuk trafik
tinggi mahal, jadi gunakan sampling. Pantau event loop lag Node sebagai sinyal blocking CPU.

## Security Considerations

Data observability dapat berisi informasi sensitif: redaksi PII di log & atribut span, batasi akses dashboard, jangan
mengekspos endpoint metrik/debug ke publik, dan terapkan retensi sesuai kebijakan privasi.

## Real-World Use Cases

- Alert burn rate membangunkan on-call saat payment gateway lambat. Trace menunjukkan 4 detik di span `payment.charge`, circuit breaker diaktifkan.
- Dashboard per revisi menunjukkan p95 `/v1/sync` naik 3× setelah deploy, lalu rollback.

## Interview Questions

1. Apa beda monitoring dan observability?
2. Apa itu RED dan USE?
3. Bagaimana mendesain alert yang tidak berisik?
4. Bagaimana menelusuri satu request yang lambat dari aplikasi mobile sampai database?

## Sample Answers

1. Monitoring memantau kondisi yang sudah diketahui dan memberi alert. Observability adalah kemampuan memahami perilaku sistem, termasuk masalah baru, dari logs, metrics, dan traces yang kaya konteks dan saling terhubung.
2. RED untuk layanan: rate, errors, duration per endpoint. USE untuk resource: utilization, saturation, errors untuk CPU, memori, disk, koneksi, dan antrean.
3. Alert pada gejala yang berdampak ke pengguna berdasarkan SLO (error budget burn rate multi-window), dengan severity jelas, runbook, dan peninjauan rutin untuk menghapus alert yang tidak ditindaklanjuti.
4. Aplikasi mengirim request ID/trace context. Backend mencatatnya di log dan membuat trace dengan span HTTP, DB, dan panggilan eksternal (OpenTelemetry), sehingga dari ID tersebut dapat dilihat log dan trace lengkap beserta span yang lambat.

## Practical Exercises

1. Tambahkan metrik RED dan endpoint `/metrics` internal ke API Anda.
2. Buat dashboard 4 baris seperti di atas dengan penanda deploy.
3. Tulis satu alert burn rate beserta runbook-nya.

## Quick Reference

```text
Logs (detail) · metrics (agregat, alert) · traces (di mana waktu habis) · OpenTelemetry
RED: rate, errors, duration · USE: utilization, saturation, errors · golden signals
Histogram + histogram_quantile p95 · label route (bukan URL) · tanpa userId di label
Alert: SLO burn rate multi-window, page vs ticket, runbook · synthetic & uptime · cert expiry
Korelasi: X-Request-Id + trace_id + versi app · biaya: sampling & retensi
```

## Related Topics

- [Logging (Backend)](/backend/logging/)
- [Crash Reporting & Mobile Monitoring](/devops/mobile-monitoring/)
- [Performance Monitoring](/testing-performance/performance-monitoring/)
