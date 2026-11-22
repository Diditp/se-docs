---
title: "Technical Decision Making"
description: "Menjawab pertanyaan tentang keputusan teknis: memilih library/arsitektur/state management, kriteria evaluasi, trade-off, ADR, reversibility, dan mengakui keputusan yang keliru — dengan contoh STAR."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, behavioral, decision-making, architecture, trade-off, adr]
---

## Overview

*"Ceritakan keputusan teknis penting yang pernah Anda ambil"* atau *"Mengapa memilih Bloc dan bukan Riverpod?"*
menilai apakah keputusan Anda **beralasan**: berdasarkan kebutuhan, kriteria yang jelas, dan trade-off yang disadari —
bukan tren atau selera pribadi.

:::note
Contoh cerita adalah struktur; gunakan keputusan nyata yang pernah Anda ambil atau ikut ambil.
:::

## Why It Matters

Keputusan teknis (arsitektur, library, database, pola sync) berdampak bertahun-tahun pada tim. Interviewer ingin melihat
kedewasaan engineering: mempertimbangkan biaya jangka panjang, kemampuan tim, risiko, dan kemampuan untuk berubah arah.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Kriteria evaluasi | Kebutuhan fungsional, performa, maintainability, kurva belajar tim, ekosistem/komunitas, lisensi, biaya |
| Trade-off | Tidak ada pilihan sempurna — sebutkan apa yang dikorbankan |
| Reversibility | Keputusan "pintu dua arah" (mudah diubah) boleh cepat; "pintu satu arah" butuh analisis lebih |
| Proof of concept | Uji opsi teratas dengan spike kecil yang ber-time-box |
| ADR | *Architecture Decision Record*: konteks, keputusan, alternatif, konsekuensi |
| Isolasi | Bungkus dependensi di balik interface agar bisa diganti |

## How It Works

```text
Masalah & kebutuhan → kriteria (berbobot) → 2–3 opsi → spike/PoC bila perlu
→ keputusan + trade-off → tulis ADR → implementasi bertahap → evaluasi ulang
```

## Implementation

### Contoh jawaban (struktur)

**Pertanyaan:** "Ceritakan keputusan teknis yang Anda ambil dan bagaimana Anda sampai ke sana."

> **S** — Aplikasi POS harus tetap bisa bertransaksi tanpa internet. Penyimpanan lokal awalnya memakai key-value
> sederhana, dan query laporan harian mulai lambat serta rawan data tidak konsisten.
>
> **T** — Saya diminta mengusulkan penyimpanan lokal yang baru.
>
> **A** — Saya menuliskan kebutuhan: relasi (order–item–produk), query agregat, transaksi atomik, migrasi skema, dan
> testability. Opsinya: tetap key-value, Isar/ObjectBox, atau SQLite via Drift. Saya membuat spike dua hari untuk Drift
> dan satu alternatif, mengukur waktu query laporan dengan data sebanyak outlet terbesar. Drift unggul di relasi,
> transaksi, migrasi yang eksplisit, dan SQL yang sudah dikuasai tim; kekurangannya code generation dan boilerplate. Saya
> menulis ADR, membungkus akses data di repository supaya UI tidak bergantung pada Drift, dan memigrasikan per modul.
>
> **R** — Query laporan harian menjadi jauh lebih cepat dan kasus stok tidak konsisten karena operasi setengah jadi hilang
> berkat transaksi. ADR membantu anggota baru memahami alasan pilihan itu.

### Template ADR singkat

```markdown
# ADR-007: Penyimpanan lokal menggunakan Drift (SQLite)
Status: Accepted · Tanggal: 2026-03-02
## Konteks
Transaksi offline butuh relasi, query agregat, dan atomicity.
## Keputusan
Gunakan Drift di balik repository interface.
## Alternatif
Key-value (tidak ada relasi/transaksi), NoSQL lokal (query agregat terbatas untuk kebutuhan kami).
## Konsekuensi
+ Transaksi & migrasi eksplisit, SQL familiar. − Code generation, waktu build bertambah.
```

