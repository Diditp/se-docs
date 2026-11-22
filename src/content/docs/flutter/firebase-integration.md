---
title: "Firebase Integration"
description: "Menghubungkan Flutter ke Firebase dengan FlutterFire CLI per flavor, memilih layanan (Auth, Firestore, Crashlytics, Analytics, Remote Config, App Check), security rules, dan batas penggunaan yang sehat."
level: intermediate
status: complete
version: "FlutterFire (firebase_core 3.x/4.x) · Firebase CLI"
updated: 2026-11-12
tags: [flutter, firebase, crashlytics, firestore, remote-config, app-check]
---

## Overview

**Firebase** adalah platform Backend-as-a-Service dari Google: autentikasi, database (Firestore/Realtime Database),
storage, Cloud Functions, push notification (FCM), crash reporting (Crashlytics), analytics, Remote Config, dan App Check.
Plugin resminya untuk Flutter disebut **FlutterFire**.

Di banyak project, Firebase dipakai **berdampingan** dengan backend sendiri — misalnya hanya untuk Crashlytics, FCM,
dan Remote Config — sementara data bisnis tetap di API + PostgreSQL.

## Why It Matters

- Crash reporting dan analytics adalah kebutuhan dasar app produksi.
- FCM adalah jalur standar push notification Android (dan iOS via APNs).
- Remote Config & feature flag memungkinkan mematikan fitur tanpa rilis ulang.
- Firestore/Auth mempercepat MVP — tetapi butuh pemahaman security rules dan model biaya.

## Core Concepts

| Layanan | Kegunaan utama | Catatan |
| --- | --- | --- |
| Firebase Auth | Login email, OTP SMS, Google/Apple | Token ID bisa diverifikasi backend sendiri |
| Cloud Firestore | NoSQL dokumen real-time, offline cache | Biaya per read/write; query terbatas (tanpa JOIN) |
| Cloud Storage | File/gambar | Dilindungi Storage Rules |
| Cloud Functions | Kode server event-driven | Untuk logika yang tidak boleh di client |
| FCM | Push notification | Lihat [Push Notifications](/flutter/push-notifications/) |
| Crashlytics | Crash & non-fatal error | Upload simbol untuk build obfuscated |
| Analytics | Event & funnel | Jangan kirim PII |
| Remote Config | Konfigurasi & flag dari server | Default lokal wajib |
| App Check | Membuktikan request berasal dari app asli | Play Integrity / App Attest |

## How It Works

- `flutterfire configure` membaca project Firebase dan menghasilkan `firebase_options.dart` (konfigurasi per platform) — file ini berisi identifier publik, bukan secret server.
- `Firebase.initializeApp(options: ...)` dipanggil sekali sebelum memakai layanan.
- Akses data dari client ke Firestore/Storage **diizinkan atau ditolak oleh Security Rules** di server Firebase — rules adalah satu-satunya lapisan otorisasi jika tidak ada backend sendiri.

## Implementation

### Setup per flavor (dev/prod terpisah)

```bash
dart pub global activate flutterfire_cli
flutterfire configure --project=pos-dev  --out=lib/firebase/firebase_options_dev.dart  \
  --android-package-name=com.example.pos.dev --ios-bundle-id=com.example.pos.dev
flutterfire configure --project=pos-prod --out=lib/firebase/firebase_options_prod.dart \
  --android-package-name=com.example.pos --ios-bundle-id=com.example.pos
```

```dart
// lib/app/bootstrap.dart
Future<void> bootstrap(Flavor flavor, Widget Function() builder) async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: flavor == Flavor.prod
        ? prod.DefaultFirebaseOptions.currentPlatform
        : dev.DefaultFirebaseOptions.currentPlatform,
  );

  // Crashlytics: tangkap error Flutter & async
  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };
  await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(!kDebugMode);

  // App Check
  await FirebaseAppCheck.instance.activate(
    androidProvider: kDebugMode ? AndroidProvider.debug : AndroidProvider.playIntegrity,
    appleProvider: kDebugMode ? AppleProvider.debug : AppleProvider.appAttestWithDeviceCheckFallback,
  );

  runApp(builder());
}
```

### Remote Config sebagai feature flag

```dart
final rc = FirebaseRemoteConfig.instance;
await rc.setDefaults(const {'enable_qris': true, 'min_supported_version': '1.0.0'});
await rc.setConfigSettings(RemoteConfigSettings(
  fetchTimeout: const Duration(seconds: 10),
  minimumFetchInterval: kDebugMode ? Duration.zero : const Duration(hours: 1),
));
await rc.fetchAndActivate();                       // gagal → tetap pakai default/terakhir
final qrisEnabled = rc.getBool('enable_qris');
```

### Firestore + security rules

```dart
// Data user sendiri
final notes = FirebaseFirestore.instance
    .collection('users').doc(uid).collection('notes')
    .orderBy('createdAt', descending: true).limit(50)
    .withConverter<Note>(
      fromFirestore: (s, _) => Note.fromJson(s.data()!..['id'] = s.id),
      toFirestore: (n, _) => n.toJson(),
    );
```

```text
// firestore.rules — deny by default, akses hanya ke data milik sendiri
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/notes/{noteId} {
      allow read, delete: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.text is string && request.resource.data.text.size() <= 2000;
    }
  }
}
```

### Firebase Auth dengan backend sendiri

