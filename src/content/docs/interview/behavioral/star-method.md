---
title: "STAR Method & Story Bank"
description: "Menjawab pertanyaan behavioral dengan struktur STAR, membangun story bank yang bisa dipakai ulang, dan contoh jawaban untuk engineer mobile."
level: beginner
status: complete
updated: 2026-11-07
tags: [interview, behavioral, star, communication]
---

## Overview

**STAR** adalah struktur menjawab pertanyaan behavioral ("Ceritakan saat Anda…"):

| Bagian | Isi | Porsi |
| --- | --- | --- |
| **S**ituation | Konteks singkat: proyek, tim, skala | ~15% |
| **T**ask | Tanggung jawab/tujuan **Anda** | ~10% |
| **A**ction | Langkah konkret yang **Anda** ambil dan alasannya | ~55% |
| **R**esult | Hasil terukur + pelajaran | ~20% |

## Why It Matters

Interviewer memakai perilaku masa lalu sebagai prediktor perilaku masa depan. Tanpa struktur, jawaban cenderung
bertele-tele di konteks dan tipis di aksi. STAR memaksa Anda menunjukkan **kontribusi pribadi**, **cara berpikir**, dan
**dampak**.

## Core Concepts

- **"Saya", bukan hanya "kami"** — jelaskan bagian Anda di dalam kerja tim.
- **Spesifik** — satu kejadian nyata, bukan "biasanya saya…".
- **Terukur** — angka (waktu, crash rate, jumlah user, persentase) atau dampak bisnis yang jelas.
- **Refleksi** — apa yang Anda pelajari/ubah sesudahnya.
- **Story bank** — 6–8 cerita yang masing-masing bisa menjawab beberapa jenis pertanyaan.

## How It Works

Pemetaan story bank → kompetensi yang sering ditanyakan:

| Cerita (contoh) | Problem solving | Tekanan | Kolaborasi | Konflik | Ownership | Kegagalan | Keputusan teknis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bug transaksi ganda di production | ✓ | ✓ |  |  | ✓ |  | ✓ |
| Migrasi ke Clean Architecture | ✓ |  | ✓ | ✓ |  |  | ✓ |
| Deadline rilis dipercepat | | ✓ | ✓ |  | ✓ |  |  |
| Salah estimasi fitur sync | |  |  |  |  | ✓ |  |
| Beda pendapat dengan backend soal API | |  | ✓ | ✓ |  |  | ✓ |
| Mentoring rekan baru | |  | ✓ |  | ✓ |  |  |

## Implementation

### Template cerita

```text
Judul: ____________________     Kompetensi: ____________________
S: (2 kalimat) Di mana, produk apa, skala, kondisi saat itu.
T: (1 kalimat) Tanggung jawab saya adalah …
A: (3–5 poin) 1) … karena …  2) …  3) …
R: (angka) … dari X menjadi Y; dampak bisnis …; pelajaran: …
Pertanyaan lanjutan yang mungkin: ________________
```

### Contoh: "Ceritakan saat Anda menangani bug di production"

> **S** — Aplikasi POS Flutter kami dipakai di sekitar [N] outlet. Setelah rilis versi baru, beberapa outlet melaporkan
> transaksi tercatat dua kali di laporan pusat.
>
> **T** — Saya pemilik fitur sinkronisasi, jadi saya bertanggung jawab menghentikan dampaknya dan menemukan akar masalah hari itu juga.
>
> **A** — Pertama saya memitigasi: menghentikan staged rollout di Play Console dan menginformasikan tim support agar
> outlet tidak menghapus data manual. Lalu saya mencocokkan log request dengan data duplikat dan menemukan polanya:
> request sync timeout di jaringan lambat, client melakukan retry, dan server membuat transaksi baru karena ID dibuat di
> server. Saya mengusulkan dan mengimplementasikan UUID dari client sebagai idempotency key, bekerja sama dengan
> engineer backend untuk mengubah insert menjadi `ON CONFLICT DO NOTHING`. Saya menulis script untuk mendeteksi dan
> menandai duplikat yang sudah terjadi agar finance bisa merekonsiliasi, serta menambahkan test retry dan alert jumlah duplikat.
>
> **R** — Duplikasi berhenti sejak versi perbaikan, [X] transaksi duplikat direkonsiliasi dalam dua hari, dan pola
> idempotency key kemudian kami jadikan standar untuk semua endpoint tulis. Pelajaran saya: selalu asumsikan request
> akan di-retry dan rancang API idempotent sejak awal.

### Contoh: "Ceritakan saat Anda tidak setuju dengan rekan kerja"

