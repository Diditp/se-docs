---
title: "Environment Secrets"
description: "Mengelola secret (API key, password database, kunci penandatanganan, service account) dengan aman: secret vs konfigurasi, mengapa secret tidak boleh di aplikasi mobile, .env dan .gitignore, secret manager & KMS, injeksi secret di CI/CD (GitHub Actions, OIDC), keystore Android & sertifikat iOS, rotasi, secret scanning, dan langkah bila secret bocor."
level: intermediate
status: complete
updated: 2026-11-13
tags: [security, secrets, env, ci-cd, secret-manager, mobile]
---

## Overview

**Secret** adalah nilai yang memberi akses: password database, API key payment gateway, kunci privat JWT, token SMS
gateway, service account cloud, keystore penandatanganan aplikasi. **Konfigurasi** biasa (URL API, feature flag, nama
environment) tidak memberi akses dan boleh terlihat.

Prinsip utamanya: secret **tidak pernah** masuk repositori, log, atau binary aplikasi mobile, dan setiap secret punya
pemilik, cakupan minimum, dan rencana rotasi.

## Why It Matters

Secret yang ter-commit ke Git atau tertanam di APK adalah penyebab kebocoran yang sangat umum. Bot terus memindai
repositori publik dan aplikasi di store. Satu API key payment yang bocor dapat berarti kerugian finansial langsung.

## Core Concepts

| Jenis | Contoh | Boleh di aplikasi mobile? |
| --- | --- | --- |
| Konfigurasi publik | Base URL API, flavor, versi minimum | Ya |
| Identifier publik | Firebase config, Supabase anon key, Maps key (dibatasi), publishable key payment | Ya, **dengan** pembatasan & aturan akses di server |
| Secret server | Secret key payment, password DB, service account, kunci privat JWT, token SMS | **Tidak pernah** |
| Kunci signing | Keystore upload Android, sertifikat & profil iOS | Tidak (hanya di CI/secret storage) |

```text
Aturan praktis: bila nilai itu bisa dipakai untuk melakukan sesuatu atas nama Anda (menagih, mengirim SMS,
membaca DB), maka itu secret server dan harus berada di balik API Anda.
```

## How It Works

```text
Developer: .env lokal (tidak di-commit) + .env.example (tanpa nilai)
CI/CD: secret di GitHub Actions/secret manager → diinjeksi saat build/deploy, di-mask di log
Runtime server: aplikasi membaca dari secret manager atau env yang diisi platform (Cloud Run, ECS, Kubernetes)
Mobile: hanya konfigurasi & identifier publik. Aksi yang butuh secret → panggil backend
```

## Implementation

### Repositori

```text
# .gitignore
.env
.env.*
!.env.example
*.jks
*.keystore
key.properties
google-services.json        # opsional: berisi identifier publik, tetapi banyak tim memilih tidak di-commit per flavor
GoogleService-Info.plist
*.p8
*.p12
*.mobileprovision
```

```bash
# .env.example — dokumentasi variabel, tanpa nilai
DATABASE_URL=
JWT_PRIVATE_KEY_PEM=
PAYMENT_SECRET_KEY=
```

### Validasi saat startup (fail fast)

```ts
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  PAYMENT_SECRET_KEY: z.string().min(20),
  JWT_PRIVATE_KEY_PEM: z.string().includes('BEGIN PRIVATE KEY'),
});
export const env = Env.parse(process.env);     // gagal start bila ada yang hilang. JANGAN log nilainya
```

### Secret manager

```ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
const client = new SecretManagerServiceClient();
const [v] = await client.accessSecretVersion({ name: 'projects/pos/secrets/payment-secret-key/versions/latest' });
const paymentKey = v.payload!.data!.toString();
// Akses dibatasi IAM per layanan (service account cloud-run-api hanya boleh membaca secret yang ia perlukan)
```

### CI/CD: GitHub Actions

```yaml
jobs:
  deploy:
    permissions:
      id-token: write          # OIDC: login ke cloud tanpa menyimpan kunci jangka panjang
      contents: read
    environment: production    # secret environment + required reviewers
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: deployer@pos.iam.gserviceaccount.com
      - name: Decode Android keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/upload.jks
```

```text
- Secret tidak tersedia untuk workflow dari fork / pull_request pihak luar
- Jangan echo secret. Gunakan ::add-mask:: untuk nilai turunan
- Pin action ke versi/commit
```

### Flutter: konfigurasi per flavor, bukan secret

```bash
flutter build appbundle --flavor production --dart-define=API_BASE_URL=https://api.example.com
```

```dart
const apiBaseUrl = String.fromEnvironment('API_BASE_URL');   // tertanam di binary → hanya nilai publik
```

`--dart-define`, `.env` di aset, dan obfuscation **tidak** menyembunyikan secret: nilainya tetap bisa diekstrak dari
APK/IPA. Gunakan backend untuk semua operasi yang memerlukan secret.

### Kunci signing aplikasi

