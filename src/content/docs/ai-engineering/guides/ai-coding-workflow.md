---
title: "AI Coding Workflow"
description: "Best practice membangun project bersama AI coding agent agar hasilnya sesuai standar engineering dan keinginan Anda: siapkan aturan, beri konteks, minta rencana, kerjakan bertahap, verifikasi, review, dan perbaiki aturan."
level: intermediate
status: complete
version: "Konsep lintas tool — Claude Code, Codex, Copilot, dll."
updated: 2026-11-12
tags: [ai, agents, workflow, best-practice, code-review]
---

## Overview

**AI coding workflow** adalah cara kerja terstruktur saat memakai AI agent untuk menulis, mengubah, dan mereview kode.
Intinya: agent adalah rekan kerja yang sangat cepat tetapi **tidak tahu konvensi Anda** dan **tidak mengingat percakapan
sebelumnya**. Kualitas hasil ditentukan oleh tiga hal:

1. **Aturan tetap** yang selalu dibaca agent — file `AGENTS.md` (lihat [AI Agent Instructions](/agent-instructions/)).
2. **Konteks tugas** yang jelas di setiap prompt — tujuan, batasan, kriteria selesai.
3. **Loop verifikasi** — test, lint, review diff, lalu memperbaiki aturan bila agent salah.

## Why It Matters

Tanpa workflow, AI agent cenderung: memilih library sendiri, menaruh logika di layer yang salah, melewatkan test,
"memperbaiki" error dengan menonaktifkan lint, atau mengubah file yang tidak diminta. Hasilnya kode yang **jalan tetapi
tidak sesuai** — dan biaya review & refactor menghapus keuntungan kecepatan. Dengan workflow yang benar, agent menghasilkan
kode yang konsisten dengan arsitektur Anda, sehingga Anda fokus pada keputusan produk dan desain.

## Core Concepts

| Konsep | Arti |
| --- | --- |
| **Project instructions (`AGENTS.md`)** | Aturan permanen: perintah, struktur, larangan, Definition of Done |
| **Routing aturan** | Root `AGENTS.md` menunjuk file domain yang relevan → konteks tetap kecil |
| **Task spec** | Deskripsi tugas: tujuan, scope, acceptance criteria, file terkait |
| **Plan-then-execute** | Agent menulis rencana dulu; Anda menyetujui sebelum kode ditulis |
| **Small batches** | Satu tugas = satu perubahan logis yang bisa direview |
| **Verification loop** | Agent menjalankan format/lint/test sendiri dan melaporkan hasil apa adanya |
| **Human review** | Anda tetap pemilik kode: review diff, terutama keamanan & data |
| **Rule feedback loop** | Kesalahan berulang → aturan baru yang spesifik di `AGENTS.md` |

## How It Works

```text
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 1. Siapkan   │──►│ 2. Spesifikasi│──►│ 3. Rencana   │──►│ 4. Eksekusi  │──►│ 5. Verifikasi│
│ AGENTS.md    │   │ tugas        │   │ (approve)    │   │ bertahap     │   │ DoD + review │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────┬───────┘
        ▲                                                                           │
        └──────────── 6. Perbarui aturan bila agent mengulang kesalahan ◄──────────┘
```

## Implementation

### 1. Siapkan aturan sekali per project

- Salin template dari [AI Agent Instructions](/agent-instructions/) (mis. [Flutter](/agent-instructions/template-flutter-app/)) dan isi placeholder.
- Pastikan perintah di `AGENTS.md` **benar-benar jalan** di mesin Anda dan sama dengan CI.
- Tambahkan [shim](/agent-instructions/shims/) untuk tool yang Anda pakai.

### 2. Tulis task spec yang baik

```markdown
## Goal
Tambah fitur "riwayat transaksi per shift" di app kasir.

## Scope
- Layar list transaksi untuk shift aktif, urut terbaru, pagination 20.
- Data dari Drift (offline); tidak ada endpoint baru.

## Out of scope
- Filter tanggal, ekspor PDF.

## Acceptance criteria
- Menampilkan nomor struk, waktu, total (format rupiah), status sync.
- Empty state & error state.
- Cubit test (loading → loaded/empty/failure) + widget test 3 state.

## Context
- Ikuti pola fitur `order/` yang sudah ada.
- Rules: AGENTS.md → flutter, testing.
```

