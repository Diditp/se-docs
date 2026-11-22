---
title: "Crash Reporting & Mobile Monitoring"
description: "Memantau aplikasi mobile di production: crash & non-fatal error (Crashlytics/Sentry), symbolication (Dart symbols, R8 mapping, dSYM), ANR & Android vitals, performance monitoring (startup, network, trace), analytics & funnel, logging terstruktur, release health per versi, alert, serta privasi data monitoring."
level: intermediate
status: complete
version: "firebase_crashlytics / sentry_flutter versi terbaru — fitur & konfigurasi berubah, cek dokumentasi resmi"
updated: 2026-11-13
tags: [mobile, monitoring, crashlytics, sentry, observability, release-health]
---

## Overview

Setelah aplikasi dirilis, Anda tidak bisa melihat layar pengguna. **Mobile monitoring** memberi visibilitas: crash dan
error, performa (startup, jaringan, frame), kesehatan per versi rilis, serta perilaku pengguna. Alat umum: **Firebase
Crashlytics**, **Sentry**, **Firebase Performance**, **Android vitals** (Play Console), dan **Xcode Organizer**.

## Why It Matters

Staged rollout dan hotfix hanya berguna bila Anda **tahu** ada masalah. Metrik crash-free users dan ANR rate juga
memengaruhi visibilitas aplikasi di store. Interviewer menanyakan "bagaimana Anda tahu ada bug di production?".

## Core Concepts

| Sinyal | Contoh metrik | Alat |
| --- | --- | --- |
| Stabilitas | Crash-free users/sessions, ANR rate, OOM | Crashlytics, Sentry, Android vitals, Xcode Organizer |
| Error non-fatal | Exception yang ditangkap (sync gagal, parsing) | `recordError` / `captureException` |
| Performa | Startup time, network latency, slow/frozen frames, trace kustom | Firebase Performance, Sentry Performance |
| Release health | Metrik per versi & build | Crashlytics/Sentry dashboard |
| Bisnis/produk | Funnel checkout, konversi | Analytics |
| Konteks | Breadcrumb, custom key (outlet, flavor), user ID ter-hash | SDK monitoring |

**Symbolication**: stack trace build release tidak terbaca tanpa file symbol — Dart (`--split-debug-info`), Android
R8 `mapping.txt`, iOS `dSYM`.

## How It Works

```text
Error terjadi → SDK mencatat stack trace + konteks (versi, device, breadcrumb) → dikirim (sekarang/peluncuran berikutnya)
→ server men-symbolicate dengan file symbol versi tersebut → dikelompokkan per issue → alert bila lonjakan
Dashboard per rilis → keputusan: lanjutkan rollout / halt / hotfix
```

## Implementation

### Menangkap semua error di Flutter (Crashlytics)

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;   // error framework
  PlatformDispatcher.instance.onError = (error, stack) {                         // error async tak tertangkap
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };

  await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(!kDebugMode);
  runApp(const PosApp());
}
```

### Konteks yang berguna (tanpa data pribadi)

```dart
final crash = FirebaseCrashlytics.instance;
await crash.setUserIdentifier(hashedUserId);           // bukan email/nomor HP
await crash.setCustomKey('outlet_id', outletId);
await crash.setCustomKey('flavor', 'production');
await crash.log('checkout: pembayaran QRIS dimulai');  // breadcrumb

