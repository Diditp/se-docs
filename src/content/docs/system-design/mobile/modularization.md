---
title: "Design: Modularisasi Aplikasi Mobile Besar"
description: "Mendesain aplikasi mobile besar untuk banyak tim: alasan modularisasi, struktur feature & core module (Flutter packages/melos, Gradle modules), aturan dependensi, komunikasi antar fitur, navigasi lintas modul, design system, build time, ownership, super app & dynamic feature, serta strategi migrasi bertahap."
level: advanced
status: complete
version: "Flutter 3.x (pub workspaces/melos) · Gradle multi-module"
updated: 2026-11-13
tags: [system-design, mobile, modularization, architecture, monorepo, flutter]
---

## Overview

Ketika aplikasi tumbuh (puluhan fitur, beberapa tim), satu modul besar membuat build lambat, konflik merge sering, dan
batas tanggung jawab kabur. **Modularisasi** memecah aplikasi menjadi modul dengan **batas dan dependensi yang jelas**
sehingga tim dapat bekerja paralel. Soal "bagaimana menstrukturkan aplikasi untuk 5 tim?" umum di interview senior.

## Why It Matters

Struktur kode menentukan kecepatan tim. Modularisasi yang baik mempercepat build, mempermudah testing, dan memungkinkan
fitur dikembangkan/di-review oleh pemiliknya; modularisasi yang buruk menambah boilerplate tanpa manfaat.

## Core Concepts

| Jenis modul | Isi | Boleh bergantung pada |
| --- | --- | --- |
| `app` (shell) | Entry point, DI root, navigasi tingkat atas, konfigurasi flavor | Semua feature & core |
| `feature_*` | Fitur bisnis (checkout, inventory, reports) — UI, state, domain, data fitur | `core_*`, `feature_*_api` |
| `feature_*_api` (opsional) | Kontrak publik fitur (interface, route, model kecil) | `core_model` |
| `core_*` | Kemampuan bersama: network, database, design system, analytics, auth | `core` lebih dasar saja |

**Aturan utama:** feature **tidak** saling bergantung langsung pada implementasi — hanya melalui kontrak (api module,
interface, route). Dependensi mengalir: `app → feature → core`.

## How It Works

```text
app
 ├─ feature_checkout ──► feature_catalog_api (interface: ProductLookup, route /products/:id)
 ├─ feature_catalog  ──► implements feature_catalog_api
 ├─ feature_reports
 └─ core: core_network · core_database · core_designsystem · core_auth · core_analytics · core_model
DI di app menghubungkan interface (api) ke implementasi (feature) saat runtime.
```

## Implementation

### Struktur Flutter monorepo

```text
apps/
  pos_app/                   (shell: main_*.dart, router, DI, flavors)
packages/
  core/network/  core/database/  core/designsystem/  core/auth/  core/model/
  features/checkout/  features/catalog/  features/catalog_api/  features/reports/
pubspec.yaml                 (pub workspace, Dart 3.6+) atau melos.yaml
```

```yaml
# packages/features/checkout/pubspec.yaml
name: feature_checkout
resolution: workspace
dependencies:
  core_network: any
  core_designsystem: any
  feature_catalog_api: any      # BUKAN feature_catalog
```

### Kontrak antar fitur

```dart
// feature_catalog_api
abstract interface class ProductLookup {
  Future<ProductSummary?> findBySku(String sku);
}
class CatalogRoutes { static String productDetail(String id) => '/products/$id'; }

// feature_checkout memakai ProductLookup lewat DI, navigasi lewat route string/typed route — tanpa import layar catalog
```

### Router gabungan dari modul

```dart
// Setiap fitur mengekspor daftar route-nya
final router = GoRouter(routes: [
  ...catalogRoutes,        // dari feature_catalog
  ...checkoutRoutes,       // dari feature_checkout
  ...reportsRoutes,
]);
```

### Menegakkan aturan dependensi

```dart
// test/architecture_test.dart (di CI) — gagal bila feature mengimpor feature lain secara langsung
test('feature tidak mengimpor implementasi feature lain', () {
  for (final file in Directory('packages/features').listSync(recursive: true).whereType<File>()) {
    if (!file.path.endsWith('.dart')) continue;
    final owner = file.uri.pathSegments[2];                         // packages/features/<owner>/... → mis. "checkout"
    final forbidden = RegExp(r"package:feature_(\w+)/")
        .allMatches(file.readAsStringSync())
        .map((m) => m.group(1)!)
        .where((imported) => imported != owner && !imported.endsWith('_api'));   // boleh: diri sendiri & *_api
    expect(forbidden, isEmpty, reason: file.path);
  }
});
```

