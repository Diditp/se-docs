---
title: "Environment Variables"
description: "Environment variables untuk konfigurasi aplikasi (12-factor): cara kerja env di proses, .env untuk development, validasi saat startup, penamaan, nilai default yang aman, env di Docker/Compose/CI/systemd, perbedaan konfigurasi build-time vs runtime, serta padanannya di Flutter (--dart-define, flavor) dan Android (BuildConfig)."
level: beginner
status: complete
updated: 2026-11-13
tags: [devops, environment-variables, configuration, 12-factor, flutter]
---

## Overview

**Environment variable** adalah pasangan nama–nilai yang diberikan ke proses oleh lingkungan tempat ia berjalan
(`DATABASE_URL=postgres://...`). Prinsip **12-factor app**: konfigurasi yang berbeda antar environment (dev, staging,
prod) disimpan di environment, **bukan** di kode, sehingga satu build yang sama dapat dijalankan di mana saja.

## Why It Matters

Hardcode URL atau kredensial membuat kode berbeda per environment, rawan bocor, dan sulit di-deploy. Env yang tidak
divalidasi menyebabkan error membingungkan di tengah jalan, misalnya aplikasi start tetapi gagal saat request pertama
karena `PAYMENT_KEY` kosong.

## Core Concepts

| Jenis konfigurasi | Contoh | Tempat |
| --- | --- | --- |
| Runtime (server) | `DATABASE_URL`, `REDIS_URL`, `LOG_LEVEL`, `PORT` | Environment proses |
| Secret | Password DB, API key | Secret manager → env/file saat runtime |
| Build-time (mobile/web) | Base URL API, flavor, versi | `--dart-define`, BuildConfig, flavor, di dalam binary |
| Feature flag dinamis | Fitur on/off | Remote Config / layanan flag (bukan env) |

| Istilah | Penjelasan |
| --- | --- |
| 12-factor | Metodologi aplikasi cloud. Faktor III: konfigurasi di environment |
| `.env` | File untuk development lokal, **tidak di-commit** |
| `.env.example` | Daftar variabel tanpa nilai, di-commit sebagai dokumentasi |
| Fail fast | Aplikasi menolak start bila konfigurasi tidak valid |

## How It Works

```text
Shell/orkestrator mengisi environment → proses Node membaca process.env (selalu string atau undefined)
→ modul config mem-parse & memvalidasi → objek config bertipe dipakai seluruh aplikasi
Proses anak mewarisi environment induk
```

## Implementation

### Modul config terpusat (Node.js)

```ts
// src/config/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGINS: z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).default(''),
  PAYMENT_SECRET_KEY: z.string().min(20),
  FEATURE_NEW_CHECKOUT: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);   // nama variabel, bukan nilainya
  process.exit(1);
}
export const env = parsed.data;
```

Hanya modul ini yang membaca `process.env`. Bagian lain mengimpor `env` bertipe.

### Development lokal

```bash
# .env (tidak di-commit)
DATABASE_URL=postgres://pos:pos@localhost:5432/pos
REDIS_URL=redis://localhost:6379
PAYMENT_SECRET_KEY=test_xxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
node --env-file=.env dist/main.js          # Node 20.6+ mendukung --env-file tanpa package dotenv
```

### Docker, Compose, systemd, CI

```yaml
# docker-compose.yml
services:
  api:
    image: pos-api:dev
    env_file: .env
    environment:
      NODE_ENV: development
      LOG_LEVEL: debug
```

```bash
docker run -e NODE_ENV=production --env-file /etc/pos-api/env pos-api:1.8.0
```

```yaml
# GitHub Actions
env:
  NODE_ENV: test
steps:
  - run: npm test
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
      PAYMENT_SECRET_KEY: ${{ secrets.PAYMENT_TEST_KEY }}
```

Pada systemd gunakan `EnvironmentFile=/etc/pos-api/env` dengan permission `600`.

### Penamaan

```text
UPPER_SNAKE_CASE · prefix per area: DB_*, REDIS_*, PAYMENT_*, FEATURE_*
URL lengkap lebih ringkas daripada banyak variabel (DATABASE_URL vs DB_HOST/DB_PORT/...)
Boolean eksplisit 'true'/'false' (ingat: env selalu string; "false" adalah string truthy)
```

### Flutter: konfigurasi build-time

