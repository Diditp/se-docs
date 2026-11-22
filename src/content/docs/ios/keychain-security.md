---
title: "Keychain & iOS App Security"
description: "Keamanan aplikasi iOS untuk Flutter developer: Keychain & kelas aksesibilitas, flutter_secure_storage di iOS, data protection, App Transport Security, certificate pinning, biometrik (LocalAuthentication), jailbreak & App Attest, snapshot app switcher, URL scheme vs Universal Links, serta checklist keamanan iOS."
level: intermediate
status: complete
version: "iOS 15+ · flutter_secure_storage 9+ · OWASP MASVS v2"
updated: 2026-11-13
tags: [ios, security, keychain, ats, biometrics, masvs]
---

## Overview

iOS menyediakan fondasi keamanan yang kuat (sandbox, enkripsi perangkat, Keychain, ATS), tetapi aplikasi tetap harus
memakainya dengan benar. Prinsipnya sama dengan Android: **jangan percaya klien**, simpan rahasia di penyimpanan aman,
amankan komunikasi, dan validasi keputusan penting di server.

## Why It Matters

Aplikasi finansial dan korporat biasanya menjalani pentest iOS dan Android. Kesalahan umum: token di
`UserDefaults`/`SharedPreferences`, pengecualian ATS di production, data sensitif terlihat di app switcher.

## Core Concepts

| Kontrol | Penjelasan |
| --- | --- |
| Keychain | Penyimpanan terenkripsi untuk rahasia kecil (token, kredensial) |
| Kelas aksesibilitas | Kapan item Keychain dapat dibaca (lihat tabel di bawah) |
| `ThisDeviceOnly` | Item tidak ikut backup/restore ke perangkat lain |
| Data Protection | Enkripsi file berdasarkan status kunci perangkat |
| ATS (App Transport Security) | Memaksa HTTPS dengan TLS modern |
| LocalAuthentication | Face ID/Touch ID; sebaiknya terikat ke item Keychain (access control) |
| App Attest / DeviceCheck | Bukti dari Apple bahwa request berasal dari aplikasi asli di perangkat asli (diverifikasi server) |
| Universal Links | Link HTTPS terverifikasi domain (lebih aman dari custom URL scheme) |

| Kelas aksesibilitas Keychain | Dapat dibaca |
| --- | --- |
| `WhenUnlocked(ThisDeviceOnly)` | Hanya saat perangkat tidak terkunci — paling aman untuk data interaktif |
| `AfterFirstUnlock(ThisDeviceOnly)` | Setelah unlock pertama sejak boot — dibutuhkan untuk tugas background |
| `WhenPasscodeSetThisDeviceOnly` | Hanya bila passcode aktif; terhapus bila passcode dimatikan |

## How It Works

```text
Token login → Keychain (kelas sesuai kebutuhan background) → dibaca saat request → header Authorization
Komunikasi → ATS menolak HTTP & TLS lemah → (opsional) pinning
Aksi sensitif → biometrik membuka item Keychain berproteksi → server tetap memverifikasi
Catatan: item Keychain dapat tetap ada setelah aplikasi dihapus & dipasang ulang → bersihkan saat first run bila perlu
```

## Implementation

### flutter_secure_storage dengan opsi iOS

```dart
const storage = FlutterSecureStorage(
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),  // perlu dibaca saat background sync
  aOptions: AndroidOptions(),                                                          // opsi Android sesuai versi paket
);

await storage.write(key: 'refresh_token', value: token);
final refresh = await storage.read(key: 'refresh_token');
```

### Bersihkan Keychain saat instalasi baru

```dart
Future<void> clearKeychainOnFreshInstall(SharedPreferences prefs, FlutterSecureStorage storage) async {
  if (prefs.getBool('installed') != true) {     // UserDefaults terhapus saat uninstall, Keychain tidak selalu
    await storage.deleteAll();
    await prefs.setBool('installed', true);
  }
}
```

### Biometrik

```dart
final auth = LocalAuthentication();
final ok = await auth.authenticate(
  localizedReason: 'Konfirmasi void transaksi',
  options: const AuthenticationOptions(biometricOnly: true, stickyAuth: true),
);
// Butuh NSFaceIDUsageDescription di Info.plist.
// Biometrik di klien = kenyamanan UX; aksi penting tetap divalidasi server (mis. PIN/OTP atau tanda tangan kunci perangkat).
```

### ATS: jangan buka lebar

```xml
<!-- ❌ Hindari di production -->
<key>NSAppTransportSecurity</key>
<dict><key>NSAllowsArbitraryLoads</key><true/></dict>

<!-- ✅ Bila terpaksa (mis. printer lokal berbasis HTTP), batasi per domain dan dokumentasikan alasannya -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSExceptionDomains</key>
  <dict><key>printer.local</key><dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict></dict>
</dict>
```

### Snapshot app switcher

