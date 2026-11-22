---
title: "Mobile Application Engineering"
description: "Peta jawaban interview untuk posisi mobile engineer: arsitektur app, state management, offline-first, integrasi API, keamanan, performa, testing, rilis, dan cara menceritakan pengalaman Flutter Anda."
level: intermediate
status: complete
updated: 2026-11-13
tags: [interview, company-prep, mobile, flutter, android]
---

## Overview

Ini adalah **halaman rangkuman** untuk interview mobile engineering: topik apa yang hampir pasti ditanyakan, jawaban
inti yang perlu Anda kuasai, dan tautan ke materi lengkap. Gunakan sebagai daftar periksa sebelum interview dan bahan
latihan menjawab lisan.

## Why It Matters

Mobile engineering adalah keunggulan utama profil Anda. Interviewer akan menggali lebih dalam di area ini daripada area
lain, sehingga jawaban harus **terstruktur, mendalam, dan dikaitkan dengan pengalaman nyata** (aplikasi transaksi,
penyimpanan lokal, offline).

## Core Concepts

Peta kompetensi dan materi pendalaman:

| Area | Yang harus bisa dijelaskan | Materi |
| --- | --- | --- |
| Dasar Flutter & Dart | Widget/Element/RenderObject, lifecycle, const, null safety | [Widget Lifecycle](/flutter/widget-lifecycle/), [Dart](/flutter/dart-fundamentals/) |
| Async | Future, Stream, Isolate, event loop | [Async](/flutter/async-programming/) |
| State management | Ephemeral vs app state, Bloc vs Riverpod, side effect | [State Management](/flutter/state-management/) |
| Arsitektur | Clean Architecture, feature-first, repository, DI | [Clean Architecture](/flutter/clean-architecture/) |
| Data | REST API, error mapping, local DB, offline-first, sync | [REST](/flutter/rest-api-integration/), [Offline-First](/flutter/offline-first/) |
| Native | Lifecycle Android, platform channel, background work | [Activity Lifecycle](/android/activity-lifecycle/), [Background](/flutter/background-processing/) |
| Kualitas | Testing, error handling, crash reporting | [Testing](/flutter/testing/), [Error Handling](/flutter/error-handling/) |
| Performa | Jank, rebuild, memori, startup | [Rendering](/flutter/rendering-performance/), [Memory](/flutter/memory-management/) |
| Keamanan | Token storage, secret, pinning, obfuscation | [Flutter Security](/flutter/security-best-practices/) |
| Rilis | Flavor, signing, staged rollout, OTA | [Build & Release](/flutter/build-release-deployment/), [OTA](/flutter/ota-update/) |

## How It Works

Struktur jawaban teknis yang konsisten (60–120 detik):

```text
1. Definisi singkat        → "Bloc adalah pola state management berbasis event → state…"
2. Cara kerja              → "Event masuk ke handler, handler memanggil use case, lalu emit state…"
3. Contoh dari pengalaman  → "Di app POS saya, CartBloc menangani ItemAdded, DiscountApplied…"
4. Trade-off / kapan tidak → "Untuk form sederhana saya pakai Cubit atau setState karena…"
```

## Implementation

### Cerita arsitektur aplikasi Anda (template 3 menit)

```markdown
**Produk & user:** Aplikasi <kasir/transaksi> untuk <N outlet / jenis user>; masalah bisnis: <…>.
**Arsitektur:** Flutter, Clean Architecture feature-first; Bloc untuk state; Dio + interceptor auth;
<SQLite/Drift> sebagai penyimpanan lokal; sinkronisasi <outbox + retry>.
**Keputusan penting & alasannya:**
- <Offline-first karena koneksi outlet tidak stabil → transaksi tetap jalan.>
- <UUID dari client + idempotency agar retry tidak membuat transaksi ganda.>
**Tantangan terbesar:** <bug/performa/sync> → bagaimana Anda menemukan dan memperbaikinya.
**Hasil:** <angka: crash-free, waktu transaksi, jumlah transaksi/hari, rating>.
**Jika diulang:** <apa yang akan Anda ubah dan mengapa>.
```

### Pertanyaan "deep dive" yang sering menyusul — siapkan jawabannya

| Pertanyaan lanjutan | Inti jawaban |
| --- | --- |
| "Bagaimana jika dua kasir menjual stok terakhir saat offline?" | Ledger stok, stok minus dilaporkan untuk opname; server menjumlahkan delta |
| "Kenapa tidak Riverpod?" | Konsistensi tim, keterlacakan event untuk alur transaksi; keduanya valid |
| "Bagaimana token disimpan?" | Refresh di secure storage, access di memori, refresh single-flight |
| "Bagaimana Anda tahu ada crash di production?" | Crashlytics + simbol obfuscation, alert crash-free per rilis |
| "Bagaimana memastikan update tidak merusak data lokal?" | Migrasi schema bertahap + test migrasi dari versi lama |
| "Bagaimana mengukur performa?" | Profile mode di device nyata, DevTools, anggaran 16 ms |

