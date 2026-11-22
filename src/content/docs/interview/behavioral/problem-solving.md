---
title: "Problem Solving"
description: "Menjawab pertanyaan behavioral tentang pemecahan masalah: kerangka berpikir, cara menunjukkan analisis akar masalah, contoh cerita STAR untuk engineer mobile, dan pertanyaan lanjutan yang sering muncul."
level: beginner
status: complete
updated: 2026-11-12
tags: [interview, behavioral, problem-solving, star]
---

## Overview

Pertanyaan seperti *"Ceritakan masalah tersulit yang pernah Anda selesaikan"* menilai **cara Anda berpikir**, bukan
sekadar hasilnya: bagaimana Anda memahami masalah, mengumpulkan data, menyusun hipotesis, memilih solusi, dan
memastikan masalah tidak terulang.

:::note
Semua contoh cerita di halaman ini adalah **contoh struktur**. Ganti dengan pengalaman nyata Anda — interviewer akan
menggali detail, dan cerita yang dikarang mudah terlihat.
:::

## Why It Matters

Engineer menghabiskan sebagian besar waktunya memecahkan masalah yang tidak jelas. Interviewer ingin tahu apakah Anda
sistematis (tidak menebak-nebak), mampu bekerja dengan informasi tidak lengkap, dan tahu kapan meminta bantuan.

## Core Concepts

Kerangka yang bisa Anda tunjukkan di bagian **Action**:

| Langkah | Yang ditunjukkan |
| --- | --- |
| 1. Definisikan masalah | Gejala, dampak, siapa terdampak, sejak kapan |
| 2. Kumpulkan data | Log, metrik, reproduksi, wawancara user |
| 3. Hipotesis | Beberapa kemungkinan penyebab, diurutkan dari yang paling mungkin/mudah diuji |
| 4. Uji & persempit | Eksperimen kecil, eliminasi |
| 5. Solusi & trade-off | Opsi yang dipertimbangkan dan alasan memilih |
| 6. Verifikasi | Test, monitoring setelah rilis |
| 7. Pencegahan | Test regresi, alert, dokumentasi, perubahan proses |

## How It Works

```text
S: Konteks + dampak masalah (angka)
T: Peran Anda
A: Langkah 1–7 (fokus 2–4 langkah paling menarik, sebutkan alternatif yang ditolak)
R: Hasil terukur + pencegahan + pelajaran
```

## Implementation

### Contoh jawaban (struktur)

**Pertanyaan:** "Ceritakan masalah teknis paling sulit yang pernah Anda selesaikan."

> **S** — Aplikasi POS kami di beberapa outlet mengalami stok yang tidak cocok dengan server setelah sinkronisasi;
> keluhan muncul ±5 outlet per minggu dan tim keuangan harus koreksi manual.
>
> **T** — Saya bertanggung jawab atas modul sinkronisasi di aplikasi Flutter.
>
> **A** — Pertama saya mengumpulkan data: membandingkan log transaksi lokal dengan data server untuk outlet yang
> bermasalah. Polanya muncul — selisih terjadi saat koneksi putus di tengah upload. Hipotesis saya: request berhasil di
> server, tetapi respons gagal diterima sehingga app mengirim ulang dan stok berkurang dua kali. Saya mereproduksinya
> dengan memutus jaringan di emulator tepat setelah request dikirim. Opsinya: (1) cek duplikat berdasarkan waktu
> transaksi — rapuh; (2) **idempotency key** berupa UUID per transaksi yang divalidasi server dengan unique constraint.
> Saya memilih opsi 2, berdiskusi dengan tim backend, dan menambahkan test integrasi untuk skenario retry.
>
> **R** — Selisih stok akibat duplikasi tidak muncul lagi pada bulan berikutnya, koreksi manual berhenti. Pelajarannya:
> setiap operasi yang bisa di-retry harus idempoten — sekarang menjadi checklist review di tim.

### Pertanyaan lanjutan yang perlu disiapkan

