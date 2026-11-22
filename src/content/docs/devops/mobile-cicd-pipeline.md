---
title: "Mobile CI/CD Pipeline (Flutter Android & iOS)"
description: "Membangun pipeline CI/CD untuk aplikasi Flutter: job verifikasi PR, build release Android (AAB) dan iOS (IPA) dengan signing dari secret, versi build otomatis, upload ke Play internal testing & TestFlight, cache, flavor, symbol upload, serta pilihan tool (GitHub Actions, Codemagic, Bitrise, Xcode Cloud, fastlane)."
level: intermediate
status: complete
version: "GitHub Actions · subosito/flutter-action v2 · fastlane 2.x — versi action & runner berubah, cek rilis terbaru"
updated: 2026-11-13
tags: [devops, ci-cd, flutter, android, ios, fastlane, github-actions]
---

## Overview

Pipeline mobile memverifikasi setiap perubahan dan menghasilkan **build ber-signing yang siap diuji** tanpa campur tangan
manual. Untuk Flutter, satu repositori menghasilkan dua artefak — **AAB** (Android) dan **IPA** (iOS) — dengan kebutuhan
berbeda: iOS wajib runner **macOS**, keduanya butuh **signing**, dan distribusinya lewat **store**.

## Why It Matters

Rilis manual dari laptop rawan salah (keystore salah, build number lupa dinaikkan, flavor tertukar) dan membuat tim
bergantung pada satu orang. Pipeline otomatis adalah ciri tim mobile yang matang dan sering ditanyakan di interview.

## Core Concepts

| Tahap | Pemicu | Isi |
| --- | --- | --- |
| Verify | Setiap PR | `dart format`, `flutter analyze`, unit & widget test, (golden test), build debug cepat |
| Build internal | Merge ke `main` | Build release flavor staging → Play internal testing / Firebase App Distribution / TestFlight internal |
| Release | Tag `v*` / approval | Build production → Play (track production/staged) & App Store Connect |
| Post-release | Otomatis | Upload symbol (mapping, dSYM, Dart symbols), notifikasi tim, tag & changelog |

| Tool | Kelebihan | Catatan |
| --- | --- | --- |
| GitHub Actions | Terintegrasi repo, fleksibel | Menit macOS lebih mahal; signing iOS diatur sendiri |
| Codemagic | Fokus Flutter, signing iOS terkelola | Layanan pihak ketiga berbayar per menit/paket |
| Bitrise | Banyak step siap pakai | |
| Xcode Cloud | Terintegrasi Apple | Hanya iOS/Apple |
| fastlane | Otomasi signing, upload, metadata | Dipakai di atas CI mana pun |

## How It Works

```text
PR → verify (ubuntu) ─┐
                      ├─ merge → build-android (ubuntu): decode keystore → flutter build appbundle → upload internal track
                      └─ merge → build-ios (macos): API key + certificate/profile → flutter build ipa → upload TestFlight
Build number = nomor run CI (selalu naik) · version dari pubspec / tag
```

## Implementation

### Job verifikasi PR

```yaml
name: mobile-ci
on:
  pull_request:
    paths: ['lib/**', 'test/**', 'pubspec.*', 'android/**', 'ios/**']
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { channel: stable, cache: true }
      - run: flutter pub get
      - run: dart format --output=none --set-exit-if-changed lib test
      - run: flutter analyze
      - run: flutter test --coverage
```

### Build & upload Android (internal testing)

```yaml
  android-internal:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - uses: subosito/flutter-action@v2
        with: { channel: stable, cache: true }
      - name: Decode keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/upload.jks
          cat > android/key.properties <<EOF
          storeFile=upload.jks
          storePassword=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          keyAlias=${{ secrets.ANDROID_KEY_ALIAS }}
          keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}
          EOF
      - run: |
          flutter build appbundle --release --flavor staging -t lib/main_staging.dart \
            --build-number=${{ github.run_number }} \
            --obfuscate --split-debug-info=build/symbols
      - name: Upload ke Play internal testing
        run: |
          echo '${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}' > play.json
          bundle exec fastlane supply --aab build/app/outputs/bundle/stagingRelease/app-staging-release.aab \
            --track internal --json_key play.json --package_name com.example.pos.staging
```

*(Fastlane dapat dipasang lewat `Gemfile` di repo; alternatif lain adalah action upload Play pihak ketiga.)*

### Build & upload iOS (TestFlight)

```yaml
  ios-testflight:
    if: github.ref == 'refs/heads/main'
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { channel: stable, cache: true }
      - run: flutter pub get && cd ios && pod install
      - name: Signing & upload via fastlane
        env:
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_P8: ${{ secrets.ASC_KEY_P8 }}
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_AUTH }}
          BUILD_NUMBER: ${{ github.run_number }}
        run: cd ios && bundle exec fastlane beta
```

