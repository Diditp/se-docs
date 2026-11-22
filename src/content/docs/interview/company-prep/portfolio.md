---
title: "Portfolio & Project Explanation"
description: "Menyusun portfolio software engineer yang meyakinkan: memilih proyek, struktur README & case study, demo, CV berbasis pencapaian, cara menjelaskan proyek saat interview, dan menangani proyek rahasia (NDA)."
level: beginner
status: complete
updated: 2026-11-13
tags: [interview, company-prep, portfolio, cv, github, career]
---

## Overview

Portfolio adalah **bukti** kemampuan Anda: proyek yang bisa dilihat, dicoba, dan dijelaskan. Untuk software engineer,
portfolio biasanya terdiri dari **CV berbasis pencapaian**, **profil GitHub/GitLab** dengan beberapa repository yang
dirapikan, **case study** proyek kerja (yang boleh dibagikan), dan **demo** (APK/video/web).

## Why It Matters

Pada seleksi dengan banyak pelamar, portfolio yang jelas membantu Anda menonjol dan menjadi bahan diskusi interview yang
Anda kuasai. Proyek kantor sering tidak bisa dibagikan — proyek pribadi yang dirancang dengan baik mengisi celah itu.

## Core Concepts

| Komponen | Isi | Prioritas |
| --- | --- | --- |
| CV (1–2 halaman) | Ringkasan, pengalaman berbasis pencapaian, skill, pendidikan, proyek | Wajib |
| 2–3 proyek unggulan | Repository rapi + README + demo | Tinggi |
| Case study proyek kerja | Masalah, peran, arsitektur, hasil — tanpa data rahasia | Tinggi |
| GitHub profile README | Ringkasan & tautan proyek | Sedang |
| Artikel/catatan teknis | Menunjukkan cara berpikir (knowledge base ini bisa jadi contoh) | Bonus |

Ciri proyek portfolio yang kuat: **menyelesaikan masalah nyata**, **arsitektur jelas**, **ada test & CI**, **dapat
dijalankan orang lain**, **README menjelaskan keputusan teknis**.

## How It Works

Rekomendasi set proyek untuk profil Anda (Flutter → software engineer end-to-end):

```text
1. Proyek unggulan full-stack: POS/kasir offline-first
   Flutter (Clean Architecture, Bloc, Drift, outbox sync) + Node.js API (TypeScript, PostgreSQL, idempotency)
   + Docker Compose + GitHub Actions + AGENTS.md
2. Aplikasi lapangan/tiket: lapor gangguan & work order dengan foto offline + push notification
3. Knowledge base ini (website dokumentasi) — bukti kemampuan belajar & dokumentasi
```

## Implementation

### Template README proyek

```markdown
# POS Offline-First (Flutter + Node.js)

Aplikasi kasir yang tetap bisa bertransaksi tanpa internet dan menyinkronkan data tanpa duplikasi.

![demo](docs/demo.gif)

## Fitur
- Transaksi offline, struk Bluetooth, multi-payment (tunai, QRIS mock)
- Sinkronisasi outbox idempotent; stok sebagai ledger
- Laporan harian per shift

## Arsitektur
(diagram) Flutter (Clean Architecture, Bloc, Drift) → REST API (Node.js/TypeScript) → PostgreSQL
Keputusan penting: UUID dari client, Idempotency-Key, cursor-based pull — lihat docs/adr/

## Menjalankan
docker compose up -d   # API + DB
cd mobile && flutter run --flavor dev

## Kualitas
- Unit, bloc & widget test; integration test checkout
- CI: format, analyze, test, build (GitHub Actions)

## Apa yang saya pelajari / rencana berikutnya
```

### CV: tulis pencapaian, bukan tugas

```text
❌ "Membuat fitur transaksi dan sinkronisasi di aplikasi Flutter."
✅ "Membangun sinkronisasi offline-first (Drift + outbox + idempotency key) untuk aplikasi kasir di ±<N> outlet;
    menghilangkan transaksi ganda saat koneksi tidak stabil dan memangkas waktu checkout dari <a> ke <b> detik."
Rumus: Kata kerja aksi + apa yang dibangun (teknologi) + dampak terukur.
```

### Menjelaskan proyek saat interview (5 menit)

```text
1. Masalah & user (30 dtk)
2. Peran Anda & tim (20 dtk)
3. Arsitektur + diagram (90 dtk) — tunjukkan layar/whiteboard bila memungkinkan
4. Satu keputusan teknis penting & alternatifnya (60 dtk)
5. Tantangan tersulit & cara mengatasinya (60 dtk)
6. Hasil terukur & pelajaran (40 dtk)
```

