---
title: "CI/CD Fundamentals"
description: "Konsep dasar CI/CD: continuous integration, delivery, dan deployment; tahap pipeline (lint, test, build, artefak, deploy), trunk-based development, quality gate, artefak & environment, metrik DORA, serta perbedaan pipeline backend dan mobile."
level: beginner
status: complete
updated: 2026-11-13
tags: [devops, ci-cd, pipeline, dora, automation]
---

## Overview

**CI/CD** adalah praktik mengotomatiskan perjalanan kode dari commit hingga sampai ke pengguna:

- **Continuous Integration (CI)** — setiap perubahan digabung sering dan diverifikasi otomatis (format, lint, test, build).
- **Continuous Delivery** — setiap perubahan yang lolos selalu **siap dirilis**; rilis ke production dengan satu keputusan/klik.
- **Continuous Deployment** — setiap perubahan yang lolos **otomatis** dirilis ke production.

## Why It Matters

Tanpa CI/CD, rilis bergantung pada laptop satu orang, langkah manual yang mudah salah, dan bug ditemukan terlambat.
Hampir semua lowongan engineer — termasuk mobile — menyebut pengalaman CI/CD.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Pipeline | Rangkaian job otomatis yang dipicu event (push, PR, tag) |
| Quality gate | Syarat lolos (test hijau, coverage minimum, tidak ada error lint) sebelum merge/rilis |
| Artefak | Hasil build yang disimpan & diberi versi (image Docker, APK/AAB, IPA) — **build sekali, promosikan** |
| Environment | dev → staging → production dengan konfigurasi berbeda |
| Trunk-based development | Branch pendek, sering merge ke main, fitur belum siap disembunyikan feature flag |
| Secrets | Kredensial disimpan di secret store CI, bukan di repo |
| Rollback | Cara kembali cepat ke versi sebelumnya |

### Metrik DORA

| Metrik | Arti |
| --- | --- |
| Deployment frequency | Seberapa sering rilis |
| Lead time for changes | Waktu commit → production |
| Change failure rate | Persentase rilis yang menyebabkan masalah |
| Time to restore service | Waktu pulih dari insiden |

### Backend vs mobile

| Aspek | Backend | Mobile |
| --- | --- | --- |
| Rilis | Deploy ke server; bisa berkali-kali sehari | Upload ke store; review & adopsi pengguna bertahap |
| Rollback | Deploy versi lama dalam menit | Tidak bisa "menarik" versi dari HP pengguna → feature flag, hotfix, staged rollout, force update |
| Artefak | Image container | AAB/APK, IPA + file symbol |
| Runner | Linux | Android: Linux · iOS: **macOS** wajib |
| Signing | Biasanya tidak | Wajib (keystore, certificate & profile) |

## How It Works

```text
PR dibuka → CI: format → lint/analyze → unit test → build → (laporan coverage) → review → merge
Merge ke main → CD: build artefak release → deploy/upload ke staging/internal testing → verifikasi
Tag rilis / approval → promosi artefak yang SAMA ke production → monitoring → rollback bila perlu
```

## Implementation

### Contoh pipeline minimal (GitHub Actions, Node.js)

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage
      - run: npm run build
```

Contoh lengkap mobile: [Mobile CI/CD Pipeline](/devops/mobile-cicd-pipeline/). Detail GitHub Actions:
[GitHub Actions](/devops/github-actions/).

### Definition of "siap rilis"

```markdown
- [ ] Semua quality gate hijau (format, lint, test, build)
- [ ] Artefak ber-versi tersimpan
- [ ] Migrasi database kompatibel mundur
- [ ] Monitoring & alert siap; rencana rollback jelas
- [ ] Release notes/changelog diperbarui
```

## Best Practices

- **Pipeline cepat** (PR < ±10–15 menit) agar tidak diabaikan.
- **Build sekali, promosikan artefak yang sama** antar environment.
- **Quality gate wajib** di branch protection.
- **Secret di secret store**, akses minimum.
- **Feature flag** untuk memisahkan deploy dari rilis fitur.
- **Ukur DORA** untuk melihat perbaikan proses.

## Anti-Patterns

- Rilis manual dari laptop tanpa jejak.
- Test flaky yang dibiarkan → tim terbiasa mengabaikan merah.
- Build ulang berbeda untuk setiap environment.
- Pipeline yang bisa dilewati (admin merge tanpa CI).

## Performance Considerations

Cache dependensi (npm, pub, Gradle, CocoaPods), jalankan job paralel, gunakan path filter agar perubahan dokumentasi
tidak memicu build mobile penuh, dan pisahkan job cepat (PR) dari job berat (release, integration test).

## Security Considerations

Pin versi action/image, batasi permission token CI (`permissions:` minimum), jangan cetak secret ke log, wajibkan review
untuk perubahan workflow, dan pindai dependensi serta secret di pipeline.

## Real-World Use Cases

- Backend Node.js: CI per PR, deploy otomatis ke staging, deploy production dengan approval.
- Aplikasi Flutter: CI per PR, build otomatis ke internal testing Play & TestFlight setiap merge ke main.

## Interview Questions

1. Apa beda continuous integration, delivery, dan deployment?
2. Apa saja tahap pipeline yang Anda gunakan?
3. Apa itu metrik DORA?
4. Apa bedanya CI/CD backend dan mobile?
5. Bagaimana menjaga pipeline tetap cepat?

## Sample Answers

1. CI: setiap perubahan diintegrasikan dan diverifikasi otomatis. Continuous delivery: setiap perubahan yang lolos selalu siap dirilis dengan keputusan manual. Continuous deployment: rilis ke production otomatis setelah lolos pipeline.
2. Format & lint, test (unit/widget/integration), build, penyimpanan artefak, deploy ke staging/internal testing, lalu promosi ke production dengan monitoring.
3. Empat metrik kinerja delivery: deployment frequency, lead time for changes, change failure rate, dan time to restore service.
4. Mobile butuh signing, runner macOS untuk iOS, distribusi lewat store dengan review, dan tidak bisa rollback dari perangkat pengguna sehingga mengandalkan staged rollout, feature flag, hotfix, dan force update.
5. Cache dependensi, paralelisasi, path filter, memisahkan job PR dan release, serta memperbaiki/mengkarantina test flaky.

## Practical Exercises

1. Tambahkan pipeline CI minimal ke proyek Anda dengan branch protection.
2. Ukur durasi pipeline dan kurangi 30% dengan cache.
3. Tulis rencana rollback untuk backend dan untuk aplikasi mobile Anda.

## Quick Reference

```text
CI (verifikasi tiap perubahan) · Continuous Delivery (siap rilis) · Continuous Deployment (otomatis ke prod)
Pipeline: format → lint → test → build → artefak → staging → production · build sekali, promosikan
DORA: frekuensi · lead time · change failure rate · time to restore
Mobile: signing · macOS untuk iOS · store review · rollback via flag/hotfix/staged rollout
```

## Related Topics

- [GitHub Actions](/devops/github-actions/)
- [Mobile CI/CD Pipeline](/devops/mobile-cicd-pipeline/)
- [Versioning & Release Management](/devops/versioning-release/)
