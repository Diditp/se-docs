---
title: "Feature-First Architecture"
description: "Mengorganisasi kode Flutter berdasarkan fitur bisnis (bukan jenis file): struktur folder, batas antar fitur, shared core, dan kapan dipecah menjadi package terpisah."
level: intermediate
status: complete
version: "Flutter 3.x"
updated: 2026-11-12
tags: [flutter, architecture, project-structure, modularization]
---

## Overview

**Feature-first** (disebut juga *package by feature*) mengelompokkan kode berdasarkan **kemampuan bisnis** —
`auth/`, `catalog/`, `checkout/`, `report/` — dan di dalam setiap fitur barulah dipisah per layer
(`domain/`, `data/`, `presentation/`). Kebalikannya adalah **layer-first** (*package by layer*): `models/`, `screens/`,
`services/`, `repositories/` di root, berisi file semua fitur.

```text
Layer-first (sulit diskalakan)          Feature-first (direkomendasikan)
lib/                                     lib/
  models/  order.dart product.dart        core/ (network, db, theme, di, error)
  screens/ checkout.dart catalog.dart      features/
  blocs/   checkout_bloc.dart ...            catalog/  domain/ data/ presentation/
  services/ api.dart                         checkout/ domain/ data/ presentation/
```

## Why It Matters

- **Locality**: semua yang berubah untuk satu fitur berada di satu folder — perubahan & review lebih mudah.
- **Kepemilikan**: tim/orang bisa "memiliki" fitur tertentu.
- **Skalabilitas**: menambah fitur ke-30 tidak membuat folder `screens/` berisi ratusan file.
- **Modularisasi**: fitur bisa dipindah menjadi package Dart terpisah jika app tumbuh besar.

## Core Concepts

- **Feature** = satu kemampuan bisnis yang bisa dijelaskan ke user (checkout, laporan shift), bukan satu layar.
- **Core/shared** = kode lintas fitur yang **tidak berisi aturan bisnis fitur tertentu**: HTTP client, database, theme, l10n, error dasar, router.
- **Public API fitur** = hal yang boleh dipakai fitur lain (mis. route, entity bersama) — sisanya internal.
- **Arah dependency**: `features/* → core`, tidak sebaliknya. Antar fitur seminimal mungkin, idealnya lewat domain bersama atau navigasi.

## How It Works

```text
lib/
├── app/                    # composition root: App, router, bootstrap, flavors
├── core/
│   ├── di/                 # registrasi dependency
│   ├── network/            # Dio, interceptors
│   ├── database/           # Drift DB & DAO bersama
│   ├── error/              # Failure, Result
│   ├── theme/ · l10n/ · utils/
│   └── widgets/            # komponen UI generik (AppButton, EmptyView)
└── features/
    ├── auth/
    │   ├── domain/         entities/ repositories/ usecases/
    │   ├── data/           models/ datasources/ repositories/
    │   ├── presentation/   bloc/ pages/ widgets/
    │   └── auth.dart       # (opsional) barrel: export public API fitur
    ├── catalog/ ...
    └── checkout/ ...
```

Aturan sederhana untuk menentukan lokasi file: *"Jika fitur X dihapus, apakah file ini ikut dihapus?"* Ya → di dalam
fitur X. Tidak, dipakai banyak fitur dan tanpa aturan bisnis → `core/`.

## Implementation

### Barrel file sebagai public API fitur

```dart
// lib/features/catalog/catalog.dart — hanya ekspor yang boleh dipakai fitur lain
export 'domain/entities/product.dart';
export 'presentation/pages/product_picker_page.dart' show ProductPickerPage;
```

```dart
// lib/features/checkout/presentation/pages/checkout_page.dart
import 'package:pos/features/catalog/catalog.dart';   // ✅ lewat public API
// import 'package:pos/features/catalog/data/datasources/catalog_remote_ds.dart'; ❌ internal fitur lain
```

### Router per fitur (go_router)

```dart
// lib/features/report/report_routes.dart
final reportRoutes = [
  GoRoute(path: '/reports', builder: (_, __) => const ReportPage(), routes: [
    GoRoute(path: 'shift/:id', builder: (_, s) => ShiftReportPage(shiftId: s.pathParameters['id']!)),
  ]),
];

// lib/app/router.dart — composition root menggabungkan route semua fitur
final router = GoRouter(routes: [...authRoutes, ...catalogRoutes, ...checkoutRoutes, ...reportRoutes]);
```

### DI per fitur

```dart
// lib/features/checkout/checkout_di.dart
void registerCheckout(GetIt sl) {
  sl
    ..registerLazySingleton<CheckoutRepository>(() => CheckoutRepositoryImpl(sl(), sl()))
    ..registerFactory(() => CreateOrder(sl(), sl()))
    ..registerFactory(() => CheckoutBloc(sl()));
}
// lib/core/di/injection.dart
void configureDependencies() { registerCore(sl); registerAuth(sl); registerCatalog(sl); registerCheckout(sl); }
```

### Menegakkan batas dengan architecture test

Test sederhana ini gagal jika sebuah fitur mengimpor file internal (`domain/`, `data/`, `presentation/`) milik fitur lain.
Jalan di `flutter test` sehingga otomatis ikut CI.

```dart
// test/architecture/feature_boundaries_test.dart
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('fitur tidak mengimpor internal fitur lain', () {
    final internalImport = RegExp(r"import 'package:\w+/features/(\w+)/(domain|data|presentation)/");
    final violations = <String>[];
    final files = Directory('lib/features').listSync(recursive: true).whereType<File>()
        .where((f) => f.path.endsWith('.dart'));
    for (final file in files) {
      final ownFeature = file.uri.pathSegments[2];          // lib/features/<fitur>/...
      for (final m in internalImport.allMatches(file.readAsStringSync())) {
        if (m.group(1) != ownFeature) violations.add('${file.path} -> ${m.group(0)}');
      }
    }
    expect(violations, isEmpty, reason: violations.join('\n'));
  });
}
```

