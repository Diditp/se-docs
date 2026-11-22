---
title: "Secrets Management"
description: "Mengoperasikan secret di pipeline dan infrastruktur: memilih secret store (GitHub Secrets, cloud secret manager, Vault, SOPS), struktur per environment & layanan, injeksi ke runtime (env, file, Kubernetes secret, Cloud Run), OIDC/workload identity untuk CI, rotasi otomatis, audit akses, secret aplikasi mobile di CI (keystore, App Store Connect key), dan prosedur insiden."
level: intermediate
status: complete
updated: 2026-11-13
tags: [devops, secrets, vault, oidc, ci-cd, rotation]
---

## Overview

Halaman [Environment Secrets](/security/environment-secrets/) menjelaskan **apa** itu secret dan mengapa tidak boleh
di repo atau aplikasi mobile. Halaman ini fokus pada **operasional**: di mana secret disimpan, bagaimana sampai ke
aplikasi dan pipeline, siapa yang boleh mengakses, dan bagaimana dirotasi.

## Why It Matters

Seiring bertambahnya layanan dan environment, jumlah secret tumbuh cepat: password DB per environment, kunci payment,
token SMS, service account, keystore Android, kunci App Store Connect. Tanpa sistem yang rapi, secret tersebar di laptop,
chat, dan file `.env` di server, sulit dirotasi, dan tidak jelas siapa yang memakainya.

## Core Concepts

| Secret store | Cocok untuk | Catatan |
| --- | --- | --- |
| GitHub Actions secrets/environments | Secret yang dipakai pipeline | Tingkat repo/organisasi/environment, dengan reviewer |
| Cloud secret manager (GCP Secret Manager, AWS Secrets Manager/SSM) | Secret runtime layanan di cloud | IAM per layanan, versi, audit log |
| HashiCorp Vault / OpenBao | Multi-cloud, secret dinamis | Kredensial DB sementara, PKI. Operasional lebih berat |
| SOPS + age/KMS | Secret terenkripsi di Git (GitOps) | Nilai terenkripsi di repo, kunci di KMS |
| Kubernetes Secrets | Secret pod | Base64, bukan enkripsi. Aktifkan enkripsi at rest / gunakan external secrets |

| Konsep | Penjelasan |
| --- | --- |
| Workload identity / OIDC | Layanan/CI membuktikan identitasnya ke cloud tanpa kunci jangka panjang |
| Rotasi | Mengganti secret berkala atau saat insiden, tanpa downtime |
| Dynamic secret | Kredensial dibuat sesuai permintaan dengan masa berlaku pendek |
| Least privilege | Setiap layanan hanya dapat membaca secret miliknya |

## How It Works

```text
Admin/otomasi membuat secret di secret manager (per env, per layanan)
→ IAM: service account "pos-api-prod" boleh membaca "pos-api-prod/*"
→ runtime: platform menyuntikkan secret sebagai env/file saat container start, atau aplikasi membaca via SDK
→ CI: login ke cloud via OIDC → ambil secret deploy yang diperlukan → deploy
→ audit log mencatat setiap akses · rotasi terjadwal memperbarui versi secret
```

## Implementation

### Penamaan & struktur

```text
<layanan>/<env>/<nama>
pos-api/prod/database-url
pos-api/prod/payment-secret-key
pos-api/staging/payment-secret-key        ← kunci sandbox
mobile-ci/android-upload-keystore
mobile-ci/app-store-connect-api-key
```

### Injeksi ke Cloud Run (contoh)

```bash
gcloud run deploy pos-api \
  --image=asia-southeast2-docker.pkg.dev/acme/pos/pos-api:git-3f2a9c1 \
  --service-account=pos-api-prod@acme.iam.gserviceaccount.com \
  --set-secrets=DATABASE_URL=pos-api-prod-database-url:latest,PAYMENT_SECRET_KEY=pos-api-prod-payment-key:7
```

Pin versi secret (`:7`) untuk perubahan terkontrol, atau `latest` bila rotasi otomatis diikuti restart.

### Kubernetes dengan External Secrets

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata: { name: pos-api }
spec:
  refreshInterval: 1h
  secretStoreRef: { name: gcp-secret-manager, kind: ClusterSecretStore }
  target: { name: pos-api-env }
  data:
    - secretKey: DATABASE_URL
      remoteRef: { key: pos-api-prod-database-url }
```

### CI dengan OIDC (tanpa kunci cloud tersimpan)

```yaml
permissions: { id-token: write, contents: read }
jobs:
  deploy:
    environment: production
    steps:
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: deployer-prod@acme.iam.gserviceaccount.com
      - uses: google-github-actions/get-secretmanager-secrets@v2
        id: secrets
        with:
          secrets: |-
            sentry_token:acme/sentry-auth-token
```

Kebijakan trust OIDC dibatasi ke repo, branch (`main`), dan environment tertentu, sehingga workflow dari fork/branch lain
tidak bisa mendapatkan kredensial.

### Secret aplikasi mobile di CI

```text
Android: keystore upload (base64) + password di GitHub environment secret → didekode ke file sementara saat build
         Play Console service account JSON untuk upload (cakupan hanya aplikasi terkait)
