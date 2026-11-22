---
title: "iOS vs Android: Perbedaan yang Sering Menjebak"
description: "Daftar perbedaan perilaku iOS dan Android yang sering menimbulkan bug di aplikasi Flutter: background, izin, push, navigasi & tombol back, keyboard & safe area, file & storage, deep link, WebView, font & tampilan, tanggal & locale, ukuran layar, rilis & review — beserta solusi dan checklist QA lintas platform."
level: intermediate
status: complete
version: "Flutter 3.x · iOS 15+ · Android 8–15"
updated: 2026-11-13
tags: [ios, android, flutter, cross-platform, qa]
---

## Overview

Flutter membuat kode UI sama untuk iOS dan Android, tetapi **platform di bawahnya tetap berbeda**. Halaman ini adalah
ringkasan "jebakan" yang paling sering muncul — gunakan sebagai checklist saat mendesain fitur dan saat QA.

## Why It Matters

Bug lintas platform sering lolos karena pengujian hanya dilakukan di satu platform (biasanya Android). Interview juga
sering bertanya "apa yang perlu diperhatikan saat merilis aplikasi Flutter ke iOS?".

## Core Concepts

| Area | Android | iOS | Dampak di Flutter |
| --- | --- | --- | --- |
| Background | WorkManager, foreground service | Suspend cepat, BGTaskScheduler oportunistik | Sync periodik tidak bisa diandalkan di iOS |
| Izin | Dapat diminta ulang (dengan rationale) | Dialog biasanya sekali; lalu ke Settings | Alur izin berbeda; usage description wajib di iOS |
| Push | FCM langsung | Lewat APNs (kunci .p8, capability) | Konfigurasi ekstra; foreground presentation |
| Tombol back | Tombol/gesture back sistem | Swipe dari tepi kiri (Cupertino) | `PopScope`, konfirmasi keluar form |
| Safe area | Status/navigation bar | Notch, Dynamic Island, home indicator | Wajib `SafeArea`/padding |
| Keyboard | Mengubah ukuran (resize) | Overlay; perlu scroll | `resizeToAvoidBottomInset`, scroll ke field |
| File & storage | Scoped storage, MediaStore | Sandbox, Files app via `UIFileSharingEnabled` | `path_provider` beda direktori; berbagi file via share sheet |
| Deep link | App Links (`assetlinks.json`) | Universal Links (`apple-app-site-association`) | Konfigurasi domain dua kali |
| Kamera/galeri | Izin media granular / Photo Picker | PHPicker, usage description | Plugin menangani, tapi konfigurasi berbeda |
| Bluetooth | Izin `BLUETOOTH_SCAN/CONNECT` (12+) | `NSBluetoothAlwaysUsageDescription`; tanpa Classic SPP umum | Banyak printer Bluetooth Classic tidak didukung di iOS (butuh BLE/MFi) |
| HTTP | Cleartext diblokir default (9+) | ATS memblokir HTTP | Perangkat lokal HTTP butuh pengecualian terbatas |
| WebView | Chromium WebView | WKWebView | Perilaku cookie/JS berbeda |
| Tampilan | Material, font Roboto | Cupertino, font SF | Font & scroll physics berbeda; `Theme.of(context).platform` |
| Rilis | Play Console, review relatif cepat | App Store Review, TestFlight | Siapkan buffer waktu & akun demo |

## How It Works

```text
Satu kode Dart → dua embedder (Android/iOS) → API platform berbeda
Plugin menyembunyikan sebagian perbedaan, tetapi KONFIGURASI (manifest vs Info.plist, capabilities)
dan PERILAKU OS (background, izin, push) tetap harus ditangani per platform.
```

## Implementation

### Kode yang sadar platform (secukupnya)

```dart
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

bool get isIOS => !kIsWeb && Platform.isIOS;

Widget adaptiveLoader() => isIOS ? const CupertinoActivityIndicator() : const CircularProgressIndicator();

// Banyak widget Material punya konstruktor adaptive
Switch.adaptive(value: enabled, onChanged: onChanged);
```

Utamakan abstraksi (service per platform di balik interface) daripada `if (Platform.isIOS)` yang tersebar.

### Keyboard & form

```dart
Scaffold(
  resizeToAvoidBottomInset: true,
  body: SafeArea(
    child: SingleChildScrollView(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: const CheckoutForm(),
    ),
  ),
);
```

### Mencegah kehilangan data saat swipe back (iOS) / back (Android)

```dart
PopScope(
  canPop: !form.isDirty,
  onPopInvokedWithResult: (didPop, _) async {
    if (didPop) return;
    if (await confirmDiscard(context)) Navigator.of(context).pop();
  },
  child: const EditProductForm(),
);
```

### Printer Bluetooth: cek dukungan iOS sejak awal

