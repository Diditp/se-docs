---
title: "Performance Monitoring"
description: "Memantau performa aplikasi di production: lab vs field data, metrik mobile (startup, frame rendering, ANR, network latency, crash-free), Android vitals, Firebase Performance Monitoring, custom trace, percentiles (p50/p95/p99), SLO, performance budget, dan regresi per versi."
level: intermediate
status: complete
version: "Firebase Performance Monitoring · Play Console Android vitals · Sentry Performance — cek dokumentasi resmi"
updated: 2026-11-13
tags: [performance, monitoring, observability, android-vitals, slo]
---

## Overview

**Performance monitoring** mengukur performa aplikasi **di perangkat dan jaringan pengguna sungguhan** secara
berkelanjutan. Profiling di laptop menjawab "mengapa lambat"; monitoring menjawab "apakah lambat, untuk siapa, dan sejak
versi berapa".

## Why It Matters

Performa di lab (perangkat flagship, Wi-Fi kantor) berbeda jauh dengan pengguna nyata. Play Store memakai Android vitals
(misalnya tingkat ANR dan crash yang berlebihan) yang dapat memengaruhi visibilitas aplikasi.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Lab data | Diukur di lingkungan terkontrol (benchmark, profiling) |
| Field data (RUM) | Diukur dari pengguna nyata |
| Percentile | p50 = median, p95/p99 = pengalaman pengguna yang paling lambat |
| SLI / SLO | Indikator terukur / target (mis. p95 cold start < 3 s untuk 95% hari) |
| Performance budget | Batas yang tidak boleh dilampaui (ukuran app, startup, request per layar) |

### Metrik mobile utama

| Metrik | Sumber |
| --- | --- |
| Crash-free users/sessions | Crashlytics/Sentry, Play Console |
| ANR rate (Android) | Play Console Android vitals |
| Cold/warm start | Android vitals, Firebase Performance (app start trace) |
| Slow/frozen frames | Firebase Performance (screen traces), vitals |
| Network latency & success rate | Firebase Performance (HTTP traces), APM backend |
| Custom flow duration | Custom trace (mis. checkout, sinkronisasi) |

## How It Works

```text
SDK mengumpulkan trace (otomatis: startup, layar, HTTP; manual: custom trace) → sampling → kirim batch
→ agregasi per versi app, perangkat, negara, jaringan → dashboard percentiles → alert bila melewati ambang
→ korelasikan dengan rilis → investigasi dengan profiling
```

## Implementation

### Custom trace di Flutter (Firebase Performance)

```dart
Future<Receipt> checkout(Cart cart) async {
  final trace = FirebasePerformance.instance.newTrace('checkout_flow');
  await trace.start();
  trace.putAttribute('payment_method', cart.paymentMethod.name);     // atribut berkardinalitas rendah
  try {
    final receipt = await _repo.checkout(cart);
    trace.setMetric('item_count', cart.items.length);
    return receipt;
  } finally {
    await trace.stop();
  }
}
```

### HTTP metric untuk client kustom (bila tidak otomatis)

```dart
final metric = FirebasePerformance.instance.newHttpMetric(url, HttpMethod.Post);
await metric.start();
final res = await dio.post(url, data: body);
metric
  ..httpResponseCode = res.statusCode
  ..responseContentType = res.headers.value('content-type')
  ..responsePayloadSize = int.tryParse(res.headers.value('content-length') ?? '');
await metric.stop();
```

*(Dapat dibungkus sebagai Dio interceptor; jangan sertakan query berisi data pribadi di URL.)*

### Mengapa percentiles, bukan rata-rata

```text
Startup: 9 pengguna 1 s, 1 pengguna 11 s → rata-rata 2 s (terlihat baik), p95 ≈ 11 s (pengguna menderita)
Pantau p50 untuk tipikal, p95/p99 untuk ekor yang sering menjadi keluhan.
```

### Contoh SLO & budget

