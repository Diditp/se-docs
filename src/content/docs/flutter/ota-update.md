---
title: "OTA Update (Shorebird Code Push)"
description: "Over-the-air update untuk Flutter: perbedaan store update vs code push, cara kerja Shorebird (release & patch), batasan (hanya kode Dart), strategi rollout & rollback, kepatuhan kebijakan store, dan force update."
level: advanced
status: complete
version: "Shorebird CLI & shorebird_code_push (cek versi terbaru)"
updated: 2026-11-12
tags: [flutter, ota, shorebird, code-push, release, hotfix]
---

## Overview

**OTA (over-the-air) update** adalah mengirim perubahan ke aplikasi yang sudah terpasang **tanpa** user mengunduh versi
baru dari Play Store/App Store. Untuk Flutter, solusi yang umum adalah **Shorebird** (code push): Anda membuat **release**
(build yang dikirim ke store) lalu mengirim **patch** berisi perubahan kode Dart untuk release tersebut.

Tiga mekanisme "update" yang berbeda:

| Mekanisme | Mengubah | Contoh |
| --- | --- | --- |
| Store update | Segalanya (Dart, native, aset, izin) | Rilis 1.8.0 → 1.9.0 |
| **Code push (Shorebird)** | **Kode Dart** release yang sama | Hotfix bug kalkulasi diskon |
| Remote config / feature flag | Nilai konfigurasi yang sudah dibaca kode | Menonaktifkan QRIS sementara |

## Why It Matters

Review store dan adopsi update bisa memakan hari hingga minggu — sementara bug kritis di aplikasi transaksi (total salah,
crash saat checkout) harus diperbaiki dalam jam. Code push mempercepat hotfix; tetapi tanpa disiplin, ia juga bisa
mengirim bug ke semua user dalam hitungan menit.

## Core Concepts

- **Release** — build yang dibuat dengan `shorebird release` dan diunggah ke store; Shorebird menyimpan informasinya.
- **Patch** — perubahan kode Dart untuk **satu versi release tertentu** (`shorebird patch`).
- **Updater** — komponen di app yang memeriksa, mengunduh, dan memasang patch; secara default patch berlaku pada **peluncuran berikutnya**.
- **Track / staging** — mengirim patch ke kanal uji sebelum ke semua user (tersedia di versi Shorebird yang mendukung track).
- **Rollback** — menonaktifkan patch dari console/CLI; device kembali ke release/patch sebelumnya.
- **Batasan** — perubahan **native code** (Kotlin/Swift, plugin baru dengan kode native), **aset**, `pubspec` yang menambah plugin native, atau perubahan permission **tidak bisa** di-patch → butuh release baru.

## How It Works

```text
shorebird release android  → build AAB + metadata release 1.8.0+42 → upload AAB ke Play
(bug ditemukan)
shorebird patch android    → diff kode Dart terhadap release 1.8.0+42 → upload patch ke server Shorebird
App 1.8.0+42 dibuka → updater cek patch → unduh di background → patch aktif saat app dibuka lagi
```

Patch terikat ke versi release; user dengan versi app berbeda tidak menerima patch tersebut.

## Implementation

### Alur dasar CLI

```bash
# Sekali per project
shorebird init                                   # menambah shorebird.yaml (app_id) & konfigurasi

# Release ke store (gantikan flutter build appbundle untuk build yang ingin bisa di-patch)
shorebird release android --flavor prod -t lib/main_prod.dart -- --dart-define-from-file=config/prod.json
shorebird release ios     --flavor prod -t lib/main_prod.dart -- --dart-define-from-file=config/prod.json

# Hotfix: perbaiki kode Dart, lalu patch release yang sudah beredar
shorebird patch android --flavor prod -t lib/main_prod.dart --release-version=1.8.0+42 \
  -- --dart-define-from-file=config/prod.json

# Uji release/patch di device sebelum dipromosikan
shorebird preview
```

Flag `--obfuscate`/`--split-debug-info`, track/staging, dan opsi lain bergantung pada versi CLI — cek `shorebird release --help`
dan dokumentasi resmi. Patch harus dibuat dari **konfigurasi build yang sama** (flavor, dart-define) dengan release-nya.

### Kontrol update dari kode (opsional)

```dart
// Contoh menggunakan package shorebird_code_push (nama API dapat berbeda antar versi)
final updater = ShorebirdUpdater();

Future<void> checkForPatch() async {
  if (!updater.isAvailable) return;                      // build non-Shorebird (debug) → lewati
  final status = await updater.checkForUpdate();
  if (status == UpdateStatus.outdated) {
    await updater.update();                              // unduh; aktif saat restart berikutnya
    // Opsional: tampilkan "Pembaruan siap — mulai ulang aplikasi" di layar yang aman (bukan saat transaksi)
  }
}
```

Untuk aplikasi transaksi, **jangan memaksa restart di tengah alur kasir**; terapkan patch pada peluncuran berikutnya atau
tawarkan restart saat shift ditutup.

### Strategi hotfix yang aman

```markdown
1. Reproduksi bug & tulis regression test.
2. Perbaiki di branch release/1.8 (bukan main yang sudah berisi fitur baru).
3. CI: analyze + test + build patch (konfigurasi sama dengan release).
4. Kirim ke track staging / device internal → verifikasi alur terdampak.
5. Promosikan ke semua user; pantau crash-free & error rate per patch.
6. Siap rollback patch dari console bila memburuk.
7. Masukkan fix ke main & rilis store berikutnya (patch bukan pengganti rilis normal).
```

### Force update untuk perubahan yang tidak bisa di-patch

