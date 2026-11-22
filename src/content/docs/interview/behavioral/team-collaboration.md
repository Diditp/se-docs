---
title: "Team Collaboration"
description: "Menjawab pertanyaan kolaborasi dan konflik: bekerja dengan backend/QA/desainer/PM, beda pendapat teknis, memberi & menerima feedback, mentoring, dan kerja jarak jauh — dengan contoh STAR."
level: beginner
status: complete
updated: 2026-11-12
tags: [interview, behavioral, collaboration, conflict, communication]
---

## Overview

Pertanyaan kolaborasi menilai bagaimana Anda bekerja dengan orang lain: **berkomunikasi**, **menyelesaikan konflik**,
**memberi dan menerima feedback**, serta **membantu tim berhasil**. Untuk mobile engineer, mitra utamanya adalah backend,
QA, desainer UI/UX, dan product manager.

:::note
Contoh cerita adalah struktur; gunakan pengalaman nyata Anda dan jangan menjelekkan rekan kerja.
:::

## Why It Matters

Hampir semua pekerjaan software adalah kerja tim. Engineer yang kuat secara teknis tetapi sulit diajak bekerja sama
memperlambat tim. Hampir setiap perusahaan memasukkan kolaborasi ke nilai budayanya (*Teamwork*, *One Team*;
di BUMN: *Harmonis* dan *Kolaboratif* dalam AKHLAK).

## Core Concepts

| Situasi | Yang ingin dilihat interviewer |
| --- | --- |
| Beda pendapat teknis | Argumen berbasis data, mendengarkan, *disagree and commit* |
| Konflik antar-orang | Bicara langsung & privat, fokus pada masalah, bukan orang |
| Menerima kritik | Tidak defensif, menindaklanjuti |
| Memberi feedback | Spesifik, tepat waktu, membangun |
| Membantu rekan | Mentoring, dokumentasi, berbagi pengetahuan |
| Lintas fungsi | Memahami kebutuhan backend/QA/desain/PM |

## How It Works

Pola resolusi konflik yang baik:

```text
Pahami sudut pandang lain (tanya & dengarkan) → samakan tujuan bersama
→ bandingkan opsi dengan data/kriteria → putuskan (atau eskalasi dengan rapi)
→ dukung keputusan sepenuhnya → evaluasi hasilnya bersama
```

## Implementation

### Contoh 1 — beda pendapat dengan backend

> **S** — Tim backend ingin endpoint daftar produk mengembalikan semua data sekaligus; di aplikasi kasir dengan ribuan
> produk ini membuat sinkronisasi awal lambat di perangkat low-end.
>
> **T** — Saya perlu memastikan performa app tanpa memaksakan pendapat.
>
> **A** — Saya mengukur dulu: waktu unduh dan parsing di perangkat outlet, serta penggunaan memori. Lalu saya mengajak
> diskusi singkat dan menunjukkan datanya. Ternyata backend khawatir kompleksitas pagination. Kami sepakat memakai
> *delta sync* berbasis `updated_at` dengan cursor pagination sederhana; saya membantu menulis kontrak API dan contoh
> request agar implementasinya cepat.
>
> **R** — Sinkronisasi awal jauh lebih cepat dan sinkronisasi berikutnya hanya mengambil perubahan. Hubungan dengan tim
> backend membaik — kami mulai membahas kontrak API sebelum implementasi.

### Contoh 2 — menerima kritik di code review

> Lead mengkritik PR saya karena logika bisnis ada di widget. Awalnya saya merasa itu cukup, tetapi saya bertanya
> alasannya, mempelajari pemisahan layer, lalu merefaktor ke use case + test. Sejak itu saya memakai pola yang sama dan
> komentar review serupa tidak muncul lagi.

## Best Practices

- **Bicara dengan data dan tujuan bersama** ("supaya kasir tidak menunggu"), bukan preferensi pribadi.
- **Selesaikan langsung dan privat**; eskalasi hanya bila buntu, dengan opsi yang jelas.
- **Disagree and commit** — setelah diputuskan, dukung sepenuhnya.
- **Dokumentasikan kesepakatan** (kontrak API, ADR, catatan rapat).
- **Tunjukkan empati lintas fungsi**: pahami kendala backend, QA, desainer.

## Anti-Patterns

- Cerita di mana Anda "menang" dan pihak lain digambarkan bodoh/malas.
- Menghindari konflik sama sekali ("saya selalu setuju").
- Eskalasi ke atasan sebelum bicara langsung.
- Kolaborasi hanya berupa "kami rapat" tanpa aksi Anda yang spesifik.

## Performance Considerations

Siapkan 2–3 cerita: konflik teknis, konflik non-teknis/komunikasi, dan membantu/mentoring rekan. Masing-masing 1,5–2 menit.

## Security Considerations

Kolaborasi juga berarti menjaga praktik aman bersama: tidak berbagi kredensial lewat chat, memakai secret manager, dan
melibatkan security sejak awal untuk fitur sensitif — contoh baik untuk diceritakan.

## Real-World Use Cases

- Menyepakati kontrak API dengan backend sebelum coding.
- Bekerja dengan QA untuk reproduksi bug dan test plan.
- Menyesuaikan desain yang sulit diimplementasikan bersama desainer.
- Kerja remote lintas kota: async update, dokumentasi tertulis.

## Interview Questions

1. Ceritakan saat Anda tidak setuju dengan rekan kerja/atasan.
2. Bagaimana Anda menangani rekan yang tidak menyelesaikan bagiannya?
3. Ceritakan saat Anda menerima kritik yang sulit.
4. Bagaimana Anda membantu anggota tim baru?
5. Bagaimana Anda bekerja dengan tim backend/desain?

## Sample Answers

1. STAR: pahami alasan pihak lain, gunakan data, cari solusi yang memenuhi tujuan bersama, dukung keputusan akhir.
2. Bicara privat untuk memahami kendalanya (beban kerja, ketidakjelasan tugas), tawarkan bantuan, sepakati rencana; eskalasi ke lead hanya jika berdampak pada tim dan tidak membaik.
3. Ceritakan reaksi awal dengan jujur, bagaimana Anda meminta penjelasan, perubahan yang Anda lakukan, dan hasilnya.
4. Onboarding terstruktur: dokumentasi setup, pair programming, tugas kecil pertama, review yang menjelaskan alasan — contoh nyata bila ada.
5. Sepakati kontrak lebih awal, komunikasi rutin, hormati keahlian masing-masing, dan beri umpan balik berbasis data (performa, effort) bukan preferensi.

## Practical Exercises

1. Tulis cerita konflik teknis dan cerita menerima kritik.
2. Petakan cerita Anda ke nilai Harmonis dan Kolaboratif.
3. Latih kalimat menyampaikan ketidaksetujuan: "Saya melihat risiko X berdasarkan data Y; bagaimana kalau kita coba Z?"

## Quick Reference

```text
Dengarkan → tujuan bersama → data & opsi → putuskan → disagree & commit → evaluasi
Privat dulu, eskalasi terakhir · dokumentasikan kesepakatan · jangan menjelekkan orang
Siapkan: konflik teknis · kritik · mentoring · lintas fungsi
```

## Related Topics

- [STAR Method & Story Bank](/interview/behavioral/star-method/)
- [Technical Decision Making](/interview/behavioral/technical-decision-making/)
- [HR Interview Preparation](/interview/company-prep/hr-interview/)
