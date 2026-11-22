---
title: "Build, Release & Deployment"
description: "Flavors & environment, versioning, signing Android, build AAB/IPA, obfuscation & simbol, rilis bertahap di Play Console/App Store, otomatisasi CI/CD, dan checklist rilis aplikasi Flutter."
level: intermediate
status: complete
version: "Flutter 3.x · Android Gradle Plugin 8.x · Google Play · App Store Connect"
updated: 2026-11-12
tags: [flutter, release, flavors, signing, ci-cd, play-store]
---

## Overview

Rilis aplikasi Flutter melibatkan: **konfigurasi per environment** (flavor), **versi**, **signing**, **build artefak**
(AAB untuk Google Play, IPA untuk App Store), **simbol untuk crash report**, **distribusi bertahap** (internal → beta →
production), dan **otomatisasi** di CI.

## Why It Matters

Kesalahan rilis mahal: build production yang menunjuk API staging, keystore hilang (tidak bisa update app lagi tanpa
proses pemulihan), crash tanpa stack trace yang bisa dibaca, atau rilis 100% sekaligus yang membawa bug ke semua user.

## Core Concepts

| Konsep | Arti |
| --- | --- |
| Build mode | debug (JIT, hot reload) · profile (AOT + tracing) · release (AOT, optimasi penuh) |
| Flavor | Varian app (dev/staging/prod) dengan applicationId, nama, ikon, dan konfigurasi berbeda |
| `--dart-define(-from-file)` | Konfigurasi compile-time ke kode Dart |
| `version: 1.8.0+42` | versionName `1.8.0` + build number/versionCode `42` (harus naik setiap upload) |
| Upload key & app signing key | Play App Signing: Anda menandatangani dengan upload key; Google menandatangani dengan app signing key |
| AAB | Android App Bundle — Play membuat APK teroptimasi per device |
| Obfuscation & split-debug-info | Menyamarkan nama simbol Dart & menyimpan simbol terpisah untuk de-obfuscation crash |
| Staged rollout | Rilis ke persentase user bertahap; bisa dihentikan |

## How It Works

```text
git tag mobile-v1.8.0 → CI: analyze → test → build appbundle --flavor prod (signed, obfuscated)
  → upload simbol ke Crashlytics → upload AAB ke Play internal track (fastlane/Play API)
  → QA → promosi ke closed/open testing → production staged rollout 5% → 20% → 50% → 100%
  (pantau crash-free users & vitals di setiap tahap; halt jika memburuk)
```

## Implementation

### Flavor Android (build.gradle.kts)

```kotlin
android {
    flavorDimensions += "env"
    productFlavors {
        create("dev")  { dimension = "env"; applicationIdSuffix = ".dev"; resValue("string", "app_name", "POS Dev") }
        create("prod") { dimension = "env"; resValue("string", "app_name", "POS") }
    }
    signingConfigs {
        create("release") {
            // Nilai dari environment CI / key.properties lokal (tidak di-commit)
            storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "upload.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KEY_ALIAS")
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
        }
    }
}
```

### Konfigurasi Dart per environment

```json
// config/prod.json (tidak berisi secret — hanya konfigurasi publik)
{ "API_BASE_URL": "https://api.example.com", "ENV": "prod" }
```

```dart
const apiBaseUrl = String.fromEnvironment('API_BASE_URL');
const env = String.fromEnvironment('ENV', defaultValue: 'dev');
```

```bash
flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=config/dev.json
flutter build appbundle --release --flavor prod -t lib/main_prod.dart \
  --dart-define-from-file=config/prod.json \
  --obfuscate --split-debug-info=build/symbols
```

### Versioning

```yaml
# pubspec.yaml
version: 1.8.0+42        # 1.8.0 = versionName (semver), 42 = versionCode/build number (wajib naik)
```

Di CI, build number bisa diambil dari nomor run: `flutter build appbundle --build-number=$GITHUB_RUN_NUMBER`.

### iOS (garis besar)

- Scheme/configuration per flavor di Xcode; bundle identifier berbeda.
- Signing: sertifikat distribusi + provisioning profile (atau automatic signing); di CI gunakan fastlane `match` atau App Store Connect API key.
- `flutter build ipa --release --flavor prod -t lib/main_prod.dart --obfuscate --split-debug-info=build/symbols`
- Upload ke TestFlight, lalu App Store dengan *phased release*.

### Checklist rilis

```markdown
- [ ] CHANGELOG & release notes (bahasa user)
- [ ] versionName & build number dinaikkan
- [ ] Build prod menunjuk API prod (cek splash/About menampilkan env & versi)
- [ ] Migrasi DB lokal diuji dari versi rilis sebelumnya
- [ ] Kompatibilitas API: backend sudah mendukung versi ini (dan versi lama masih jalan)
- [ ] Simbol (split-debug-info) & mapping R8 diunggah ke crash reporter
- [ ] Smoke test di device fisik (login, transaksi, sync, print)
- [ ] Rilis bertahap + pantau crash-free & ANR; rencana halt/rollback
```