```text
Android: aktifkan Play App Signing (Google memegang app signing key). Upload key di CI secret + cadangan aman. Bila upload key hilang, bisa diganti melalui Play Console
iOS: sertifikat & profil dikelola (mis. fastlane match dengan repo terenkripsi atau App Store Connect API key di CI)
Batasi siapa yang dapat mengakses kunci, dan simpan cadangan offline yang terenkripsi
```

### Secret scanning

```text
- Pre-commit: gitleaks / detect-secrets
- Repositori: GitHub secret scanning + push protection
- CI: scan setiap PR
- Aplikasi: periksa APK/IPA hasil build untuk string yang tidak boleh ada
```

### Bila secret bocor

```text
1. Cabut/rotasi SEGERA (anggap sudah disalahgunakan). Menghapus dari Git tidak cukup karena riwayat & clone sudah ada
2. Periksa log penggunaan secret untuk aktivitas mencurigakan
3. Ganti di semua tempat (secret manager, CI) & deploy ulang
4. Bersihkan riwayat Git bila perlu (git filter-repo) dan minta penyedia (mis. GitHub) membersihkan cache
5. Postmortem: bagaimana bisa bocor, kontrol apa yang ditambahkan
```

## Best Practices

- **Secret hanya di server/secret manager**, tidak di repo, log, atau aplikasi mobile.
- **Least privilege & satu secret per layanan/environment**.
- **OIDC/workload identity** di CI alih-alih kunci jangka panjang.
- **Rotasi terjadwal** dan otomatis bila memungkinkan.
- **Secret scanning berlapis** (pre-commit, repo, CI).
- **Validasi env saat startup** tanpa mencetak nilainya.

## Anti-Patterns

- Secret key payment/SMS di kode Flutter atau `.env` di aset.
- Secret yang sama untuk dev, staging, dan production.
- Mengirim secret lewat chat/email.
- `console.log(process.env)` untuk debugging.
- Menghapus file `.env` dari commit terakhir dan menganggap masalah selesai.

## Performance Considerations

Ambil secret dari secret manager saat startup dan simpan di memori. Jangan memanggil secret manager di setiap request.
Untuk rotasi tanpa restart, muat ulang secara berkala atau saat menerima event rotasi.

## Security Considerations

Akses ke secret harus diaudit (siapa/layanan apa membaca kapan). Pisahkan hak "membaca secret" dari "mengelola secret".
Lingkungan developer memakai kredensial sandbox/test sehingga laptop yang hilang tidak membuka production.

## Real-World Use Cases

- Aplikasi POS memanggil `POST /payments` di backend. Secret key payment gateway hanya ada di secret manager backend.
- CI membangun AAB dengan upload key dari GitHub secret, mengunggah ke Play dengan service account terbatas pada aplikasi tersebut.

## Interview Questions

1. Apa beda secret dan konfigurasi?
2. Mengapa API secret tidak boleh disimpan di aplikasi mobile, walau sudah di-obfuscate?
3. Bagaimana mengelola secret di CI/CD?
4. Apa yang Anda lakukan bila secret ter-commit ke repositori publik?
5. Bagaimana mengelola kunci signing aplikasi Android dan iOS?

## Sample Answers

1. Secret memberi akses atau kemampuan bertindak (password, API secret, kunci privat). Konfigurasi hanya mengatur perilaku (URL, flag) dan boleh terlihat.
2. Semua isi binary dapat diekstrak dengan reverse engineering atau intersepsi runtime. Obfuscation hanya memperlambat. Operasi yang butuh secret harus dilakukan backend.
3. Simpan di secret store CI atau secret manager, injeksi saat runtime job, batasi per environment dengan reviewer, gunakan OIDC untuk akses cloud, mask di log, dan jangan berikan ke workflow dari fork.
4. Segera cabut dan rotasi secret, periksa log penyalahgunaan, perbarui semua konsumen, bersihkan riwayat bila perlu, dan lakukan postmortem serta tambahkan secret scanning.
5. Android: Play App Signing dengan upload key di secret CI dan cadangan terenkripsi. iOS: sertifikat dan profil dikelola terpusat (fastlane match atau App Store Connect API key) dengan akses terbatas.

## Practical Exercises

1. Pasang gitleaks sebagai pre-commit hook dan jalankan pada seluruh riwayat repo Anda.
2. Pindahkan semua secret backend ke secret manager dengan IAM per layanan.
3. Ekstrak APK release Anda dan pastikan tidak ada secret server di dalamnya.

## Quick Reference

```text
Secret = memberi akses · konfigurasi = perilaku
Mobile: hanya identifier publik (dibatasi) · secret server di balik API · dart-define/obfuscation ≠ aman
.env tidak di-commit + .env.example · validasi env saat startup (tanpa log nilai)
Secret manager + IAM per layanan · CI: environment secret, OIDC, mask, tanpa fork
Signing: Play App Signing · fastlane match/ASC API key
Bocor → rotasi dulu, audit, perbarui, bersihkan riwayat, postmortem · gitleaks + push protection
```

## Related Topics

- [Secrets Management (DevOps)](/devops/secrets-management/)
- [Environment Variables](/devops/environment-variables/)
- [Sensitive Data Protection & Encryption](/security/sensitive-data-protection/)
