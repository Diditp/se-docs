---
title: "Permission & Privacy di iOS"
description: "Sistem izin dan privasi iOS: usage description di Info.plist, alur izin satu kali (tidak bisa diminta ulang), status izin, App Tracking Transparency, lokasi when-in-use vs always & precise, limited photo access & PHPicker, notifikasi, privacy manifest (PrivacyInfo.xcprivacy), App Privacy di App Store, serta permission_handler di Flutter."
level: intermediate
status: complete
version: "iOS 14–18+ · permission_handler 11+ — aturan privasi Apple sering diperbarui"
updated: 2026-11-13
tags: [ios, permissions, privacy, info-plist, att]
---

## Overview

iOS mewajibkan setiap akses ke data/perangkat sensitif disertai **alasan tertulis** (usage description di
`Info.plist`) yang ditampilkan di dialog sistem. Perbedaan penting dengan Android: **dialog izin biasanya hanya muncul
sekali** — setelah ditolak, aplikasi tidak bisa memintanya lagi dan pengguna harus mengubahnya di Settings.

## Why It Matters

Lupa usage description menyebabkan **crash** saat fitur diakses, dan alasan yang tidak jelas dapat membuat aplikasi
**ditolak App Review**. Karena izin hanya diminta sekali, waktu dan konteks permintaan sangat menentukan tingkat
persetujuan.

## Core Concepts

| Data/fitur | Kunci Info.plist | Catatan |
| --- | --- | --- |
| Kamera | `NSCameraUsageDescription` | Scan barcode, foto bukti |
| Galeri (baca) | `NSPhotoLibraryUsageDescription` | Pertimbangkan PHPicker (tanpa izin) |
| Simpan ke galeri | `NSPhotoLibraryAddUsageDescription` | |
| Lokasi saat dipakai | `NSLocationWhenInUseUsageDescription` | |
| Lokasi selalu | `NSLocationAlwaysAndWhenInUseUsageDescription` | Butuh alasan kuat, review ketat |
| Bluetooth | `NSBluetoothAlwaysUsageDescription` | Printer/perangkat BLE |
| Mikrofon | `NSMicrophoneUsageDescription` | |
| Kontak | `NSContactsUsageDescription` | |
| Face ID | `NSFaceIDUsageDescription` | Autentikasi biometrik |
| Tracking lintas app | `NSUserTrackingUsageDescription` | App Tracking Transparency (ATT) |
| Notifikasi | (tanpa kunci) | Diminta via `UNUserNotificationCenter` |

| Status | Arti |
| --- | --- |
| notDetermined | Belum pernah diminta → boleh meminta |
| authorized / limited / provisional | Diberikan (penuh/terbatas/sementara) |
| denied | Ditolak → arahkan ke Settings |
| restricted | Dibatasi (parental control/MDM) — pengguna tidak bisa mengubah |

### Privacy manifest & App Store

- **`PrivacyInfo.xcprivacy`**: mendeklarasikan data yang dikumpulkan dan alasan pemakaian "required reason API"
  (mis. `UserDefaults`, timestamp file). SDK pihak ketiga juga harus menyertakan manifest-nya.
- **App Privacy (App Store Connect)**: label privasi di halaman App Store harus sesuai praktik aplikasi.

## How It Works

```text
Fitur dipakai → cek status
  notDetermined → (opsional: layar penjelasan sendiri) → request → dialog sistem (sekali)
  authorized/limited → lanjut
  denied → jelaskan & tombol "Buka Settings" → UIApplication.openSettingsURLString
  restricted → fitur tidak tersedia
Usage description tidak ada → aplikasi dihentikan saat API diakses
```

## Implementation

### Flutter dengan permission_handler

```dart
Future<bool> ensureCameraPermission(BuildContext context) async {
  var status = await Permission.camera.status;
  if (status.isGranted || status.isLimited) return true;

  if (status.isDenied) {                       // di iOS: belum pernah diminta
    final ok = await showExplainDialog(context, 'Kamera dipakai untuk memindai barcode produk.');
    if (!ok) return false;
    status = await Permission.camera.request();
    return status.isGranted;
  }

  if (status.isPermanentlyDenied || status.isRestricted) {
    await showOpenSettingsDialog(context);     // iOS: satu-satunya jalan adalah Settings
  }
  return false;
}
```

```ruby
# ios/Podfile — permission_handler hanya menyertakan kode izin yang diaktifkan
post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)
    target.build_configurations.each do |config|
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)',
        'PERMISSION_CAMERA=1',
        'PERMISSION_NOTIFICATIONS=1',
        'PERMISSION_LOCATION_WHENINUSE=1',
      ]
    end
  end
end
```