```bash
flutter run --flavor dev --dart-define=API_BASE_URL=https://dev-api.example.com
flutter build appbundle --flavor prod --dart-define-from-file=config/prod.json
```

```dart
abstract final class AppConfig {
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const environment = String.fromEnvironment('APP_ENV', defaultValue: 'dev');

  static void validate() {
    if (apiBaseUrl.isEmpty) throw StateError('API_BASE_URL not set');       // fail fast saat startup
  }
}
```

Nilai ini **tertanam di binary** dan bisa dibaca siapa pun. Hanya untuk konfigurasi publik, bukan secret.

### Android native

```kotlin
android {
    flavorDimensions += "env"
    productFlavors {
        create("dev")  { buildConfigField("String", "API_BASE_URL", "\"https://dev-api.example.com\"") }
        create("prod") { buildConfigField("String", "API_BASE_URL", "\"https://api.example.com\"") }
    }
    buildFeatures { buildConfig = true }
}
```

## Best Practices

- **Satu modul config** yang memvalidasi semua variabel saat startup.
- **`.env.example` di-commit**, `.env` tidak.
- **Default aman** (debug off, CORS tertutup). Variabel wajib tanpa default.
- **Secret dari secret manager**, bukan file `.env` di server yang disalin manual.
- **Bedakan build-time dan runtime**. Mobile hanya memuat konfigurasi publik.
- **Jangan mencetak nilai env** di log.

## Anti-Patterns

- `process.env.X` tersebar di seluruh kode.
- `if (process.env.DEBUG)` yang bernilai true untuk string `"false"`.
- Secret di `--dart-define` atau BuildConfig aplikasi mobile.
- File `.env` produksi di repository.
- Default ke kredensial/URL produksi bila variabel tidak diisi.

## Performance Considerations

Baca dan parse env sekali saat startup. Mengakses `process.env` berulang di jalur panas sedikit lebih lambat dan
membuat konfigurasi tidak konsisten bila berubah.

## Security Considerations

Environment proses dapat terlihat oleh proses lain dengan hak tertentu, di dump crash, atau di halaman debug. Batasi
akses, hindari mencetak `process.env`, dan pertimbangkan secret sebagai file yang di-mount (mis. Kubernetes secret
volume) untuk kredensial sensitif.

## Real-World Use Cases

- API yang sama di-deploy ke staging dan produksi hanya dengan env berbeda.
- Build Flutter flavor `staging` mengarah ke API staging lewat `--dart-define-from-file`.

## Interview Questions

1. Mengapa konfigurasi disimpan di environment, bukan di kode?
2. Bagaimana memastikan konfigurasi yang salah terdeteksi sedini mungkin?
3. Apa beda konfigurasi build-time dan runtime di aplikasi mobile?

## Sample Answers

1. Agar satu build dapat dijalankan di banyak environment tanpa mengubah kode, secret tidak masuk repository, dan konfigurasi dapat diubah oleh tim operasional (prinsip 12-factor).
2. Validasi semua variabel dengan skema di satu modul saat startup dan hentikan proses bila ada yang hilang atau tidak valid (fail fast), sambil mencatat nama variabelnya tanpa nilainya.
3. Build-time tertanam di binary saat build (`--dart-define`, BuildConfig, flavor) dan hanya bisa diubah dengan build baru, sehingga hanya untuk nilai publik. Runtime dibaca saat aplikasi berjalan, misalnya Remote Config untuk flag dan konfigurasi dinamis.

## Practical Exercises

1. Buat modul `env.ts` dengan zod dan uji start tanpa variabel wajib.
2. Tambahkan `.env.example` dan pastikan `.env` ada di `.gitignore`.
3. Konfigurasikan flavor dev/staging/prod di Flutter dengan `--dart-define-from-file`.

## Quick Reference

```text
12-factor: konfigurasi di environment · satu modul config + zod · fail fast
.env (lokal, tidak di-commit) · .env.example (di-commit) · node --env-file
Docker env_file/-e · Actions env + secrets · systemd EnvironmentFile (600)
Env = string ('false' truthy) · tanpa log nilai
Mobile: --dart-define(-from-file), flavor, BuildConfig = publik, tertanam di binary
```

## Related Topics

- [Environment Management: Dev, Staging, Prod](/devops/environment-management/)
- [Secrets Management](/devops/secrets-management/)
- [Environment Secrets (Security)](/security/environment-secrets/)
