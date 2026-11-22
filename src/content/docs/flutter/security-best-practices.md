---
title: "Flutter Security Best Practices"
description: "Keamanan aplikasi Flutter berbasis OWASP MASVS: penyimpanan aman, network & certificate pinning, tidak ada secret di app, obfuscation, integritas device, deep link, WebView, logging, dan checklist sebelum rilis."
level: advanced
status: complete
version: "Flutter 3.x · OWASP MASVS v2"
updated: 2026-11-12
tags: [flutter, security, masvs, secure-storage, pinning, obfuscation]
---

## Overview

Aplikasi mobile berjalan di perangkat yang **tidak Anda kendalikan**: binary bisa dibongkar, traffic bisa disadap di
jaringan yang tidak aman atau lewat proxy, device bisa di-root, dan app lain bisa mengirim intent/deep link. Keamanan
Flutter berarti **mengurangi apa yang bisa dicuri dari app** dan **memastikan keputusan penting diambil di server**.
Acuan standar: **OWASP MASVS** (Mobile Application Security Verification Standard) dan panduan uji **MASTG**.

## Why It Matters

Aplikasi transaksi dan layanan pelanggan menyimpan token, data pribadi, dan kadang data pembayaran. Temuan pentest
mobile yang paling sering: token di SharedPreferences, API key di binary, log berisi data sensitif, tidak ada validasi
deep link, dan backend yang memercayai data dari app.

## Core Concepts

| Area MASVS | Pertanyaan kunci |
| --- | --- |
| STORAGE | Apakah data sensitif tersimpan aman (atau tidak disimpan sama sekali)? |
| CRYPTO | Apakah kriptografi memakai library & kunci yang benar? |
| AUTH | Apakah autentikasi/sesi dikelola dengan aman (dan diputuskan server)? |
| NETWORK | Apakah komunikasi terenkripsi & server terverifikasi? |
| PLATFORM | Apakah interaksi dengan OS (intent, deep link, WebView, clipboard) aman? |
| CODE | Apakah dependency terbarui, input divalidasi, build release aman? |
| RESILIENCE | Apakah app mempersulit reverse engineering & tampering (defense-in-depth)? |
| PRIVACY | Apakah data pribadi diminimalkan dan transparan? |

Prinsip utama: **semua yang ada di APK/IPA dianggap publik**. Obfuscation hanya memperlambat penyerang.

## How It Works

```text
Ancaman                         Kontrol
Device hilang/di-root      →   secure storage (Keystore/Keychain), DB terenkripsi, session timeout, remote logout
Traffic disadap (MITM)     →   HTTPS/TLS, (opsional) certificate pinning dengan rencana rotasi
Binary dibongkar           →   tanpa secret di app, obfuscation, logika penting di server
App/payload palsu          →   Play Integrity / App Attest + validasi server
Intent/deep link jahat     →   validasi parameter, allowlist route, exported component minimal
Data bocor via log/screen  →   redaksi log, FLAG_SECURE / blur app switcher
```

## Implementation

### Penyimpanan aman

```dart
class SecureTokenStore {
  SecureTokenStore(this._storage);
  final FlutterSecureStorage _storage;
  String? _accessToken;                                   // access token cukup di memori

  static const _refreshKey = 'refresh_token';

  Future<void> save({required String access, required String refresh}) async {
    _accessToken = access;
    await _storage.write(key: _refreshKey, value: refresh);
  }

  String? get accessToken => _accessToken;
  Future<String?> refreshToken() => _storage.read(key: _refreshKey);

  Future<void> clear() async {                           // dipanggil saat logout / sesi dicabut
    _accessToken = null;
    await _storage.delete(key: _refreshKey);
  }
}
```

Opsi platform (`AndroidOptions`, `IOSOptions` seperti accessibility Keychain) sesuaikan dengan kebutuhan; cek dokumentasi
`flutter_secure_storage` versi Anda. Database lokal dengan data pribadi/finansial: SQLCipher dengan kunci acak di secure storage.

### Tidak ada secret di app

```dart
// ❌ Siapa pun bisa mengekstrak string ini dari binary
const paymentSecretKey = 'sk_live_xxx';

// ✅ App hanya memakai token user; operasi rahasia dilakukan backend
final qr = await api.createQrisPayment(orderId: order.id);   // backend memegang kredensial payment gateway
```

