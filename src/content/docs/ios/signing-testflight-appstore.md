---
title: "Signing, TestFlight & App Store"
description: "Merilis aplikasi Flutter ke iOS: Apple Developer Program, certificate, App ID & bundle ID, provisioning profile, automatic vs manual signing, capabilities, versi & build number, flutter build ipa, upload ke App Store Connect, TestFlight internal/eksternal, App Review & alasan penolakan umum, phased release, serta signing di CI."
level: intermediate
status: complete
version: "Xcode 16+ · App Store Connect — kebijakan & tooling Apple berubah; cek dokumentasi resmi"
updated: 2026-11-13
tags: [ios, release, signing, testflight, app-store, ci-cd]
---

## Overview

Merilis ke iOS melibatkan **identitas kriptografis** (certificate + provisioning profile) yang membuktikan aplikasi
berasal dari tim Anda, **App Store Connect** untuk distribusi, **TestFlight** untuk beta, dan **App Review** sebelum
publik. Bagi Flutter developer, inilah bagian yang paling sering membuat rilis iOS tertunda.

## Why It Matters

"Pernah rilis ke App Store?" adalah pertanyaan umum interview mobile. Memahami signing dan review mempercepat rilis,
mencegah build gagal di menit terakhir, dan memungkinkan otomasi CI/CD.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Apple Developer Program | Keanggotaan berbayar (individu/organisasi) untuk distribusi |
| Certificate | Identitas penanda tangan: Apple Development / Apple Distribution |
| App ID / Bundle ID | Identitas aplikasi (`com.company.pos`) + capabilities |
| Provisioning profile | Mengikat certificate + App ID + (perangkat untuk development/ad hoc) + entitlements |
| Automatic signing | Xcode mengelola certificate & profile — paling mudah untuk tim kecil |
| Manual signing | Profile dipilih eksplisit — umum di CI/enterprise |
| Version (`CFBundleShortVersionString`) | Versi yang dilihat pengguna (1.4.0) |
| Build (`CFBundleVersion`) | Nomor build unik per upload (meningkat) |
| TestFlight | Distribusi beta: internal (tim, tanpa review beta) & eksternal (butuh Beta App Review) |
| App Review | Peninjauan sebelum rilis publik |
| Phased release | Rilis bertahap ke pengguna update otomatis selama beberapa hari |

Di Flutter, `version: 1.4.0+42` di `pubspec.yaml` → version `1.4.0`, build `42`.

## How It Works

```text
Kode → flutter build ipa (archive Release + sign dengan Distribution cert & profile)
→ upload (Xcode Organizer, aplikasi Transporter, atau fastlane/App Store Connect API di CI)
→ App Store Connect: processing → TestFlight (internal → eksternal) → submit for review
→ review → Ready for Sale (manual/automatic/phased release)
```

## Implementation

### Build & upload

```bash
# Naikkan build number setiap upload
flutter build ipa --release --flavor production -t lib/main_production.dart \
  --obfuscate --split-debug-info=build/symbols \
  --export-options-plist=ios/ExportOptions.plist
# Hasil: build/ios/ipa/*.ipa → upload dengan Transporter, Xcode Organizer, atau fastlane
```

```xml
<!-- ios/ExportOptions.plist (contoh untuk App Store, signing otomatis) -->
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>ABCDE12345</string>
</dict></plist>
```

*(Nilai `method` berubah antar versi Xcode — mis. `app-store` di versi lama. Cek dokumentasi Xcode Anda.)*

### Signing di CI (fastlane, garis besar)

```ruby
# fastlane/Fastfile
lane :beta do
  app_store_connect_api_key(key_id: ENV["ASC_KEY_ID"], issuer_id: ENV["ASC_ISSUER_ID"], key_content: ENV["ASC_KEY_P8"])
  match(type: "appstore", readonly: true)          # certificate & profile dari repo terenkripsi
  sh("flutter build ipa --release --export-options-plist=../ios/ExportOptions.plist")
  upload_to_testflight(ipa: "../build/ios/ipa/pos.ipa", skip_waiting_for_build_processing: true)
end
```

Alternatif: Codemagic, Xcode Cloud, atau GitHub Actions runner macOS dengan certificate di secret terenkripsi.

### Alasan penolakan App Review yang umum

| Alasan | Pencegahan |
| --- | --- |
| Crash/bug saat review | Uji build release di perangkat nyata & TestFlight |
| Akun demo tidak tersedia | Sertakan akun demo & instruksi di App Review notes |
| Usage description tidak jelas | Tulis alasan spesifik untuk setiap izin |
| Metadata/screenshot tidak sesuai | Screenshot dari aplikasi nyata, deskripsi akurat |
| Konten/fitur minimal ("hanya WebView") | Pastikan nilai fungsional aplikasi |
| Pembayaran barang digital di luar In-App Purchase | Ikuti aturan pembayaran Apple (barang fisik/jasa nyata seperti POS umumnya berbeda) |
| Login pihak ketiga tanpa opsi yang disyaratkan | Ikuti pedoman terkait opsi login |
| Privasi: label/privacy manifest tidak sesuai | Sinkronkan dengan SDK & praktik data |

