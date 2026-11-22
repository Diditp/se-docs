---
title: "Handling Production Bugs"
description: "Cara menjawab pertanyaan tentang menangani bug/insiden production: triage, mitigasi, komunikasi, root cause, postmortem tanpa menyalahkan, serta contoh cerita STAR untuk aplikasi mobile."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, behavioral, incident, production, postmortem]
---

## Overview

*"Ceritakan saat ada bug kritis di production"* adalah pertanyaan favorit untuk menilai ketenangan, prioritas,
komunikasi, dan tanggung jawab. Kuncinya: **mitigasi dulu, root cause kemudian, pencegahan di akhir**, dengan komunikasi
yang jelas sepanjang proses.

:::note
Contoh cerita adalah struktur. Gunakan insiden nyata Anda; samarkan data sensitif.
:::

## Why It Matters

Setiap sistem akan mengalami insiden. Perusahaan mencari engineer yang tidak panik, tidak saling menyalahkan,
memprioritaskan dampak ke pengguna, dan memperbaiki proses agar insiden serupa tidak terulang.

## Core Concepts

| Fase | Tujuan | Contoh tindakan (mobile + backend) |
| --- | --- | --- |
| Detect | Tahu secepatnya | Crashlytics alert, error rate API, laporan CS |
| Triage | Ukur dampak & prioritas | Berapa % user, fitur apa, ada kerugian data/uang? |
| Communicate | Semua pihak tahu status | Update berkala ke tim/CS/atasan |
| Mitigate | Hentikan dampak | Rollback server, feature flag off, hotfix, Shorebird patch (Dart-only), force update |
| Resolve | Perbaiki akar masalah | Fix + test regresi |
| Recover | Pulihkan data | Script koreksi data, rekonsiliasi |
| Learn | Cegah terulang | Postmortem blameless, action items, alert/test baru |

**Blameless postmortem** — fokus pada *apa* di sistem/proses yang memungkinkan kesalahan terjadi, bukan *siapa*.

## How It Works

```text
Alert/laporan → triage (severity) → komunikasi awal → mitigasi cepat
           → root cause → fix + test → rilis bertahap → pemulihan data
           → postmortem → action items (test, alert, checklist) → follow-up
```

## Implementation

### Contoh jawaban (struktur)

**Pertanyaan:** "Ceritakan saat Anda menangani bug kritis di production."

> **S** — Setelah rilis versi baru aplikasi kasir, crash rate naik dari di bawah 1% menjadi sekitar 8% dalam dua jam;
> kasir di beberapa outlet tidak bisa membuka halaman pembayaran.
>
> **T** — Saya developer yang merilis fitur tersebut dan on-call hari itu.
>
> **A** — Saya cek Crashlytics: stack trace menunjukkan null error saat parsing konfigurasi metode pembayaran yang
> kosong untuk outlet tertentu. Karena dampaknya ke transaksi, saya langsung mengabari lead dan tim CS dengan ringkasan
> dampak dan perkiraan waktu. Mitigasi pertama: mematikan fitur baru lewat remote config sehingga app kembali ke alur
> lama dalam ±15 menit. Lalu saya memperbaiki parsing agar menangani data kosong dengan default yang aman, menambah unit
> test untuk konfigurasi kosong/rusak, dan merilis hotfix dengan staged rollout.
>
> **R** — Crash rate kembali normal dalam satu jam setelah fitur dimatikan; hotfix rilis keesokan harinya tanpa
> regresi. Di postmortem kami menambahkan: validasi kontrak data dari backend, test untuk data kosong, dan aturan bahwa
> fitur berisiko wajib di balik feature flag.

### Template update insiden

```text
[INSIDEN] Halaman pembayaran crash — Severity: Tinggi
Dampak   : ±8% sesi, outlet dengan konfigurasi X; transaksi tertunda
Status   : Mitigasi — fitur baru dimatikan via remote config (10:45)
Berikut  : Fix + test, hotfix staged rollout. Update berikutnya 12:00
PIC      : <nama>
```

