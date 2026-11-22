---
title: "Flutter vs Native Android"
description: "Perbandingan Flutter dan Android native (Kotlin/Compose) dari sisi arsitektur rendering, performa, akses platform, ukuran aplikasi, produktivitas tim, ekosistem, dan kebutuhan bisnis — plus opsi hybrid (add-to-app, platform view, Kotlin Multiplatform) dan cara menjawab pertanyaan ini di interview."
level: intermediate
status: complete
version: "Flutter 3.x (Impeller) · Android Compose · Kotlin Multiplatform — kondisi ekosistem berubah, cek sumber resmi"
updated: 2026-11-13
tags: [android, flutter, cross-platform, comparison, kmp]
---

## Overview

Pertanyaan "**Flutter atau native?**" tidak punya satu jawaban benar — jawabannya bergantung pada kebutuhan produk,
platform target, tim, dan integrasi perangkat. Sebagai Flutter developer yang memahami Android, Anda diharapkan bisa
menjelaskan **trade-off** secara objektif, bukan membela satu teknologi.

## Why It Matters

Pertanyaan ini sering muncul di interview (terutama posisi Flutter di perusahaan yang juga punya tim native) dan dalam
keputusan teknis nyata (mis. modul pembayaran atau integrasi perangkat keras).

## Core Concepts

| Aspek | Flutter | Native Android (Kotlin + Compose) |
| --- | --- | --- |
| Platform | Android, iOS, web, desktop dari satu codebase | Android (iOS terpisah, kecuali KMP untuk logika/Compose Multiplatform) |
| Rendering | Engine sendiri (Impeller/Skia) menggambar semua piksel | Toolkit UI Android (Compose/View) |
| Bahasa | Dart | Kotlin |
| Akses API platform | Plugin / platform channel / FFI | Langsung, fitur baru tersedia hari pertama |
| Performa UI | Sangat baik untuk sebagian besar aplikasi; perhatikan jank & startup | Optimal & paling dekat dengan platform |
| Ukuran aplikasi | Ada overhead engine (beberapa MB) | Lebih kecil untuk aplikasi sederhana |
| Konsistensi UI | Identik lintas platform | Mengikuti platform |
| Produktivitas | Satu tim, hot reload, satu codebase | Dua codebase untuk Android & iOS |
| Fitur khusus OS (widget layar utama, Wear OS, auto, integrasi sistem dalam) | Butuh kode native | Natural |

## How It Works

```text
Flutter: Dart (UI + logika) → engine → Impeller/Skia → canvas di atas Activity (FlutterView)
         Fitur platform → MethodChannel/Pigeon/FFI → Kotlin/Swift
Native : Kotlin → Compose/View → Android rendering pipeline
Hybrid : Add-to-app (modul Flutter di aplikasi native) · Platform View (view native di Flutter) · KMP (logika bersama)
```

## Implementation

### Kerangka keputusan

| Kondisi | Kecenderungan |
| --- | --- |
| Butuh Android + iOS cepat, tim kecil, UI kustom branded | Flutter |
| Aplikasi internal/lapangan lintas perangkat, offline-first, CRUD + transaksi | Flutter (atau native bila hanya Android & perangkat khusus) |
| Integrasi perangkat keras/SDK native berat (POS terminal, scanner, kamera lanjutan, AR) | Native, atau Flutter + modul native yang kuat |
| Hanya Android, memakai fitur terbaru OS, Wear/Auto/TV | Native |
| Sudah punya aplikasi native besar dan ingin berbagi fitur baru | Add-to-app atau KMP |
| Performa grafis/animasi ekstrem, game | Native/engine game |
| Tim sudah ahli satu teknologi | Teknologi tim saat ini (biaya peralihan nyata) |

### Contoh opsi hybrid

```text
1. Flutter app + plugin native: printer Bluetooth, scanner, SDK pembayaran via MethodChannel/Pigeon
2. Add-to-app: aplikasi native lama menambahkan fitur baru berbasis Flutter (FlutterEngine di-cache)
3. Platform View: menampilkan peta/kamera native di dalam layar Flutter (ada biaya performa)
4. Kotlin Multiplatform: logika bisnis/data bersama Android–iOS, UI tetap native (atau Compose Multiplatform)
```

### Cara menjawab di interview (struktur)

```text
"Tergantung kebutuhan." → sebutkan 3–4 faktor (platform target, integrasi perangkat, tim, waktu ke pasar, performa)
→ beri contoh nyata dari pengalaman (mis. Flutter untuk kasir + modul native untuk printer)
→ sebutkan kelemahan pilihan Anda dan mitigasinya
```

