---
title: "Agile, Scrum & Code Review"
description: "Nilai Agile, kerangka Scrum (peran, event, artefak), Kanban, estimasi & story point, Definition of Ready/Done, serta praktik code review yang efektif: ukuran PR, checklist reviewer, cara memberi dan menerima feedback."
level: beginner
status: complete
updated: 2026-11-12
tags: [fundamentals, agile, scrum, kanban, code-review]
---

## Overview

**Agile** adalah pendekatan pengembangan yang mengutamakan rilis kecil berkala, kolaborasi, dan respons terhadap
perubahan. **Scrum** dan **Kanban** adalah kerangka kerja Agile yang paling umum. **Code review** adalah praktik inti
kualitas di tim mana pun, apa pun kerangkanya.

## Why It Matters

Hampir semua tim software memakai variasi Scrum/Kanban. Interviewer menanyakan pengalaman Anda bekerja dalam sprint,
estimasi, dan code review untuk menilai kesiapan bekerja di tim.

## Core Concepts

### Agile Manifesto (nilai)

Individu & interaksi > proses & alat · Software yang berfungsi > dokumentasi lengkap · Kolaborasi dengan pelanggan >
negosiasi kontrak · Merespons perubahan > mengikuti rencana. (*Hal di kanan tetap bernilai, yang di kiri lebih
diutamakan.*)

### Scrum

| Elemen | Isi |
| --- | --- |
| Peran | Product Owner (prioritas & nilai), Scrum Master (proses & hambatan), Developers (membangun increment) |
| Event | Sprint (1–4 minggu), Sprint Planning, Daily Scrum (≤ 15 menit), Sprint Review, Sprint Retrospective |
| Artefak | Product Backlog, Sprint Backlog, Increment |
| Komitmen | Product Goal, Sprint Goal, Definition of Done |

### Kanban

Aliran kerja kontinu di papan (To Do → In Progress → Review → Done) dengan **WIP limit**; metrik lead time & cycle
time. Cocok untuk tim support/ops atau pekerjaan yang datang tidak terduga.

### Estimasi

Story point (relatif: kompleksitas + ketidakpastian + effort), skala Fibonacci (1, 2, 3, 5, 8, 13), planning poker.
**Velocity** = rata-rata point selesai per sprint — alat perencanaan tim, bukan ukuran produktivitas individu.

### Definition of Ready / Done

```markdown
DoR: story jelas, acceptance criteria ada, desain/API tersedia, dependensi diketahui, cukup kecil untuk 1 sprint.
DoD: kode direview & di-merge, test otomatis lulus, AC terpenuhi, tidak ada error lint, dokumentasi diperbarui, sudah di staging.
```

## How It Works

```text
Backlog refinement → Sprint Planning (sprint goal + backlog) → Daily Scrum
→ kerja: branch → PR → code review → CI → merge → staging
→ Sprint Review (demo increment) → Retrospective (perbaikan proses) → sprint berikutnya
```

## Implementation

### Code review: ukuran & deskripsi PR

```markdown
## Ringkasan
Menambahkan void transaksi dengan PIN supervisor (STORY-142).

## Perubahan
- Use case VoidSale + test
- Outbox event `sale.voided`
- UI dialog PIN

## Cara uji
1. Buat transaksi → menu ⋮ → Void → masukkan PIN 1234 (seed dev)
2. Cek stok kembali dan transaksi berstatus "Dibatalkan"

## Catatan
Refund non-tunai di luar scope (STORY-150). Screenshot terlampir.
```

PR ideal kecil (umumnya < ±400 baris perubahan bermakna) dan fokus pada satu tujuan.

### Checklist reviewer

```markdown
- [ ] Memenuhi acceptance criteria & tujuan PR
- [ ] Logika benar, termasuk edge case (kosong, offline, error, concurrency)
- [ ] Desain sesuai arsitektur/aturan modul; tidak ada duplikasi aturan bisnis
- [ ] Test memadai dan bermakna
- [ ] Keamanan: input divalidasi, otorisasi, tidak ada secret/log data sensitif
- [ ] Performa: tidak ada N+1, rebuild berlebihan, operasi berat di main thread
- [ ] Keterbacaan: nama jelas, fungsi kecil
- [ ] Dokumentasi/migrasi/konfigurasi diperbarui
```

### Memberi feedback