// Non-fatal: error yang ditangani tetapi perlu diketahui
try {
  await syncService.pushPending();
} on SyncException catch (e, s) {
  await crash.recordError(e, s, reason: 'sync_push_failed', fatal: false);
}
```

### Alternatif: Sentry

```dart
await SentryFlutter.init(
  (o) {
    o.dsn = const String.fromEnvironment('SENTRY_DSN');
    o.environment = const String.fromEnvironment('ENV', defaultValue: 'production');
    o.tracesSampleRate = 0.2;                          // sampling performa
    o.beforeSend = (event, hint) => scrubPersonalData(event);
  },
  appRunner: () => runApp(const PosApp()),
);
```

### Trace performa kustom

```dart
final trace = FirebasePerformance.instance.newTrace('sync_outbox');
await trace.start();
final pushed = await syncService.pushPending();
trace.setMetric('pushed_items', pushed);
await trace.stop();
```

### Symbol upload (wajib untuk build obfuscated)

```bash
flutter build appbundle --obfuscate --split-debug-info=build/symbols
firebase crashlytics:symbols:upload --app=<FIREBASE_APP_ID> build/symbols
# Android mapping.txt & iOS dSYM: pastikan plugin Gradle/build phase Crashlytics (atau sentry-cli) mengunggahnya di CI
```

### Alert & SOP

| Kondisi | Aksi |
| --- | --- |
| Crash-free users versi baru turun di bawah ambang (mis. 99%) | Halt staged rollout, triage |
| Issue baru dengan pengguna terdampak tinggi | Notifikasi on-call |
| ANR rate naik | Periksa trace main thread |
| Non-fatal `sync_push_failed` melonjak | Cek backend/jaringan, data outbox |

## Best Practices

- **Pasang sejak rilis pertama**, bukan setelah ada keluhan.
- **Upload symbol setiap build** dan verifikasi stack trace terbaca.
- **Catat non-fatal untuk alur kritis** (pembayaran, sync, login).
- **Pantau per versi** dan kaitkan dengan staged rollout.
- **Breadcrumb & custom key** untuk konteks, tanpa data pribadi.
- **Matikan pengumpulan di debug** agar dashboard bersih.

## Anti-Patterns

- `catch` yang menelan error tanpa pencatatan.
- Mengirim email, nomor HP, token, atau isi transaksi lengkap ke alat monitoring.
- Tidak mengunggah symbol → crash tidak bisa dibaca.
- Dashboard tanpa alert dan tanpa pemilik.

## Performance Considerations

SDK monitoring menambah overhead kecil; atur sampling untuk performance tracing, kirim batch, dan hindari log berlebihan
di loop. Inisialisasi SDK lebih awal untuk menangkap crash startup, tetapi tanpa memblokir frame pertama lebih lama dari
perlu.

## Security Considerations

Data monitoring adalah data pribadi bila tidak hati-hati: hash identitas, scrub field sensitif (`beforeSend`), patuhi
regulasi pelindungan data dan kebijakan store (Data safety / App Privacy). Batasi akses dashboard dan DSN/token
monitoring hanya untuk yang membutuhkan.

## Real-World Use Cases

- Menemukan crash hanya di satu model perangkat setelah update plugin kamera.
- Halt staged rollout karena crash-free users versi baru turun.
- Melacak kegagalan sinkronisasi per outlet lewat non-fatal + custom key.

## Interview Questions

1. Bagaimana Anda tahu ada masalah di production aplikasi mobile?
2. Apa itu symbolication dan mengapa penting?
3. Apa beda fatal dan non-fatal error?
4. Metrik apa yang Anda pantau setelah rilis?
5. Bagaimana menjaga privasi pengguna dalam monitoring?

## Sample Answers

1. Crash reporting (Crashlytics/Sentry) dengan alert, Android vitals & Xcode Organizer, performance monitoring, non-fatal untuk alur kritis, dan dashboard per versi yang dipantau selama staged rollout.
2. Menerjemahkan alamat/nama ter-obfuscate di stack trace menjadi nama fungsi, file, dan baris menggunakan file symbol (Dart symbols, mapping.txt, dSYM) dari build yang sama.
3. Fatal menyebabkan aplikasi crash; non-fatal adalah error yang tertangani tetapi tetap dicatat karena menandakan masalah (sync gagal, parsing gagal).
4. Crash-free users/sessions, ANR rate, startup time, error rate API, non-fatal di alur kritis, adopsi versi, dan metrik bisnis seperti keberhasilan checkout.
5. Tidak mengirim data pribadi (hash ID, scrub field), sampling, retensi terbatas, akses dashboard terbatas, dan deklarasi yang sesuai di Data safety/App Privacy.

## Practical Exercises

1. Pasang Crashlytics atau Sentry dengan handler error global dan uji crash sengaja di build release.
2. Tambahkan non-fatal + custom key pada alur sinkronisasi.
3. Otomatiskan symbol upload di pipeline CI dan verifikasi stack trace terbaca.

## Quick Reference

```text
FlutterError.onError + PlatformDispatcher.onError → crash reporting · recordError(fatal: false) untuk non-fatal
Symbol: --split-debug-info + upload · mapping.txt · dSYM · release health per versi → kendali staged rollout
Konteks: breadcrumb + custom key + hashed user ID · tanpa data pribadi · alert dengan pemilik
```

## Related Topics

- [Mobile CI/CD Pipeline](/devops/mobile-cicd-pipeline/)
- [Handling Production Bugs](/interview/behavioral/production-bugs/)
- [Error Handling (Flutter)](/flutter/error-handling/)