API key publik yang memang harus ada di app (Maps, Firebase) dibatasi di console penyedia (package name + SHA-256 sertifikat, API yang diizinkan).

### Network: TLS & certificate pinning (opsional, berisiko tinggi)

```dart
// Pinning SPKI dengan Dio (gambaran) — gunakan beberapa pin (aktif + cadangan) dan rencana rotasi
(dio.httpClientAdapter as IOHttpClientAdapter).validateCertificate = (cert, host, port) {
  if (cert == null) return false;
  final spkiSha256 = sha256OfSubjectPublicKeyInfo(cert.der);   // implementasi parsing DER
  return allowedPins[host]?.contains(spkiSha256) ?? false;
};
```

Pinning yang salah konfigurasi dapat **memutus seluruh user** saat sertifikat diganti. Pakai hanya bila risiko MITM
tinggi (finansial), dengan pin cadangan, kill switch via remote config, dan uji rotasi.

Android: pastikan cleartext dinonaktifkan (default untuk targetSdk modern) dan tidak ada `network_security_config` yang mempercayai CA user di release.

### Build release

```bash
flutter build appbundle --release --obfuscate --split-debug-info=build/symbols
```

Android: R8 (`isMinifyEnabled = true`), `android:debuggable` false (default release), `android:allowBackup` dikonfigurasi
untuk mengecualikan data sensitif.

### Layar sensitif & app switcher

```kotlin
// MainActivity.kt — cegah screenshot/rekam layar untuk seluruh app (atau toggle per layar via platform channel)
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
}
```

```dart
// Blur saat app ke background (juga membantu di iOS app switcher)
class PrivacyCurtain extends StatefulWidget { ... }   // tampilkan overlay saat AppLifecycleState.inactive/hidden
```

### Deep link & WebView

```dart
bool isSafeRoute(Uri uri) =>
    uri.scheme == 'https' && uri.host == 'app.example.com' &&
    RegExp(r'^/(orders|tickets)/[A-Za-z0-9-]{1,64}$').hasMatch(uri.path);
```

WebView: muat hanya domain tepercaya, nonaktifkan JavaScript bila tidak perlu, jangan expose JavaScript channel yang
bisa memicu aksi sensitif, dan jangan menampilkan halaman login pihak ketiga di WebView (gunakan system browser + PKCE).

### Integritas device/app (defense-in-depth)

Play Integrity API (Android) dan App Attest (iOS) memberi **token yang diverifikasi server** untuk menilai apakah request
berasal dari app asli di device yang sah. Deteksi root/jailbreak di client mudah dilewati — jadikan sinyal tambahan, bukan satu-satunya kontrol.

## Best Practices

- **Minimalkan data yang disimpan**; yang disimpan → terenkripsi; token → secure storage; access token di memori.
- **Tidak ada secret di app**; operasi sensitif di backend.
- **Server memutuskan**: harga, diskon, saldo, role, kelayakan.
- **HTTPS + timeout + validasi respons**; pinning hanya dengan rencana rotasi.
- **Obfuscation + simbol** di setiap release.
- **Validasi semua input dari luar**: deep link, push payload, platform channel, clipboard, QR code.
- **Redaksi log** & matikan log verbose di release.
- **Logout membersihkan** token, cache, DB (sesuai kebijakan), dan task background.
- **Dependency diperbarui & diaudit** (`flutter pub outdated`, advisories).
- **Uji dengan checklist MASVS** sebelum rilis besar; pentest berkala untuk app finansial.

## Anti-Patterns

- Token/PIN di `SharedPreferences` atau file biasa.
- API key/secret server di `const` Dart atau `--dart-define`.
- `badCertificateCallback = (_, __, ___) => true` untuk "memperbaiki" error SSL.
- Menganggap root detection / obfuscation sebagai pengaman utama.
- Menampilkan detail error server (stack trace) ke user.
- WebView dengan JavaScript channel yang menerima perintah dari halaman mana pun.

## Performance Considerations

