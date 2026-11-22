---
title: "Requirement Analysis"
description: "Cara menggali, menganalisis, mendokumentasikan, dan memvalidasi kebutuhan: stakeholder, teknik elisitasi, user story & acceptance criteria, use case, prioritisasi MoSCoW, traceability, dan menangani perubahan kebutuhan."
level: beginner
status: complete
updated: 2026-11-12
tags: [fundamentals, requirements, user-story, analysis]
---

## Overview

**Requirement analysis** adalah proses memahami **masalah apa yang harus diselesaikan dan untuk siapa**, lalu
menerjemahkannya menjadi kebutuhan yang jelas, dapat diuji, dan disepakati. Kesalahan di tahap ini paling mahal karena
semua tahap berikutnya dibangun di atasnya.

## Why It Matters

Banyak proyek gagal bukan karena kode buruk, tetapi karena membangun hal yang salah. Engineer yang bisa bertanya dengan
tepat, menemukan kasus tepi, dan menulis acceptance criteria yang jelas menghemat waktu tim dan meningkatkan kepercayaan
stakeholder.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Stakeholder | Semua pihak yang terdampak: user, admin, manajemen, tim IT, regulator |
| Elicitation | Menggali kebutuhan: wawancara, observasi, workshop, analisis dokumen/sistem lama, prototipe |
| Business requirement | Tujuan bisnis ("kurangi waktu antre kasir") |
| User requirement | Apa yang dilakukan user ("kasir dapat mencari produk dengan barcode") |
| System requirement | Perilaku sistem detail, termasuk non-fungsional |
| User story | "Sebagai <peran>, saya ingin <aksi>, agar <manfaat>" |
| Acceptance criteria | Kondisi yang harus terpenuhi agar story dianggap selesai |
| Traceability | Keterkaitan kebutuhan ↔ desain ↔ test |

**Kriteria kebutuhan yang baik**: jelas (tidak ambigu), lengkap, konsisten, dapat diuji, layak (feasible), dan
diprioritaskan.

## How It Works

```text
Identifikasi stakeholder → elisitasi (tanya "mengapa", amati proses nyata)
→ analisis (kelompokkan, temukan konflik & kasus tepi, prioritaskan)
→ spesifikasi (user story, use case, NFR, prototipe)
→ validasi (review bersama stakeholder, prototipe, acceptance criteria)
→ manajemen perubahan (backlog, versi, dampak)
```

## Implementation

### Pertanyaan elisitasi yang berguna

```text
- Masalah apa yang terjadi sekarang? Bagaimana prosesnya hari ini (tunjukkan)?
- Siapa saja penggunanya? Berapa banyak? Perangkat & koneksi seperti apa?
- Apa yang terjadi jika ... gagal / offline / data salah?
- Bagaimana kita tahu fitur ini berhasil (metrik)?
- Apa yang TIDAK termasuk scope?
- Ada aturan bisnis/regulasi yang berlaku?
- Sistem lain apa yang harus terintegrasi?
```

### User story + acceptance criteria

```markdown
**Story:** Sebagai kasir, saya ingin membatalkan (void) transaksi yang salah input,
agar laporan penjualan tetap akurat.

**Acceptance criteria**
1. Void hanya untuk transaksi hari yang sama dan butuh PIN supervisor.
2. Alasan void wajib dipilih dari daftar.
3. Stok produk dikembalikan otomatis.
4. Transaksi void tetap tampil di laporan dengan status "Dibatalkan" (tidak dihapus).
5. Void tetap bisa dilakukan saat offline dan tersinkron saat online.

**Out of scope:** refund pembayaran non-tunai (story terpisah).
```

### Use case singkat

```text
Use case : Void Transaksi
Aktor    : Kasir, Supervisor
Pra-kondisi: Transaksi berstatus Lunas pada hari yang sama
Alur utama : 1) Kasir pilih transaksi 2) Pilih alasan 3) Supervisor input PIN 4) Sistem ubah status, kembalikan stok, catat audit
Alur alternatif: 3a) PIN salah 3× → kunci aksi void 5 menit
```

### Prioritisasi MoSCoW