### Proyek kantor yang terikat kerahasiaan

- Jelaskan **jenis** sistem dan **peran** Anda tanpa nama klien, data, kode, atau detail keamanan.
- Gunakan angka yang dibulatkan/persentase.
- Tunjukkan keterampilan yang sama melalui proyek pribadi yang serupa.

## Best Practices

- **Sedikit tetapi berkualitas**: 2–3 proyek unggulan lebih baik dari 20 repository tutorial.
- **README sebagai halaman penjualan**: demo GIF/video, cara menjalankan, keputusan teknis.
- **Commit history & PR yang rapi** (Conventional Commits) — menunjukkan kebiasaan kerja.
- **Test & CI hijau** di repository unggulan.
- **APK/rilis demo** atau video singkat agar pewawancara bisa melihat tanpa setup.
- **CV disesuaikan dengan lowongan** (kata kunci dari deskripsi posisi), maksimal 2 halaman, format mudah dibaca.

## Anti-Patterns

- Repository tanpa README atau tidak bisa dijalankan.
- Mengunggah kode milik perusahaan/klien.
- Secret (API key, keystore) ter-commit di repository publik.
- CV berisi daftar teknologi panjang tanpa konteks atau bukti.
- Proyek clone tutorial tanpa modifikasi atau penjelasan.

## Performance Considerations

Sertakan metrik performa sederhana di README proyek (waktu startup, ukuran APK, hasil load test API) — menunjukkan Anda
memperhatikan kualitas, bukan hanya fitur.

## Security Considerations

- Periksa repository sebelum dipublikasikan: `.env`, keystore, `google-services.json` milik project nyata, kredensial di histori git.
- Gunakan data dummy; jangan pernah menampilkan data pelanggan asli di screenshot/demo.
- Sebutkan praktik keamanan yang diterapkan (secure storage, otorisasi, validasi) sebagai nilai tambah.

## Real-World Use Cases

- Lampiran tautan GitHub & demo di CV/formulir pendaftaran (bila disediakan kolomnya).
- Bahan diskusi saat interview teknis ("tunjukkan kode yang paling Anda banggakan").
- Bukti pembelajaran mandiri saat beralih dari mobile ke peran software engineer yang lebih luas.

## Interview Questions

1. Ceritakan proyek yang paling Anda banggakan.
2. Apa peran spesifik Anda dalam proyek tersebut?
3. Keputusan teknis apa yang akan Anda ubah jika mengulang proyek?
4. Bagaimana Anda memastikan kualitas kode di proyek pribadi?
5. Tunjukkan bagian kode yang menurut Anda paling baik dan jelaskan.

## Sample Answers

1. Gunakan struktur 5 menit di atas, fokus pada masalah nyata, arsitektur, satu keputusan penting, dan hasil terukur.
2. Pisahkan kontribusi pribadi dari kontribusi tim: "Saya merancang dan mengimplementasikan modul sinkronisasi dan menulis test-nya; backend dikerjakan rekan, dan saya ikut merancang kontrak API."
3. Contoh: "Saya akan menyiapkan sync berbasis cursor server sejak awal daripada timestamp device, karena kami sempat mengalami data terlewat ketika jam device salah."
4. Lint ketat, test di beberapa level, CI yang menjalankan semuanya, review diri dengan checklist, dan AGENTS.md agar AI agent mengikuti konvensi yang sama.
5. Pilih potongan kode yang menunjukkan desain (mis. repository + error mapping + test), jelaskan alasan desain dan trade-off-nya.

## Practical Exercises

1. Pilih 2–3 proyek unggulan dan tulis README dengan template di atas.
2. Tulis ulang 5 poin pengalaman di CV dengan rumus aksi + teknologi + dampak.
3. Rekam presentasi proyek 5 menit dan evaluasi.
4. Audit repository publik Anda dari secret dan data sensitif.

## Quick Reference

```text
Portfolio = CV pencapaian + 2–3 proyek unggulan (README, demo, test, CI) + case study kerja (tanpa rahasia)
CV: aksi + teknologi + dampak terukur · disesuaikan lowongan · ≤ 2 halaman
Presentasi 5 menit: masalah → peran → arsitektur → keputusan → tantangan → hasil
Cek sebelum publik: secret, data asli, kode milik perusahaan
```

## Related Topics

- [Explaining Previous Work Experience](/interview/behavioral/explaining-experience/)
- [Mobile Application Engineering](/interview/company-prep/mobile-engineering/)
- [Git & Git Workflow](/fundamentals/git-workflow/)
- [AI Agent Instructions](/agent-instructions/) — AGENTS.md sebagai nilai tambah di repository
