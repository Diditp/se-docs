---
title: "End-to-End Testing"
description: "E2E testing untuk aplikasi mobile: kapan perlu, memilih alur kritis, tool (Flutter integration_test, Patrol, Maestro, Espresso, XCUITest, Appium), menangani dialog sistem & izin, data & backend test, device farm (Firebase Test Lab), stabilitas, dan biaya pemeliharaan."
level: intermediate
status: complete
version: "integration_test · Patrol 3.x · Maestro · Firebase Test Lab — fitur tool berubah, cek dokumentasi resmi"
updated: 2026-11-13
tags: [testing, e2e, mobile, patrol, maestro, firebase-test-lab]
---

## Overview

**End-to-end (E2E) test** menjalankan aplikasi seperti pengguna nyata — dari UI, melewati semua lapisan, sampai backend
(nyata atau tiruan) — untuk memastikan **alur paling penting** tetap berfungsi. E2E memberi keyakinan tertinggi tetapi
paling lambat dan paling mahal dirawat, sehingga jumlahnya harus sedikit dan dipilih dengan cermat.

## Why It Matters

Bug yang lolos unit & widget test sering berupa masalah lintas lapisan: navigasi, izin, plugin native, konfigurasi
build release. E2E pada alur kritis (login, checkout, sinkronisasi) mencegah rilis yang "build-nya lulus tetapi aplikasinya
tidak bisa dipakai".

## Core Concepts

| Tool | Platform | Ciri |
| --- | --- | --- |
| Flutter `integration_test` | Android/iOS | Resmi, berbasis widget finder; terbatas untuk dialog sistem |
| Patrol | Flutter | Menambah interaksi native (dialog izin, notifikasi, settings) |
| Maestro | Android/iOS (lintas framework) | Alur YAML, black-box, mudah ditulis QA |
| Espresso / UI Automator | Android | Native, cepat; UI Automator untuk lintas app/sistem |
| XCUITest | iOS | Native Apple |
| Appium | Lintas platform | Fleksibel, lebih lambat & kompleks |

### Memilih alur E2E

| Kriteria | Contoh |
| --- | --- |
| Bernilai bisnis tinggi | Login, checkout & pembayaran, sinkronisasi transaksi |
| Lintas banyak lapisan/native | Izin kamera + scan barcode, push notification membuka layar |
| Pernah rusak di production | Alur yang punya riwayat insiden |

## How It Works

```text
Build app (flavor test/staging) → instal di emulator/perangkat/device farm
→ siapkan data (akun test, seed backend atau fake server) → jalankan skenario
→ screenshot/video/log saat gagal → laporan di CI
```

## Implementation

### Patrol: menangani dialog izin

```dart
patrolTest('scan barcode setelah memberi izin kamera', ($) async {
  await $.pumpWidgetAndSettle(const PosApp());
  await $('Scan').tap();
  if (await $.native.isPermissionDialogVisible()) {
    await $.native.grantPermissionWhenInUse();
  }
  expect($('Arahkan kamera ke barcode'), findsOneWidget);
});
```

### Maestro: alur login (YAML)

```yaml
appId: com.example.pos.staging
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: "kasir.test@example.com"
- tapOn: "Password"
- inputText: ${TEST_PASSWORD}          # dari environment CI, bukan hardcode
- tapOn: "Masuk"
- assertVisible: "Penjualan Hari Ini"
```

### Firebase Test Lab dari CI (garis besar)

```bash
flutter build apk --debug --flavor staging -t integration_test/checkout_test.dart   # atau konfigurasi Patrol/Test Lab
gcloud firebase test android run --type instrumentation \
  --app build/app/outputs/apk/staging/debug/app-staging-debug.apk \
  --test <apk-test-androidTest> --device model=<model>,version=<api>
```

*(Langkah pembuatan APK test berbeda untuk integration_test vs Patrol — ikuti dokumentasi tool yang dipakai.)*

### Data & backend