- "Bagaimana Anda tahu itu akar masalahnya, bukan hanya gejala?"
- "Apa yang akan Anda lakukan berbeda?"
- "Berapa lama prosesnya dan siapa saja yang terlibat?"
- "Bagaimana jika backend menolak perubahan?"

## Best Practices

- **Pilih masalah yang benar-benar sulit** tetapi bisa dijelaskan dalam 2 menit.
- **Tunjukkan data, bukan tebakan** — log, metrik, reproduksi.
- **Sebutkan alternatif yang ditolak** dan alasannya.
- **Akhiri dengan pencegahan** — menunjukkan Anda berpikir sistemik.
- **Sesuaikan level teknis** dengan pewawancara (HR vs user teknis).

## Anti-Patterns

- "Saya coba-coba sampai berhasil" tanpa proses.
- Masalah terlalu sepele (typo) atau terlalu teknis tanpa konteks dampak.
- Mengklaim semua pekerjaan tim sebagai kerja pribadi.
- Tidak ada hasil terukur atau pelajaran.

## Performance Considerations

Jawaban ideal 1,5–2,5 menit. Latih versi singkat (30 detik) dan versi detail; biarkan interviewer memilih untuk menggali.

## Security Considerations

Jangan membuka informasi rahasia perusahaan sebelumnya (nama klien, data internal, angka keuangan sensitif). Samarkan
dengan "klien ritel", "puluhan outlet", atau persentase.

## Real-World Use Cases

- Wawancara user/teknis yang menggali proyek di CV.
- Behavioral event interview (BEI) di tahap HR.
- Diskusi portfolio: "masalah apa yang paling menantang di proyek ini?"

## Interview Questions

1. Ceritakan masalah tersulit yang pernah Anda selesaikan.
2. Ceritakan saat Anda harus menyelesaikan masalah tanpa informasi lengkap.
3. Bagaimana pendekatan Anda saat menghadapi bug yang tidak bisa direproduksi?
4. Ceritakan saat solusi pertama Anda gagal.
5. Kapan Anda memutuskan untuk meminta bantuan?

## Sample Answers

1. Gunakan contoh di atas: data → hipotesis → reproduksi → opsi & trade-off → solusi → hasil & pencegahan.
2. Jelaskan asumsi yang Anda buat secara eksplisit, cara memvalidasinya cepat (prototipe, tanya stakeholder), dan bagaimana Anda mengurangi risiko jika asumsi salah.
3. Kumpulkan konteks (device, versi, langkah user, log/crash report), tambah logging/telemetri terarah, cari pola, coba reproduksi di kondisi serupa (jaringan lambat, memori rendah), dan perbaiki dengan test yang mensimulasikan kondisi itu.
4. Akui dengan jujur, jelaskan bagaimana Anda tahu solusinya gagal (data), apa yang dipelajari, dan solusi kedua yang berhasil.
5. Setelah time-box (mis. 1–2 jam tanpa kemajuan) dan setelah menyiapkan ringkasan: apa yang sudah dicoba, data yang ada, hipotesis tersisa — sehingga bantuan efisien.

## Practical Exercises

1. Tulis 2 cerita problem solving (teknis & non-teknis) dengan template STAR.
2. Untuk setiap cerita, siapkan jawaban atas 4 pertanyaan lanjutan di atas.
3. Rekam diri Anda menjawab dalam 2 menit; cek apakah langkah analisis terdengar jelas.

## Quick Reference

```text
Definisikan → Data → Hipotesis → Uji → Solusi (trade-off) → Verifikasi → Pencegahan
Fokus Action (±55%) · angka di Result · "saya" bukan hanya "kami" · samarkan data rahasia
```

## Related Topics

- [STAR Method & Story Bank](/interview/behavioral/star-method/)
- [Handling Production Bugs](/interview/behavioral/production-bugs/)
- [Problem Solving Framework (coding test)](/interview/coding-test/problem-solving-framework/)