| Kategori | Contoh |
| --- | --- |
| Must | Void dengan PIN supervisor, audit log |
| Should | Laporan void per kasir |
| Could | Notifikasi ke pemilik saat void > N kali |
| Won't (sekarang) | Void lintas hari |

## Best Practices

- **Tanya "mengapa" hingga ke tujuan bisnis** — solusi yang diminta user belum tentu solusi terbaik.
- **Amati proses nyata** (datang ke outlet, lihat kasir bekerja).
- **Tuliskan out-of-scope** secara eksplisit.
- **Buat acceptance criteria yang dapat diuji** dan pakai sebagai dasar test.
- **Prototipe cepat** (wireframe, Figma) untuk memvalidasi pemahaman.
- **Kelola perubahan**: perubahan dicatat, dinilai dampaknya, diprioritaskan ulang.

## Anti-Patterns

- Kebutuhan ambigu: "aplikasi harus cepat", "mudah digunakan".
- Hanya bertanya ke manajemen, tidak ke pengguna sebenarnya.
- Mendesain solusi teknis sebelum memahami masalah.
- Kebutuhan disimpan di chat yang tercecer tanpa sumber kebenaran.
- Mengabaikan kasus tepi (offline, data kosong, izin ditolak).

## Performance Considerations

Ubah harapan performa menjadi angka terukur: "hasil pencarian produk muncul ≤ 300 ms untuk 20.000 produk di perangkat
kelas menengah", bukan "pencarian cepat".

## Security Considerations

Identifikasi kebutuhan keamanan sejak awal: data sensitif apa yang diproses, siapa yang boleh mengakses (matriks peran),
kebutuhan audit, retensi data, dan regulasi pelindungan data pribadi yang berlaku.

## Real-World Use Cases

- Menyusun SRS/PRD untuk proyek klien atau tender.
- Refinement backlog sebelum sprint planning.
- Menganalisis sistem lama sebelum migrasi.

## Interview Questions

1. Bagaimana Anda menggali kebutuhan dari klien yang belum tahu apa yang diinginkan?
2. Apa itu user story dan acceptance criteria?
3. Bagaimana menangani perubahan kebutuhan di tengah pengembangan?
4. Apa ciri kebutuhan yang baik?
5. Bagaimana memprioritaskan kebutuhan?

## Sample Answers

1. Mulai dari masalah & tujuan bisnis, wawancara pengguna nyata, amati proses yang berjalan, tunjukkan prototipe untuk memancing feedback, lalu iterasi.
2. User story menggambarkan kebutuhan dari sudut pandang pengguna (peran, aksi, manfaat); acceptance criteria adalah kondisi terukur yang harus dipenuhi agar story selesai, sekaligus dasar test.
3. Catat perubahan, analisis dampak (waktu, biaya, risiko), diskusikan prioritas dengan stakeholder, perbarui backlog/dokumen; dalam Agile, perubahan masuk ke sprint berikutnya kecuali mendesak.
4. Jelas, lengkap, konsisten, dapat diuji, layak, dapat ditelusuri, dan diprioritaskan.
5. Berdasarkan nilai bisnis, risiko, ketergantungan, dan effort — dengan MoSCoW, value vs effort matrix, atau keputusan product owner.

## Practical Exercises

1. Ubah kebutuhan "aplikasi harus mudah dan cepat" menjadi 3 kebutuhan yang dapat diuji.
2. Tulis user story + acceptance criteria + out of scope untuk fitur "diskon member".
3. Buat daftar 10 pertanyaan elisitasi untuk aplikasi pencatatan meter lapangan.

## Quick Reference

```text
Stakeholder → elisitasi → analisis → spesifikasi → validasi → change management
Story: Sebagai <peran>, saya ingin <aksi>, agar <manfaat> · AC terukur (Given–When–Then)
Baik = jelas · lengkap · konsisten · testable · feasible · prioritized · tulis out-of-scope
```

## Related Topics

- [Functional & Non-Functional Requirements](/fundamentals/functional-non-functional-requirements/)
- [SDLC](/fundamentals/sdlc/)
- [Agile, Scrum & Code Review](/fundamentals/agile-scrum-code-review/)