```dart
// Tutupi layar sensitif saat app inactive (snapshot diambil sistem saat masuk background)
AppLifecycleListener(
  onInactive: () => privacyOverlay.show(),
  onResume: () => privacyOverlay.hide(),
);
```

### Universal Links vs URL scheme

```text
URL scheme (kasirkita://order/A1): mudah dibajak app lain yang mendaftar scheme sama → validasi ketat
Universal Links (https://pos.example.com/orders/A1): butuh file apple-app-site-association di domain + Associated Domains entitlement
```

### Checklist keamanan iOS

```markdown
- [ ] Token di Keychain dengan kelas yang tepat; tidak di UserDefaults
- [ ] Bersihkan Keychain saat first run bila dibutuhkan
- [ ] ATS tanpa NSAllowsArbitraryLoads; pengecualian per domain terdokumentasi
- [ ] Pinning (bila dipakai) punya pin cadangan & rencana rotasi
- [ ] Overlay privasi untuk layar sensitif
- [ ] Deep link/Universal Link divalidasi
- [ ] Build release di-obfuscate (--obfuscate --split-debug-info), tanpa log sensitif
- [ ] Secret server tidak ada di app/Info.plist
- [ ] Integritas perangkat (App Attest) diverifikasi server untuk aplikasi berisiko tinggi
```

## Best Practices

- **Keychain untuk rahasia kecil**, database terenkripsi untuk data besar sensitif.
- **Kelas aksesibilitas seketat mungkin** yang masih memenuhi kebutuhan background.
- **`ThisDeviceOnly`** untuk token agar tidak berpindah via backup.
- **Biometrik terikat kunci**, bukan sekadar boolean "berhasil".
- **Universal Links** untuk deep link penting.

## Anti-Patterns

- Token di `UserDefaults`/`SharedPreferences`.
- `NSAllowsArbitraryLoads = true` di production.
- Deteksi jailbreak di klien sebagai satu-satunya pertahanan.
- Menganggap uninstall menghapus semua data Keychain.

## Performance Considerations

Akses Keychain relatif lambat dibanding memori — baca sekali saat startup lalu simpan di memori selama sesi, tulis
hanya saat berubah. Operasi biometrik memerlukan interaksi pengguna; jangan memicunya berulang.

## Security Considerations

Halaman ini adalah topik keamanan. Tambahan: siapkan mekanisme cabut sesi dari server, minimum app version untuk
memaksa update saat ada kerentanan, dan rujuk OWASP MASVS untuk persyaratan lengkap.

## Real-World Use Cases

- Aplikasi kasir yang membaca token di background sync (kelas `AfterFirstUnlockThisDeviceOnly`).
- Konfirmasi void dengan Face ID + validasi PIN supervisor di server.
- Aplikasi bank dengan App Attest dan overlay privasi.

## Interview Questions

1. Di mana menyimpan token di iOS dan mengapa?
2. Apa itu kelas aksesibilitas Keychain?
3. Apa itu App Transport Security?
4. Apakah data Keychain terhapus saat aplikasi di-uninstall?
5. URL scheme vs Universal Links?

## Sample Answers

1. Di Keychain (mis. lewat `flutter_secure_storage`) karena terenkripsi dan dilindungi sistem, bukan di `UserDefaults` yang berupa file plist biasa.
2. Pengaturan kapan item dapat diakses, mis. hanya saat perangkat tidak terkunci (`WhenUnlocked`) atau setelah unlock pertama sejak boot (`AfterFirstUnlock`), dan apakah boleh ikut backup ke perangkat lain (`ThisDeviceOnly`).
3. Kebijakan iOS yang mewajibkan koneksi HTTPS dengan TLS dan cipher modern; pengecualian harus dideklarasikan di Info.plist dan sebaiknya dibatasi per domain.
4. Tidak selalu — item Keychain dapat bertahan setelah uninstall, sehingga aplikasi perlu membersihkannya saat mendeteksi instalasi baru.
5. URL scheme kustom dapat didaftarkan aplikasi mana pun sehingga bisa dibajak; Universal Links memakai URL HTTPS yang diverifikasi melalui file di domain Anda dan entitlement Associated Domains.

## Practical Exercises

1. Atur `flutter_secure_storage` dengan kelas aksesibilitas yang sesuai untuk sync background.
2. Implementasikan pembersihan Keychain saat first run dan uji dengan uninstall/install ulang.
3. Jalankan checklist keamanan iOS pada aplikasi Anda.

## Quick Reference

```text
Keychain (bukan UserDefaults) · WhenUnlocked vs AfterFirstUnlock · ThisDeviceOnly · bersihkan saat first run
ATS tanpa ArbitraryLoads · pinning + backup pin · Face ID + NSFaceIDUsageDescription · validasi server
Overlay privasi saat inactive · Universal Links > URL scheme · App Attest diverifikasi server · obfuscate
```

## Related Topics

- [Android App Security](/android/app-security/)
- [Flutter Security Best Practices](/flutter/security-best-practices/)
- [Mobile Application Security](/security/mobile-app-security/)