## Best Practices

- **Mitigasi sebelum perfeksi** — rollback/feature flag lebih cepat dari fix sempurna.
- **Komunikasi proaktif & berkala**, termasuk saat belum ada kabar baru.
- **Ambil tanggung jawab** atas bagian Anda tanpa menyalahkan orang lain.
- **Perbaiki data**, bukan hanya kode — transaksi/stok yang rusak harus dipulihkan.
- **Postmortem dengan action items yang ditindaklanjuti**.
- Siapkan "sabuk pengaman" sebelum insiden: feature flag, staged rollout, crash reporting, kemampuan rollback.

## Anti-Patterns

- Diam-diam memperbaiki tanpa memberi tahu siapa pun.
- Langsung men-deploy fix besar yang belum dites di tengah panik.
- Menyalahkan QA/backend/user di jawaban interview.
- Cerita tanpa pelajaran atau perubahan proses.

## Performance Considerations

Ukuran keberhasilan yang bisa disebut: **MTTD** (waktu mendeteksi), **MTTR** (waktu memulihkan), crash-free users,
error rate. Menyebutkan angka ini membuat jawaban lebih kredibel.

## Security Considerations

Jika insiden menyangkut keamanan (kebocoran data, token), alurnya berbeda: libatkan tim security, batasi informasi,
rotasi kredensial, dan ikuti prosedur pelaporan perusahaan. Jangan menceritakan detail kerentanan yang masih relevan.

## Real-World Use Cases

- Crash setelah rilis aplikasi mobile (feature flag, staged rollout, hotfix).
- API mengembalikan data salah setelah migrasi database (rollback, script koreksi).
- Notifikasi terkirim berulang ke user (matikan job, dedup, permintaan maaf ke user).

## Interview Questions

1. Ceritakan saat Anda menangani bug kritis di production.
2. Apa yang Anda lakukan pertama kali saat production down?
3. Pernahkah Anda menyebabkan insiden? Apa yang terjadi?
4. Bagaimana mencegah bug yang sama terulang?
5. Bagaimana Anda berkomunikasi dengan non-teknis saat insiden?

## Sample Answers

1. Gunakan struktur di atas: deteksi → triage → komunikasi → mitigasi → fix → pemulihan → postmortem.
2. Pastikan dampak dan cakupannya (triage), beri tahu pihak terkait, lalu cari mitigasi tercepat yang aman (rollback/feature flag) sebelum menggali akar masalah.
3. Jujur: jelaskan kesalahan Anda, bagaimana Anda segera mengakuinya, langkah pemulihan, dan perubahan konkret (test, checklist, review) yang Anda dorong setelahnya.
4. Test regresi untuk kasus tersebut, alert/monitoring yang mendeteksi lebih cepat, perubahan proses (feature flag, staged rollout, validasi kontrak), dan dokumentasi postmortem.
5. Fokus pada dampak dan waktu, bukan detail teknis: apa yang terdampak, apa yang sudah dilakukan, kapan update berikutnya, apa yang perlu dilakukan user/CS sementara.

## Practical Exercises

1. Tulis satu cerita insiden dengan semua fase (detect → learn).
2. Buat template postmortem singkat untuk proyek pribadi Anda.
3. Daftar "sabuk pengaman" yang sudah/belum ada di aplikasi Anda (feature flag, crash reporting, rollback, staged rollout).

## Quick Reference

```text
Detect → Triage → Communicate → Mitigate → Resolve → Recover data → Postmortem (blameless)
Mitigasi: rollback · feature flag · staged rollout · hotfix · force update
Sebut angka: crash rate, MTTR, % user terdampak · ambil tanggung jawab · action items
```

## Related Topics

- [Problem Solving](/interview/behavioral/problem-solving/)
- [Working Under Pressure](/interview/behavioral/working-under-pressure/)
- [Debugging & Performance Questions](/interview/technical/debugging-performance/)