```ruby
# ios/fastlane/Fastfile
lane :beta do
  setup_ci                                            # keychain sementara di runner
  api_key = app_store_connect_api_key(key_id: ENV["ASC_KEY_ID"], issuer_id: ENV["ASC_ISSUER_ID"], key_content: ENV["ASC_KEY_P8"])
  match(type: "appstore", readonly: true, api_key: api_key)
  Dir.chdir("../..") do
    sh("flutter build ipa --release --flavor staging -t lib/main_staging.dart --build-number=#{ENV['BUILD_NUMBER']} --export-options-plist=ios/ExportOptions.plist")
  end
  upload_to_testflight(api_key: api_key, ipa: Dir["../../build/ios/ipa/*.ipa"].first, skip_waiting_for_build_processing: true)
end
```

### Upload symbol untuk crash report

```bash
# Dart (obfuscated) → Crashlytics
firebase crashlytics:symbols:upload --app=<FIREBASE_APP_ID> build/symbols
# Android mapping.txt R8 & iOS dSYM biasanya diunggah otomatis oleh plugin Gradle/ build phase Crashlytics — verifikasi!
```

### Secrets yang dibutuhkan

| Secret | Untuk |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64`, password, alias | Signing upload key Android |
| `PLAY_SERVICE_ACCOUNT_JSON` | Upload ke Play Console (service account dengan izin minimum) |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` | App Store Connect API |
| `MATCH_PASSWORD`, akses repo match | Certificate & profile iOS terenkripsi |
| Firebase token/service account | Distribusi & symbol upload |

## Best Practices

- **Verify cepat di Linux**, job iOS hanya saat dibutuhkan (macOS mahal).
- **Build number dari CI** (`github.run_number`) agar selalu naik.
- **Satu flavor per environment** dengan bundle ID/package berbeda.
- **Signing hanya di CI** dengan secret; developer tidak perlu memegang kunci distribusi.
- **Upload symbol** setiap build release.
- **Cache** pub, Gradle, CocoaPods.

## Anti-Patterns

- Keystore/`key.properties`/`.p8` di repo.
- Build release dari laptop untuk production.
- Satu job raksasa yang membangun semua di macOS untuk setiap PR.
- Lupa menaikkan build number (upload ditolak store).
- Tidak menyimpan symbol → crash obfuscated tidak terbaca.

## Performance Considerations

Gunakan `paths` filter, cache (`flutter-action` cache, Gradle cache, `Pods`), dan jalankan Android & iOS paralel. Untuk
proyek besar, pisahkan integration test perangkat ke workflow terjadwal atau Firebase Test Lab.

## Security Considerations

Batasi `permissions` token GitHub, pin versi action (idealnya commit SHA), gunakan environment protection untuk job
release (approval), service account Play dengan izin minimum, dan rotasi kunci bila ada anggota tim keluar atau bocor.

## Real-World Use Cases

- Setiap merge ke main menghasilkan build staging di Play internal & TestFlight untuk QA.
- Tag `v1.5.0` memicu build production dan upload ke track production (staged rollout) & App Store Connect.

## Interview Questions

1. Seperti apa pipeline CI/CD aplikasi Flutter Anda?
2. Bagaimana menyimpan keystore dan certificate di CI?
3. Mengapa iOS butuh runner macOS?
4. Bagaimana mengelola build number?
5. Apa itu fastlane dan kegunaannya?

## Sample Answers

1. PR: format, analyze, test di Linux. Merge: build release flavor staging, signing dari secret, upload ke Play internal & TestFlight. Tag: build production, upload ke store dengan staged rollout, upload symbol, notifikasi.
2. Keystore di-encode base64 dan disimpan sebagai secret lalu didekode saat job; iOS memakai App Store Connect API key dan certificate/profile dari `match` (repo terenkripsi) atau secret, dengan keychain sementara di runner.
3. Kompilasi dan signing aplikasi iOS memerlukan Xcode yang hanya berjalan di macOS.
4. Gunakan nomor run CI sebagai build number (`--build-number`) sehingga selalu naik; version nama dari pubspec atau tag.
5. Alat otomasi rilis mobile: mengelola signing (`match`), build, upload ke Play (`supply`) dan TestFlight/App Store (`pilot`/`deliver`), screenshot, dan metadata.

## Practical Exercises

1. Tambahkan workflow verify PR ke proyek Flutter Anda.
2. Otomatiskan build AAB staging + upload ke internal testing.
3. Siapkan `match` + lane `beta` untuk TestFlight (atau coba Codemagic).

## Quick Reference

```text
PR: format → analyze → test (ubuntu) · main: build staging → Play internal + TestFlight · tag: production
Android: keystore base64 secret → key.properties → appbundle → fastlane supply
iOS: macOS runner → ASC API key + match → flutter build ipa → upload_to_testflight
--build-number=run_number · flavor per env · symbol upload · cache · secrets minimum
```

## Related Topics

- [CI/CD Fundamentals](/devops/cicd-fundamentals/)
- [Android Signing & Google Play Release](/devops/android-play-release/)
- [Signing, TestFlight & App Store](/ios/signing-testflight-appstore/)
- [Build, Release & Deployment (Flutter)](/flutter/build-release-deployment/)