*(Di Android multi-module, aturan serupa ditegakkan lewat struktur Gradle (`implementation project(":core:network")`) dan
alat analisis dependensi.)*

### Build time & CI

```text
- Hanya jalankan test/analyze untuk paket yang berubah (melos --diff / path filter)
- Cache build per modul; Gradle configuration cache & build cache di Android
- Code generation per paket (build_runner) agar tidak membangun ulang semua
```

### Ownership

```text
CODEOWNERS:
/packages/features/checkout/   @team-payments
/packages/core/network/        @team-platform
```

### Migrasi bertahap dari monolit

```text
1. Ekstrak core yang paling stabil (design system, model, network)
2. Pindahkan satu fitur dengan batas jelas → buat api module bila fitur lain membutuhkannya
3. Tambah architecture test di CI
4. Ulangi per fitur; jangan "big bang"
```

### Super app & dynamic feature

Aplikasi besar (super app) memuat banyak mini-fitur; di Android, **dynamic feature module** dapat diunduh sesuai
kebutuhan. Di Flutter, opsi serupa terbatas (deferred components hanya Android) — biasanya cukup feature module + feature
flag untuk mengaktifkan fitur.

## Best Practices

- **Modularisasi saat ada masalah nyata** (build lambat, banyak tim, konflik), bukan sejak hari pertama untuk app kecil.
- **Feature bergantung pada kontrak, bukan implementasi** fitur lain.
- **Core module kecil & stabil**; hindari "common" yang menampung segalanya.
- **Aturan dependensi diuji otomatis** di CI.
- **Ownership jelas** per modul (CODEOWNERS).
- **Design system bersama** untuk konsistensi UI.

## Anti-Patterns

- Modul `common`/`utils` raksasa yang diimpor semua dan berisi logika bisnis.
- Feature saling mengimpor layar satu sama lain (siklus dependensi).
- Puluhan modul kecil untuk aplikasi 5 layar (overhead tanpa manfaat).
- Batas modul tanpa penegakan → terkikis dalam beberapa bulan.

## Performance Considerations

Modularisasi mempercepat build inkremental dan test selektif, tetapi menambah biaya konfigurasi; ukur waktu build
sebelum/sesudah. Saat runtime, inisialisasi fitur secara lazy agar startup tidak memuat semua modul.

## Security Considerations

Pusatkan logika keamanan di core (`core_auth`, `core_network` dengan interceptor, penyimpanan aman) agar fitur tidak
membuat implementasi sendiri yang berbeda-beda. Modul fitur sensitif (pembayaran) dapat punya reviewer wajib.

## Real-World Use Cases

- Aplikasi POS dengan tim pembayaran, katalog, dan laporan terpisah.
- Super app dengan banyak layanan (pembayaran, tiket, belanja).
- Migrasi aplikasi Flutter monolit 200+ layar menjadi monorepo paket.

## Interview Questions

1. Kapan aplikasi mobile perlu dimodularisasi?
2. Bagaimana fitur berkomunikasi tanpa saling bergantung?
3. Bagaimana mencegah batas modul terkikis?
4. Bagaimana navigasi bekerja lintas modul?
5. Apa risiko modularisasi berlebihan?

## Sample Answers

1. Saat build/test lambat, banyak tim bekerja paralel dan sering konflik, batas tanggung jawab kabur, atau ada kebutuhan berbagi kode antar aplikasi.
2. Melalui kontrak (api module berisi interface/route/model kecil) yang diimplementasikan fitur pemilik dan dihubungkan lewat DI di shell app; navigasi lewat route, bukan import layar.
3. Aturan dependensi yang diuji di CI (architecture test, analisis dependensi), struktur build yang mencegah import, code review dengan CODEOWNERS.
4. Setiap modul mengekspor route-nya; shell app menggabungkannya dalam satu router; modul lain menavigasi dengan path/typed route dari api module.
5. Boilerplate, konfigurasi build rumit, waktu build bisa malah naik, dan indirection berlebihan untuk aplikasi kecil.

## Practical Exercises

1. Gambar peta modul aplikasi Anda saat ini dan usulan target.
2. Ekstrak design system menjadi paket terpisah dalam monorepo.
3. Tambahkan architecture test yang melarang feature mengimpor feature lain.

## Quick Reference

```text
app (shell) → feature_* → core_* · feature ↔ feature hanya via *_api (interface, route)
DI di shell · router gabungan · architecture test di CI · CODEOWNERS
Pub workspace/melos (Flutter) · Gradle multi-module (Android) · migrasi bertahap · jangan over-modularize
```

## Related Topics

- [Feature-First Architecture (Flutter)](/flutter/feature-first-architecture/)
- [Android Architecture](/android/android-architecture/)
- [Software Architecture Fundamentals](/fundamentals/software-architecture-fundamentals/)