| Opsi | Kelebihan | Kekurangan |
| --- | --- | --- |
| Backend staging dengan akun test | Paling realistis | Bisa tidak stabil, data berubah |
| Fake server/WireMock khusus E2E | Deterministik | Tidak menguji backend nyata |
| Seed & reset data via API test | Seimbang | Butuh endpoint/skrip khusus (amankan!) |

### Menjaga E2E tetap stabil

```text
- Selector stabil: Key/semantics label/testTag, bukan teks yang sering berubah atau posisi
- Tunggu kondisi (assertVisible/pumpAndSettle dengan batas), bukan sleep
- Animasi dimatikan di emulator test
- Satu skenario = satu alur; reset state di awal (clearState)
- Rekam video/screenshot saat gagal
```

## Best Practices

- **Sedikit E2E untuk alur kritis**, sisanya di level unit/widget/integration.
- **Selector berbasis key/semantics**.
- **Data test terkendali** dan akun test terpisah.
- **Jalankan di CI** (nightly atau sebelum rilis) dan perangkat nyata/device farm secara berkala.
- **Perbaiki atau hapus test flaky** — E2E yang sering merah tanpa alasan akan diabaikan.

## Anti-Patterns

- Ratusan E2E untuk setiap detail UI.
- Kredensial nyata di file test.
- Bergantung pada teks UI yang diterjemahkan/berubah.
- E2E sebagai satu-satunya jenis test.

## Performance Considerations

E2E bisa berjalan beberapa menit per alur. Paralelkan per perangkat/shard, gunakan emulator dengan snapshot, dan jalankan
matriks perangkat lengkap hanya terjadwal (bukan setiap PR).

## Security Considerations

Endpoint seed/reset data hanya ada di environment test dan dilindungi; password akun test disimpan sebagai secret CI;
pastikan build test (dengan hook khusus) tidak pernah dirilis ke store.

## Real-World Use Cases

- Smoke test sebelum rilis: login → transaksi → cetak → sinkron.
- Alur izin kamera & scan barcode di beberapa versi Android/iOS.
- Notifikasi push membuka detail order.

## Interview Questions

1. Kapan E2E test layak dibuat?
2. Mengapa E2E sering flaky dan bagaimana mengatasinya?
3. Tool E2E apa untuk Flutter dan apa batasannya?
4. Bagaimana menangani dialog izin sistem di E2E?
5. Bagaimana menyiapkan data untuk E2E?

## Sample Answers

1. Untuk alur kritis bernilai bisnis tinggi atau yang melibatkan banyak lapisan/native, di mana kegagalan tidak tertangkap test level bawah.
2. Ketergantungan waktu, animasi, jaringan, data bersama, dan selector rapuh; atasi dengan menunggu kondisi, selector stabil, data terkendali, animasi dimatikan, dan isolasi state.
3. `integration_test` (resmi, tetapi sulit berinteraksi dengan UI sistem), Patrol (menambah interaksi native), Maestro (black-box lintas framework).
4. Gunakan tool yang mendukung interaksi native (Patrol, UI Automator, Maestro) atau berikan izin terlebih dahulu melalui perintah adb/konfigurasi test.
5. Akun test khusus, seed/reset lewat skrip atau endpoint khusus environment test, atau fake server yang deterministik.

## Practical Exercises

1. Pilih 3 alur kritis aplikasi Anda dan tulis skenario E2E-nya.
2. Implementasikan satu alur dengan Maestro atau Patrol.
3. Jalankan alur tersebut di CI secara terjadwal dan simpan video saat gagal.

## Quick Reference

```text
Sedikit · alur kritis · lintas lapisan/native
integration_test · Patrol (dialog native) · Maestro (YAML) · Espresso/XCUITest · Appium
Selector key/semantics · tunggu kondisi · animasi off · data terkendali · video saat gagal · nightly/pre-release
```

## Related Topics

- [Integration Testing](/testing-performance/integration-testing/)
- [Testing Fundamentals](/testing-performance/testing-fundamentals/)
- [Mobile CI/CD Pipeline](/devops/mobile-cicd-pipeline/)
