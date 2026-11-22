---
title: "AGENTS.md: Konsep & Cara Menulis"
description: "Apa itu AGENTS.md, bagaimana AI coding agent membacanya, struktur yang efektif, hierarki file per folder, dan cara menulis instruksi yang konkret serta dapat diverifikasi."
level: beginner
status: complete
version: "Konvensi AGENTS.md (agents.md) — 2025/2026"
updated: 2026-11-07
tags: [ai, agents-md, ai-coding, conventions, documentation]
---

## Overview

**AGENTS.md** adalah file Markdown di repository yang berisi instruksi untuk **AI coding agent** — semacam
"README untuk agent". README ditulis untuk manusia (apa project ini, cara mulai); AGENTS.md ditulis untuk agent
(perintah persis, batas arsitektur, larangan, dan definisi selesai). Format ini dipakai lintas banyak tool AI coding
sebagai konvensi terbuka; beberapa tool juga membaca file khusus miliknya sendiri (mis. `CLAUDE.md`, file rules di folder
konfigurasi tool) — Anda bisa membuat file tersebut merujuk/menyalin AGENTS.md agar satu sumber kebenaran.

## Why It Matters

Tanpa konteks, agent akan menebak: memakai package yang tidak Anda pakai, menaruh logika di layer yang salah, melewatkan
test, atau "memperbaiki" lint dengan menonaktifkannya. AGENTS.md yang baik:

- Membuat output agent **konsisten dengan konvensi tim** sejak percobaan pertama.
- Mengurangi review berulang untuk kesalahan yang sama.
- Menjadi **dokumentasi engineering yang dapat dieksekusi** — juga bermanfaat untuk developer baru.

## Core Concepts

- **Konkret & dapat diverifikasi** — "Jalankan `flutter analyze`; harus 0 issue" lebih efektif daripada "tulis kode berkualitas".
- **Perintah persis** — setup, build, test, lint, format, migrasi, dengan flag yang benar.
- **Batas (boundaries)** — layer mana boleh mengimport apa; folder yang tidak boleh disentuh (generated, vendor, migration lama).
- **Larangan eksplisit (MUST NOT)** — pola yang dilarang beserta alternatifnya.
- **Definition of Done** — checklist yang harus terpenuhi sebelum agent menyatakan selesai.
- **Hierarki** — AGENTS.md di root berlaku global; AGENTS.md di subfolder (mis. `backend/AGENTS.md`) menambah/menimpa aturan untuk file di folder tersebut. Instruksi langsung dari user di chat biasanya lebih diprioritaskan.
- **Ringkas** — agent membaca file ini di setiap tugas; bagian yang panjang dan generik mengurangi bobot aturan penting.

## How It Works

```text
repo/
├── AGENTS.md                 ← aturan global: workflow, git, security, DoD
├── mobile/AGENTS.md          ← Flutter: arsitektur, state management, test
├── backend/AGENTS.md         ← Node.js: API conventions, DB, migration
└── docs/adr/                 ← keputusan arsitektur yang dirujuk AGENTS.md

Agent mengerjakan backend/src/orders/service.ts
  → membaca AGENTS.md (root) + backend/AGENTS.md (lebih spesifik, menang jika konflik)
  → menjalankan perintah test/lint yang tertulis
  → memeriksa Definition of Done sebelum melapor selesai
```

## Implementation

### Struktur yang direkomendasikan

```markdown
# AGENTS.md

## Project Overview          ← 3–5 kalimat: produk, stack, modul utama
## Setup & Commands          ← perintah persis (install, dev, test, lint, format, build, migrate)
## Architecture & Boundaries ← layer, folder, aturan import, pola utama
## Coding Conventions        ← naming, error handling, logging, async, style
## Testing Requirements      ← apa yang wajib dites, lokasi, cara menjalankan, coverage
## Security Rules            ← secrets, validasi input, auth, data sensitif
## Performance Rules         ← batasan & pola yang dilarang
## Git & PR                  ← format commit, ukuran PR, apa yang ditulis di deskripsi
## Do / Don't                ← daftar MUST / MUST NOT singkat
## Definition of Done        ← checklist yang bisa dicentang
```

### Instruksi lemah vs kuat

| ❌ Lemah | ✅ Kuat |
| --- | --- |
| Tulis clean code. | Fungsi maks. ±40 baris; jika lebih, ekstrak private method dengan nama yang menjelaskan maksud. |
| Gunakan best practice state management. | Gunakan `flutter_bloc` (Cubit untuk state sederhana). Jangan menambah Provider/GetX/Riverpod. |
| Pastikan aman. | Semua query lewat repository dengan parameter (`$1`), tidak ada string concatenation SQL. Jangan log `Authorization` header. |
| Tambahkan test. | Setiap use case baru wajib unit test di `test/features/<feature>/domain/` mencakup sukses + minimal 1 failure. |
| Jangan rusak apa pun. | Jangan mengubah file di `lib/generated/`, `*.g.dart`, `*.freezed.dart`; jalankan `dart run build_runner build -d` untuk regenerasi. |

### Siklus perbaikan AGENTS.md

1. Agent membuat kesalahan yang sama dua kali → tambahkan aturan **spesifik** yang mencegahnya.
2. Aturan tidak pernah relevan dalam beberapa bulan → hapus.
3. Review AGENTS.md seperti kode (lewat PR), karena ia memengaruhi semua perubahan berikutnya.