iOS:     App Store Connect API key (.p8) + fastlane match (repo sertifikat terenkripsi) → passphrase sebagai secret
Hapus file sementara di akhir job (runner hosted dibuang otomatis; self-hosted harus dibersihkan)
```

### Rotasi

```text
Rotasi tanpa downtime untuk password DB:
1. Buat kredensial baru (user/password kedua) di DB
2. Simpan sebagai versi baru di secret manager
3. Deploy ulang/restart layanan agar memakai versi baru (rolling)
4. Verifikasi tidak ada koneksi dengan kredensial lama → cabut kredensial lama
Banyak cloud mendukung rotasi otomatis untuk DB terkelola. Kunci API pihak ketiga biasanya mendukung dua kunci aktif bersamaan
```

| Secret | Frekuensi rotasi (contoh kebijakan) |
| --- | --- |
| Password DB aplikasi | 90 hari atau otomatis |
| API key pihak ketiga | Sesuai kemampuan penyedia, minimal tahunan |
| Kunci signing JWT | Berkala dengan overlap kid (JWKS) |
| Keystore upload Android | Hanya bila bocor (via Play Console) |
| Semua | **Segera** bila ada indikasi bocor |

### Audit & respons insiden

```text
- Aktifkan audit log akses secret manager, alert untuk akses dari identitas tak terduga
- Inventaris: daftar secret, pemilik, konsumen, tanggal rotasi terakhir
- Runbook kebocoran: cabut/rotasi → audit penggunaan → deploy ulang → bersihkan sumber kebocoran → postmortem
```

## Best Practices

- **Satu sumber kebenaran** (secret manager) per platform.
- **IAM per layanan & per environment**.
- **OIDC/workload identity** alih-alih kunci jangka panjang di CI.
- **Rotasi terjadwal**, otomatis bila memungkinkan, dengan prosedur tanpa downtime.
- **Audit & inventaris** secret.
- **Environment secrets dengan reviewer** untuk produksi.

## Anti-Patterns

- Secret dikirim lewat chat/email atau disimpan di dokumen bersama.
- Satu service account "admin" untuk semua layanan dan pipeline.
- Kunci JSON service account disimpan permanen di GitHub secrets padahal OIDC tersedia.
- Kubernetes Secret dianggap terenkripsi padahal hanya base64.
- Tidak pernah merotasi karena "takut rusak".

## Performance Considerations

Ambil secret saat startup atau melalui injeksi platform, bukan di setiap request. Bila memakai rotasi otomatis dengan
`latest`, siapkan mekanisme reload/restart bertahap agar layanan tidak membaca versi yang sudah dicabut.

## Security Considerations

Akses ke secret manager adalah akses ke seluruh sistem, jadi lindungi dengan MFA, pemisahan peran (yang mengelola vs
yang membaca), dan audit. Runner CI self-hosted harus diisolasi karena dapat membaca secret yang diinjeksikan ke job.

## Real-World Use Cases

- Cloud Run membaca `DATABASE_URL` dari Secret Manager dengan service account khusus per layanan.
- Pipeline mobile memakai OIDC ke cloud dan GitHub environment `release` dengan reviewer untuk keystore & App Store key.

## Interview Questions

1. Bagaimana Anda mengelola secret di produksi?
2. Apa keuntungan OIDC untuk CI/CD?
3. Bagaimana merotasi password database tanpa downtime?
4. Apakah Kubernetes Secret aman secara default?

## Sample Answers

1. Secret disimpan di secret manager per environment dan layanan, akses dibatasi IAM per service account, disuntikkan saat runtime oleh platform, diaudit, dan dirotasi terjadwal. Pipeline memakai OIDC dan environment secrets dengan reviewer.
2. CI mendapatkan kredensial cloud berumur pendek berdasarkan identitas workflow (repo, branch, environment), sehingga tidak ada kunci jangka panjang yang tersimpan dan bisa bocor.
3. Buat kredensial kedua, simpan sebagai versi secret baru, lakukan rolling restart agar semua instance memakai kredensial baru, verifikasi kredensial lama tidak dipakai, lalu cabut kredensial lama.
4. Tidak sepenuhnya. Nilainya hanya base64 di etcd. Aktifkan enkripsi at rest dengan KMS, batasi RBAC, atau gunakan External Secrets/CSI driver dari secret manager.

## Practical Exercises

1. Buat inventaris semua secret proyek Anda beserta pemilik dan tanggal rotasi.
2. Ganti kunci JSON service account di CI dengan OIDC.
3. Latih rotasi password DB di staging tanpa downtime.

## Quick Reference

```text
Store: GitHub env secrets (CI) · cloud secret manager (runtime) · Vault (dinamis) · SOPS (GitOps)
Nama: <layanan>/<env>/<nama> · IAM per layanan & env · audit log
Injeksi: --set-secrets / External Secrets / file mount · ambil saat startup
CI: OIDC + trust terbatas repo/branch/env · reviewer untuk production/release
Rotasi: kredensial ganda → versi baru → rolling restart → cabut lama · bocor → rotasi segera
```

## Related Topics

- [Environment Secrets (Security)](/security/environment-secrets/)
- [Environment Management](/devops/environment-management/)
- [GitHub Actions](/devops/github-actions/)
