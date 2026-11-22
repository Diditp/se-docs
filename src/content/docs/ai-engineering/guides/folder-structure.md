---
title: "Folder Structure Guidelines"
description: "Struktur folder yang mudah dipahami manusia dan AI coding agent: feature-first vs layer-first, struktur rekomendasi untuk Flutter, Android (multi-module), Node.js/TypeScript, dan monorepo full-stack, aturan dependensi antar folder, penempatan AGENTS.md bertingkat, lokasi test & dokumentasi, serta cara menegakkannya otomatis."
level: intermediate
status: complete
updated: 2026-11-13
tags: [ai, agents, folder-structure, architecture, monorepo]
---

## Overview

Struktur folder adalah **peta proyek**. Struktur yang jelas membuat developer baru dan AI coding agent tahu di mana
membuat file, kode mana yang boleh saling memanggil, dan aturan mana yang berlaku. Agent sangat bergantung pada pola
yang terlihat: bila strukturnya konsisten, agent akan meniru pola yang benar.

## Why It Matters

Struktur yang berantakan membuat agent membuat file di tempat yang salah, menduplikasi kode yang sudah ada, atau
mengimpor lintas layer (UI langsung memanggil Dio). Struktur yang tertulis di AGENTS.md dan ditegakkan otomatis
mencegah hal ini sejak awal.

## Core Concepts

| Pendekatan | Pengelompokan | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| Layer-first | `models/`, `views/`, `controllers/` | Familiar untuk proyek kecil | Satu fitur tersebar ke banyak folder, sulit dihapus/dipindah |
| Feature-first | `features/order/{domain,data,presentation}` | Fitur kohesif, mudah ditemukan & dipecah | Butuh aturan untuk kode bersama (`core/`) |

Rekomendasi default: **feature-first di luar, layer di dalam fitur**.

| Konsep | Penjelasan |
| --- | --- |
| Core/shared | Kode lintas fitur yang kecil dan stabil (network, error, theme). Jangan jadi tempat sampah |
| Public API modul | File/folder yang boleh diimpor fitur lain. Sisanya internal |
| Arah dependensi | presentation → domain ← data. Domain tidak mengimpor framework |
| AGENTS.md bertingkat | Root untuk aturan global, AGENTS.md di subfolder untuk aturan spesifik bagian itu |

## How It Works

```text
Agent menerima tugas "tambah fitur customer"
→ membaca AGENTS.md root (struktur + routing) → membuka fitur contoh yang mirip (features/order/)
→ membuat features/customer/ dengan pola yang sama → test di test/features/customer/
→ lint/arsitektur test memastikan tidak ada import terlarang
```

## Implementation

### Flutter

```text
lib/
  app/              app.dart, router.dart, bootstrap.dart, flavors.dart
  core/             di/ network/ database/ error/ logging/ theme/ l10n/ utils/
  features/
    order/
      domain/       entities/ repositories/ (interface) usecases/
      data/         datasources/ models/ (DTO) repositories/ (impl)
      presentation/ cubit/ pages/ widgets/
test/               mirror lib/ (test/features/order/...)
integration_test/   alur kritis
```

### Android (multi-module)

```text
app/                         wiring, navigation, DI root
core/
  core-network/  core-database/  core-designsystem/  core-common/
feature/
  feature-order/             ui/ (Compose), domain/, data/   ← boleh dipecah lagi bila besar
  feature-customer/
build-logic/                 convention plugins (konfigurasi Gradle bersama)
Aturan: feature-* tidak saling bergantung langsung, hanya ke core-*
```

### Node.js / TypeScript (modular monolith)

```text
src/
  main.ts                    bootstrap
  config/                    env schema
  modules/
    orders/
      orders.routes.ts       HTTP (validasi, mapping)
      orders.service.ts      aturan bisnis
      orders.repository.ts   akses DB
      orders.schemas.ts      zod
      index.ts               API publik modul
    catalog/ …
  shared/                    errors/ logging/ db/ auth/
test/                        unit/ integration/
migrations/                  0001_init.sql …
```

### Monorepo full-stack

```text
/
├── AGENTS.md                  aturan global + routing
├── apps/
│   ├── mobile/   AGENTS.md    (Flutter: aturan & perintah khusus mobile)
│   ├── backend/  AGENTS.md    (Node.js)
│   └── admin-web/ AGENTS.md
├── packages/                  kode bersama (api-contract, ui-kit)
├── db/        AGENTS.md       migrasi & aturan SQL
├── docs/
│   ├── agents/                file aturan domain
│   ├── adr/  api/  runbooks/
└── .github/workflows/
```

