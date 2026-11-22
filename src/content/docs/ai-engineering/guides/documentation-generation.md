---
title: "Documentation Generation Guidelines"
description: "Membuat dan memelihara dokumentasi proyek dengan bantuan AI agent tanpa kehilangan akurasi: jenis dokumen (README, ADR, OpenAPI, runbook, changelog, komentar kode, dokumentasi fitur), docs-as-code, kapan dokumen wajib diperbarui, template, verifikasi isi dokumen yang dihasilkan AI, dan pemisahan dokumentasi belajar vs aturan agent."
level: beginner
status: complete
updated: 2026-11-13
tags: [ai, agents, documentation, adr, readme, docs-as-code]
---

## Overview

Dokumentasi yang baik menjawab pertanyaan sebelum ditanyakan: cara menjalankan proyek, mengapa keputusan diambil, bagaimana
API bekerja, dan apa yang dilakukan saat insiden. AI agent sangat membantu menulis draf dokumentasi, tetapi dokumen
**harus diverifikasi** karena agent dapat menulis hal yang terdengar benar namun tidak sesuai kode.

## Why It Matters

Dokumentasi yang usang lebih berbahaya daripada tidak ada dokumentasi, karena menyesatkan manusia **dan** agent yang
membacanya sebagai konteks. Dengan aturan "dokumen diperbarui dalam perubahan yang sama", dokumentasi tetap sinkron
dengan kode.

## Core Concepts

| Dokumen | Menjawab | Lokasi |
| --- | --- | --- |
| README | Apa ini, cara setup, menjalankan, test | `README.md` root & per app |
| AGENTS.md | Aturan kerja untuk agent | root + `docs/agents/` |
| ADR | Mengapa keputusan arsitektur diambil | `docs/adr/NNNN-judul.md` |
| Kontrak API | Endpoint, skema, error | `docs/api/openapi.yaml` |
| Runbook | Langkah operasional (deploy, rollback, insiden, restore) | `docs/runbooks/` |
| Changelog | Apa yang berubah per versi | `CHANGELOG.md` (otomatis dari commit) |
| Komentar kode | Mengapa kode ditulis begini | Di kode, seperlunya |
| Dokumentasi belajar | Konsep & alasan (seperti situs ini) | Knowledge base terpisah |

Prinsip **docs-as-code**: dokumentasi disimpan di repo, ditulis dalam Markdown, direview lewat PR, dan divalidasi CI.

## How It Works

```text
Perubahan kode → aturan DoD: "update README/OpenAPI/ADR/runbook bila perilaku berubah"
→ agent membuat draf dokumen → manusia memverifikasi fakta (perintah, path, nama env, perilaku)
→ CI: lint Markdown, cek link, validasi OpenAPI → merge bersama kode
```

## Implementation

### Template ADR

```markdown
# 0007. Gunakan transactional outbox untuk event order

- Status: Accepted
- Tanggal: 2026-11-13
- Pemilik: tim backend

## Context
Order tersimpan tetapi event `order.paid` kadang tidak terkirim saat broker gangguan.

## Decision
Tulis event ke tabel `outbox` dalam transaksi yang sama dengan order, lalu relay mem-publish.

## Options considered
1. Publish langsung setelah commit (ditolak: dual write)
2. CDC dari WAL (ditunda: operasional lebih berat)

## Consequences
+ Konsistensi DB & event. − Tabel outbox perlu dibersihkan berkala. Consumer harus idempoten.
```

### README minimal yang berguna

```markdown
# POS Mobile
Aplikasi kasir Flutter untuk outlet F&B (Android, iOS).

## Quick start
flutter pub get && dart run build_runner build --delete-conflicting-outputs
flutter run --flavor dev -t lib/main_dev.dart

## Commands
| Purpose | Command |
| --- | --- |
| Test | flutter test |
| Analyze | flutter analyze --fatal-infos |

## Configuration
Flavors in lib/app/flavors.dart. No secrets in the app. See docs/agents/ for AI agent rules.

## Docs
Architecture: docs/architecture.md · ADR: docs/adr/ · API: docs/api/openapi.yaml
```

### Aturan dokumentasi untuk agent