```dart
final idToken = await FirebaseAuth.instance.currentUser!.getIdToken();
// Kirim ke backend: Authorization: Bearer <idToken>
// Backend memverifikasi dengan Firebase Admin SDK (signature, aud = project id, exp) lalu menerbitkan sesi/otorisasi sendiri.
```

:::caution[Version-dependent]
Nama API FlutterFire (mis. provider App Check, callback Crashlytics) dan versi minimum Android/iOS berubah antar rilis.
Ikuti `flutterfire configure` terbaru dan changelog tiap plugin.
:::

## Best Practices

- **Project Firebase terpisah per environment** (dev/staging/prod) — data & analytics tidak tercampur.
- **Security Rules deny-by-default** dan diuji dengan Emulator Suite; rules adalah backend Anda bila memakai Firestore langsung.
- **Logika sensitif di server** (Cloud Functions atau backend sendiri): harga, poin, pembayaran, role.
- **Crashlytics + simbol obfuscation** di setiap rilis; tambahkan custom key (versi, outlet) tanpa PII.
- **Remote Config dengan default lokal** — app tetap jalan tanpa jaringan.
- **App Check** untuk mengurangi abuse API Firebase oleh client palsu.
- **Batasi query Firestore** (`limit`, index komposit) untuk mengontrol biaya.

## Anti-Patterns

- Rules `allow read, write: if true;` (test mode) dibiarkan sampai production.
- Menyimpan role/izin di dokumen yang bisa diubah user sendiri.
- Mengandalkan Firestore untuk laporan agregasi kompleks/relasional (mahal & sulit) — gunakan backend SQL atau ekspor ke BigQuery.
- Mengirim email/nomor HP ke Analytics.
- Satu project Firebase untuk dev & prod.

## Performance Considerations

- Firestore menagih per dokumen yang dibaca — listener pada koleksi besar tanpa `limit` mahal dan lambat.
- Firestore offline persistence aktif secara default di mobile: cepat, tetapi perhatikan ukuran cache.
- Inisialisasi plugin Firebase menambah waktu startup — inisialisasi yang tidak kritis (Remote Config fetch, Analytics) bisa ditunda setelah frame pertama.
- Crashlytics/Analytics mengirim data secara batch di background.

## Security Considerations

- `firebase_options.dart` / `google-services.json` berisi identifier publik; keamanan berasal dari **Rules + App Check + otorisasi backend**, bukan dari menyembunyikan file tersebut.
- Verifikasi ID token Firebase di backend (signature, audience, issuer, expiry) sebelum mempercayai `uid`.
- Gunakan custom claims (diset server) untuk role, bukan field dokumen yang bisa diubah client.
- Perhatikan regulasi data pribadi saat memakai Analytics/Crashlytics (consent, retensi).

## Real-World Use Cases

- **POS dengan backend sendiri**: Firebase hanya untuk Crashlytics, FCM, dan Remote Config (flag `enable_qris`, versi minimum).
- **MVP aplikasi komunitas**: Auth + Firestore + Storage + Functions, rules ketat per user.
- **Force update**: Remote Config `min_supported_version` dibandingkan dengan versi app.

## Interview Questions

1. Layanan Firebase apa yang pernah Anda pakai dan untuk apa?
2. Bagaimana mengamankan Firestore tanpa backend sendiri?
3. Apakah `google-services.json` rahasia?
4. Kapan Anda tidak memakai Firestore untuk data utama?
5. Bagaimana memakai Firebase Auth bersama backend Node.js sendiri?

## Sample Answers

1. Crashlytics untuk crash & non-fatal error (dengan simbol obfuscation), FCM untuk notifikasi, Remote Config untuk feature flag dan force update, App Check untuk membatasi abuse, dan Auth untuk login OTP.
2. Security Rules deny-by-default yang memeriksa `request.auth.uid`, validasi bentuk data di rules, role via custom claims, App Check, dan logika sensitif dipindah ke Cloud Functions; diuji dengan Emulator.
3. Tidak — berisi identifier publik yang memang ada di setiap APK. Keamanan berasal dari rules, App Check, pembatasan API key di Google Cloud, dan otorisasi server.
4. Saat data sangat relasional, butuh transaksi kompleks lintas entitas, laporan agregasi berat, atau biaya baca tinggi — PostgreSQL + API lebih tepat.
5. Client login dengan Firebase Auth, mengirim ID token ke backend; backend memverifikasi dengan Admin SDK, memetakan `uid` ke user internal, lalu menerapkan otorisasi sendiri.

## Practical Exercises

1. Konfigurasikan dua project Firebase (dev & prod) dengan flavor dan pastikan crash dev tidak masuk prod.
2. Tulis Firestore rules untuk koleksi notes per user dan uji dengan Emulator (akses user lain harus ditolak).
3. Implementasikan force update berbasis Remote Config.

## Quick Reference

```text
flutterfire configure per flavor · Firebase.initializeApp sekali di bootstrap
Crashlytics: FlutterError.onError + PlatformDispatcher.onError + simbol obfuscation
Rules deny-by-default + Emulator test · App Check · logika sensitif di server
Remote Config: setDefaults + fetchAndActivate · Firestore: limit + index, waspadai biaya read
```

## Related Topics

- [Push Notifications](/flutter/push-notifications/)
- [Error Handling](/flutter/error-handling/)
- [Build, Release & Deployment](/flutter/build-release-deployment/)
- [Flutter Security Best Practices](/flutter/security-best-practices/)
- Referensi resmi: [FlutterFire](https://firebase.google.com/docs/flutter/setup), [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started), [App Check](https://firebase.google.com/docs/app-check).