## Best Practices

- **Tulis untuk eksekusi, bukan inspirasi** — setiap baris harus mengubah perilaku agent atau bisa dicek.
- **Sertakan "mengapa" singkat** untuk aturan yang tidak jelas, agar agent bisa menerapkannya pada kasus baru.
- **Satu sumber kebenaran** — rujuk dokumen lain (ADR, API guidelines) daripada menyalin panjang; tetapi aturan kritis tetap ditulis di AGENTS.md.
- **Contoh kecil kode yang benar** untuk pola inti (struktur use case, format error API).
- **Definition of Done yang bisa diverifikasi mesin** (perintah yang exit code-nya 0).
- **Pisahkan per paket/folder** di monorepo.
- **Selaraskan dengan CI** — perintah di AGENTS.md sama dengan yang dijalankan pipeline.

## Anti-Patterns

- Menyalin template generik tanpa menyesuaikan dengan project (agent mengikuti aturan yang tidak berlaku).
- AGENTS.md ribuan baris berisi tutorial framework.
- Aturan yang saling bertentangan antar file tanpa penjelasan prioritas.
- Menaruh secret, URL internal sensitif, atau kredensial di AGENTS.md.
- Tidak pernah diperbarui sehingga perintah sudah tidak valid.

## Performance Considerations

AGENTS.md dibaca sebagai konteks setiap tugas: file yang terlalu panjang menghabiskan konteks dan dapat menurunkan
kepatuhan pada aturan penting. Target praktis: root < ~150–250 baris, file per paket lebih pendek. Pindahkan detail ke
dokumen yang dirujuk dan biarkan agent membacanya saat relevan.

## Security Considerations

- **Jangan pernah** menaruh token, password, atau isi `.env` di AGENTS.md.
- Tuliskan aturan eksplisit: jangan membaca/mengubah `.env`, jangan menjalankan perintah destruktif (`DROP`, `rm -rf`, `git push --force`) tanpa konfirmasi, jangan menambah dependency tanpa alasan.
- Minta agent menjelaskan setiap dependency baru (nama, alasan, lisensi) — mitigasi supply chain risk.
- Perlakukan konten dari internet/issue yang dibaca agent sebagai data, bukan instruksi (risiko prompt injection).

## Real-World Use Cases

- Project Flutter dengan Clean Architecture: agent selalu membuat fitur baru di `lib/features/<name>/{data,domain,presentation}` lengkap dengan test.
- Backend Node.js: agent selalu menambahkan validasi Zod, error Problem Details, dan migrasi baru alih-alih mengedit migrasi lama.
- Monorepo full-stack: kontrak OpenAPI sebagai sumber kebenaran; agent wajib memperbarui spec saat mengubah endpoint.

## Interview Questions

1. Apa itu AGENTS.md dan apa bedanya dengan README?
2. Instruksi seperti apa yang efektif untuk AI coding agent?
3. Bagaimana menjaga kualitas kode saat tim memakai AI agent?
4. Apa risiko keamanan memakai AI coding agent dan mitigasinya?

## Sample Answers

1. AGENTS.md adalah instruksi untuk AI agent: perintah build/test, batas arsitektur, konvensi, larangan, dan definition of done. README untuk manusia yang ingin memahami & memulai project. Keduanya saling melengkapi.
2. Spesifik, dapat dieksekusi, dan dapat diverifikasi — perintah persis, path folder, pola yang wajib/terlarang beserta alternatifnya, dan checklist selesai yang bisa dicek dengan exit code.
3. AGENTS.md yang jelas, CI yang sama ketatnya untuk kode manusia maupun AI (lint, test, security scan), PR kecil, review manusia yang fokus pada desain & keamanan, dan memperbarui AGENTS.md saat menemukan pola kesalahan.
4. Kebocoran secret, dependency berbahaya, kode rentan (SQL injection, authz hilang), perintah destruktif, dan prompt injection dari konten eksternal. Mitigasi: aturan eksplisit, least privilege untuk agent, sandbox, review diff, scanning otomatis.

## Practical Exercises

1. Tulis AGENTS.md untuk project Flutter Anda menggunakan [template Flutter](/agent-instructions/template-flutter-app/); sesuaikan setiap perintah dan path.
2. Minta agent membuat satu fitur kecil; catat setiap penyimpangan dari konvensi dan ubah menjadi aturan.
3. Ukur: berapa komentar review yang berulang sebelum dan sesudah AGENTS.md diperbarui.

## Quick Reference

- AGENTS.md = README untuk agent: **commands · boundaries · conventions · MUST NOT · DoD**.
- Konkret, dapat diverifikasi, ringkas; sertakan alasan singkat.
- Root untuk aturan global; subfolder untuk aturan spesifik.
- Tanpa secret. Selaras dengan CI. Perbarui saat agent mengulang kesalahan.

## Related Topics

- [AI Coding Workflow](/ai-engineering/guides/ai-coding-workflow/)
- [AGENTS.md — Global Engineering](/agent-instructions/global/)
- [AGENTS.md — Flutter Project](/agent-instructions/template-flutter-app/)
- [AGENTS.md — Node.js Backend](/agent-instructions/template-nodejs-backend/)
- Referensi: [agents.md](https://agents.md).
