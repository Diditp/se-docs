---
title: "Environment Management: Dev, Staging, Prod"
description: "Mengelola environment development, staging, dan production untuk backend dan aplikasi mobile: tujuan tiap environment, parity, promosi build yang sama (build once, deploy many), data test & anonimisasi, flavor Flutter & Firebase project per environment, preview environment, akses & approval, serta infrastructure as code."
level: intermediate
status: complete
updated: 2026-11-13
tags: [devops, environments, staging, flavors, infrastructure-as-code]
---

## Overview

Environment adalah salinan sistem yang berjalan untuk tujuan berbeda. Minimal ada tiga:

- **Development**: untuk developer bereksperimen (lokal atau bersama).
- **Staging**: tiruan produksi untuk verifikasi sebelum rilis (QA, UAT, uji integrasi).
- **Production**: dipakai pengguna sungguhan.

Untuk mobile, environment mencakup **backend** dan **build aplikasi** (flavor) yang mengarah ke backend tersebut.

## Why It Matters

Tanpa pemisahan yang jelas, tes dilakukan di produksi, data uji tercampur dengan data pelanggan, atau bug baru terlihat
setelah rilis karena staging terlalu berbeda dari produksi. Untuk aplikasi mobile, kesalahan flavor bisa membuat build
produksi mengarah ke API staging, atau sebaliknya.

## Core Concepts

| Environment | Data | Deploy | Akses |
| --- | --- | --- | --- |
| Local/dev | Sintetis, seed | Bebas, sering | Developer |
| Staging | Sintetis/anonim, mirip produksi | Otomatis dari main | Tim, QA, stakeholder |
| Production | Data nyata | Terkontrol, approval | Sangat terbatas, diaudit |
| Preview (opsional) | Sintetis | Per pull request | Reviewer |

| Prinsip | Penjelasan |
| --- | --- |
| Environment parity | Staging semirip mungkin dengan produksi (versi DB, konfigurasi, topologi) |
| Build once, deploy many | Artefak (image/APK) yang sama dipromosikan dari staging ke produksi, hanya konfigurasi yang berbeda |
| Isolasi | Kredensial, database, bucket, dan project Firebase terpisah per environment |
| Infrastructure as Code | Infrastruktur didefinisikan dalam kode agar environment konsisten & dapat dibuat ulang |

## How It Works

```text
Backend: PR → CI test → merge main → build image git-<sha> → deploy staging (otomatis) → smoke/E2E
→ approval → deploy image YANG SAMA ke production
Mobile: build flavor staging → distribusi internal (Firebase App Distribution/TestFlight) → QA
→ build flavor prod (commit yang sama) → internal testing track → staged rollout
```

## Implementation

### Flutter flavors & konfigurasi

```text
config/
  dev.json       { "APP_ENV": "dev", "API_BASE_URL": "https://dev-api.example.com" }
  staging.json   { "APP_ENV": "staging", "API_BASE_URL": "https://staging-api.example.com" }
  prod.json      { "APP_ENV": "prod", "API_BASE_URL": "https://api.example.com" }
```

```bash
flutter run --flavor staging --dart-define-from-file=config/staging.json
flutter build appbundle --flavor prod --dart-define-from-file=config/prod.json
```

```text
- applicationId/bundle ID berbeda: com.example.pos.dev, .staging, (prod tanpa suffix) → bisa terpasang berdampingan
- Nama & ikon berbeda ("POS STG") agar tester tidak tertukar
- Firebase project berbeda per environment (flutterfire configure per flavor) → crash & analytics tidak tercampur
- Banner/indikator environment di aplikasi non-prod
```

### Backend per environment

```text
- Database, Redis, bucket, queue terpisah per environment
- Kredensial pihak ketiga: sandbox/test di dev & staging, live hanya di produksi
- Konfigurasi via env/secret manager per environment (nama variabel sama, nilai berbeda)
- Domain jelas: api.example.com, staging-api.example.com
```

### Data di staging

```text
✅ Data sintetis yang realistis (seed script), atau salinan produksi yang DIANONIMKAN (nama, telepon, email, alamat diganti)
❌ Salinan mentah database produksi (melanggar privasi, risiko kebocoran, notifikasi ke pelanggan nyata)
Nonaktifkan pengiriman email/SMS/push sungguhan di staging (atau alihkan ke inbox uji)
```

### Infrastructure as Code (gambaran)