- Secure storage relatif lambat (akses Keystore/Keychain) — baca sekali saat start lalu simpan di memori selama sesi.
- Enkripsi database menambah overhead kecil pada I/O; ukur pada device target.
- Pinning tidak menambah latency berarti setelah handshake; integrity attestation memiliki kuota & latency — panggil pada aksi sensitif, bukan setiap request.

## Security Considerations

Halaman ini seluruhnya tentang keamanan; untuk sisi server, lihat [OWASP Top 10](/security/owasp-top-10/) dan
[Authentication & Authorization](/backend/authentication-authorization/). Untuk aturan yang bisa langsung dipakai AI
agent, lihat [Application Security Requirements](/agent-instructions/security/).

## Real-World Use Cases

- **POS**: token di secure storage, DB transaksi terenkripsi, kunci PIN kasir setelah idle, device binding & remote logout dari dashboard.
- **Aplikasi pelanggan**: OTP login, tidak menampilkan data lengkap di notifikasi, FLAG_SECURE di halaman tagihan.
- **Field app**: foto bukti disimpan di storage privat app, dihapus setelah terunggah.

## Interview Questions

1. Di mana Anda menyimpan token di aplikasi Flutter dan mengapa?
2. Bagaimana melindungi API key di aplikasi mobile?
3. Apa itu certificate pinning, kapan dipakai, dan apa risikonya?
4. Apakah obfuscation membuat aplikasi aman?
5. Bagaimana mengamankan deep link?
6. Apa itu OWASP MASVS?

## Sample Answers

1. Refresh token di `flutter_secure_storage` (Keystore/Keychain), access token di memori, dan semuanya dihapus saat logout. SharedPreferences tersimpan sebagai teks biasa sehingga tidak boleh untuk secret.
2. Secret sejati tidak boleh ada di app — pindahkan operasinya ke backend. Key publik (Maps/Firebase) dibatasi di console penyedia berdasarkan package name/sertifikat dan API yang diizinkan, ditambah App Check/Play Integrity.
3. Memastikan app hanya menerima sertifikat/kunci publik server tertentu sehingga MITM dengan CA lain gagal. Dipakai untuk app berisiko tinggi; risikonya app tidak bisa terhubung saat sertifikat diganti jika tidak ada pin cadangan dan rencana rotasi.
4. Tidak — obfuscation hanya mempersulit dan memperlambat reverse engineering. Keamanan berasal dari tidak menyimpan secret di app, otorisasi di server, dan penyimpanan yang aman.
5. Verifikasi domain (App Links/Universal Links), validasi path & parameter dengan allowlist, jangan melakukan aksi sensitif langsung dari deep link tanpa konfirmasi/autentikasi, dan muat data berdasarkan ID dengan otorisasi server.
6. Standar verifikasi keamanan aplikasi mobile dari OWASP yang mencakup storage, crypto, auth, network, platform, code, resilience, dan privacy — dipakai sebagai checklist pengembangan dan dasar pengujian (MASTG).

## Practical Exercises

1. Audit app Anda: cari penyimpanan token, string rahasia di kode, log sensitif, dan `badCertificateCallback`.
2. Pindahkan token ke secure storage dan pastikan logout membersihkan semuanya.
3. Tambahkan FLAG_SECURE pada layar sensitif dan privacy curtain saat app ke background.
4. Jalankan checklist MASVS-STORAGE & NETWORK pada build release.

## Quick Reference

```text
Semua di APK/IPA = publik · secret di backend · server yang memutuskan
Token: refresh → secure storage, access → memori · DB sensitif → SQLCipher · logout = bersihkan semua
HTTPS + timeout · pinning hanya dgn pin cadangan & rotasi · release: --obfuscate + R8
Validasi deep link/push/channel · FLAG_SECURE · redaksi log · Play Integrity/App Attest = sinyal tambahan
```

## Related Topics

- [Mobile Application Security](/security/mobile-app-security/)
- [Secure Token Storage](/security/secure-token-storage/)
- [REST API Integration](/flutter/rest-api-integration/)
- [Build, Release & Deployment](/flutter/build-release-deployment/)
- Referensi resmi: [OWASP MASVS](https://mas.owasp.org/MASVS/), [Flutter security](https://docs.flutter.dev/security), [flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage), [Play Integrity API](https://developer.android.com/google/play/integrity).