*(Nama makro mengikuti dokumentasi permission_handler versi yang Anda pakai.)*

### Notifikasi (Swift)

```swift
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
  // granted=false → jangan meminta lagi; tawarkan pengaturan di Settings
}
```

### Galeri tanpa izin: PHPicker

Di Flutter, `image_picker` versi modern memakai PHPicker di iOS 14+ sehingga **memilih foto tidak memerlukan izin
galeri** (izin hanya untuk akses penuh ke seluruh library).

### App Tracking Transparency

```dart
final status = await AppTrackingTransparency.requestTrackingAuthorization();   // paket app_tracking_transparency
// Minta hanya bila benar-benar melakukan tracking lintas aplikasi/situs milik pihak lain (iklan, attribution)
```

## Best Practices

- **Minta saat konteks jelas** dan pertimbangkan layar penjelasan sendiri sebelum dialog sistem (karena hanya sekali).
- **Usage description spesifik & jujur** ("untuk memindai barcode produk", bukan "untuk aplikasi").
- **Pakai API tanpa izin** bila cukup (PHPicker, lokasi approximate).
- **Tangani `limited`** (akses foto terbatas) dan `provisional` (notifikasi senyap).
- **Perbarui privacy manifest & label App Privacy** setiap menambah SDK/fitur data.

## Anti-Patterns

- Meminta semua izin saat onboarding.
- Usage description generik/salin-tempel → risiko ditolak review.
- Meminta lokasi "always" tanpa fitur yang membutuhkannya.
- Mengasumsikan dialog bisa ditampilkan lagi setelah ditolak.
- Meminta ATT padahal tidak melakukan tracking.

## Performance Considerations

Pemeriksaan status izin murah; hindari memanggilnya di setiap build widget — cache di state dan perbarui saat aplikasi
`resumed` (pengguna mungkin mengubahnya di Settings).

## Security Considerations

Prinsip least privilege berlaku: minta minimum, akses data hanya saat dibutuhkan, dan transparan di label privasi.
Ketidaksesuaian antara label App Privacy dan perilaku nyata dapat berujung penolakan atau penghapusan aplikasi.

## Real-World Use Cases

- Izin kamera untuk scan barcode dengan fallback input manual.
- Izin Bluetooth untuk printer struk.
- Notifikasi pesanan dengan izin diminta setelah kasir menyelesaikan transaksi pertama.

## Interview Questions

1. Apa yang terjadi bila usage description tidak ditambahkan?
2. Apa beda alur izin iOS dan Android?
3. Bagaimana menangani izin yang sudah ditolak di iOS?
4. Apa itu App Tracking Transparency?
5. Apa itu privacy manifest?

## Sample Answers

1. Aplikasi dihentikan sistem saat API terkait diakses, dan upload ke App Store dapat ditolak.
2. Di iOS dialog umumnya hanya muncul sekali per izin dan setelah ditolak harus diubah lewat Settings; Android dapat meminta ulang (dengan rationale) hingga ditolak permanen. iOS juga mewajibkan usage description untuk tiap izin.
3. Deteksi status `denied`/`permanentlyDenied`, jelaskan manfaat fitur, dan sediakan tombol yang membuka Settings aplikasi; sediakan fallback bila tetap ditolak.
4. Kerangka Apple yang mewajibkan izin pengguna sebelum aplikasi melacak pengguna lintas aplikasi/situs milik perusahaan lain (mis. IDFA untuk iklan), dengan usage description `NSUserTrackingUsageDescription`.
5. File `PrivacyInfo.xcprivacy` yang mendeklarasikan data yang dikumpulkan dan alasan pemakaian API tertentu oleh aplikasi dan SDK-nya, diperiksa saat upload ke App Store.

## Practical Exercises

1. Audit `Info.plist` proyek Anda: apakah setiap izin punya deskripsi yang jelas?
2. Implementasikan alur kamera dengan layar penjelasan, penolakan, dan tombol Settings.
3. Ganti akses galeri berbasis izin dengan picker tanpa izin.

## Quick Reference

```text
Info.plist: NS*UsageDescription untuk setiap izin (tanpa → crash) · dialog sekali → ditolak = Settings
Status: notDetermined · authorized · limited · provisional · denied · restricted
PHPicker (tanpa izin) · ATT hanya bila tracking · PrivacyInfo.xcprivacy + label App Privacy
permission_handler: aktifkan makro izin di Podfile
```

## Related Topics

- [Android Permissions](/android/permissions/)
- [Struktur Proyek iOS di Flutter](/ios/ios-project-structure/)
- [Signing, TestFlight & App Store](/ios/signing-testflight-appstore/)
