---
title: "Struktur Proyek iOS di Flutter"
description: "Memahami folder ios/ di proyek Flutter: Runner, AppDelegate, Info.plist, Runner.xcworkspace, CocoaPods & Podfile, Swift Package Manager, build configuration & xcconfig, scheme & flavor, deployment target, bundle identifier, capabilities/entitlements, dan troubleshooting build iOS."
level: beginner
status: complete
version: "Flutter 3.x · Xcode 16+ · CocoaPods 1.15+ · dukungan SPM Flutter bergantung versi — cek dokumentasi resmi"
updated: 2026-11-13
tags: [ios, flutter, xcode, cocoapods, info-plist, flavors]
---

## Overview

Folder `ios/` di proyek Flutter adalah **proyek Xcode biasa** bernama `Runner` yang membungkus engine Flutter dan kode
Dart Anda. Hampir semua konfigurasi iOS — izin, push, nama aplikasi, ikon, signing, flavor — dilakukan di sini. Memahami
strukturnya membuat error build iOS jauh lebih mudah diatasi.

## Why It Matters

Masalah iOS yang paling sering dialami Flutter developer berada di folder ini: `pod install` gagal, deployment target
tidak cocok, izin lupa ditambahkan di `Info.plist`, signing salah, atau flavor tidak terkonfigurasi.

## Core Concepts

| File/folder | Fungsi |
| --- | --- |
| `Runner.xcworkspace` | **Buka file ini** di Xcode (bukan `.xcodeproj`) bila memakai CocoaPods |
| `Runner.xcodeproj` | Definisi proyek: target, build settings, phases |
| `Runner/AppDelegate.swift` | Titik masuk aplikasi; registrasi plugin, konfigurasi push/channel |
| `Runner/Info.plist` | Metadata: nama tampilan, versi, izin (usage description), URL scheme, background modes |
| `Runner/Assets.xcassets` | Ikon aplikasi, gambar launch |
| `Runner/Runner.entitlements` | Capabilities: push, associated domains, keychain sharing, App Groups |
| `Podfile` / `Podfile.lock` | Dependensi CocoaPods (plugin Flutter native); **commit lockfile** |
| `Flutter/*.xcconfig` | Konfigurasi build Debug/Release (diisi tool Flutter) |
| `PrivacyInfo.xcprivacy` | Privacy manifest (wajib untuk alasan pemakaian API tertentu) |

| Konsep Xcode | Arti |
| --- | --- |
| Target | Produk yang dibangun (Runner, extension seperti Notification Service) |
| Build configuration | Debug / Release / Profile (bisa ditambah, mis. Release-staging) |
| Scheme | Kombinasi target + konfigurasi untuk run/archive (dipakai `--flavor`) |
| Bundle identifier | ID unik aplikasi (`com.company.pos`) — harus cocok dengan App ID & provisioning |
| Deployment target | Versi iOS minimum yang didukung |

## How It Works

```text
flutter build ios
 → flutter assemble: kompilasi Dart (AOT) → App.framework, aset
 → pod install: plugin native → Pods
 → xcodebuild: Runner + Flutter.framework + App.framework + Pods → .app → (archive) → .ipa
Plugin Flutter yang punya kode iOS → otomatis didaftarkan di GeneratedPluginRegistrant.
```

## Implementation

### AppDelegate standar

```swift
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

:::caution[Version-dependent]
Apple mendorong adopsi **UIScene lifecycle**, dan Flutter versi terbaru menyediakan template/migrasi terkait scene.
Template `AppDelegate` dan cara mendaftarkan plugin dapat berubah antar versi Flutter — ikuti panduan migrasi resmi saat
upgrade.
:::

### Info.plist yang sering diubah

```xml
<key>CFBundleDisplayName</key><string>Kasir Kita</string>
<key>NSCameraUsageDescription</key><string>Kamera dipakai untuk memindai barcode produk.</string>
<key>NSBluetoothAlwaysUsageDescription</key><string>Bluetooth dipakai untuk terhubung ke printer struk.</string>
<key>CFBundleURLTypes</key>
<array><dict><key>CFBundleURLSchemes</key><array><string>kasirkita</string></array></dict></array>
<key>UIBackgroundModes</key><array><string>remote-notification</string></array>
```

### Podfile & deployment target

```ruby
platform :ios, '13.0'      # samakan dengan IPHONEOS_DEPLOYMENT_TARGET di Xcode & kebutuhan plugin

post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.0'
    end
  end