```dart
// Remote Config / endpoint /v1/config: min_supported_version
if (Version.parse(currentVersion) < Version.parse(minSupported)) {
  showBlockingUpdateDialog();   // arahkan ke store; Android bisa memakai in-app updates
}
```

:::caution[Kebijakan store & versi]
Google Play dan Apple mengizinkan pembaruan kode yang diinterpretasikan/diunduh dengan syarat tertentu — antara lain tidak
mengubah tujuan utama aplikasi dan tidak mengelabui proses review. Patch harus berupa perbaikan/penyesuaian, bukan
fitur besar baru yang menghindari review. Baca kebijakan terbaru masing-masing store dan dokumentasi Shorebird, karena
detail teknis (API updater, dukungan track, flag CLI) terus berubah.
:::

## Best Practices

- **Patch untuk hotfix kecil & mendesak** (bug logika Dart, teks, perhitungan) — fitur besar tetap lewat rilis store.
- **Patch dari branch release yang sama** dengan versi yang beredar, dengan konfigurasi build identik.
- **Uji patch di track internal/staging** sebelum ke semua user.
- **Pantau metrik per patch** (crash-free, error) dan siapkan rollback.
- **Simpan simbol obfuscation** untuk setiap release & patch agar crash tetap terbaca.
- **Patch diterapkan saat aman** (peluncuran berikutnya), tidak mengganggu transaksi berjalan.
- **Catat patch di changelog internal** (versi release, nomor patch, perubahan, waktu).

## Anti-Patterns

- Menjadikan code push alur rilis utama dan melewati review store untuk fitur besar.
- Patch yang bergantung pada perubahan native/aset → crash atau perilaku tak terduga.
- Patch langsung ke 100% tanpa uji.
- Patch dari `main` yang berisi perubahan lain di luar hotfix.
- Tidak menyimpan konfigurasi build release → patch tidak bisa dibuat dengan identik.

## Performance Considerations

- Patch diunduh di background dan ukurannya relatif kecil (diff kode Dart), tetapi tetap memakai kuota data user — kirim seperlunya.
- Updater berjalan saat startup; pastikan tidak memblokir frame pertama.
- Performa kode yang dipatch dapat berbeda dari kode AOT release pada platform tertentu (detail implementasi Shorebird, terutama iOS) — ukur alur kritis setelah patch.

## Security Considerations

- Patch adalah jalur distribusi kode: lindungi akun & token Shorebird (2FA, token CI terbatas di secret).
- Hanya CI dari branch terproteksi yang boleh membuat patch production.
- Patch tidak boleh menambah perilaku yang melanggar kebijakan privasi/permission.
- Audit: siapa membuat patch, kapan, untuk release apa.

## Real-World Use Cases

- **Bug pembulatan pajak** di POS ditemukan pagi hari → patch diuji di 3 outlet → dipromosikan siang hari tanpa menunggu review store.
- **Teks/label salah** pada struk → patch kecil.
- **Perubahan plugin printer (native)** → tidak bisa di-patch → rilis store + `min_supported_version`.

## Interview Questions

1. Apa beda OTA code push dan update via store?
2. Apa yang tidak bisa dikirim lewat patch Shorebird?
3. Bagaimana Anda memastikan patch aman sebelum sampai ke semua user?
4. Bagaimana menangani perubahan yang membutuhkan rilis native?
5. Apa risiko kebijakan store terkait code push?

## Sample Answers

1. Store update mengganti seluruh binary (native, aset, Dart) dan melalui review. Code push mengirim perubahan kode Dart untuk release yang sudah terpasang, berlaku tanpa user mengunduh dari store — lebih cepat untuk hotfix.
2. Perubahan kode native (Kotlin/Swift, plugin baru dengan bagian native), aset, perubahan permission/manifest, dan apa pun yang mengubah binary native — butuh release baru.
3. Regression test, build dari branch release dengan konfigurasi identik, uji di track staging/device internal, rollout bertahap jika tersedia, pantau crash & error per patch, siap rollback.
4. Rilis store normal, lalu pakai mekanisme minimum supported version (Remote Config/API) untuk mendorong user update; backend tetap kompatibel dengan versi lama selama masa transisi.
5. Store melarang mengubah tujuan utama aplikasi atau menghindari review lewat kode yang diunduh. Patch harus terbatas pada perbaikan; fitur besar lewat rilis biasa.

## Practical Exercises

1. Inisialisasi Shorebird di project latihan, buat release, lalu patch perubahan teks dan uji dengan `shorebird preview`.
2. Tulis SOP hotfix (7 langkah di atas) di repo Anda dan tambahkan ke AGENTS.md project.
3. Implementasikan force update berbasis `min_supported_version`.

## Quick Reference

```text
shorebird init → shorebird release <platform> → (bug) → shorebird patch <platform> --release-version=x.y.z+n
Patch = kode Dart saja · native/aset/permission → rilis store · aktif saat app dibuka berikutnya
Branch release + konfigurasi identik · uji di staging · pantau & siap rollback · patch ≠ pengganti rilis
```

## Related Topics

- [Build, Release & Deployment](/flutter/build-release-deployment/)
- [Setup Dev di Windows (memindahkan .shorebird dari C:)](/devops/windows-dev-storage/)
- [Firebase Integration (Remote Config)](/flutter/firebase-integration/)
- [Rollback Strategy](/devops/rollback-strategy/)
- Referensi resmi: [Shorebird documentation](https://docs.shorebird.dev), [Google Play policy](https://support.google.com/googleplay/android-developer/answer/9888379), [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
