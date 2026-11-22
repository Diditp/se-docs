---
title: "Debugging & Performance Questions"
description: "Bank pertanyaan interview debugging dan performa: metodologi debugging, membaca stack trace & log, crash reporting, profiling Flutter (jank, memori, startup), performa jaringan & database, backend latency, serta observability — dengan jawaban ringkas."
level: advanced
status: complete
updated: 2026-11-12
tags: [interview, debugging, performance, profiling, observability, question-bank]
---

## Overview

Pertanyaan debugging & performa memisahkan engineer yang "bisa membuat fitur" dari yang "bisa menjaga fitur tetap
berjalan baik". Interviewer ingin mendengar **metodologi** (reproduksi, ukur, hipotesis, verifikasi) dan **alat** yang
tepat, idealnya dengan cerita nyata dan angka.

## Why It Matters

Pengguna merasakan performa secara langsung (aplikasi lambat, patah-patah, boros baterai). Bug yang sulit (race
condition, memory leak, crash di perangkat tertentu) membutuhkan pendekatan sistematis, bukan tebakan.

## Core Concepts

### Metodologi debugging

```text
1. Reproduksi (langkah, data, perangkat, versi)   2. Kumpulkan bukti (log, stack trace, metrik)
3. Persempit (bisect, isolasi komponen)           4. Hipotesis → uji satu per satu
5. Perbaiki akar masalah + test regresi           6. Verifikasi di production (monitoring)
```

### Alat

| Area | Alat |
| --- | --- |
| Flutter | DevTools (Performance, CPU Profiler, Memory, Network, Inspector), `--profile`, `debugPrint`, `flutter logs` |
| Android | Logcat, Android Studio Profiler, LeakCanary, StrictMode, Android vitals |
| Crash & error | Firebase Crashlytics / Sentry, symbol upload untuk build obfuscate |
| Backend | Log terstruktur + request id, APM/tracing (OpenTelemetry), `--inspect`, flame graph |
| Database | `EXPLAIN ANALYZE`, slow query log, `pg_stat_statements` |
| Jaringan | Charles/Proxyman, DevTools Network, HAR |

### Metrik penting

| Area | Metrik |
| --- | --- |
| Mobile UI | Frame build/raster time (target 60/120 fps → ±16,7/8,3 ms per frame), jank |
| Startup | Time to first frame / time to interactive |
| Stabilitas | Crash-free users/sessions, ANR rate |
| Backend | Latency p50/p95/p99, error rate, throughput, saturasi |

## How It Works

```text
Jank Flutter: UI thread (build/layout) lambat? → rebuild berlebih, layout mahal, kerja sinkron berat
              Raster thread lambat? → saveLayer/opacity/clip/shadow, gambar besar, shader compilation
Memori naik terus → objek tertahan: controller/subscription tidak di-dispose, cache tanpa batas, listener global
API lambat → ukur di mana waktunya: jaringan, server (DB? service lain?), parsing di klien
```

## Implementation

```dart
// Mengukur durasi bagian kode di timeline DevTools
import 'dart:developer';
final result = Timeline.timeSync('parse-products', () => parseProducts(raw));

// Memindahkan parsing besar dari UI isolate
final products = await Isolate.run(() => parseProducts(raw));

// Mengurangi rebuild: pilih bagian state yang dibutuhkan saja
final total = context.select<CartBloc, int>((b) => b.state.total);

// Membatasi ukuran decode gambar
Image.network(url, cacheWidth: 300);

// Mencegah leak: dispose
@override
void dispose() {
  _controller.dispose();
  _subscription.cancel();
  super.dispose();
}

// Error global tercatat ke crash reporting
FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
PlatformDispatcher.instance.onError = (e, s) { FirebaseCrashlytics.instance.recordError(e, s, fatal: true); return true; };
```

## Best Practices

- **Ukur di mode profile pada perangkat nyata** (terutama low-end), bukan debug di emulator.
- **Satu perubahan, satu pengukuran** — bandingkan sebelum/sesudah.
- **Reproduksi sebelum memperbaiki**; tulis test yang gagal dulu bila memungkinkan.
- **Log terstruktur dengan konteks** (request id, user id ter-hash, versi app).
- **Pantau metrik production** dan tetapkan anggaran performa (startup, ukuran APK).

## Anti-Patterns

- Optimasi prematur tanpa data.
- Mengukur performa di debug mode.
- "Memperbaiki" dengan `try/catch` kosong yang menyembunyikan error.
- Menambahkan `Future.delayed` untuk "mengatasi" race condition.
- `print` berlebihan di production yang membocorkan data.

## Performance Considerations

Area optimasi umum: `const` widget & memecah widget, `ListView.builder` + pagination, cache & resize gambar,
`RepaintBoundary` untuk area animasi, isolate untuk CPU berat, mengurangi ukuran payload & jumlah request, index
database, query batching, cache di backend. Lihat [Rendering & Performance](/flutter/rendering-performance/) dan
[Memory Management](/flutter/memory-management/).

