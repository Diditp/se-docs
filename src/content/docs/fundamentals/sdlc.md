---
title: "Software Development Life Cycle (SDLC)"
description: "Tahapan SDLC (perencanaan, analisis, desain, implementasi, testing, deployment, maintenance), model Waterfall, V-Model, Iterative, Agile, dan DevOps, beserta kapan memakai masing-masing dan artefak setiap tahap."
level: beginner
status: complete
updated: 2026-11-12
tags: [fundamentals, sdlc, process, agile, waterfall]
---

## Overview

**Software Development Life Cycle (SDLC)** adalah kerangka tahapan untuk membangun dan memelihara perangkat lunak —
dari ide sampai aplikasi berjalan di production dan terus diperbaiki. SDLC bukan satu metode tunggal; ada beberapa
**model** (Waterfall, V-Model, Iterative, Agile, DevOps) yang menyusun tahapan yang sama dengan cara berbeda.

## Why It Matters

- Memberi bahasa bersama antara engineer, PM, QA, dan klien tentang "kita sedang di tahap apa".
- Mencegah langsung coding tanpa kebutuhan jelas, atau rilis tanpa testing.
- Sering ditanyakan di interview BUMN/enterprise dan muncul di dokumen tender/proyek (TOR, SRS, UAT).

## Core Concepts

| Tahap | Tujuan | Artefak umum |
| --- | --- | --- |
| 1. Planning | Tujuan bisnis, scope, biaya, jadwal, risiko | Project charter, roadmap |
| 2. Requirement analysis | Apa yang dibutuhkan pengguna | SRS/PRD, user story, acceptance criteria |
| 3. Design | Bagaimana sistem dibangun | Arsitektur, ERD, API contract, UI/UX mockup |
| 4. Implementation | Menulis kode | Source code, unit test, PR |
| 5. Testing | Memastikan kualitas | Test plan, test case, laporan bug, UAT sign-off |
| 6. Deployment | Rilis ke pengguna | Release notes, artefak build, runbook |
| 7. Maintenance | Perbaikan & pengembangan lanjut | Hotfix, monitoring, backlog |

### Model SDLC

| Model | Ciri | Cocok untuk | Risiko |
| --- | --- | --- | --- |
| Waterfall | Tahap berurutan, sekali jalan | Kebutuhan stabil & kontrak tetap | Perubahan mahal, feedback terlambat |
| V-Model | Setiap tahap desain berpasangan dengan tahap testing | Sistem kritis/teregulasi | Kaku seperti Waterfall |
| Iterative/Incremental | Sistem dibangun bertahap per increment | Produk besar dengan prioritas jelas | Butuh arsitektur yang bisa tumbuh |
| Spiral | Iterasi berbasis analisis risiko | Proyek besar berisiko tinggi | Kompleks & mahal |
| Agile (Scrum/Kanban) | Iterasi pendek, feedback cepat | Produk yang kebutuhannya berubah | Tanpa disiplin bisa jadi "tanpa rencana" |
| DevOps | Menyatukan dev & ops, otomatisasi CI/CD | Layanan yang sering dirilis | Butuh investasi tooling & budaya |

## How It Works

```text
Waterfall : Plan → Req → Design → Build → Test → Deploy → Maintain   (sekali, berurutan)

V-Model   : Requirement ─────────────── Acceptance test
              System design ─────────── System test
                Architecture ────────── Integration test
                  Module design ─────── Unit test
                         └── Coding ──┘

Agile     : [Plan → Build → Test → Review → Release] → [ ... ] → [ ... ]   (sprint 1–4 minggu)
DevOps    : Plan → Code → Build → Test → Release → Deploy → Operate → Monitor → (kembali ke Plan)
```

## Implementation

### Contoh: fitur "Pembayaran QRIS" di aplikasi kasir (Agile + DevOps)

| Tahap | Aktivitas nyata |
| --- | --- |
| Planning | PM menetapkan target rilis, prioritas di backlog |
| Requirement | User story + acceptance criteria, NFR (timeout, keamanan) |
| Design | Sequence diagram app ↔ backend ↔ payment gateway, kontrak API, state UI |
| Implementation | Branch fitur, unit test use case, PR + review |
| Testing | Widget/integration test, test sandbox gateway, QA regression, UAT dengan outlet pilot |
| Deployment | CI build → internal testing → staged rollout 10% → 100% |
| Maintenance | Pantau error rate pembayaran, perbaiki bug, iterasi fitur refund |

