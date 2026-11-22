---
title: "GitHub Actions (Test, Build & Deploy Pipeline)"
description: "Membangun pipeline CI/CD dengan GitHub Actions untuk backend Node.js (test dengan PostgreSQL, build & push Docker image, deploy bertahap) dan aplikasi Flutter (analyze, test, build APK/AAB)."
level: intermediate
status: complete
version: "GitHub Actions · actions/checkout@v4 · actions/setup-node@v4"
updated: 2026-11-07
tags: [ci-cd, github-actions, devops, flutter, nodejs, docker]
---

## Overview

**GitHub Actions** adalah platform CI/CD bawaan GitHub. **Workflow** (file YAML di `.github/workflows/`) dipicu oleh
**event** (push, pull_request, tag, jadwal, manual) dan terdiri dari **job** yang berjalan di **runner**; setiap job
berisi **step** (perintah shell atau *action* siap pakai).

- **CI (Continuous Integration)** — setiap perubahan otomatis di-lint, di-test, dan di-build.
- **CD (Continuous Delivery/Deployment)** — artefak yang lolos CI otomatis siap dirilis (delivery) atau langsung dirilis (deployment).

## Why It Matters

- Bug tertangkap di PR, bukan di production.
- Release menjadi proses yang **dapat diulang dan diaudit**, bukan langkah manual di laptop seseorang.
- Kualitas dijaga secara otomatis (lint, test, security scan) sehingga code review fokus pada desain.

## Core Concepts

- **Trigger (`on`)** — `pull_request`, `push` ke branch, `push` tag `v*`, `workflow_dispatch`, `schedule`.
- **Job** — berjalan paralel secara default; `needs:` untuk urutan.
- **Runner** — `ubuntu-latest`, `macos-latest` (untuk build iOS), atau self-hosted.
- **Matrix** — menjalankan job untuk beberapa versi/OS.
- **Cache & artifact** — cache dependency antar run; artifact untuk menyimpan hasil build.
- **Secrets & variables** — nilai sensitif terenkripsi; **environments** dengan approval dan secrets terpisah (staging/production).
- **OIDC** — autentikasi ke cloud tanpa menyimpan kredensial jangka panjang.
- **Concurrency** — membatalkan run lama untuk branch yang sama.

## How It Works

```text
PR dibuka ──► ci.yml: lint → typecheck → test (PostgreSQL service) → build  ──► status check wajib hijau
merge ke main ──► cd.yml: build & push image :sha ──► deploy staging ──► smoke test
                                                      └─► environment "production" (approval) ──► deploy ──► health check
tag v1.4.0 ──► release: changelog + image :1.4.0 / build AAB → Play Console internal track
```

## Implementation

### CI backend Node.js dengan PostgreSQL

```yaml
# .github/workflows/backend-ci.yml
name: backend-ci
on:
  pull_request:
    paths: ['backend/**', '.github/workflows/backend-ci.yml']
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read                     # least privilege untuk GITHUB_TOKEN

jobs:
  test:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: test, POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U test" --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      DATABASE_URL: postgres://test:test@localhost:5432/test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: backend/.nvmrc
          cache: npm
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run db:migrate
      - run: npm test -- --coverage
      - run: npm audit --omit=dev --audit-level=high
```

### CD: build & push Docker image, deploy bertahap

```yaml
# .github/workflows/backend-cd.yml
name: backend-cd
on:
  push:
    branches: [main]
    paths: ['backend/**']

permissions:
  contents: read
  packages: write                     # push ke GitHub Container Registry
  id-token: write                     # OIDC ke cloud provider

jobs:
  image:
    runs-on: ubuntu-latest
    outputs:
      tag: ${{ steps.meta.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      - id: meta
        run: echo "tag=ghcr.io/${{ github.repository }}/api:${{ github.sha }}" >> "$GITHUB_OUTPUT"
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' }
      - uses: docker/build-push-action@v6
        with:
          context: backend
          push: true
          tags: ${{ steps.meta.outputs.tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    needs: image
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - run: ./scripts/deploy.sh staging "${{ needs.image.outputs.tag }}"   # migrasi → rollout
      - run: curl --fail --retry 5 --retry-delay 5 https://staging-api.example.com/health

  deploy-production:
    needs: [image, deploy-staging]
    runs-on: ubuntu-latest
    environment: production            # wajib approval reviewer (diatur di Settings → Environments)
    steps:
      - run: ./scripts/deploy.sh production "${{ needs.image.outputs.tag }}"
      - run: curl --fail --retry 10 --retry-delay 6 https://api.example.com/health
```