## Security Considerations

Log dan crash report tidak boleh memuat token, password, atau data pribadi lengkap; batasi akses ke dashboard
monitoring; gunakan build obfuscate dengan symbol yang disimpan aman untuk de-obfuscation.

## Real-World Use Cases

- Daftar produk ribuan item yang patah-patah di perangkat kasir low-end.
- Crash hanya terjadi di Android versi tertentu atau setelah process death.
- API laporan lambat di akhir bulan karena query tanpa index.
- Memori aplikasi naik setelah berpindah halaman berkali-kali.

## Interview Questions

1. Jelaskan cara Anda men-debug bug yang sulit direproduksi.
2. Bagaimana mendiagnosis jank di Flutter?
3. Apa beda UI thread dan raster thread di Flutter?
4. Bagaimana menemukan memory leak?
5. Bagaimana mempercepat startup aplikasi?
6. Bagaimana membaca dan memanfaatkan stack trace dari build obfuscate?
7. API terasa lambat dari aplikasi — bagaimana Anda menelusurinya?
8. Bagaimana menemukan query database yang lambat?
9. Apa itu p95/p99 latency dan kenapa lebih penting dari rata-rata?
10. Ceritakan optimasi performa yang pernah Anda lakukan.

## Sample Answers

1. Kumpulkan konteks (perangkat, versi, langkah, log, crash report), tambah logging/telemetri terarah, cari pola (jaringan lambat, memori rendah, process death, concurrency), coba reproduksi dengan kondisi serupa, lalu perbaiki dengan test yang mensimulasikannya.
2. Jalankan mode profile di perangkat nyata, lihat Performance view untuk frame yang melebihi anggaran, tentukan apakah UI atau raster thread yang lambat, gunakan CPU profiler & "track widget rebuilds", perbaiki penyebabnya, ukur ulang.
3. UI thread menjalankan kode Dart (build, layout, logika) dan menghasilkan layer tree; raster thread mengubah layer tree menjadi piksel via GPU. Keduanya harus selesai dalam anggaran frame.
4. DevTools Memory: ambil snapshot sebelum/sesudah navigasi berulang, bandingkan instance yang bertambah, telusuri retaining path; di Android native gunakan LeakCanary. Penyebab umum: controller/stream tidak di-dispose, listener statis, closure yang menahan context.
5. Ukur dulu (time to first frame), tunda inisialisasi yang tidak penting (lazy), paralelkan inisialisasi independen, kurangi kerja di `main()`, kecilkan aset awal, gunakan splash native yang tepat, dan untuk Android pertimbangkan Baseline Profiles.
6. Simpan file symbol dari `--split-debug-info` per versi build, unggah ke Crashlytics/Sentry, atau gunakan `flutter symbolize` untuk menerjemahkan stack trace menjadi nama fungsi dan baris.
7. Ukur di klien (timing request di DevTools/interceptor), bandingkan dengan latency server (log & tracing dengan request id), lihat breakdown server (DB, service eksternal), periksa ukuran payload & jumlah request; perbaiki di titik terbesar.
8. Slow query log / `pg_stat_statements` untuk menemukan query termahal, `EXPLAIN (ANALYZE, BUFFERS)` untuk melihat rencana, lalu tambah index, tulis ulang query, atau ubah pola akses (pagination, agregasi pra-hitung).
9. Persentil latency: 95%/99% request lebih cepat dari nilai itu. Rata-rata menyembunyikan ekor lambat yang dialami banyak pengguna nyata (terutama saat banyak request per halaman), sehingga SLO biasanya memakai persentil.
10. STAR dengan angka: gejala (mis. scroll jank pada daftar besar), pengukuran (frame time), penyebab (rebuild seluruh list, gambar besar), perbaikan (`builder`, `const`, cache/resize gambar, `select`), hasil (frame time turun, keluhan berkurang).

## Practical Exercises

1. Profil satu layar aplikasi Anda di mode profile; catat frame time sebelum/sesudah satu optimasi.
2. Buat leak sengaja (controller tidak di-dispose), temukan dengan DevTools Memory.
3. Jalankan `EXPLAIN ANALYZE` pada query laporan dan perbaiki dengan index.

## Quick Reference

```text
Reproduksi → bukti → persempit → hipotesis → fix + test → verifikasi production
Flutter: profile mode + DevTools · UI vs raster thread · const/split/select/isolate/cacheWidth/dispose
Crash: Crashlytics/Sentry + symbols · Backend: request id, tracing, p95/p99 · DB: EXPLAIN ANALYZE
Ukur sebelum & sesudah · jangan optimasi tanpa data
```

## Related Topics

- [Rendering & Performance](/flutter/rendering-performance/)
- [Memory Management](/flutter/memory-management/)
- [Handling Production Bugs](/interview/behavioral/production-bugs/)
- [Node.js Event Loop](/backend/nodejs-event-loop/)