### Template acceptance criteria (Given–When–Then)

```gherkin
Scenario: Pembayaran QRIS berhasil
  Given kasir membuat transaksi Rp50.000
  When pelanggan membayar melalui QRIS
  Then status transaksi menjadi "Lunas" dalam ≤ 5 detik setelah notifikasi gateway
  And struk dapat dicetak
```

## Best Practices

- **Pilih model sesuai konteks**: kontrak tetap & regulasi ketat → lebih formal; produk yang terus berubah → Agile.
- **Definition of Done** yang jelas di setiap tahap (kode direview, test lulus, dokumentasi).
- **Libatkan QA dan pengguna sejak awal** (shift-left testing).
- **Otomatisasi** build, test, dan deploy agar siklus pendek dan konsisten.
- **Umpan balik dari production** (monitoring, crash report) masuk kembali ke perencanaan.

## Anti-Patterns

- "Agile" sebagai alasan tidak menulis kebutuhan atau dokumentasi sama sekali.
- Testing hanya di akhir proyek.
- Waterfall untuk produk yang kebutuhannya jelas akan berubah.
- Maintenance dianggap bukan bagian proyek (tidak ada anggaran/waktu).

## Performance Considerations

Kebutuhan performa (waktu respons, ukuran aplikasi, perangkat minimum) harus ditetapkan di tahap requirement dan
diuji di tahap testing — bukan ditemukan setelah rilis. Lihat
[Functional & Non-Functional Requirements](/fundamentals/functional-non-functional-requirements/).

## Security Considerations

**Secure SDLC**: threat modeling di desain, secure coding & code review di implementasi, SAST/DAST & dependency scan di
testing, hardening & secret management di deployment, patch & monitoring di maintenance.

## Real-World Use Cases

- Proyek pemerintah/BUMN: dokumen formal (TOR, SRS, UAT) sering bercampur dengan iterasi Agile di dalam tim.
- Startup produk: Scrum/Kanban + CI/CD dengan rilis mingguan.
- Sistem kritis (pembayaran, medis): V-Model atau Agile dengan gerbang verifikasi ketat.

## Interview Questions

1. Sebutkan tahapan SDLC.
2. Apa beda Waterfall dan Agile?
3. Kapan Waterfall masih cocok dipakai?
4. Apa itu V-Model?
5. Apa hubungan DevOps dengan SDLC?
6. Apa itu UAT?

## Sample Answers

1. Planning, requirement analysis, design, implementation, testing, deployment, maintenance.
2. Waterfall berurutan dan menyerahkan produk di akhir; perubahan mahal. Agile iteratif dengan rilis kecil berkala sehingga feedback cepat dan perubahan lebih murah, dengan konsekuensi perencanaan jangka panjang yang lebih adaptif.
3. Ketika kebutuhan stabil dan terdefinisi jelas, kontrak berbasis scope tetap, atau regulasi menuntut dokumentasi lengkap sebelum pengembangan.
4. Variasi Waterfall yang memasangkan setiap tahap spesifikasi dengan tahap pengujian yang sesuai (requirement ↔ acceptance test, desain ↔ integration test, modul ↔ unit test).
5. DevOps memperluas SDLC ke operasi: otomatisasi CI/CD, monitoring, dan feedback loop berkelanjutan sehingga deployment & maintenance menjadi bagian siklus yang terus berputar.
6. User Acceptance Testing — pengguna/klien memverifikasi bahwa sistem memenuhi kebutuhan bisnis sebelum dirilis/diterima.

## Practical Exercises

1. Petakan proyek terakhir Anda ke tahap SDLC; tandai tahap yang paling lemah.
2. Tulis 3 user story + acceptance criteria untuk fitur "riwayat transaksi".
3. Jelaskan dalam 1 menit kenapa tim Anda memakai model tertentu.

## Quick Reference

```text
Plan → Requirement → Design → Build → Test → Deploy → Maintain
Waterfall (stabil, kontrak tetap) · V-Model (test berpasangan) · Agile (iteratif) · DevOps (otomasi + feedback)
Secure SDLC: threat model · secure code review · SAST/DAST · hardening · patch
```

## Related Topics

- [Requirement Analysis](/fundamentals/requirement-analysis/)
- [Agile, Scrum & Code Review](/fundamentals/agile-scrum-code-review/)
- [GitHub Actions](/devops/github-actions/)