## Best Practices

- **Putuskan berdasarkan kebutuhan & tim**, dokumentasikan dengan ADR.
- **Isolasi kode platform** di plugin/paket dengan antarmuka yang jelas.
- **Prototipe integrasi perangkat paling berisiko** sebelum memilih.
- **Ukur performa di perangkat target** (sering kelas menengah–bawah).
- **Kuasai dasar native** walau memakai Flutter — debugging dan plugin membutuhkannya.

## Anti-Patterns

- Memilih teknologi karena tren atau preferensi pribadi.
- "Flutter pasti lambat" / "native pasti lebih baik" tanpa data.
- Menulis ulang aplikasi native besar sekaligus ke Flutter tanpa strategi bertahap.
- Platform view berlebihan di layar yang sering di-scroll.

## Performance Considerations

Flutter dengan Impeller menghilangkan sebagian besar jank akibat kompilasi shader; bottleneck umum ada di kode aplikasi
(rebuild berlebihan, gambar besar, kerja berat di UI isolate). Native memiliki akses langsung dan overhead lebih kecil
untuk UI sederhana. Startup Flutter mencakup inisialisasi engine — ukur dan optimalkan keduanya dengan alat masing-masing.

## Security Considerations

Prinsip keamanan sama (secure storage, TLS, tidak ada secret di klien). Flutter menyimpan kode Dart terkompilasi AOT
(lebih sulit dibaca dari bytecode Java, tetapi bukan pengaman); obfuscation tetap disarankan. Plugin pihak ketiga
menambah permukaan serangan — evaluasi pemeliharaan dan izin yang diminta.

## Real-World Use Cases

- Aplikasi kasir Flutter untuk Android & iPad dengan plugin native printer ESC/POS.
- Bank dengan aplikasi native yang menambahkan modul onboarding berbasis Flutter (add-to-app).
- Startup yang memakai KMP untuk logika sinkronisasi bersama dan UI native.

## Interview Questions

1. Kapan Anda memilih Flutter dan kapan native?
2. Apa kelemahan Flutter?
3. Bagaimana Flutter menggambar UI dibanding native?
4. Bagaimana mengakses fitur native yang belum ada plugin-nya?
5. Apa itu add-to-app dan Kotlin Multiplatform?

## Sample Answers

1. Flutter saat butuh lintas platform dengan tim kecil, UI kustom, dan waktu ke pasar cepat; native saat hanya menarget Android dengan fitur OS terbaru, integrasi perangkat/SDK yang sangat berat, atau kebutuhan performa ekstrem — dengan contoh dari pengalaman.
2. Overhead ukuran aplikasi, akses fitur platform baru bergantung pada plugin/kode native, platform view berbiaya performa, dan tetap perlu keahlian native untuk kasus khusus; mitigasi dengan modul native yang terisolasi.
3. Flutter menggambar setiap piksel dengan engine-nya sendiri (Impeller/Skia) di atas surface, bukan memakai widget UI platform; native memakai toolkit UI Android (Compose/View).
4. Menulis platform channel (MethodChannel/EventChannel) atau Pigeon untuk API type-safe, atau FFI untuk library C; dikemas sebagai plugin dengan antarmuka Dart yang bersih.
5. Add-to-app menyisipkan modul Flutter ke aplikasi native yang sudah ada; Kotlin Multiplatform membagi kode Kotlin (umumnya logika bisnis/data) antara Android, iOS, dan platform lain, dengan UI native atau Compose Multiplatform.

## Practical Exercises

1. Tulis ADR singkat "Flutter vs native" untuk proyek kasir dengan printer Bluetooth.
2. Latih jawaban 2 menit "Flutter atau native?" dengan contoh pengalaman Anda.
3. Buat prototipe kecil yang sama di Flutter dan Compose; bandingkan waktu pengembangan, ukuran, dan performa.

## Quick Reference

```text
Flutter: lintas platform · engine sendiri · satu tim · plugin/channel untuk fitur native
Native: akses penuh & terbaru · performa paling dekat platform · dua codebase untuk iOS
Hybrid: plugin · add-to-app · platform view · KMP
Jawab: "tergantung" → faktor → contoh nyata → kelemahan & mitigasi
```

## Related Topics

- [Platform Channels & Native Integration](/android/platform-channels/)
- [Jetpack Compose Fundamentals](/android/jetpack-compose/)
- [Technical Decision Making](/interview/behavioral/technical-decision-making/)
