---
title: "Git & CI/CD Questions"
description: "Bank pertanyaan interview Git dan CI/CD: konsep Git, merge vs rebase, branching strategy, resolusi konflik, undo perubahan, commit yang baik, pipeline CI/CD, build & rilis aplikasi mobile, secrets, dan strategi deployment."
level: beginner
status: complete
updated: 2026-11-12
tags: [interview, git, ci-cd, devops, question-bank]
---

## Overview

Git dan CI/CD adalah keseharian engineer. Pertanyaan biasanya praktis: *"Apa beda merge dan rebase?"*, *"Bagaimana
membatalkan commit yang sudah di-push?"*, *"Apa saja tahap pipeline aplikasi Anda?"*. Materi lengkap:
[Git Workflow](/fundamentals/git-workflow/) dan [GitHub Actions](/devops/github-actions/).

## Why It Matters

Kesalahan Git dapat menghapus pekerjaan tim; pipeline yang baik mencegah bug masuk production dan mempercepat rilis.
Interviewer menilai kebiasaan kerja yang aman dan kolaboratif.

## Core Concepts

| Konsep | Ringkas |
| --- | --- |
| Commit | Snapshot + metadata, ditunjuk oleh hash |
| Branch | Pointer bergerak ke commit |
| HEAD | Posisi kerja saat ini |
| Merge | Menggabungkan riwayat (merge commit bila perlu) |
| Rebase | Memutar ulang commit di atas basis baru (riwayat linear, hash berubah) |
| Cherry-pick | Menyalin commit tertentu |
| Revert vs reset | Revert membuat commit pembalik (aman untuk riwayat publik); reset memindahkan pointer (riwayat lokal) |

### CI/CD

- **Continuous Integration**: setiap push/PR menjalankan format, analisis statis, test, build.
- **Continuous Delivery**: artefak selalu siap rilis (rilis dengan persetujuan).
- **Continuous Deployment**: otomatis sampai production bila lolos.

## How It Works

```text
feature branch → commit kecil → push → PR → CI (lint, analyze, test, build) → code review
→ merge ke main → CD: build release (signed) → distribusi internal/testing → staged rollout production
```

## Implementation

```bash
# Memperbarui branch fitur dengan main
git fetch origin
git rebase origin/main          # riwayat linear (hanya untuk branch milik sendiri)
# atau
git merge origin/main           # aman untuk branch bersama

# Membatalkan perubahan
git restore file.dart           # buang perubahan working tree
git reset --soft HEAD~1         # batalkan commit terakhir (lokal), perubahan tetap staged
git revert <hash>               # batalkan commit yang sudah di-push dengan commit baru

# Menemukan commit penyebab bug
git bisect start && git bisect bad && git bisect good v1.4.0

# Menyelamatkan pekerjaan yang "hilang"
git reflog
```

```yaml
# Ringkas: CI Flutter di GitHub Actions
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { channel: stable, cache: true }
      - run: flutter pub get
      - run: dart format --output=none --set-exit-if-changed .
      - run: flutter analyze
      - run: flutter test --coverage
```

*(Versi action dapat berubah — periksa rilis terbaru.)*

## Best Practices

- **Commit kecil & bermakna** dengan pesan jelas (mis. Conventional Commits: `feat(checkout): ...`).
- **Branch berumur pendek**, PR kecil yang mudah direview.
- **Jangan rebase/force-push branch bersama**; gunakan `--force-with-lease` bila terpaksa di branch sendiri.
- **Proteksi branch main**: wajib CI hijau & review.
- **Secrets di secret store CI**, bukan di repo.
- **Tag & versi** setiap rilis; changelog.

## Anti-Patterns

- Commit raksasa "update" berisi puluhan file tak terkait.
- Commit keystore, `.env`, atau `google-services.json` dengan kredensial sensitif ke repo publik.
- `git push --force` ke main.
- Pipeline yang lambat & flaky sehingga diabaikan tim.
- Build release dari laptop pribadi tanpa jejak.

## Performance Considerations

Percepat pipeline dengan cache dependensi (pub, Gradle, npm), menjalankan job paralel, memisahkan verifikasi PR dari
build release, hanya menjalankan job relevan (path filter), dan membatasi integration test berat ke branch tertentu.