```hcl
# Terraform: modul yang sama, variabel berbeda per environment
module "api" {
  source        = "./modules/cloud-run-api"
  env           = "staging"
  image         = var.api_image
  min_instances = 0
  db_tier       = "db-custom-1-3840"
}
```

```text
environments/staging.tfvars · environments/prod.tfvars
Perubahan infrastruktur lewat PR + plan yang direview, bukan klik manual di console
```

### Akses & approval

```text
- GitHub Environments: "production" dengan required reviewers & secret terpisah
- Akses produksi minimal, MFA, audit. Developer tidak memegang kredensial DB produksi sehari-hari
- Staging dapat diakses tim, tetapi tetap tidak publik (login/IP allowlist) bila berisi fitur rahasia
```

## Best Practices

- **Build once, deploy many** untuk backend. Commit yang sama untuk build mobile staging & prod.
- **Isolasi total** data & kredensial antar environment.
- **Staging mirip produksi** (versi, konfigurasi, migrasi).
- **Flavor jelas** dengan ID, nama, ikon, dan Firebase project berbeda.
- **Data staging sintetis/anonim**.
- **IaC dan approval** untuk produksi.

## Anti-Patterns

- Menguji fitur di produksi karena staging "tidak pernah sama".
- Satu database untuk staging dan produksi.
- Build ulang image untuk produksi dari kode yang mungkin sudah berubah.
- Build release aplikasi mengarah ke API staging karena salah flavor.
- Mengirim push/SMS ke pelanggan nyata dari staging.

## Performance Considerations

Staging tidak harus sebesar produksi, tetapi load test membutuhkan environment yang representatif (ukuran instance &
data mendekati produksi). Gunakan skala nol/kecil untuk environment preview agar biaya terkendali.

## Security Considerations

Staging sering menjadi pintu masuk serangan karena keamanannya lebih longgar. Terapkan autentikasi yang sama, jangan
memakai data asli, jangan memakai kredensial produksi, dan matikan endpoint debug di semua environment yang dapat
diakses dari internet.

## Real-World Use Cases

- Aplikasi POS: flavor dev/staging/prod dengan ikon berbeda, staging terhubung ke payment sandbox dan Firebase project staging.
- Image `pos-api:git-3f2a9c1` diverifikasi di staging lalu dipromosikan ke produksi tanpa build ulang.

## Interview Questions

1. Apa fungsi environment staging dan bagaimana menjaganya tetap representatif?
2. Apa arti "build once, deploy many"?
3. Bagaimana mengelola environment di aplikasi Flutter?
4. Bolehkah menyalin data produksi ke staging?

## Sample Answers

1. Staging memverifikasi rilis dalam kondisi semirip mungkin dengan produksi sebelum pengguna terdampak. Jaga dengan IaC yang sama, versi software dan migrasi yang sama, konfigurasi setara, data realistis, dan deploy otomatis dari main.
2. Artefak dibangun sekali (image dengan tag commit) lalu artefak yang sama dipromosikan antar environment, hanya konfigurasi yang berbeda, sehingga yang diuji persis sama dengan yang dirilis.
3. Flavor per environment dengan application ID/bundle ID, nama, ikon, dan Firebase project berbeda, konfigurasi via `--dart-define-from-file`, serta build dari commit yang sama untuk staging dan produksi.
4. Hanya setelah dianonimkan dan sesuai kebijakan privasi. Data mentah produksi di staging berisiko bocor, melanggar regulasi, dan dapat memicu komunikasi ke pelanggan nyata.

## Practical Exercises

1. Siapkan flavor dev/staging/prod di proyek Flutter Anda dengan ikon & Firebase project berbeda.
2. Buat seed script data sintetis untuk staging.
3. Konfigurasikan GitHub Environment "production" dengan reviewer wajib.

## Quick Reference

```text
dev (bebas) · staging (mirip prod, data sintetis/anonim) · prod (terkontrol) · preview per PR (opsional)
Build once, deploy many · isolasi DB/kredensial/bucket/Firebase per env · sandbox pihak ketiga di non-prod
Flutter: flavor + --dart-define-from-file + ID/ikon/nama berbeda · banner env
IaC (Terraform) + tfvars per env · GitHub Environments + reviewer · tanpa email/SMS/push nyata dari staging
```

## Related Topics

- [Environment Variables](/devops/environment-variables/)
- [Mobile CI/CD Pipeline](/devops/mobile-cicd-pipeline/)
- [Secrets Management](/devops/secrets-management/)