### Checklist rilis iOS

```markdown
- [ ] Version & build number naik
- [ ] Bundle ID, signing, capabilities (push, associated domains) benar untuk flavor production
- [ ] Info.plist: usage description, nama tampilan; ATS tanpa pengecualian lebar
- [ ] PrivacyInfo.xcprivacy & label App Privacy sesuai
- [ ] Symbol (dSYM & split-debug-info) diunggah ke crash reporting
- [ ] TestFlight internal lulus smoke test di perangkat nyata
- [ ] Release notes, screenshot, akun demo untuk review
- [ ] Rencana: phased release + pantau crash-free rate
```

## Best Practices

- **Automatic signing untuk tim kecil**, `match`/API key untuk CI dan tim besar.
- **Build number otomatis** dari CI (mis. nomor run pipeline).
- **TestFlight internal untuk setiap build kandidat**, eksternal untuk beta tester.
- **Phased release** dan pantau metrik sebelum 100%.
- **Simpan symbol** untuk setiap build agar crash dapat dibaca.

## Anti-Patterns

- Mengunggah build tanpa diuji di perangkat nyata.
- Certificate distribusi disimpan di laptop satu orang tanpa cadangan/pengelolaan tim.
- Menggunakan build number yang sama (upload ditolak).
- Mengabaikan email peringatan dari App Store Connect (privacy, deprecated API, deadline SDK).

## Performance Considerations

Ukuran unduhan memengaruhi konversi — periksa laporan ukuran App Store Connect dan `flutter build ipa --analyze-size`.
Proses review dan processing memerlukan waktu; rencanakan jadwal rilis dengan buffer.

## Security Considerations

Certificate & private key distribusi, file `.p8` App Store Connect API key, dan kredensial `match` adalah rahasia
tingkat tinggi — simpan di secret manager CI, batasi akses, dan rotasi bila bocor. Gunakan peran App Store Connect
dengan hak minimum untuk anggota tim.

## Real-World Use Cases

- Pipeline: merge ke main → build iOS & Android → TestFlight & internal testing Play otomatis.
- Rilis bertahap aplikasi kasir dengan phased release dan pemantauan crash.
- Menangani penolakan review karena usage description kamera kurang jelas.

## Interview Questions

1. Apa itu certificate dan provisioning profile?
2. Apa beda version dan build number?
3. Apa beda TestFlight internal dan eksternal?
4. Apa alasan umum aplikasi ditolak App Review?
5. Bagaimana mengotomatiskan rilis iOS di CI?

## Sample Answers

1. Certificate adalah identitas kriptografis penanda tangan (development/distribution); provisioning profile mengikat certificate dengan App ID, entitlements, dan (untuk development/ad hoc) daftar perangkat, sehingga sistem tahu aplikasi boleh dijalankan/didistribusikan.
2. Version (`CFBundleShortVersionString`) dilihat pengguna, mis. 1.4.0; build number (`CFBundleVersion`) unik dan meningkat untuk setiap upload. Di Flutter: `version: 1.4.0+42`.
3. Internal: anggota tim App Store Connect, tersedia cepat tanpa Beta App Review. Eksternal: hingga ribuan penguji lewat email/link publik, butuh Beta App Review untuk build pertama versi tersebut.
4. Crash/bug, tidak ada akun demo, metadata tidak akurat, usage description tidak jelas, fungsi minimal, pelanggaran aturan pembayaran, dan ketidaksesuaian privasi.
5. Runner macOS (GitHub Actions/Codemagic/Xcode Cloud), App Store Connect API key, certificate/profile dari `match` atau secret terenkripsi, `flutter build ipa`, lalu upload ke TestFlight via fastlane/API, dengan build number otomatis.

## Practical Exercises

1. Buat `ExportOptions.plist` dan hasilkan `.ipa` release dari proyek Anda.
2. Susun Fastfile `beta` (atau workflow Codemagic) untuk upload otomatis ke TestFlight.
3. Siapkan template App Review notes berisi akun demo dan langkah uji fitur utama.

## Quick Reference

```text
Certificate (identitas) + App ID (bundle ID) + Provisioning profile (pengikat) → signing
pubspec version 1.4.0+42 → version + build · flutter build ipa --export-options-plist
TestFlight: internal (cepat) · eksternal (Beta Review) · App Review → phased release
CI: ASC API key + match/secret · build number otomatis · simpan symbol
```

## Related Topics

- [Akun Developer & Publikasi (Personal vs Company)](/devops/store-accounts-publishing/)
- [Struktur Proyek iOS di Flutter](/ios/ios-project-structure/)
- [Build, Release & Deployment (Flutter)](/flutter/build-release-deployment/)
- [GitHub Actions](/devops/github-actions/)