### 3. Minta rencana dulu untuk perubahan non-trivial

> "Baca AGENTS.md dan aturan yang dirujuk. **Jangan menulis kode dulu.** Buat rencana: file yang dibuat/diubah, alur data,
> test yang akan ditulis, risiko. Tunggu persetujuan saya."

Review rencana: apakah layer tepat? memakai pola yang ada? test cukup? Koreksi di sini jauh lebih murah daripada setelah kode jadi.

### 4. Eksekusi bertahap

- Satu tugas → satu branch → satu PR kecil.
- Untuk fitur besar: pecah menjadi langkah (domain → data → presentation → test) dan minta agent berhenti di setiap langkah.
- Jika agent mulai menyimpang, **hentikan dan arahkan ulang**; jangan biarkan ia "mencoba-coba" puluhan file.

### 5. Verifikasi & review

Minta laporan dengan format tetap:

```markdown
## Summary
## Files changed
## Verification (commands run + results)
## Not verified / assumptions
## Risks & follow-ups
```

Lalu review diff dengan checklist di bagian **Code Review Checklist** setiap file aturan. Fokus manusia:
otorisasi & data sensitif, query DB, perubahan kontrak API, nama & struktur, test yang benar-benar menguji perilaku.

### 6. Perbaiki aturan, bukan hanya kodenya

Jika agent dua kali melakukan kesalahan yang sama (mis. memanggil `dio` dari Cubit), tambahkan aturan spesifik dengan
alasannya ke file paling spesifik:

```markdown
- **MUST NOT** call `dio`/repositories' data sources from Cubits; call use cases. *Why:* keeps presentation independent of data layer (see ADR-0004).
```

## Best Practices

- **Aturan permanen di `AGENTS.md`, detail tugas di prompt.** Alasan: aturan permanen tidak perlu diulang; prompt tetap fokus.
- **Rencana sebelum kode** untuk perubahan > 3 file, skema DB, API publik, atau keamanan.
- **Perubahan kecil & dapat di-revert** — review lebih teliti, risiko lebih kecil.
- **Agent wajib menjalankan test & lint** dan melaporkan kegagalan apa adanya; Anda menjalankan ulang di CI.
- **Berikan contoh di codebase** ("ikuti pola `features/order/`") — contoh nyata lebih kuat daripada deskripsi.
- **Batasi akses agent**: tanpa secret produksi, tanpa akses deploy, konfirmasi untuk perintah destruktif.
- **Gunakan agent juga untuk review & test**: minta ia mereview diff dengan checklist, atau menulis test untuk kode lama sebelum refactor.
- **Jaga satu sumber kebenaran**: shim tool lain menunjuk ke `AGENTS.md`, jangan menyalin aturan ke banyak file.

## Anti-Patterns

| Anti-pattern | Akibat | Lakukan |
| --- | --- | --- |
| Prompt "buatkan aplikasi POS lengkap" | Ribuan baris tanpa arsitektur yang Anda mau | Pecah per fitur dengan task spec |
| Menerima kode tanpa membaca diff | Bug keamanan & data lolos | Review dengan checklist |
| Membiarkan agent menonaktifkan lint/test | Kualitas turun diam-diam | Aturan MUST NOT di AGENTS.md |
| Instruksi abstrak ("clean code") | Tidak mengubah perilaku | Aturan konkret & dapat diverifikasi |
| AGENTS.md raksasa berisi tutorial | Konteks penuh, aturan penting terabaikan | Aturan ringkas + routing; tutorial di materi belajar |
| Memberi secret/akses produksi | Risiko kebocoran & kerusakan | Least privilege, sandbox |
| Tidak memperbarui aturan | Kesalahan sama berulang | Rule feedback loop |

## Performance Considerations

"Performa" di sini adalah efisiensi kerja dan biaya:

- **Konteks kecil = hasil lebih baik**: routing memuat hanya file aturan yang relevan.
- **Tugas kecil** mengurangi iterasi panjang dan token terbuang.
- **Perintah verifikasi cepat** (unit test terpilih, analyze per paket) mempercepat loop; test penuh di CI.
- Aturan performa aplikasi tetap berlaku — agent harus mengikuti bagian *Performance Considerations* tiap domain.

