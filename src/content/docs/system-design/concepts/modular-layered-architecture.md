---
title: "Modular & Layered Architecture"
description: "Arsitektur berlapis (presentation, application, domain, infrastructure) dan modular (pembagian berdasarkan fitur/domain): aturan dependensi, kombinasi keduanya, kohesi & coupling, API publik modul, komunikasi antar modul, contoh di Flutter, Android, dan Node.js, cara menegakkan batas, serta kesalahan umum seperti layer bocor dan modul 'common' raksasa."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, architecture, layered, modular, coupling, cohesion]
---

## Overview

Dua cara utama mengorganisasi kode:

- **Layered architecture**: membagi kode secara **horizontal** berdasarkan tanggung jawab teknis (UI, aplikasi, domain, infrastruktur).
- **Modular architecture**: membagi kode secara **vertikal** berdasarkan fitur atau domain bisnis (orders, catalog, payments).

Arsitektur yang sehat biasanya **menggabungkan keduanya**: modul per domain, dan di dalam setiap modul ada lapisan.

## Why It Matters

Struktur menentukan seberapa mudah perubahan dilakukan. Bila satu perubahan fitur menyentuh 15 folder atau satu modul
bisa mengimpor apa saja dari modul lain, setiap perubahan menjadi berisiko. Batas yang jelas memudahkan testing,
kerja paralel antar tim, onboarding, dan pemecahan menjadi layanan atau package bila diperlukan.

## Core Concepts

### Lapisan umum

| Lapisan | Isi | Bergantung pada |
| --- | --- | --- |
| Presentation | UI, controller HTTP, state holder (Bloc/ViewModel) | Application/domain |
| Application | Use case, orkestrasi, transaksi | Domain |
| Domain | Entitas, aturan bisnis, interface repository | Tidak ada (murni) |
| Infrastructure/data | DB, HTTP client, cache, implementasi repository | Domain (mengimplementasikan interface) |

### Kohesi & coupling

| Konsep | Tujuan |
| --- | --- |
| Kohesi tinggi | Kode yang berubah bersama ditempatkan bersama (satu fitur dalam satu modul) |
| Coupling rendah | Modul hanya saling mengenal melalui API publik yang kecil |
| Dependency rule | Dependensi mengarah ke dalam (ke domain), tidak sebaliknya |
| Acyclic dependencies | Tidak ada siklus antar modul (A → B → A) |

## How It Works

```text
           Modul orders            Modul catalog            Modul payments
         ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
 present │ routes/UI    │        │ routes/UI    │        │ routes/UI    │
 applic. │ use cases    │ ─API─▶ │ public API   │        │ use cases    │
 domain  │ entities     │        │ entities     │        │ entities     │
 infra   │ repository   │        │ repository   │        │ gateway      │
         └──────────────┘        └──────────────┘        └──────────────┘
                     shared kernel kecil: errors, logging, types dasar
```

Modul berkomunikasi lewat **API publik** (fungsi/interface yang diekspor) atau **event**, tidak lewat file internal
atau tabel milik modul lain.

## Implementation

### Flutter

```text
lib/features/order/
  domain/        order.dart, order_repository.dart (abstract), create_order.dart (use case)
  data/          order_dto.dart, order_api.dart, order_repository_impl.dart
  presentation/  order_list_cubit.dart, order_list_page.dart
lib/features/catalog/ ...
lib/core/        network/, error/, theme/  (kecil & stabil)
```

Untuk aplikasi besar, fitur dapat dipecah menjadi package lokal (`packages/feature_order`) agar batas ditegakkan oleh
`pubspec.yaml` (lihat [Modularization](/system-design/mobile/modularization/)).

### Android multi-module

```text
:feature:order  → bergantung pada :core:network, :core:database, :core:designsystem
:feature:catalog → idem
:feature:order TIDAK bergantung pada :feature:catalog
Navigasi lintas fitur melalui route/contract di :core:navigation
```

### Node.js modular monolith

```ts
// modules/catalog/index.ts — API publik
export interface CatalogApi { getPrices(productIds: string[]): Promise<Map<string, number>> }
export function createCatalogModule(deps: { db: Db }): { api: CatalogApi; routes: FastifyPluginAsync } { /* ... */ }

// modules/orders/orders.service.ts — memakai API publik, bukan repository catalog
constructor(private catalog: CatalogApi) {}
```

### Menegakkan batas

| Platform | Alat |
| --- | --- |
| Dart/Flutter | Package terpisah, `custom_lint`/test arsitektur yang memeriksa import |
| Android/Kotlin | Modul Gradle, Konsist/ArchUnit |
| TypeScript | dependency-cruiser, eslint-plugin-boundaries |
| Lintas bahasa | Code review + dokumen arsitektur + AGENTS.md |