> **S** — Tim backend ingin endpoint list produk mengembalikan seluruh katalog (±20 ribu item) sekaligus. **T** — Saya
> perlu memastikan aplikasi tetap cepat di HP kasir kelas menengah. **A** — Alih-alih berdebat opini, saya mengukur:
> waktu parse dan memory di device target, lalu menyajikan data tersebut bersama dua opsi (pagination cursor dan delta
> sync dengan `updated_since`) beserta dampaknya bagi backend. Kami sepakat delta sync karena juga mengurangi beban
> server. **R** — Waktu sinkron katalog turun dari [a] detik menjadi [b] detik; hubungan dengan tim backend justru
> membaik karena keputusan berbasis data.

## Best Practices

- **Tulis cerita sebelum interview**, bukan mengarang saat ditanya.
- **Pilih cerita yang menunjukkan pertumbuhan** — termasuk satu cerita kegagalan yang jujur.
- **Kuantifikasi** walau perkiraan ("sekitar 30%"), dan siap menjelaskan cara mengukurnya.
- **Jaga durasi 1,5–2,5 menit**, lalu biarkan interviewer menggali.
- **Selaraskan dengan nilai perusahaan** — cari di situs karier perusahaan target; contoh BUMN: AKHLAK. Lihat [HR Interview](/interview/company-prep/hr-interview/).

## Anti-Patterns

- Jawaban hipotetis ("Kalau itu terjadi, saya akan…") untuk pertanyaan tentang pengalaman nyata.
- Menyalahkan orang lain atau menjelekkan perusahaan sebelumnya.
- Cerita "kegagalan" yang sebenarnya pujian terselubung ("kelemahan saya terlalu perfeksionis").
- Detail teknis berlebihan untuk interviewer HR; atau terlalu dangkal untuk interviewer teknis — sesuaikan audiens.
- Tidak ada hasil/angka.

## Performance Considerations

Latih dengan timer. Jika melewati 3 menit, potong bagian Situation. Rekam diri sendiri dan perhatikan kata pengisi
("eee", "jadi…") serta kejelasan urutan aksi.

## Security Considerations

Jangan membuka informasi rahasia perusahaan sebelumnya (nama klien, angka finansial internal, detail kerentanan yang
belum diperbaiki). Gunakan angka yang dibulatkan atau persentase, dan generalisasi nama klien.

## Real-World Use Cases

STAR dipakai untuk wawancara HR, wawancara user/teknis (bagian pengalaman), penilaian kinerja, dan bahkan menulis
deskripsi pencapaian di CV ("Mengurangi crash rate dari 2% ke 0,3% dengan …").

## Interview Questions

1. Ceritakan saat Anda menyelesaikan masalah teknis yang sulit.
2. Ceritakan saat Anda bekerja di bawah tekanan/deadline ketat.
3. Ceritakan saat Anda berbeda pendapat dengan rekan atau atasan.
4. Ceritakan kegagalan Anda dan apa yang Anda pelajari.
5. Ceritakan saat Anda mengambil inisiatif di luar tugas Anda.
6. Ceritakan saat Anda harus mempelajari teknologi baru dengan cepat.

## Sample Answers

1. Gunakan cerita bug production/performa — tekankan proses diagnosis (hipotesis, data, eksperimen) dan pencegahan.
2. Fokus pada prioritisasi (MoSCoW, potong scope bersama PO), komunikasi risiko lebih awal, dan menjaga kualitas minimum (test pada alur kritis).
3. Tunjukkan bahwa Anda memisahkan orang dari masalah, memakai data, mendengar alasan pihak lain, lalu *disagree and commit* bila keputusan sudah diambil.
4. Pilih kegagalan nyata dengan dampak moderat (mis. estimasi meleset), tanggung jawab Anda, perbaikan yang Anda lakukan, dan kebiasaan baru yang terbukti.
5. Mis. membuat template project/CI atau dokumentasi yang mempercepat onboarding — sertakan dampak.
6. Mis. mempelajari Kotlin untuk plugin platform channel; jelaskan strategi belajar (dokumentasi resmi, prototipe kecil, review dari rekan) dan hasilnya.

## Practical Exercises

1. Isi tabel story bank dengan 6–8 cerita Anda sendiri.
2. Tulis setiap cerita dengan template di atas (maks. 250 kata).
3. Rekam 3 cerita, ukur durasi, dan perbaiki.
4. Minta teman mengajukan pertanyaan lanjutan "mengapa?" sebanyak tiga kali untuk tiap cerita.

## Quick Reference

- **S**ituation 15% · **T**ask 10% · **A**ction 55% · **R**esult 20%.
- "Saya", spesifik, terukur, ada pelajaran.
- 6–8 cerita mencakup: problem solving, tekanan, kolaborasi, konflik, ownership, kegagalan, keputusan teknis.
- 1,5–2,5 menit per jawaban.

## Related Topics

- [Handling Production Bugs](/interview/behavioral/production-bugs/)
- [Explaining Previous Work Experience](/interview/behavioral/explaining-experience/)
- [HR Interview Preparation](/interview/company-prep/hr-interview/)
- [Interview Simulator](/learning/interview-simulator/)
