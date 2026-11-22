---
title: "Android Signing & Google Play Release"
description: "Merilis aplikasi Android/Flutter ke Google Play: keystore & upload key, Play App Signing, AAB, versionCode/versionName, track (internal, closed, open, production), staged rollout & halt, persyaratan target API level, review & kebijakan (Data safety, izin sensitif), akun developer baru, Pre-launch report, dan in-app updates."
level: intermediate
status: complete
version: "Google Play Console — kebijakan (target API, pengujian akun baru, deklarasi) berubah tiap tahun; cek Play Console Help"
updated: 2026-11-13
tags: [android, google-play, release, signing, staged-rollout]
---

## Overview

Rilis Android melalui **Google Play Console** melibatkan **signing** (membuktikan update berasal dari Anda), format
**Android App Bundle (AAB)**, **track** untuk pengujian bertahap, **staged rollout** ke production, dan kepatuhan
**kebijakan Play**. Dibanding App Store, review Play biasanya lebih cepat, tetapi kebijakannya tetap ketat.

## Why It Matters

Kehilangan keystore, versionCode yang salah, atau pelanggaran kebijakan dapat menunda rilis berminggu-minggu. Kemampuan
merilis dengan aman (staged rollout, halt) adalah keterampilan wajib mobile engineer.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Upload key | Kunci yang Anda pakai menandatangani AAB yang diunggah |
| App signing key | Kunci yang dipakai Google menandatangani APK untuk pengguna (Play App Signing) |
| Play App Signing | Google menyimpan app signing key; upload key yang hilang dapat di-reset lewat dukungan |
| AAB | Format publikasi wajib untuk aplikasi baru; Play menghasilkan APK per perangkat |
| `versionCode` | Integer yang wajib naik setiap upload |
| `versionName` | Versi tampilan (1.5.0) |
| Track | Internal testing → closed testing → open testing → production |
| Staged rollout | Rilis ke persentase pengguna (mis. 5% → 20% → 50% → 100%) |
| Halt rollout | Menghentikan penyebaran versi bermasalah |
| Target API level | Play mewajibkan targetSdk minimal tertentu (diperbarui berkala) |

Di Flutter: `version: 1.5.0+57` → versionName `1.5.0`, versionCode `57`.

## How It Works

```text
flutter build appbundle (ditandatangani upload key)
→ upload ke Play Console (track internal) → Play memverifikasi upload key → re-sign dengan app signing key
→ uji internal → closed/open testing → production dengan staged rollout
→ pantau Android vitals & crash → naikkan persentase atau HALT
```

## Implementation

### Membuat upload keystore & konfigurasi Gradle

```bash
keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
# Simpan file & password di password manager/secret manager tim — JANGAN di repo
```

```kotlin
// android/app/build.gradle.kts
import java.util.Properties

val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) load(f.inputStream())
}

android {
    signingConfigs {
        create("release") {
            storeFile = keystoreProperties["storeFile"]?.let { file(it as String) }
            storePassword = keystoreProperties["storePassword"] as String?
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
```

```text
# android/.gitignore
key.properties
*.jks
*.keystore
```

### Track & strategi rilis

| Track | Penguji | Kegunaan |
| --- | --- | --- |
| Internal testing | Hingga ~100 penguji, tersedia cepat | Build harian untuk tim/QA |
| Closed testing | Daftar email/grup | Beta terbatas, pilot outlet |
| Open testing | Publik yang ikut program | Beta luas |
| Production | Semua pengguna | Dengan staged rollout |

:::caution[Kebijakan berubah]
Akun developer **pribadi** yang baru dibuat pada umumnya diwajibkan menjalankan closed testing dengan sejumlah penguji
selama periode tertentu sebelum bisa rilis production, dan persyaratan target API level dinaikkan setiap tahun. Selalu
cek Play Console Help untuk angka dan tenggat terbaru.
:::

### Staged rollout yang aman

```text
Hari 1: 5–10%  → pantau crash-free users, ANR rate, review/rating, metrik bisnis (mis. transaksi sukses)
Hari 2–3: 20–50% bila stabil
Hari 4+: 100%
Bermasalah: HALT rollout → perbaiki → upload versionCode lebih tinggi (versi yang sudah terpasang tidak bisa ditarik)
```

### In-app update & versi minimum

