---
title: "Working Under Pressure"
description: "Menjawab pertanyaan tentang tekanan dan deadline: prioritisasi, negosiasi scope, komunikasi risiko, menjaga kualitas minimum, dan menjaga diri — dengan contoh cerita STAR."
level: beginner
status: complete
updated: 2026-11-12
tags: [interview, behavioral, pressure, deadline, prioritization]
---

## Overview

*"Bagaimana Anda bekerja di bawah tekanan?"* atau *"Ceritakan saat deadline Anda sangat ketat"* menilai apakah Anda
bisa **memprioritaskan**, **berkomunikasi lebih awal**, dan **menjaga kualitas** — bukan apakah Anda sanggup lembur
tanpa batas.

:::note
Contoh cerita adalah struktur; gunakan pengalaman nyata Anda.
:::

## Why It Matters

Deadline rilis, permintaan mendadak, dan insiden adalah bagian normal pekerjaan engineer. Perusahaan mencari orang yang
tetap tenang dan membuat keputusan yang baik — termasuk berkata "ini tidak realistis, ini alternatifnya".

## Core Concepts

| Alat | Penjelasan |
| --- | --- |
| Prioritisasi | Must/Should/Could/Won't (MoSCoW), dampak vs effort |
| Negosiasi scope | Kurangi scope, bukan kualitas; rilis bertahap |
| Komunikasi risiko dini | Sampaikan potensi terlambat sejak terdeteksi, bukan di hari H |
| Kualitas minimum | Test untuk alur kritis, code review, tidak ada shortcut di keamanan/data |
| Time-boxing | Batasi waktu eksplorasi; eskalasi bila mentok |
| Keberlanjutan | Lembur sebagai pengecualian, bukan pola |

## How It Works

```text
Tekanan datang → klarifikasi tujuan & batas waktu → pecah tugas & estimasi
  → identifikasi yang wajib vs opsional → sepakati scope dengan stakeholder
  → eksekusi fokus + update rutin → rilis → retrospektif
```

## Implementation

### Contoh jawaban (struktur)

**Pertanyaan:** "Ceritakan saat Anda harus menyelesaikan pekerjaan dengan deadline yang sangat ketat."

> **S** — Klien meminta fitur pembayaran QRIS dirilis satu minggu lebih cepat karena ada program promo; estimasi awal
> tim tiga minggu.
>
> **T** — Saya memegang implementasi di aplikasi Flutter dan perlu memastikan rilis tetap aman untuk transaksi.
>
> **A** — Saya memecah fitur menjadi bagian kecil dan menandai mana yang wajib untuk promo: membuat pembayaran dan
> mengecek status. Riwayat detail dan pembatalan saya usulkan masuk fase kedua. Saya sampaikan ke lead dan PM dengan
> alasan risikonya, dan mereka setuju. Saya berkoordinasi harian dengan backend untuk kontrak API, menulis test untuk alur
> pembayaran dan timeout, lalu memakai feature flag supaya fitur bisa dimatikan jika bermasalah.
>
> **R** — Fase pertama rilis tepat waktu untuk promo tanpa insiden pembayaran; fase kedua menyusul dua minggu kemudian.
> Pelajarannya: saat tekanan tinggi, yang dinegosiasikan adalah scope, bukan kualitas alur kritis.

## Best Practices

- **Klarifikasi dulu**: apa yang benar-benar dibutuhkan pada tanggal itu dan kenapa?
- **Tawarkan opsi**, bukan sekadar "tidak bisa": scope dikurangi, rilis bertahap, tambah orang, geser tanggal.
- **Komunikasikan risiko sejak terlihat**.
- **Lindungi alur kritis** (transaksi, data, keamanan) dengan test & review.
- **Tunjukkan ketenangan** — sebut cara Anda menjaga fokus (time-box, mematikan distraksi, daftar prioritas).

## Anti-Patterns

- "Saya bekerja baik di bawah tekanan" tanpa contoh.
- Membanggakan lembur terus-menerus atau mengorbankan test/review.
- Diam sampai hari H lalu mengumumkan terlambat.
- Menyalahkan PM/klien atas deadline.

## Performance Considerations

Jawaban 1,5–2 menit. Pastikan **Action** memuat keputusan prioritisasi dan komunikasi, bukan hanya "saya bekerja
lebih keras".

## Security Considerations

Tekanan sering menjadi alasan melewati praktik keamanan (hardcode secret, menonaktifkan validasi SSL, skip review).
Menyebut bahwa Anda tetap menjaga hal ini di bawah tekanan adalah poin plus.

## Real-World Use Cases

- Rilis fitur untuk promo/kampanye dengan tanggal tetap.
- Insiden production bersamaan dengan pekerjaan sprint.
- Beberapa stakeholder meminta prioritas berbeda di waktu yang sama.

## Interview Questions

1. Bagaimana Anda bekerja di bawah tekanan?
2. Ceritakan saat Anda hampir tidak memenuhi deadline.
3. Apa yang Anda lakukan bila dua atasan meminta prioritas berbeda?
4. Bagaimana menolak permintaan yang tidak realistis?
5. Bagaimana Anda menjaga kualitas saat waktunya sempit?

## Sample Answers

1. Jawab dengan pendekatan (prioritas, komunikasi, kualitas minimum) lalu langsung beri contoh STAR singkat.
2. Ceritakan dengan jujur, termasuk kapan Anda menyadari risikonya, bagaimana Anda mengomunikasikan, opsi yang ditawarkan, dan hasil akhirnya.
3. Jangan memilih sendiri secara diam-diam: jelaskan dampak dan estimasi masing-masing, lalu minta keputusan bersama dari pihak yang berwenang (atau atasan bersama); dokumentasikan kesepakatan.
4. Pahami tujuan di balik permintaan, tunjukkan estimasi dan risikonya dengan data, lalu tawarkan alternatif yang mencapai tujuan utama (MVP, bertahap).
5. Tentukan alur kritis yang wajib dites dan direview, gunakan feature flag/staged rollout, tunda polesan non-kritis dan catat sebagai technical debt yang dijadwalkan.

## Practical Exercises

1. Tulis satu cerita deadline ketat dan satu cerita prioritas yang bertabrakan.
2. Latih kalimat negosiasi scope: "Untuk tanggal X, yang bisa saya jamin aman adalah A dan B; C bisa menyusul tanggal Y."
3. Buat daftar "kualitas minimum" pribadi yang tidak Anda korbankan.

## Quick Reference

```text
Klarifikasi tujuan → pecah tugas → MoSCoW → negosiasi scope (bukan kualitas) → update rutin
Kualitas minimum: test alur kritis · review · keamanan · feature flag
Hindari: klaim tanpa contoh · glorifikasi lembur · kabar buruk di hari H
```

## Related Topics

- [STAR Method & Story Bank](/interview/behavioral/star-method/)
- [Handling Production Bugs](/interview/behavioral/production-bugs/)
- [Technical Debt](/interview/behavioral/technical-debt/)