end
```

*(Versi minimum yang didukung Flutter dan plugin berubah seiring waktu — cek dokumentasi Flutter dan plugin Anda.)*

### Flavor (staging/production)

```text
1. Xcode: duplikasi build configuration → Debug-staging, Release-staging, Debug-production, Release-production
2. Buat scheme "staging" dan "production" yang memakai konfigurasi tersebut
3. Per konfigurasi: PRODUCT_BUNDLE_IDENTIFIER (com.company.pos.staging), nama tampilan, ikon, GoogleService-Info.plist
4. Jalankan: flutter run --flavor staging -t lib/main_staging.dart
```

### Troubleshooting build iOS

```bash
cd ios
pod repo update && pod install          # dependensi plugin
# Bila masih bermasalah:
flutter clean && rm -rf ios/Pods ios/Podfile.lock && flutter pub get && cd ios && pod install
# Baca error asli di Xcode (Report navigator) bila pesan flutter terlalu umum
```

| Error umum | Penyebab biasa |
| --- | --- |
| `pod install` gagal / versi konflik | Deployment target terlalu rendah, repo pod usang, plugin butuh iOS lebih baru |
| `No signing certificate` | Tim/profil signing belum diatur |
| Crash saat buka kamera/galeri | Usage description di Info.plist belum ada |
| `Module 'x' not found` | Membuka `.xcodeproj` alih-alih `.xcworkspace`, atau Pods belum terpasang |
| Arsitektur/simulator error di Mac Apple silicon | Pod lama tanpa dukungan arm64 simulator |

## Best Practices

- **Commit `Podfile.lock`** dan konfigurasi Xcode; jangan commit `Pods/`.
- **Satu sumber deployment target** (Podfile & Xcode sama).
- **Usage description yang jelas** dan jujur untuk setiap izin.
- **Flavor dengan bundle ID berbeda** agar staging dan production bisa terpasang bersamaan.
- **Ubah setting lewat Xcode atau xcconfig**, hindari edit manual `project.pbxproj` kecuali paham.

## Anti-Patterns

- Membuka `Runner.xcodeproj` saat memakai CocoaPods.
- Menaruh secret (API key server) di `Info.plist`.
- Menghapus `Podfile.lock` setiap ada masalah tanpa memahami penyebabnya.
- Mengabaikan peringatan privacy manifest saat upload ke App Store Connect.

## Performance Considerations

Build iOS lebih lambat dari Android karena kompilasi native dan Pods; gunakan cache CI untuk Pods dan derived data.
Bundle besar memperlambat unduhan — periksa ukuran dengan `flutter build ipa --analyze-size`.

## Security Considerations

`Info.plist` dan aset dapat dibaca siapa pun dari file IPA — jangan simpan secret di sana. Atur App Transport Security
(ATS) tanpa pengecualian `NSAllowsArbitraryLoads` di production; entitlements hanya yang dibutuhkan.

## Real-World Use Cases

- Menambah izin kamera & Bluetooth untuk fitur scan dan printer.
- Membuat flavor staging/production dengan Firebase project berbeda.
- Memperbaiki build gagal setelah upgrade plugin.

## Interview Questions

1. Apa isi folder `ios/` di proyek Flutter?
2. Apa fungsi `Info.plist`?
3. Mengapa membuka `.xcworkspace` bukan `.xcodeproj`?
4. Bagaimana membuat flavor di iOS?
5. Bagaimana Anda men-debug build iOS yang gagal?

## Sample Answers

1. Proyek Xcode `Runner` berisi AppDelegate, Info.plist, aset, entitlements, Podfile untuk dependensi plugin, dan xcconfig Flutter untuk konfigurasi build.
2. File metadata aplikasi: nama, versi, izin (usage description), URL scheme, background modes, dan konfigurasi lain yang dibaca sistem.
3. Workspace menggabungkan proyek Runner dan proyek Pods; tanpa itu dependensi CocoaPods tidak ikut ter-build.
4. Membuat build configuration dan scheme per flavor di Xcode, dengan bundle identifier, nama, ikon, dan file konfigurasi (mis. GoogleService-Info.plist) berbeda, lalu `flutter run --flavor <nama>`.
5. Jalankan ulang `pod install`, cek deployment target dan versi plugin, bersihkan build (`flutter clean`), lalu baca error lengkap di Xcode Report navigator; periksa signing dan Info.plist.

## Practical Exercises

1. Buka `ios/Runner.xcworkspace`, telusuri target, build settings, dan Info.plist proyek Anda.
2. Tambahkan flavor staging dengan bundle ID berbeda.
3. Sengaja hapus usage description kamera dan amati crash, lalu perbaiki.

## Quick Reference

```text
ios/Runner: AppDelegate.swift · Info.plist · Assets · entitlements · PrivacyInfo.xcprivacy
Buka Runner.xcworkspace · Podfile + Podfile.lock (commit) · Pods/ (jangan commit)
Flavor = build configuration + scheme + bundle ID · deployment target konsisten
Debug build: pod install → flutter clean → baca error di Xcode
```

## Related Topics

- [Permission & Privacy di iOS](/ios/ios-permissions-privacy/)
- [Signing, TestFlight & App Store](/ios/signing-testflight-appstore/)
- [Build, Release & Deployment (Flutter)](/flutter/build-release-deployment/)