Test ini mengasumsikan import memakai `package:` (aktifkan lint `always_use_package_imports`). Alternatif yang lebih
kuat: custom lint rules, atau memecah fitur menjadi package lokal sehingga dependency harus dideklarasikan di `pubspec.yaml`.

### Kapan memecah menjadi package (melos/pub workspaces)

| Sinyal | Tindakan |
| --- | --- |
| Build/analyze lambat karena ukuran app besar | Pecah fitur stabil menjadi package lokal |
| Banyak tim, konflik merge sering | Package per tim/fitur dengan owner jelas |
| Fitur dipakai di beberapa app (white-label) | Package bersama yang di-versioning |
| App kecil–menengah, 1–3 developer | **Tetap satu package**, cukup folder feature-first |

## Best Practices

- **Nama fitur = istilah bisnis** (`checkout`, `shift`, `inventory`) — bukan teknis (`helpers`).
- **`core/` tanpa logika bisnis fitur** — jika mulai berisi aturan checkout, pindahkan ke fitur.
- **Fitur berkomunikasi lewat public API** (barrel), navigasi, atau domain bersama — bukan impor file internal.
- **Struktur test mencerminkan `lib/`** (`test/features/checkout/...`).
- **Mulai sebagai folder, pecah menjadi package hanya saat ada sinyal nyata** — modularisasi dini menambah biaya konfigurasi.
- **Dokumentasikan struktur di AGENTS.md** agar AI agent dan developer baru menaruh file di tempat yang sama.

## Anti-Patterns

- `core/` atau `shared/` menjadi tempat "segala sesuatu" (god module).
- Fitur yang mengimpor bloc/data source fitur lain secara langsung → coupling melingkar.
- Satu fitur per layar (`login_page/`, `register_page/`) → terlalu granular; kelompokkan per kemampuan (`auth/`).
- Duplikasi entity yang sama di banyak fitur tanpa sumber kebenaran.
- Campuran layer-first dan feature-first tanpa aturan.

## Performance Considerations

Struktur folder tidak memengaruhi performa runtime. Dampaknya pada **waktu build/analisis** dan **produktivitas**:
package terpisah memungkinkan analisis & test per package dan *deferred loading* (web). Barrel file besar yang diimpor
di mana-mana bisa memperlambat analyzer pada project sangat besar — ekspor seperlunya.

## Security Considerations

- Kode sensitif (token storage, enkripsi) di satu tempat di `core/security/` — mudah diaudit.
- Batas fitur yang jelas mempermudah review: perubahan di `auth/` dan `payment/` bisa diwajibkan reviewer khusus (CODEOWNERS).

## Real-World Use Cases

- **POS**: `auth`, `catalog`, `cart`, `checkout`, `payment`, `shift`, `inventory`, `report`, `sync`, `settings`.
- **Aplikasi petugas lapangan**: `work_order`, `site_survey`, `photo_evidence`, `signature`, `sync`.
- **CODEOWNERS** per folder fitur pada tim yang lebih besar.

## Interview Questions

1. Apa beda feature-first dan layer-first? Mana yang Anda pilih dan mengapa?
2. Apa yang boleh masuk ke `core/`?
3. Bagaimana dua fitur berkomunikasi tanpa coupling erat?
4. Kapan Anda memecah app menjadi beberapa package?

## Sample Answers

1. Layer-first mengelompokkan berdasarkan jenis file (models, screens); feature-first berdasarkan kemampuan bisnis dengan layer di dalamnya. Saya memilih feature-first untuk app yang akan tumbuh karena perubahan satu fitur terlokalisasi, mudah dimiliki tim, dan bisa dipecah menjadi package.
2. Kode lintas fitur yang generik dan tidak mengandung aturan bisnis fitur tertentu: network client, database, theme, l10n, error dasar, widget generik, router setup, DI.
3. Melalui public API (barrel export) berisi entity/route yang memang dibagikan, navigasi dengan parameter, atau repository/domain bersama yang dipindahkan ke `core` bila benar-benar dipakai banyak fitur. Hindari mengimpor bloc/data source internal fitur lain.
4. Saat ada sinyal nyata: build/analisis lambat, banyak tim dengan konflik, atau fitur dipakai ulang di beberapa app. Untuk app kecil, folder feature-first sudah cukup.

## Practical Exercises

1. Petakan project Anda saat ini ke struktur feature-first; daftar file yang "salah tempat".
2. Buat barrel public API untuk satu fitur dan perbaiki import lintas fitur.
3. Tambahkan pengecekan CI yang gagal jika fitur mengimpor `data/` milik fitur lain.

## Quick Reference

```text
lib/app (composition root) · lib/core (generik, tanpa aturan bisnis) · lib/features/<bisnis>/{domain,data,presentation}
Uji lokasi: "jika fitur dihapus, file ini ikut terhapus?" → ya: di fitur · tidak & generik: core
Antar fitur: public API/barrel, navigasi, domain bersama — bukan import internal
Package terpisah hanya saat ada sinyal (ukuran, tim, reuse)
```

## Related Topics

- [Clean Architecture di Flutter](/flutter/clean-architecture/)
- [Repository Pattern & DI](/flutter/repository-pattern-di/)
- [Navigation & Routing](/flutter/navigation-routing/)
- [AGENTS.md — Flutter Template](/agent-instructions/template-flutter-app/)
