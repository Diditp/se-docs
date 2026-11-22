---
title: "Explaining Previous Work Experience"
description: "Menjelaskan pengalaman kerja dan proyek sebelumnya secara jelas: struktur penjelasan proyek, peran & kontribusi, arsitektur singkat, metrik, menjawab pertanyaan pendalaman, dan menjaga kerahasiaan."
level: beginner
status: complete
updated: 2026-11-12
tags: [interview, behavioral, experience, portfolio, communication]
---

## Overview

*"Ceritakan pengalaman kerja Anda"* dan *"Jelaskan proyek terakhir Anda"* hampir pasti ditanyakan. Jawaban yang baik
**terstruktur**, **menyorot kontribusi Anda**, **menunjukkan keputusan teknis**, dan **menyebut dampak**, dalam waktu
singkat — lalu siap digali lebih dalam.

## Why It Matters

Pertanyaan ini menjadi pintu masuk ke seluruh sesi teknis: interviewer sering memilih topik lanjutan dari apa yang Anda
sebut. Penjelasan yang rapi memberi Anda kendali atas arah wawancara ke area kekuatan Anda.

## Core Concepts

### Struktur penjelasan proyek (± 2 menit)

| Bagian | Isi | Contoh (sesuaikan dengan pengalaman Anda) |
| --- | --- | --- |
| Konteks | Produk, pengguna, skala | Aplikasi kasir untuk jaringan outlet ritel |
| Peran | Posisi & tanggung jawab Anda | Mobile developer Flutter, memegang modul transaksi & sync |
| Arsitektur | 2–3 kalimat stack & pola | Flutter + Bloc, Clean Architecture, Drift, REST API Node.js |
| Tantangan | 1–2 masalah menarik | Transaksi offline & sinkronisasi tanpa duplikasi |
| Kontribusi | Aksi spesifik Anda | Idempotency key, delta sync, test |
| Dampak | Metrik / hasil | Crash-free rate, waktu sync, keluhan berkurang |
| Pelajaran | Apa yang akan dilakukan berbeda | Kontrak API lebih awal |

### "Tell me about yourself" (60–90 detik)

```text
Saat ini → (peran, fokus, pengalaman ±N tahun)
Sebelumnya → (latar belakang yang relevan, mis. pendidikan teknik)
Pencapaian → (1 hal terukur)
Sekarang → (apa yang sedang dipelajari/dikembangkan)
Kenapa di sini → (kecocokan dengan posisi)
```

## How It Works

Siapkan **tiga level kedalaman** untuk setiap proyek:

```text
Level 1 (30 dtk)  : satu kalimat konteks + peran + dampak
Level 2 (2 mnt)   : struktur lengkap di atas
Level 3 (deep dive): diagram arsitektur, alur data, keputusan & alternatif, kode/test, insiden
```

## Implementation

### Contoh level 2 (struktur)

> "Proyek terakhir saya adalah aplikasi kasir untuk jaringan outlet ritel, dipakai setiap hari oleh kasir di banyak
> lokasi dengan koneksi tidak stabil. Saya mobile developer Flutter dan memegang modul transaksi serta sinkronisasi.
> Arsitekturnya Clean Architecture dengan Bloc, database lokal Drift, dan REST API Node.js. Tantangan utamanya
> transaksi harus tetap jalan saat offline tanpa duplikasi saat sinkron. Saya merancang outbox lokal dengan idempotency
> key per transaksi dan delta sync berbasis `updated_at`, plus test untuk skenario putus koneksi. Hasilnya keluhan
> selisih data menurun drastis dan sinkronisasi harian jauh lebih cepat. Kalau mengulang, saya akan menyepakati
> kontrak sync dengan backend lebih awal."

### Siapkan untuk pertanyaan pendalaman

```markdown
- Gambar arsitektur (layer, alur data, komponen utama)
- 2 keputusan teknis + alternatif yang ditolak
- 1 bug/insiden + penanganan
- Cara testing & CI/CD
- Ukuran tim & cara kolaborasi
- Apa yang paling Anda banggakan / ingin perbaiki
```

## Best Practices

- **Pilih 2–3 proyek terbaik** yang relevan dengan posisi; latih level 1–3.
- **Jelaskan peran dengan akurat** — "saya" untuk kontribusi Anda, "tim" untuk sisanya.
- **Gunakan istilah yang dipahami pewawancara**; jelaskan singkatan.
- **Siapkan diagram** sederhana (bisa digambar di kertas/whiteboard).
- **Konsisten dengan CV dan LinkedIn** (tanggal, peran, teknologi).

## Anti-Patterns

- Membaca ulang CV kata per kata.
- Daftar teknologi tanpa cerita ("saya pakai Flutter, Firebase, Bloc, Dio, ...").
- Terlalu lama di konteks bisnis, terlalu singkat di kontribusi.
- Melebih-lebihkan peran atau mengklaim teknologi yang tidak benar-benar dikuasai.
- Menjelekkan perusahaan atau tim sebelumnya.

## Performance Considerations

Gunakan timer saat latihan: level 1 ≤ 30 detik, level 2 ≤ 2,5 menit. Berhenti dan beri ruang interviewer bertanya —
wawancara adalah dialog.

## Security Considerations

Jaga kerahasiaan: jangan menyebut nama klien yang tidak publik, angka keuangan internal, detail keamanan, atau
memperlihatkan source code milik perusahaan. Gunakan deskripsi umum dan proyek pribadi/open source untuk demo kode.

## Real-World Use Cases

- Pembukaan wawancara user/teknis.
- Sesi presentasi portfolio.
- Wawancara HR yang menguji konsistensi CV.

## Interview Questions

1. Ceritakan tentang diri Anda.
2. Jelaskan proyek terakhir Anda.
3. Apa kontribusi spesifik Anda di proyek tersebut?
4. Apa bagian tersulit dan bagaimana Anda menyelesaikannya?
5. Apa yang akan Anda lakukan berbeda jika mengulang proyek itu?

## Sample Answers

1. Pitch 60–90 detik: saat ini → sebelumnya → pencapaian → yang sedang dikembangkan → alasan melamar.
2. Struktur level 2: konteks, peran, arsitektur, tantangan, kontribusi, dampak, pelajaran.
3. Sebut 2–3 kontribusi konkret dengan kata kerja aktif (merancang, mengimplementasikan, mengukur, memperbaiki) dan hasilnya.
4. Gunakan cerita problem solving STAR yang terkait proyek tersebut.
5. Tunjukkan refleksi yang matang: perbaikan proses atau teknis yang realistis, bukan sekadar "pakai teknologi terbaru".

## Practical Exercises

1. Tulis versi level 1 dan level 2 untuk dua proyek Anda.
2. Gambar diagram arsitektur masing-masing proyek dalam 5 menit.
3. Minta teman bertanya "kenapa?" lima kali pada satu keputusan teknis Anda.

## Quick Reference

```text
Konteks → Peran → Arsitektur → Tantangan → Kontribusi → Dampak → Pelajaran
3 level: 30 dtk · 2 mnt · deep dive · konsisten dengan CV · jaga kerahasiaan
Tell me about yourself: saat ini → sebelumnya → pencapaian → sekarang → kenapa di sini
```

## Related Topics

- [Portfolio & Project Explanation](/interview/company-prep/portfolio/)
- [STAR Method & Story Bank](/interview/behavioral/star-method/)
- [Project Ownership](/interview/behavioral/project-ownership/)