Banyak agent memakai **AGENTS.md terdekat** dengan file yang sedang diubah, sehingga aturan khusus `apps/mobile/` tidak
membebani tugas backend.

### Menegakkan batas secara otomatis

```text
Flutter: lint kustom / custom_lint atau test arsitektur sederhana (cek import di domain/)
Android: modul Gradle (dependensi eksplisit) + Konsist/ArchUnit
TypeScript: eslint-plugin-boundaries / dependency-cruiser
```

```json
// .dependency-cruiser.cjs (ringkas): domain tidak boleh mengimpor framework HTTP/DB
{ "forbidden": [{ "name": "no-modules-internals",
  "from": { "path": "^src/modules/([^/]+)/" },
  "to": { "path": "^src/modules/(?!$1)[^/]+/(?!index\\.ts$)" } }] }
```

### Menuliskannya untuk agent

```markdown
## 2. Project Structure
- New features go in `lib/features/<feature>/{domain,data,presentation}`; copy the pattern of `features/order/`.
- `core/` only for code used by ≥ 2 features; ask before adding to it.
- Tests mirror `lib/` under `test/`.
- **MUST NOT** import `data/` or `presentation/` from `domain/`.
```

## Best Practices

- **Feature-first** dengan layer di dalam fitur.
- **Satu fitur contoh yang rapi** sebagai acuan untuk manusia dan agent.
- **Batas ditegakkan tool**, bukan hanya dokumentasi.
- **AGENTS.md bertingkat** di monorepo.
- **Test & docs di lokasi yang dapat ditebak**.
- **`core/` kecil**, dengan kriteria jelas.

## Anti-Patterns

- Folder `utils/`/`common/` raksasa berisi segala hal.
- Struktur berbeda di setiap fitur.
- Domain mengimpor Flutter/Dio/Express.
- Satu AGENTS.md raksasa untuk monorepo multi-teknologi.
- Memindahkan banyak folder bersamaan dengan perubahan fitur dalam satu PR.

## Performance Considerations

Modularisasi (multi-module Android, package Flutter) dapat mempercepat build inkremental dan memungkinkan build
paralel, tetapi terlalu banyak modul kecil menambah overhead konfigurasi. Mulailah dengan folder, pecah ke modul saat
waktu build atau batas tim menuntut.

## Security Considerations

Pisahkan kode yang menangani secret, kripto, dan autentikasi ke lokasi yang jelas (`core/auth/`, `shared/auth/`) agar
mudah direview dan diberi aturan ketat. Jangan menempatkan file konfigurasi rahasia di folder yang dapat ter-commit.

## Real-World Use Cases

- Aplikasi POS Flutter dengan 12 fitur: setiap fitur dapat dikerjakan agent secara terpisah dengan meniru `features/order/`.
- Monorepo dengan AGENTS.md per app sehingga agent backend tidak memuat aturan Flutter.

## Interview Questions

1. Feature-first atau layer-first, dan mengapa?
2. Bagaimana mencegah import lintas layer yang tidak diizinkan?
3. Bagaimana menyusun instruksi agent di monorepo?

## Sample Answers

1. Feature-first untuk aplikasi yang tumbuh karena kode satu fitur berdekatan, mudah ditemukan, diuji, dan dipisahkan. Layer di dalam fitur menjaga arah dependensi.
2. Tuliskan aturannya, lalu tegakkan otomatis: modul Gradle dengan dependensi eksplisit, dependency-cruiser/eslint boundaries di TypeScript, atau test arsitektur di Dart yang memeriksa import.
3. AGENTS.md root untuk aturan global dan routing, AGENTS.md di setiap app/package untuk perintah dan aturan spesifik, serta file aturan domain di `docs/agents/` yang dirujuk sesuai tugas.

## Practical Exercises

1. Gambar struktur folder proyek Anda saat ini dan rencana feature-first-nya.
2. Tambahkan satu aturan batas import yang ditegakkan otomatis di CI.
3. Tulis bagian "Project Structure" di AGENTS.md proyek Anda.

## Quick Reference

```text
Feature-first di luar · domain/data/presentation di dalam · core/ kecil
Flutter: lib/{app,core,features} · Android: app + core-* + feature-* · Node: src/modules/<m>/{routes,service,repository,schemas,index}
Monorepo: AGENTS.md root + per app · docs/agents, docs/adr, docs/api
Tegakkan: modul Gradle · dependency-cruiser · test arsitektur · lint
```

## Related Topics

- [Feature-First Architecture](/flutter/feature-first-architecture/)
- [Modularization (Mobile System Design)](/system-design/mobile/modularization/)
- [Coding Standards & Naming Conventions](/ai-engineering/guides/coding-standards-naming/)
