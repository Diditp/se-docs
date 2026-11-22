---
title: "Git Commit, PR & Code Review Checklist"
description: "Konvensi Git untuk tim yang bekerja dengan AI coding agent: Conventional Commits, ukuran commit & PR, branch naming, template PR (summary, why, how to test, risks, rollback), checklist code review, cara mereview PR buatan agent, dan aturan yang dituliskan di AGENTS.md."
level: beginner
status: complete
updated: 2026-11-13
tags: [ai, agents, git, pull-request, code-review, conventional-commits]
---

## Overview

Commit dan pull request adalah **jejak keputusan** sebuah proyek. Dengan AI coding agent, volume perubahan bisa naik
drastis, sehingga konvensi commit, PR yang kecil, dan checklist review yang jelas menjadi semakin penting agar kualitas
dan keterlacakan tetap terjaga.

## Why It Matters

PR raksasa dari agent (fitur + refactor + format ulang) sulit direview dan berisiko menyembunyikan bug. Pesan commit
yang jelas memudahkan `git bisect`, changelog otomatis, dan rollback. Interviewer juga sering bertanya tentang proses
code review di tim.

## Core Concepts

### Conventional Commits

```text
<type>(<scope>): <subject dalam imperative, ≤ 72 karakter>

<body: mengapa perubahan dibuat, bukan apa yang diubah baris per baris>

<footer: BREAKING CHANGE: ..., Refs: #123>
```

| Type | Untuk |
| --- | --- |
| `feat` | Fitur baru |
| `fix` | Perbaikan bug |
| `refactor` | Perubahan struktur tanpa mengubah perilaku |
| `perf` | Peningkatan performa |
| `test` | Menambah/memperbaiki test |
| `docs` | Dokumentasi |
| `build` / `ci` | Build system / pipeline |
| `chore` | Pemeliharaan lain |

### Branch naming

```text
feat/order-voucher · fix/sync-duplicate-sale · chore/upgrade-flutter-3-x
```

## How It Works

```text
Task → branch → commit kecil per langkah logis → PR dengan template → CI hijau
→ review (manusia + checklist) → squash/merge dengan pesan Conventional Commit → changelog/versi otomatis
```

## Implementation

### Contoh commit yang baik

```text
fix(sync): prevent duplicate sales when push is retried

The server returned 500 after committing the sale, and the client retried
with a new idempotency key. Keys are now generated once per outbox entry
and reused on retry.

Refs: #241
```

### Template PR (`.github/pull_request_template.md`)

```markdown
## Summary
<!-- Apa yang berubah, 2–4 kalimat -->

## Why
<!-- Masalah/kebutuhan, link issue -->

## How to test
<!-- Langkah verifikasi manual + perintah yang dijalankan -->

## Screenshots / recordings (UI)

## Risks & rollback
<!-- Apa yang bisa rusak, bagaimana mematikan/rollback (flag, revert) -->

## Checklist
- [ ] Tests added/updated and passing
- [ ] Format/lint/analyze passing
- [ ] API contract / docs / ADR updated if behavior changed
- [ ] Backward compatible with existing data, APIs, and older app versions
- [ ] No secrets, debug code, or unrelated changes
```

### Aturan Git untuk agent (contoh AGENTS.md)

```markdown
## Git & Pull Requests
- Conventional Commits; subject imperative ≤ 72 chars; body explains why.
- One logical change per commit; never mix refactor/formatting with behavior changes.
- Keep PRs reviewable (aim < ~400 changed lines excluding generated files); split otherwise.
- Fill every section of the PR template; list commands run and their results.
- **MUST NOT** force-push shared branches, rewrite history of `main`, or commit generated/build outputs.
```

### Checklist code review

```text
Kebenaran      □ Melakukan persis yang diminta? □ Kasus gagal & tepi? □ Test akan gagal bila logika salah?
Desain         □ Batas layer dihormati? □ Mengikuti pola yang ada? □ Tidak ada abstraksi spekulatif?
Keamanan       □ Input divalidasi? □ Otorisasi objek? □ Tanpa secret/PII di kode atau log?
Performa       □ N+1? □ List tanpa batas? □ Kerja berat di UI thread/event loop?
Kompatibilitas □ Data lama, API lama, aplikasi versi lama tetap berfungsi? □ Migrasi aman?
Keterbacaan    □ Nama jelas? □ Komentar menjelaskan "mengapa"?
Operasional    □ Log/metrik untuk alur baru? □ Bisa dimatikan/di-rollback?
```