```text
❌ "Ini salah."
✅ "Kalau request ini di-retry saat timeout, apakah order bisa terbuat dua kali? Mungkin perlu idempotency key."
Label: [blocking] wajib · [suggestion] opsional · [nit] kosmetik · [question] ingin memahami
```

## Best Practices

- **Sprint goal yang jelas**, bukan sekadar daftar tiket.
- **Story kecil & vertikal** (UI → API → DB) agar bisa selesai dan didemo.
- **Daily Scrum untuk koordinasi**, bukan laporan status ke atasan.
- **Retrospektif menghasilkan 1–3 aksi konkret** yang ditindaklanjuti.
- **Review cepat** (mis. dalam satu hari kerja) agar alur tidak tersendat.
- **Otomatiskan hal mekanis** (format, lint, test) agar review fokus pada logika & desain.

## Anti-Patterns

- "Scrum" tanpa product owner atau tanpa retrospektif.
- Story point dipakai untuk membandingkan individu.
- PR raksasa yang hanya di-approve tanpa dibaca ("LGTM").
- Review yang menyerang orang, atau berdebat soal gaya yang seharusnya diatur formatter.
- Sprint yang terus diisi pekerjaan baru di tengah jalan tanpa negosiasi.

## Performance Considerations

Ukur kesehatan alur kerja: cycle time PR (buka → merge), waktu tunggu review, jumlah bug lolos ke production. Waktu
tunggu review yang panjang sering menjadi bottleneck terbesar tim.

## Security Considerations

Code review adalah kontrol keamanan penting: wajibkan review untuk perubahan autentikasi, pembayaran, dan konfigurasi
CI; gunakan CODEOWNERS untuk area sensitif; jangan meloloskan secret di diff.

## Real-World Use Cases

- Scrum dua mingguan untuk pengembangan aplikasi mobile & backend.
- Kanban untuk tim support/maintenance dengan tiket yang datang terus.
- Branch protection + CODEOWNERS + checklist review di GitHub.

## Interview Questions

1. Jelaskan Scrum: peran, event, dan artefak.
2. Apa beda Scrum dan Kanban?
3. Apa itu story point dan velocity?
4. Apa itu Definition of Done?
5. Apa yang Anda periksa saat code review?
6. Bagaimana menanggapi komentar review yang tidak Anda setujui?

## Sample Answers

1. Peran: Product Owner, Scrum Master, Developers. Event: Sprint, Sprint Planning, Daily Scrum, Sprint Review, Retrospective. Artefak: Product Backlog, Sprint Backlog, Increment.
2. Scrum memakai iterasi bertempo tetap dengan peran dan event yang ditentukan; Kanban berfokus pada aliran kontinu, visualisasi, dan WIP limit tanpa sprint tetap.
3. Story point adalah ukuran relatif kompleksitas/ketidakpastian/effort; velocity adalah rata-rata point yang diselesaikan tim per sprint untuk perencanaan, bukan penilaian individu.
4. Kriteria bersama yang harus dipenuhi agar pekerjaan dianggap selesai (review, test, AC, dokumentasi, deploy ke staging), memastikan kualitas konsisten.
5. Kebenaran dan edge case, kesesuaian dengan kebutuhan dan arsitektur, test, keamanan, performa, keterbacaan, serta dokumentasi/migrasi.
6. Pahami alasan reviewer, jelaskan pertimbangan saya dengan data, cari solusi bersama; bila tidak sepakat, libatkan orang ketiga atau putuskan sesuai konvensi tim — tetap profesional dan tidak defensif.

## Practical Exercises

1. Tulis DoR dan DoD untuk tim Anda.
2. Review satu PR open source dengan checklist di atas.
3. Pecah satu epic besar menjadi 5 user story vertikal yang masing-masing selesai dalam ≤ 3 hari.

## Quick Reference

```text
Scrum: PO · SM · Devs | Sprint · Planning · Daily · Review · Retro | Backlog · Sprint Backlog · Increment
Kanban: aliran + WIP limit · story point relatif · velocity untuk tim
PR kecil + deskripsi + cara uji · review: benar · desain · test · security · performa · keterbacaan
Label feedback: blocking / suggestion / nit / question
```

## Related Topics

- [SDLC](/fundamentals/sdlc/)
- [Git Workflow](/fundamentals/git-workflow/)
- [Team Collaboration](/interview/behavioral/team-collaboration/)