```ts
// Contoh test arsitektur sederhana (Vitest): domain tidak boleh mengimpor infrastruktur/framework
it('domain bebas framework', () => {
  const files = glob.sync('src/modules/*/domain/**/*.ts');
  for (const f of files) {
    expect(readFileSync(f, 'utf8')).not.toMatch(/from ['"](fastify|pg|ioredis|axios)/);
  }
});
```

### Kapan menambah lapisan/modul

```text
Proyek kecil (CRUD sederhana): route → service → repository sudah cukup, tanpa use case per aksi
Domain dengan aturan kompleks: tambahkan domain murni & use case
Banyak tim/fitur besar: modul/package terpisah dengan API publik
Jangan menambah lapisan hanya demi "arsitektur", setiap lapisan harus punya alasan
```

## Best Practices

- **Modul per domain, lapisan di dalam modul**.
- **Domain murni** tanpa framework/IO.
- **API publik modul kecil**, internal tidak diekspor.
- **Komunikasi lintas modul via API atau event**.
- **Batas ditegakkan otomatis**.
- **Shared kernel minimal**.

## Anti-Patterns

- Layer bocor: widget/controller langsung memanggil database atau HTTP client.
- Folder `common`/`utils` raksasa yang diimpor semua modul.
- Modul saling bergantung melingkar.
- JOIN langsung ke tabel milik modul lain.
- Lapisan pass-through yang hanya meneruskan panggilan tanpa nilai tambah.

## Performance Considerations

Lapisan tambahan berbiaya kecil (pemanggilan fungsi, mapping objek). Biaya yang lebih nyata adalah mapping data besar
berulang di setiap lapisan, jadi hindari menyalin daftar besar tanpa perlu. Modularisasi juga dapat mempercepat build
inkremental (Gradle/package).

## Security Considerations

Lapisan yang jelas memudahkan menempatkan kontrol keamanan di satu tempat: validasi di boundary, otorisasi di
application/service, akses data di repository dengan filter tenant. Modul sensitif (auth, payments) dapat diberi
aturan review dan pemilik khusus.

## Real-World Use Cases

- Aplikasi POS Flutter dengan 12 fitur, masing-masing domain/data/presentation, dikerjakan paralel oleh 3 developer.
- Backend modular monolith yang kemudian mengekstrak modul `notifications` menjadi layanan tanpa refactor besar.

## Interview Questions

1. Apa beda layered dan modular architecture?
2. Apa itu dependency rule?
3. Bagaimana modul berkomunikasi tanpa coupling tinggi?
4. Bagaimana menegakkan batas arsitektur di proyek?

## Sample Answers

1. Layered membagi kode berdasarkan tanggung jawab teknis (UI, aplikasi, domain, infrastruktur). Modular membagi berdasarkan fitur/domain bisnis. Kombinasi keduanya memberi kohesi per fitur dan pemisahan tanggung jawab di dalamnya.
2. Dependensi kode hanya boleh mengarah ke lapisan yang lebih dalam (domain), sehingga domain tidak bergantung pada UI, framework, atau database, dan detail dapat diganti tanpa mengubah aturan bisnis.
3. Melalui API publik yang kecil (interface/fungsi yang diekspor) atau event, tanpa mengakses file internal atau tabel milik modul lain.
4. Pisahkan menjadi modul/package dengan dependensi eksplisit, gunakan tool pengecek import (dependency-cruiser, Konsist, custom_lint), test arsitektur di CI, dan dokumentasi aturan di AGENTS.md.

## Practical Exercises

1. Gambar peta modul dan dependensi aplikasi Anda, lalu temukan siklus.
2. Tulis test arsitektur yang memastikan domain bebas framework.
3. Pindahkan satu akses lintas modul agar melalui API publik.

## Quick Reference

```text
Horizontal (layer): presentation → application → domain ← infrastructure
Vertikal (modul): orders · catalog · payments · shared kernel kecil
Kohesi tinggi · coupling rendah · tanpa siklus · domain murni
Lintas modul: API publik / event · bukan import internal / JOIN tabel lain
Tegakkan: package/Gradle module · dependency-cruiser · Konsist · test arsitektur
```

## Related Topics

- [Clean Architecture (Lintas Platform)](/system-design/concepts/clean-architecture/)
- [Folder Structure Guidelines](/ai-engineering/guides/folder-structure/)
- [Backend Architecture](/backend/backend-architecture/)