### Mereview PR buatan agent

```text
- Baca rencana & laporan agent, lalu verifikasi klaimnya dengan CI (bukan percaya teks laporan)
- Periksa file yang TIDAK diminta untuk diubah (perubahan "sekalian" yang tidak perlu)
- Cek dependensi baru: benar-benar ada, perlu, terawat?
- Cek test: apakah ada yang di-skip, dihapus, atau assertion dilonggarkan?
- Cek "jalan pintas": error ditelan, validasi dimatikan, `any`/`!`/`!!` tanpa alasan
- Untuk temuan berulang → perbarui AGENTS.md, bukan hanya komentar di PR
```

## Best Practices

- **Commit kecil dan bermakna** dengan Conventional Commits.
- **PR kecil & fokus**, satu tujuan.
- **Template PR** yang mewajibkan cara uji, risiko, dan rollback.
- **CI sebagai syarat merge** (branch protection).
- **Review berbasis checklist**, dengan perhatian khusus pada perubahan buatan agent.
- **Ubah aturan saat menemukan pola kesalahan**.

## Anti-Patterns

- Pesan commit "update", "fix bug", "wip".
- PR berisi fitur + refactor + format ulang ribuan baris.
- Merge tanpa CI hijau atau tanpa review.
- Force push ke branch bersama.
- Menyetujui PR agent hanya berdasarkan laporan "semua test lulus".

## Performance Considerations

PR kecil direview lebih cepat dan lebih teliti, sehingga siklus delivery lebih cepat secara keseluruhan. Squash merge
menjaga riwayat `main` rapi untuk `git bisect`.

## Security Considerations

Aktifkan branch protection (review wajib, status check wajib), signed commits bila diperlukan, dan secret scanning
dengan push protection. Batasi token agent agar tidak bisa melewati proteksi branch.

## Real-World Use Cases

- Changelog dan versi aplikasi dibuat otomatis dari Conventional Commits (mis. release-please).
- Reviewer menemukan agent menghapus test yang gagal. Aturan "MUST NOT delete tests" ditambahkan ke AGENTS.md.

## Interview Questions

1. Seperti apa pesan commit yang baik?
2. Apa yang Anda periksa saat code review?
3. Bagaimana Anda mereview kode yang dibuat AI?

## Sample Answers

1. Mengikuti konvensi (mis. Conventional Commits), subject singkat dalam bentuk perintah, dan body yang menjelaskan alasan perubahan serta referensi issue. Satu commit untuk satu perubahan logis.
2. Kebenaran dan test, desain dan batas layer, keamanan (validasi, otorisasi, secret), performa, kompatibilitas mundur, keterbacaan, dan kesiapan operasional (log, rollback).
3. Sama ketatnya dengan kode manusia, ditambah verifikasi klaim lewat CI, mencari perubahan di luar lingkup, memeriksa dependensi baru, test yang dilemahkan, dan jalan pintas tidak aman. Pola kesalahan berulang dimasukkan ke AGENTS.md.

## Practical Exercises

1. Tambahkan template PR dan branch protection di repositori Anda.
2. Tulis ulang 5 pesan commit lama Anda dengan Conventional Commits.
3. Review satu PR buatan agent memakai checklist di atas dan catat temuan berulang.

## Quick Reference

```text
type(scope): subject imperative ≤ 72 · body = why · footer: Refs/BREAKING CHANGE
feat · fix · refactor · perf · test · docs · build · ci · chore
PR kecil · template: Summary, Why, How to test, Risks & rollback, Checklist
Review: kebenaran · desain · keamanan · performa · kompatibilitas · keterbacaan · operasional
PR agent: verifikasi via CI · perubahan di luar lingkup · dependensi · test dilemahkan · jalan pintas
```

## Related Topics

- [Git Workflow](/fundamentals/git-workflow/)
- [Agile, Scrum & Code Review](/fundamentals/agile-scrum-code-review/)
- [AI Coding Workflow](/ai-engineering/guides/ai-coding-workflow/)