> `deploy.sh` bergantung pada platform (SSH ke VM + `docker compose pull && up -d`, Cloud Run, Kubernetes).
> Prinsipnya sama: **image yang di-deploy ke production adalah image yang sama yang lolos staging** (tag SHA, bukan rebuild).

### CI Flutter: analyze, test, build

```yaml
# .github/workflows/mobile-ci.yml
name: mobile-ci
on:
  pull_request:
    paths: ['mobile/**']
  push:
    tags: ['mobile-v*']

jobs:
  check:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: mobile } }
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { channel: stable, flutter-version-file: mobile/pubspec.yaml, cache: true }
      - run: flutter pub get
      - run: dart format --output=none --set-exit-if-changed .
      - run: flutter analyze --fatal-infos
      - run: flutter test --coverage

  build-android:
    if: startsWith(github.ref, 'refs/tags/mobile-v')
    needs: check
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: mobile } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - uses: subosito/flutter-action@v2
        with: { channel: stable, flutter-version-file: mobile/pubspec.yaml, cache: true }
      - name: Decode keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/upload.jks
      - run: flutter build appbundle --release --obfuscate --split-debug-info=build/symbols
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
      - uses: actions/upload-artifact@v4
        with:
          name: release-aab
          path: |
            mobile/build/app/outputs/bundle/release/app-release.aab
            mobile/build/symbols
```

:::caution[Version-dependent]
Versi action (`@v4`, `@v6`), opsi `flutter-version-file`, dan versi Java yang dibutuhkan Android Gradle Plugin berubah seiring waktu.
Cek README tiap action dan dokumentasi Flutter sebelum menyalin. Untuk keamanan supply chain, pin action pihak ketiga ke **commit SHA**.
:::

## Best Practices

- **Pipeline cepat (< 10 menit untuk CI PR)** — cache dependency, jalankan job paralel, filter `paths` di monorepo. Alasan: pipeline lambat mendorong developer melewatinya.
- **Status check wajib** di branch protection (`main` tidak bisa di-merge jika CI merah).
- **Build sekali, deploy berkali-kali** — artefak/image yang sama dipromosikan dev → staging → production.
- **Least privilege `permissions:`** per workflow; default `contents: read`.
- **Environments + approval** untuk production; secrets production hanya tersedia di environment tersebut.
- **OIDC** ke cloud alih-alih access key jangka panjang di secrets.
- **Migrasi database backward-compatible** dan dijalankan sebagai langkah terpisah sebelum rollout.
- **Smoke test & health check setelah deploy**, dengan rollback otomatis/terdokumentasi.

## Anti-Patterns

- Deploy production dari laptop developer.
- Secret dicetak di log (`echo $TOKEN`) atau ditaruh di file workflow.
- Menjalankan workflow dengan secret pada `pull_request_target` untuk kode dari fork tanpa pemahaman risikonya.
- Test yang *flaky* dibiarkan lalu pipeline di-*rerun* sampai hijau.
- Rebuild image untuk production (artefak berbeda dari yang dites).
- Memakai action pihak ketiga yang tidak dikenal dengan tag yang bisa digeser (`@main`).

## Performance Considerations

- `actions/setup-node` dengan `cache: npm`, `subosito/flutter-action` dengan `cache: true`, Docker layer cache `type=gha`.
- `concurrency.cancel-in-progress` menghemat menit runner.
- Pecah test besar menjadi shard dengan matrix.
- Build iOS butuh runner macOS (lebih mahal/lebih lambat) — jalankan hanya saat tag/rilis.

## Security Considerations