| Area | SLO/Budget |
| --- | --- |
| Crash-free users | ≥ 99,5% per versi |
| ANR rate | Di bawah ambang Android vitals |
| Cold start p95 (perangkat low-end) | < 3 s |
| Checkout flow p95 | < 2 s online |
| API `/v1/orders` p95 | < 300 ms |
| Ukuran AAB/APK per ABI | Naik maks 5% per rilis tanpa justifikasi |

### Menghubungkan dengan rilis

```text
Staged rollout 10% → bandingkan metrik versi baru vs lama (segmen perangkat sama)
→ regresi signifikan? → halt rollout → investigasi (profiling) → patch
```

## Best Practices

- **Pantau per versi app** untuk mendeteksi regresi.
- **Gunakan percentiles dan segmentasi** (perangkat low-end, jaringan seluler).
- **Custom trace untuk alur bisnis** (checkout, sinkronisasi, login).
- **Tetapkan SLO & budget** yang realistis, tinjau berkala.
- **Alert berdasarkan perubahan bermakna**, bukan noise.
- **Gabungkan dengan monitoring backend** (latensi API dari sisi server).

## Anti-Patterns

- Hanya memantau rata-rata.
- Atribut trace berkardinalitas tinggi (user ID, order ID) — mahal dan sering tidak diizinkan.
- Mengumpulkan data tanpa ada yang melihat dashboard.
- Mengandalkan pengujian di perangkat flagship saja.

## Performance Considerations

SDK monitoring menambah overhead kecil (CPU, jaringan, ukuran app). Gunakan sampling bila volume tinggi dan nonaktifkan
instrumentasi berlebihan di jalur sangat panas.

## Security Considerations

Jangan memasukkan PII atau token di nama trace, atribut, atau URL. Hormati pilihan pengguna untuk pengumpulan data dan
dokumentasikan di kebijakan privasi serta formulir data safety Play/Privacy label App Store.

## Real-World Use Cases

- Rilis 2.3.0 menaikkan p95 cold start dari 2,1 s ke 3,4 s di perangkat RAM 3 GB → ditemukan init SDK baru di `main()`.
- Custom trace `sync_outbox` menunjukkan p99 30 s di jaringan 3G → batch size diturunkan.

## Interview Questions

1. Apa beda lab data dan field data?
2. Metrik performa apa yang Anda pantau untuk aplikasi mobile?
3. Mengapa memakai p95 bukan rata-rata?
4. Apa itu SLO dan performance budget?
5. Bagaimana mendeteksi regresi performa setelah rilis?

## Sample Answers

1. Lab data diukur di lingkungan terkontrol untuk analisis dan benchmark; field data dari pengguna nyata dengan keragaman perangkat dan jaringan.
2. Crash-free users, ANR rate, cold/warm start, slow & frozen frames, latensi dan tingkat sukses request, serta durasi alur bisnis penting.
3. Rata-rata menyembunyikan ekor distribusi; p95/p99 menunjukkan pengalaman pengguna yang paling lambat, yang sering paling banyak mengeluh.
4. SLO adalah target terukur atas indikator layanan; performance budget adalah batas maksimal metrik (ukuran, waktu, jumlah request) yang dijaga di setiap perubahan.
5. Bandingkan metrik per versi selama staged rollout, alert saat ambang terlampaui, lalu hentikan rollout dan investigasi dengan profiling.

## Practical Exercises

1. Tambahkan custom trace untuk dua alur bisnis utama.
2. Definisikan 5 SLO untuk aplikasi Anda.
3. Buat checklist pemeriksaan metrik sebelum menaikkan persentase rollout.

## Quick Reference

```text
Lab vs field · p50/p95/p99 · per versi & segmen · SLI/SLO · budget
Crash-free · ANR · startup · slow/frozen frames · HTTP latency · custom trace
Atribut berkardinalitas rendah · tanpa PII · staged rollout + halt
```

## Related Topics

- [Logging & Error Tracking](/testing-performance/logging-error-tracking/)
- [Startup Optimization](/testing-performance/startup-optimization/)
- [Mobile Monitoring & Crash Reporting](/devops/mobile-monitoring/)