## Security Considerations

- **Prompt injection**: konten dari issue, web, log, atau file data bisa berisi instruksi palsu — aturan global menyuruh agent memperlakukannya sebagai data.
- **Secrets**: agent tidak boleh membaca/mencetak `.env` atau keystore; gunakan `.env.example`.
- **Supply chain**: setiap dependency baru wajib dijustifikasi; cek nama package (typosquatting) sebelum disetujui.
- **Perintah destruktif** (`rm -rf`, `DROP`, force push) selalu dengan konfirmasi.
- **Review keamanan oleh manusia** untuk auth, otorisasi objek, pembayaran, dan data pribadi — lihat [Security Requirements](/agent-instructions/security/).

## Real-World Use Cases

- **Fitur baru di app Flutter**: agent membuat domain/data/presentation + test sesuai template; Anda mereview layer & UX.
- **Endpoint backend**: contract-first — agent memperbarui OpenAPI, implementasi, integration test termasuk akses lintas tenant.
- **Refactor aman**: agent menulis characterization test untuk kode lama → refactor → semua test tetap hijau.
- **Review PR**: agent menjalankan checklist review dan menandai potensi N+1, otorisasi hilang, atau test yang lemah.
- **Migrasi database**: agent menulis migrasi expand/contract dengan `CONCURRENTLY` dan rencana rollback.

## Interview Questions

1. Bagaimana Anda memastikan kode dari AI agent sesuai standar tim?
2. Apa isi AGENTS.md yang efektif?
3. Bagaimana Anda mereview kode yang dihasilkan AI?
4. Apa risiko keamanan memakai AI coding agent?
5. Kapan Anda tidak memakai AI agent?

## Sample Answers

1. Aturan permanen di `AGENTS.md` (struktur, larangan, perintah, Definition of Done) yang juga ditegakkan CI; task spec dengan acceptance criteria; rencana disetujui sebelum eksekusi; review diff dengan checklist; dan memperbarui aturan saat menemukan pola kesalahan.
2. Perintah persis (install, lint, test), struktur folder & batas layer, konvensi penamaan, aturan dependency, error handling, testing minimum, aturan keamanan, Definition of Done, dan checklist review — konkret, dapat diverifikasi, dengan alasan singkat.
3. Seperti PR rekan kerja: cocokkan dengan requirement, cek layer & pola, keamanan (validasi, otorisasi objek, secrets), query & performa, kualitas test (gagal jika perilaku rusak?), dan jalankan sendiri di CI.
4. Kebocoran secret, dependency berbahaya/typosquatting, kode rentan (injection, otorisasi hilang), prompt injection dari konten eksternal, dan perintah destruktif. Mitigasi: least privilege, aturan eksplisit, scanning otomatis, review manusia.
5. Untuk keputusan produk/arsitektur yang belum jelas (butuh diskusi manusia), perubahan keamanan kritis tanpa reviewer yang paham, atau saat tujuan belajar adalah memahami konsep dengan menulis sendiri.

## Practical Exercises

1. Pasang template [Flutter](/agent-instructions/template-flutter-app/) di project latihan dan isi semua placeholder.
2. Tulis task spec untuk satu fitur kecil, minta rencana, koreksi, lalu eksekusi.
3. Catat setiap koreksi review selama seminggu; ubah 3 koreksi tersering menjadi aturan di `AGENTS.md`.
4. Minta agent mereview PR Anda sendiri memakai checklist; bandingkan dengan review Anda.

## Quick Reference

```text
Aturan permanen → AGENTS.md (+ routing ke domain)      Detail tugas → prompt (goal, scope, acceptance, context)
Non-trivial → minta RENCANA dulu → approve → eksekusi bertahap → DoD (lint/test) → laporan → review diff
Kesalahan berulang → aturan baru yang spesifik + alasan    Tanpa secret · konfirmasi perintah destruktif
```

## Related Topics

- [AI Agent Instructions](/agent-instructions/) — rule library & template siap pakai
- [AGENTS.md: Konsep & Cara Menulis](/ai-engineering/guides/agents-md-fundamentals/)
- [Git & Git Workflow](/fundamentals/git-workflow/)
- [Clean Architecture di Flutter](/flutter/clean-architecture/)
- [OWASP Top 10](/security/owasp-top-10/)