```markdown
## Documentation
- Update README, OpenAPI, and runbooks in the same change when commands, configuration, endpoints, or operations change.
- Write an ADR for new infrastructure, cross-module patterns, or decisions that are expensive to reverse.
- Comments explain *why*; do not restate the code. Public APIs get doc comments (`///` Dart, KDoc, TSDoc).
- **MUST NOT** invent commands, paths, env vars, or behavior; verify against the code and run commands before documenting them.
```

### Memverifikasi dokumen buatan AI

```text
□ Setiap perintah dijalankan dan berhasil?
□ Path file, nama env, nama endpoint benar-benar ada?
□ Perilaku yang dijelaskan sesuai kode & test?
□ Versi tool/library sesuai lockfile?
□ Tidak ada secret atau data internal sensitif?
□ Link valid (link checker di CI)?
```

### Dokumentasi belajar vs aturan agent

```text
Dokumentasi belajar (situs ini): menjelaskan konsep, alasan, trade-off, untuk manusia
AGENTS.md: aturan yang dapat ditegakkan (MUST/MUST NOT + alasan singkat), ringkas, untuk agent & reviewer
Saat menambah teknologi/standar baru: tulis materi belajarnya, lalu evaluasi apakah AGENTS.md perlu aturan baru
```

### Otomatisasi

```text
- Changelog dari Conventional Commits (release-please, semantic-release)
- Dokumentasi API dari OpenAPI (Redoc/Swagger UI)
- Doc comments → dart doc / Dokka / TypeDoc
- CI: markdownlint, link checker, validasi OpenAPI
```

## Best Practices

- **Docs-as-code** di repo, direview lewat PR.
- **Perbarui dokumen dalam perubahan yang sama** dengan kode.
- **ADR untuk keputusan penting**, singkat dan jujur tentang konsekuensi.
- **Verifikasi semua fakta** dalam dokumen buatan AI.
- **Pisahkan materi belajar dan aturan agent**.
- **Otomatiskan** changelog, dokumentasi API, dan pengecekan link.

## Anti-Patterns

- README berisi perintah yang sudah tidak berfungsi.
- Dokumen panjang yang diulang di banyak tempat (cepat usang).
- Komentar yang mengulang kode (`// increment i`).
- Menerima dokumentasi AI tanpa menjalankan perintahnya.
- Keputusan arsitektur hanya ada di chat, tanpa ADR.

## Performance Considerations

Dokumentasi yang ringkas dan terstruktur juga menghemat konteks agent. Rujuk dokumen detail lewat link, dan jangan
salin isi yang sama ke banyak file.

## Security Considerations

Jangan memasukkan secret, URL internal sensitif, data pelanggan, atau detail kerentanan yang belum diperbaiki ke dokumen
publik. Runbook boleh menyebut nama secret (`PAYMENT_SECRET_KEY`) tetapi tidak nilainya.

## Real-World Use Cases

- Agent membuat draf ADR dari diskusi desain. Tim mengoreksi bagian konsekuensi lalu merge.
- CI menolak PR yang mengubah endpoint tanpa memperbarui `openapi.yaml`.

## Interview Questions

1. Dokumentasi apa yang menurut Anda wajib ada di sebuah proyek?
2. Apa itu ADR dan kapan ditulis?
3. Bagaimana menjaga dokumentasi tetap akurat?

## Sample Answers

1. README dengan setup dan perintah, kontrak API, ADR untuk keputusan penting, runbook operasional, changelog, dan aturan kerja (termasuk AGENTS.md bila memakai agent).
2. Architecture Decision Record: dokumen singkat berisi konteks, keputusan, opsi yang dipertimbangkan, dan konsekuensi. Ditulis untuk keputusan yang berdampak luas atau mahal untuk dibatalkan.
3. Docs-as-code di repo, aturan memperbarui dokumen dalam PR yang sama, review, verifikasi perintah, validasi otomatis (OpenAPI, link), dan menghindari duplikasi.

## Practical Exercises

1. Tulis ADR untuk satu keputusan arsitektur proyek Anda.
2. Uji README proyek Anda di mesin bersih dan perbaiki langkah yang gagal.
3. Tambahkan link checker dan validasi OpenAPI ke CI.

## Quick Reference

```text
README · AGENTS.md · ADR · OpenAPI · runbook · CHANGELOG · doc comments · materi belajar terpisah
Docs-as-code · update di PR yang sama · ADR: context, decision, options, consequences
Dokumen AI: jalankan perintah, cek path/env/endpoint, cocokkan dengan kode, tanpa secret
Otomatis: changelog dari commit · Redoc · dart doc/Dokka/TypeDoc · markdownlint · link check
```

## Related Topics

- [AGENTS.md: Konsep & Cara Menulis](/ai-engineering/guides/agents-md-fundamentals/)
- [API Documentation (OpenAPI)](/backend/api-documentation/)
- [Git Commit, PR & Code Review Checklist](/ai-engineering/guides/git-commit-pr/)