```text
Android: Play In-App Updates API (flexible/immediate) — di Flutter via paket in_app_update
Lintas platform: endpoint/Remote Config "minimum_supported_version" → tampilkan layar wajib update
Lihat Versioning & Release Management untuk strategi lengkap
```

### Kebijakan yang sering menjebak

| Area | Yang perlu disiapkan |
| --- | --- |
| Data safety form | Deklarasi data yang dikumpulkan/dibagikan, sesuai SDK yang dipakai |
| Izin sensitif | Lokasi background, SMS/Call log, `MANAGE_EXTERNAL_STORAGE`, exact alarm, FGS type — butuh justifikasi |
| Akun & penghapusan data | Aplikasi dengan pembuatan akun wajib menyediakan cara menghapus akun |
| Akun demo | Untuk review fitur di balik login |
| Pre-launch report | Laporan otomatis crash/aksesibilitas di perangkat uji — baca sebelum rilis |

## Best Practices

- **Aktifkan Play App Signing** dan simpan upload key di secret manager + cadangan aman.
- **versionCode dari CI** agar selalu naik.
- **Selalu lewat internal testing** sebelum production.
- **Staged rollout + pantau metrik** sebelum 100%.
- **Perbarui targetSdk tiap tahun** dan uji perubahan perilaku platform.
- **Isi Data safety dengan jujur** dan perbarui saat menambah SDK.

## Anti-Patterns

- Keystore di repo atau hanya di satu laptop.
- Langsung 100% production tanpa staged rollout.
- Meminta izin sensitif tanpa fitur inti yang membutuhkannya.
- Mengabaikan email peringatan kebijakan dari Play Console.

## Performance Considerations

AAB mengurangi ukuran unduhan karena Play mengirim APK sesuai perangkat (ABI, density, bahasa). Pantau Android vitals
(crash rate, ANR rate) — nilai buruk dapat menurunkan visibilitas aplikasi.

## Security Considerations

Upload key dan service account Play adalah aset kritis: simpan terenkripsi, akses minimum, rotasi bila bocor (upload key
dapat di-reset melalui Play App Signing). Aktifkan R8, jangan rilis build `debuggable`, dan pastikan tidak ada log
sensitif.

## Real-World Use Cases

- Rilis mingguan aplikasi kasir: internal → closed (outlet pilot) → production 10% → 100%.
- Halt rollout saat crash meningkat setelah update SDK pembayaran.
- Menaikkan targetSdk tahunan dengan menyesuaikan izin notifikasi & FGS type.

## Interview Questions

1. Apa beda upload key dan app signing key?
2. Apa itu staged rollout dan kapan di-halt?
3. Apa beda versionCode dan versionName?
4. Apa saja track di Play Console?
5. Apa yang terjadi bila keystore hilang?

## Sample Answers

1. Upload key dipakai developer menandatangani AAB yang diunggah; app signing key dipakai Google (Play App Signing) untuk menandatangani APK yang dikirim ke pengguna.
2. Merilis versi baru ke sebagian persentase pengguna secara bertahap sambil memantau crash/ANR dan metrik; di-halt bila metrik memburuk, lalu perbaiki dengan versionCode baru.
3. versionCode adalah integer internal yang wajib naik setiap upload; versionName adalah versi yang dilihat pengguna.
4. Internal testing, closed testing, open testing, dan production.
5. Dengan Play App Signing, upload key yang hilang dapat di-reset melalui dukungan Google; tanpa Play App Signing (kasus lama), kehilangan kunci penandatanganan berarti tidak bisa memperbarui aplikasi yang sama.

## Practical Exercises

1. Buat upload keystore, konfigurasikan Gradle, dan pastikan keystore tidak masuk Git.
2. Unggah build ke internal testing dan bagikan ke 2 penguji.
3. Tulis SOP staged rollout dengan metrik dan ambang halt.

## Quick Reference

```text
Upload key (Anda) vs app signing key (Google, Play App Signing) · AAB wajib · versionCode naik
Track: internal → closed → open → production · staged rollout 5→20→50→100% · HALT bila metrik memburuk
Kebijakan: target API tahunan · Data safety · izin sensitif · hapus akun · akun demo · Pre-launch report
```

## Related Topics

- [Akun Developer & Publikasi (Personal vs Company)](/devops/store-accounts-publishing/)
- [Mobile CI/CD Pipeline](/devops/mobile-cicd-pipeline/)
- [Versioning & Release Management](/devops/versioning-release/)
- [Signing, TestFlight & App Store](/ios/signing-testflight-appstore/)