## Security Considerations

Simpan keystore/sertifikat sebagai secret terenkripsi, batasi izin token CI (least privilege), pin versi action pihak
ketiga, scan dependensi & secret (Dependabot, secret scanning), dan wajib review untuk perubahan workflow.

## Real-World Use Cases

- Pipeline Flutter: analyze → test → build AAB/IPA → distribusi internal → Play Console staged rollout.
- Pipeline backend: test → build image Docker → push registry → deploy staging → production.
- Hotfix dari tag rilis dengan cherry-pick.

## Interview Questions

1. Apa beda merge dan rebase? Kapan memakai masing-masing?
2. Apa beda `git reset`, `git revert`, dan `git restore`?
3. Bagaimana menyelesaikan merge conflict?
4. Jelaskan strategi branching yang pernah Anda pakai.
5. Bagaimana memulihkan commit yang tidak sengaja terhapus?
6. Apa itu CI/CD dan apa bedanya delivery vs deployment?
7. Apa saja tahap pipeline aplikasi mobile Anda?
8. Bagaimana mengelola secret (keystore, API key) di CI?
9. Bagaimana strategi rilis yang aman?
10. Bagaimana mencari commit yang memperkenalkan bug?

## Sample Answers

1. Merge mempertahankan riwayat apa adanya dengan merge commit — aman untuk branch bersama. Rebase menulis ulang commit di atas basis baru sehingga riwayat linear — cocok untuk merapikan branch pribadi sebelum PR. Jangan rebase commit yang sudah dipakai orang lain.
2. `restore` membuang perubahan file di working tree/stage; `reset` memindahkan pointer branch (soft/mixed/hard) — untuk riwayat lokal; `revert` membuat commit baru yang membalik perubahan — untuk riwayat yang sudah dipublikasikan.
3. Pahami kedua perubahan (diskusikan dengan penulisnya bila perlu), edit penanda konflik, jalankan build & test, lalu commit/lanjutkan rebase. Konflik berkurang dengan PR kecil dan sinkronisasi rutin.
4. Trunk-based (branch fitur pendek ke main + feature flag) untuk rilis sering, atau GitFlow ringan (main, develop, release, hotfix) untuk rilis terjadwal. Sebutkan alasan pemilihan di tim Anda.
5. `git reflog` untuk menemukan hash posisi sebelumnya, lalu `git branch rescue <hash>` atau `git reset --hard <hash>` di branch yang tepat.
6. CI mengintegrasikan & memverifikasi setiap perubahan secara otomatis. Continuous delivery: setiap perubahan siap dirilis dengan keputusan manual; continuous deployment: rilis otomatis ke production setelah lolos pipeline.
7. Format & analyze → unit/widget test → build per flavor → signing → distribusi internal (Firebase App Distribution/internal testing) → rilis store dengan staged rollout; upload simbol debug untuk crash report.
8. Simpan sebagai secret terenkripsi (base64 keystore, password), decode saat job berjalan, jangan cetak ke log, batasi akses ke branch/environment tertentu, rotasi bila bocor.
9. Feature flag, staged rollout bertahap sambil memantau crash/error, kemampuan rollback/hotfix cepat, minimum supported version untuk memaksa update bila perlu.
10. `git bisect` — tandai commit baik dan buruk, Git melakukan binary search; dapat diotomatisasi dengan `git bisect run <script test>`.

## Practical Exercises

1. Simulasikan merge conflict di repo latihan dan selesaikan dengan merge serta rebase.
2. Buat pipeline CI untuk proyek Flutter Anda dengan cache dan coverage.
3. Latih `git bisect run` dengan test yang gagal.

## Quick Reference

```text
merge (aman, riwayat asli) · rebase (linear, hanya branch sendiri) · revert (publik) · reset (lokal) · reflog (penyelamat)
Commit kecil + pesan jelas · PR kecil · proteksi main · --force-with-lease
CI: format → analyze → test → build · CD: sign → distribusi → staged rollout · secrets di store CI
```

## Related Topics

- [Git Workflow](/fundamentals/git-workflow/)
- [GitHub Actions](/devops/github-actions/)
- [Build, Release & Deployment (Flutter)](/flutter/build-release-deployment/)