```text
Android: Bluetooth Classic (SPP) umum untuk printer struk murah → mudah
iOS: aplikasi umumnya tidak bisa memakai Classic SPP tanpa perangkat MFi → pilih printer BLE / jaringan (Wi-Fi/LAN)
→ Tentukan perangkat keras yang didukung SEBELUM menjanjikan fitur di iOS
```

### Checklist QA lintas platform

```markdown
- [ ] Uji di Android (versi lama & terbaru) DAN iPhone fisik (termasuk layar kecil & ber-notch)
- [ ] Izin: pertama kali, ditolak, ditolak permanen, diubah di Settings
- [ ] Push: app tertutup, background, foreground; tap membuka layar yang benar
- [ ] Offline & jaringan lambat; app ke background saat sync; app dihentikan sistem
- [ ] Keyboard menutupi field? Safe area? Rotasi/tablet (iPad) bila didukung
- [ ] Back gesture iOS & tombol back Android pada form yang belum disimpan
- [ ] Deep link/Universal Link & App Link
- [ ] Format tanggal, angka, mata uang (locale id_ID)
- [ ] Build release (bukan debug) dengan obfuscation
```

## Best Practices

- **Uji di kedua platform sejak awal fitur**, bukan menjelang rilis.
- **Abstraksikan perbedaan platform** di service/plugin dengan interface yang sama.
- **Validasi kebutuhan perangkat keras untuk iOS** (Bluetooth, NFC) sebelum berkomitmen.
- **Desain fitur background yang toleran** terhadap batasan iOS.
- **Siapkan konfigurasi platform sebagai checklist** (manifest, Info.plist, capabilities).

## Anti-Patterns

- Hanya menguji di emulator Android.
- `Platform.isIOS` tersebar di seluruh widget.
- Menjanjikan fitur Bluetooth/background yang sama di iOS tanpa riset.
- Mengabaikan safe area dan keyboard di iPhone kecil.

## Performance Considerations

Profil performa di kedua platform: perangkat Android kelas bawah sering menjadi batas bawah performa, sementara iOS
memiliki karakteristik memori dan termal berbeda. Gunakan mode profile di perangkat fisik masing-masing.

## Security Considerations

Mekanisme penyimpanan aman berbeda (Keystore vs Keychain) — pastikan plugin dikonfigurasi benar di keduanya, termasuk
kelas aksesibilitas Keychain untuk background dan pembersihan data saat instalasi ulang di iOS.

## Real-World Use Cases

- Aplikasi kasir yang mendukung printer BLE/LAN agar berfungsi di iPad.
- Form survei lapangan yang tidak hilang saat swipe back di iOS.
- Sinkronisasi yang tetap benar meski background iOS tidak berjalan.

## Interview Questions

1. Apa saja yang perlu diperhatikan saat merilis aplikasi Flutter ke iOS?
2. Mengapa fitur background berbeda antara Android dan iOS?
3. Bagaimana menangani kode khusus platform di Flutter?
4. Apa perbedaan alur izin iOS dan Android?
5. Mengapa printer Bluetooth bisa bekerja di Android tetapi tidak di iOS?

## Sample Answers

1. Signing & provisioning, Info.plist (usage description, ATS), capabilities (push, associated domains), APNs untuk push, batasan background, privacy manifest, App Review, serta pengujian di iPhone fisik.
2. iOS menangguhkan aplikasi dengan cepat dan hanya memberi eksekusi background oportunistik atau melalui background mode tertentu, sedangkan Android menyediakan WorkManager dan foreground service dengan jaminan eksekusi lebih kuat.
3. Abstraksi di balik interface (service per platform, plugin), widget adaptive, dan `Platform.isIOS`/`defaultTargetPlatform` hanya di titik terbatas.
4. iOS mewajibkan usage description dan dialog biasanya hanya sekali sehingga setelah ditolak harus ke Settings; Android dapat meminta ulang dengan rationale sampai ditolak permanen.
5. Banyak printer murah memakai Bluetooth Classic SPP yang umum didukung Android, sedangkan di iOS akses Classic untuk aksesori biasanya memerlukan program MFi; solusi umum adalah printer BLE atau jaringan.

## Practical Exercises

1. Jalankan checklist QA lintas platform pada satu fitur aplikasi Anda.
2. Ganti `Platform.isIOS` yang tersebar dengan satu service abstraksi.
3. Riset dan dokumentasikan perangkat keras (printer/scanner) yang didukung di Android dan iOS untuk aplikasi kasir.

## Quick Reference

```text
Background (iOS ketat) · izin (iOS sekali) · push (APNs) · back gesture · safe area · keyboard
Storage & file · deep link (App Links vs Universal Links) · Bluetooth Classic vs BLE · ATS/cleartext
Uji di iPhone fisik & Android lama/baru · abstraksikan perbedaan · cek hardware iOS sejak awal
```

## Related Topics

- [Flutter vs Native Android](/android/flutter-vs-native/)
- [Background Execution di iOS](/ios/ios-background/)
- [Permission & Privacy di iOS](/ios/ios-permissions-privacy/)