- Secrets terenkripsi dan dimasking di log, tetapi tetap jangan dicetak atau dikirim ke service pihak ketiga yang tidak perlu.
- **Pin action ke SHA** dan aktifkan Dependabot untuk GitHub Actions.
- Keystore Android & sertifikat iOS hanya di secrets environment rilis; hapus file hasil decode setelah job (runner GitHub-hosted bersifat sementara, self-hosted tidak).
- Tambahkan CodeQL/secret scanning/dependency review sebagai required check.

## Real-World Use Cases

- **Backend POS**: PR → test dengan PostgreSQL → merge → image → staging → approval → production dengan rolling update.
- **Aplikasi Flutter**: setiap PR di-analyze & test; tag `mobile-v1.8.0` membangun AAB dan mengunggahnya ke Play Console internal testing (mis. via fastlane).
- **Scheduled job**: `schedule` harian untuk `npm audit`/update dependency report.

## Interview Questions

1. **(Fundamental)** Apa beda CI, continuous delivery, dan continuous deployment?
2. **(Fundamental)** Apa saja tahapan pipeline CI yang Anda buat?
3. **(Intermediate)** Bagaimana mengelola secrets di pipeline?
4. **(Intermediate)** Bagaimana menjalankan integration test yang butuh database di CI?
5. **(Advanced)** Bagaimana mendesain deployment yang aman dan bisa di-rollback?
6. **(Advanced)** Bagaimana mempercepat pipeline yang memakan 30 menit?

## Sample Answers

1. CI: setiap perubahan diintegrasikan & divalidasi otomatis (build + test). Continuous delivery: setiap perubahan yang lolos siap dirilis kapan saja (rilis bisa butuh approval manual). Continuous deployment: setiap perubahan yang lolos otomatis dirilis ke production.
2. Checkout → setup runtime + cache → install (lockfile) → format/lint → typecheck/analyze → unit test → integration test → build → security scan → upload artefak/coverage.
3. Simpan di GitHub Secrets per environment, batasi akses dengan environment protection, gunakan OIDC untuk cloud, jangan cetak di log, rotasi berkala, dan prinsip least privilege pada token.
4. Service container (PostgreSQL) di job dengan healthcheck, jalankan migrasi, lalu test terhadap database tersebut; atau Testcontainers. Data test dibuat per test/suite agar independen.
5. Build image sekali dengan tag SHA, deploy ke staging + smoke test, approval, rolling/blue-green/canary ke production, health check & metrik, rollback dengan men-deploy tag sebelumnya; migrasi DB expand-contract agar versi lama tetap kompatibel.
6. Profil durasi per step, tambahkan cache dependency & Docker layer, paralelkan job, shard test, filter `paths`, pindahkan job berat (E2E, iOS build) ke trigger rilis/nightly, dan perbaiki test yang lambat/flaky.

## Practical Exercises

1. Buat workflow CI untuk API latihan dengan PostgreSQL service dan jadikan required check.
2. Tambahkan workflow Flutter yang gagal jika format tidak sesuai atau ada warning analyzer.
3. Buat CD ke staging menggunakan image ber-tag SHA dan health check.
4. Pin semua action ke SHA dan aktifkan Dependabot untuk `github-actions`.

## Quick Reference

```text
on: pull_request / push / tags / workflow_dispatch
permissions: contents: read (least privilege)
concurrency: cancel-in-progress
cache: setup-node cache npm · flutter-action cache · docker gha cache
services: postgres + healthcheck untuk integration test
environment: staging → production (approval) · secrets per environment · OIDC
Build once (tag SHA) → promote → health check → rollback = deploy tag sebelumnya
```

## Related Topics

- [CI/CD Fundamentals](/devops/cicd-fundamentals/)
- [Dockerfile & Docker Compose](/devops/dockerfile-compose/)
- [Secrets Management](/devops/secrets-management/)
- [Rollback Strategy](/devops/rollback-strategy/)
- [Build, Release & Deployment (Flutter)](/flutter/build-release-deployment/)
- Referensi resmi: [GitHub Actions documentation](https://docs.github.com/actions), [Security hardening for GitHub Actions](https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).