### Android native yang perlu dikuasai sebagai Flutter developer

- Activity lifecycle & process death (berdampak ke `AppLifecycleState`).
- Permission runtime (kamera, lokasi, notifikasi Android 13+).
- WorkManager untuk background sync; batasan background modern.
- Platform channel / pigeon untuk integrasi printer, scanner, SDK vendor.
- Signing, Play App Signing, AAB, R8.

## Best Practices

- **Hubungkan setiap konsep dengan pengalaman nyata** — interviewer mencari bukti, bukan hafalan.
- **Akui trade-off**; "tergantung" diikuti alasan konkret adalah jawaban senior.
- **Gunakan istilah yang tepat** (idempotency, single source of truth, exhaustive state).
- **Siapkan 2–3 bug/insiden nyata** dengan cara diagnosis & pencegahan.
- **Kuasai sisi server dari API yang Anda pakai** (status code, pagination, auth) — menunjukkan pemahaman end-to-end.

## Anti-Patterns

- Menjawab hanya nama library ("pakai Bloc, Dio, GetX") tanpa alasan.
- Mengklaim pernah memakai teknologi yang tidak bisa dijelaskan detailnya.
- Menyalahkan backend/tim lain untuk setiap masalah.
- Jawaban terlalu panjang tanpa struktur.

## Performance Considerations

Siapkan angka performa dari app Anda (waktu startup, frame rendering, ukuran APK, waktu sync) dan cara mengukurnya —
angka membuat jawaban kredibel. Jika tidak punya data, jelaskan bagaimana Anda **akan** mengukurnya.

## Security Considerations

Tunjukkan kebiasaan aman: tidak ada secret di app, secure storage, validasi deep link, obfuscation, otorisasi di server,
dan tidak me-log data sensitif. Untuk aplikasi pelanggan perusahaan besar, kesadaran perlindungan data pribadi bernilai tinggi.

## Real-World Use Cases

- Aplikasi pelanggan: registrasi, tagihan, pembayaran, lapor gangguan, notifikasi status.
- Aplikasi petugas lapangan: work order offline, foto, GPS, tanda tangan, sinkronisasi.
- Aplikasi internal: approval, absensi, inspeksi aset.

## Interview Questions

1. Jelaskan arsitektur aplikasi terakhir Anda.
2. Bagaimana Anda menangani state management dan mengapa memilih pendekatan itu?
3. Bagaimana aplikasi Anda bekerja saat offline?
4. Bagaimana mengamankan token dan data sensitif di aplikasi mobile?
5. Bagaimana Anda mendiagnosis aplikasi yang lambat atau crash?
6. Apa beda Flutter dan native Android, dan kapan Anda memilih native?

## Sample Answers

1. Gunakan template cerita arsitektur di atas: produk, arsitektur berlapis, keputusan & alasan, tantangan, hasil terukur.
2. Bloc/Cubit dengan sealed state; Bloc untuk alur dengan banyak event (keranjang, sync) karena keterlacakan & transformer konkurensi, Cubit untuk layar sederhana; side effect di BlocListener; diuji dengan bloc_test.
3. Database lokal sebagai sumber data UI, transaksi ditulis bersama outbox dalam satu transaksi, ID dari client, sinkronisasi idempotent dengan backoff, status sync ditampilkan ke user.
4. Refresh token di secure storage, access token di memori, HTTPS (pinning bila risiko tinggi), tidak ada secret di app, obfuscation, logout membersihkan data, otorisasi tetap di server.
5. Reproduksi di profile mode, DevTools Performance/Memory untuk jank & leak; Crashlytics dengan simbol untuk crash, lalu regression test sebelum perbaikan dirilis.
6. Flutter: satu codebase multi-platform, UI konsisten, time-to-market cepat. Native: integrasi OS/hardware sangat dalam, fitur platform terbaru, ukuran app minimal. Sering hybrid: Flutter + platform channel untuk bagian native.

## Practical Exercises

1. Tulis cerita arsitektur 3 menit dengan template di atas dan rekam.
2. Jawab 6 pertanyaan "deep dive" secara lisan masing-masing ≤ 2 menit.
3. Lakukan satu sesi [Interview Simulator](/learning/interview-simulator/) dengan filter domain Flutter.

## Quick Reference

```text
Jawaban: definisi → cara kerja → contoh nyata → trade-off
Siapkan: cerita arsitektur 3 menit · 2–3 insiden nyata · angka performa/kualitas
Wajib kuasai: lifecycle · async/isolate · Bloc · Clean Architecture · offline-first & sync · token storage · testing · rilis
```

## Related Topics

- [Flutter & Dart (menu 02)](/flutter/)
- [Flutter & Dart Questions](/interview/technical/flutter-dart/)
- [Explaining Previous Work Experience](/interview/behavioral/explaining-experience/)
- [Portfolio & Project Explanation](/interview/company-prep/portfolio/)