## Best Practices

- **Mulai dari masalah dan kebutuhan**, bukan dari teknologi.
- **Gunakan kriteria eksplisit** dan, bila perlu, beri bobot.
- **Ukur dengan spike/PoC** pada data realistis.
- **Sebutkan trade-off dan mitigasinya** (abstraksi, migrasi bertahap).
- **Libatkan tim** dan dokumentasikan dengan ADR.
- **Evaluasi ulang** setelah berjalan; berani mengoreksi.

## Anti-Patterns

- "Karena lagi populer" atau "karena saya suka".
- Resume-driven development — memilih teknologi untuk menambah CV.
- Keputusan besar tanpa melibatkan tim atau tanpa dokumentasi.
- Menolak mengakui keputusan yang ternyata salah.

## Performance Considerations

Bila keputusan menyangkut performa, sebutkan **cara mengukurnya** (benchmark, profiling, data produksi) dan hasilnya —
angka membuat keputusan terdengar matang.

## Security Considerations

Masukkan keamanan dalam kriteria: rekam jejak kerentanan library, maintainer aktif, lisensi, data yang dikirim SDK pihak
ketiga, serta dukungan enkripsi untuk data sensitif.

## Real-World Use Cases

- Memilih state management (Bloc vs Riverpod) untuk tim yang sedang bertumbuh.
- Memilih penyimpanan lokal & strategi sinkronisasi offline.
- Memilih antara aplikasi native vs Flutter untuk modul tertentu.
- Memilih REST vs GraphQL, monolith vs microservices di backend.

## Interview Questions

1. Ceritakan keputusan teknis penting yang Anda ambil.
2. Mengapa memilih state management/library X?
3. Ceritakan keputusan teknis yang ternyata salah.
4. Bagaimana Anda meyakinkan tim untuk mengadopsi pendekatan baru?
5. Bagaimana Anda menyeimbangkan solusi ideal dengan tenggat waktu?

## Sample Answers

1. STAR dengan kriteria, opsi, PoC, trade-off, dokumentasi, dan hasil terukur.
2. Kaitkan dengan kebutuhan: kompleksitas state, kebutuhan test, ukuran tim dan kurva belajar, konsistensi pola; sebutkan juga kapan Anda akan memilih alternatifnya.
3. Jujur: keputusan dan alasannya saat itu, sinyal bahwa keputusan keliru, bagaimana Anda mengoreksi (migrasi bertahap), dan perubahan proses (spike lebih awal, kriteria lebih lengkap).
4. Mulai dari masalah yang dirasakan tim, tunjukkan PoC kecil dan data, ajukan rencana adopsi bertahap, dengarkan keberatan, dan dokumentasikan.
5. Pisahkan keputusan "pintu satu arah" (perlu dipikirkan matang, mis. skema data) dari "pintu dua arah" (boleh cepat); pilih solusi cukup baik yang mudah diubah, catat technical debt yang disengaja.

## Practical Exercises

1. Tulis ADR untuk satu keputusan di proyek Anda (state management, local DB, navigation).
2. Buat tabel kriteria berbobot untuk membandingkan dua library yang Anda kenal.
3. Siapkan cerita "keputusan yang salah" yang jujur dan menunjukkan pembelajaran.

## Quick Reference

```text
Masalah → kriteria → opsi → PoC → keputusan + trade-off → ADR → evaluasi ulang
Pintu dua arah: cepat · pintu satu arah: hati-hati · bungkus dependensi di balik interface
Hindari: hype · resume-driven · keputusan sendirian tanpa dokumentasi
```

## Related Topics

- [Technical Debt](/interview/behavioral/technical-debt/)
- [Team Collaboration](/interview/behavioral/team-collaboration/)
- [Clean Architecture Questions](/interview/technical/clean-architecture/)