## Best Practices

- **Flavor terpisah** dengan applicationId berbeda — dev & prod bisa terpasang bersamaan.
- **Play App Signing + backup upload keystore** di tempat aman (password manager/secret vault); jangan di repo.
- **Build rilis hanya dari CI** pada tag, dengan versi yang sama dengan tag.
- **Obfuscate + simpan simbol** setiap rilis.
- **Staged rollout** dan pantau Android vitals/crash-free sebelum menaikkan persentase.
- **Force update/minimum version** via Remote Config/API untuk perubahan yang tidak kompatibel.
- **Versi & environment terlihat di app** (halaman About) — mempercepat support.

## Anti-Patterns

- Build release dari laptop developer dengan konfigurasi tidak jelas.
- Mengubah applicationId/keystore setelah rilis.
- `--dart-define` berisi secret server (bisa diekstrak dari binary).
- Rilis 100% langsung di hari Jumat sore.
- Lupa menaikkan build number → upload ditolak store.

## Performance Considerations

- Release mode + AOT memberikan performa sebenarnya; selalu ukur di profile/release.
- `isMinifyEnabled` & `isShrinkResources` (R8) memperkecil ukuran native/Java; aset & font juga perlu dirampingkan.
- AAB mengurangi ukuran unduhan dibanding APK universal.
- Gunakan `--analyze-size` untuk memantau pertumbuhan ukuran antar rilis.

## Security Considerations

- Keystore & password di secret CI; file hasil decode dihapus setelah build (penting di self-hosted runner).
- Obfuscation mempersulit reverse engineering tetapi **bukan** pengaman secret — jangan ada secret di app.
- R8 keep rules minimal; periksa bahwa log debug tidak ikut di release.
- Aktifkan Play Integrity/App Attest bila backend perlu memastikan request dari app asli.

## Real-World Use Cases

- **POS**: flavor `dev` (API staging, ikon oranye) dan `prod`; rilis 2 mingguan via tag `mobile-v*`, rollout 10% → 100% dalam 3 hari.
- **Hotfix**: branch `release/1.8` → `1.8.1+45` → expedited review/rollout.
- **Enterprise/MDM**: distribusi APK internal untuk device kasir yang dikelola.

## Interview Questions

1. Apa beda debug, profile, dan release mode?
2. Bagaimana Anda mengelola konfigurasi dev/staging/prod di Flutter?
3. Apa itu Play App Signing dan mengapa penting?
4. Mengapa perlu `--split-debug-info`?
5. Bagaimana strategi rilis yang aman?

## Sample Answers

1. Debug: JIT, hot reload, assertion aktif, lambat. Profile: AOT dengan dukungan tracing DevTools untuk mengukur performa. Release: AOT teroptimasi tanpa debugging untuk distribusi.
2. Flavor native (applicationId, nama, ikon) + entry point per flavor + `--dart-define-from-file` untuk konfigurasi publik (base URL, env), project Firebase terpisah, dan build dari CI per environment.
3. Google menyimpan app signing key; developer menandatangani dengan upload key. Jika upload key hilang/bocor, bisa di-reset tanpa kehilangan kemampuan update app.
4. Dengan obfuscation, stack trace berisi nama simbol tersamar; file simbol yang disimpan terpisah dipakai untuk de-obfuscation crash report sehingga tetap bisa dibaca.
5. Build dari CI pada tag, QA di internal/closed testing, staged rollout bertahap sambil memantau crash-free & ANR, siap menghentikan rollout, backend kompatibel dengan versi lama, dan mekanisme force update untuk keadaan darurat.

## Practical Exercises

1. Tambahkan flavor dev/prod dengan ikon & nama berbeda; pasang keduanya di satu device.
2. Buat workflow CI yang membangun AAB bertanda tangan dari tag dan mengunggah artefak + simbol.
3. Implementasikan halaman About yang menampilkan versi, build number, dan environment.

## Quick Reference

```text
flutter build appbundle --release --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json --obfuscate --split-debug-info=build/symbols
version: x.y.z+build (build wajib naik) · Play App Signing + backup upload key · signing dari env CI
Rilis: tag → CI → internal → testing → staged rollout (pantau vitals) · force update via config
```

## Related Topics

- [GitHub Actions](/devops/github-actions/)
- [OTA Update](/flutter/ota-update/)
- [Flutter Security Best Practices](/flutter/security-best-practices/)
- [Versioning & Release Management](/devops/versioning-release/)
- Referensi resmi: [Build and release an Android app](https://docs.flutter.dev/deployment/android), [Build and release an iOS app](https://docs.flutter.dev/deployment/ios), [Flavors](https://docs.flutter.dev/deployment/flavors), [Obfuscating Dart code](https://docs.flutter.dev/deployment/obfuscate).
