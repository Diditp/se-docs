---
title: "Logging & Error Tracking"
description: "Logging dan error tracking untuk aplikasi mobile & backend: level log, structured logging, korelasi request ID, menangkap semua error Flutter (FlutterError, PlatformDispatcher, zone), Crashlytics/Sentry, breadcrumb, non-fatal, symbolication, PII redaction, sampling, dan alerting."
level: intermediate
status: complete
version: "Firebase Crashlytics · Sentry · pino — API SDK berubah, cek dokumentasi resmi"
updated: 2026-11-13
tags: [logging, crashlytics, sentry, observability, error-handling]
---

## Overview

**Logging** mencatat apa yang terjadi di aplikasi; **error tracking** mengumpulkan crash dan exception dari perangkat
pengguna/server ke satu tempat, lengkap dengan stack trace, konteks, dan jumlah pengguna terdampak. Keduanya adalah mata
Anda di production — tanpa itu, bug hanya diketahui dari ulasan bintang satu.

## Why It Matters

Di mobile Anda tidak bisa membuka log perangkat pengguna. Crash-free rate, ANR, dan error non-fatal menentukan rating
store dan keputusan staged rollout. Interviewer menanyakan "bagaimana Anda tahu aplikasi bermasalah di production?".

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Level log | `debug` (dev saja), `info` (peristiwa penting), `warn` (anomali tertangani), `error` (gagal) |
| Structured logging | Log sebagai objek (JSON) dengan field konsisten, bukan string bebas |
| Correlation/request ID | ID yang mengalir dari mobile → API → service untuk menelusuri satu permintaan |
| Fatal vs non-fatal | Crash yang menutup app vs exception yang tertangkap tetapi tetap dilaporkan |
| Breadcrumb | Jejak peristiwa sebelum error (layar, tap, request) |
| Symbolication | Mengubah stack trace obfuscated/native kembali ke nama fungsi (butuh symbol/mapping) |
| Crash-free users | Persentase pengguna tanpa crash dalam periode tertentu |

## How It Works

```text
Error terjadi → handler global menangkap → SDK menambah konteks (versi, perangkat, user ID anonim, breadcrumb, custom key)
→ simpan lokal → kirim saat online → server mengelompokkan (issue) + symbolication
→ dashboard/alert → engineer memperbaiki → rilis → pantau regresi per versi
```

## Implementation

### Flutter: tangkap semua jalur error

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;      // error framework/widget
  PlatformDispatcher.instance.onError = (error, stack) {                              // error async tak tertangkap
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };
  await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(!kDebugMode);

  runApp(const App());
}
```

### Non-fatal dengan konteks

```dart
Future<void> syncOutbox() async {
  try {
    await _sync.run();
  } on NetworkFailure {
    // perkiraan normal (offline) — cukup log info, JANGAN laporkan sebagai error
  } catch (e, s) {
    await FirebaseCrashlytics.instance.setCustomKey('outbox_size', await _outbox.count());
    await FirebaseCrashlytics.instance.recordError(e, s, reason: 'sync_outbox_failed');   // non-fatal
  }
}
```

### Logger berlapis (abstraksi)

```dart
abstract interface class AppLogger {
  void info(String msg, [Map<String, Object?> ctx]);
  void error(String msg, Object error, StackTrace stack, [Map<String, Object?> ctx]);
}
// DebugLogger → console; ReleaseLogger → breadcrumb Crashlytics/Sentry + redaksi PII
```

### Node.js: structured log + request ID

```ts
import pino from 'pino';
const logger = pino({ redact: ['req.headers.authorization', '*.password', '*.otp'] });

app.use((req, res, next) => {
  req.id = req.header('x-request-id') ?? crypto.randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader('x-request-id', req.id);
  next();
});

req.log.info({ orderId, outletId, durationMs }, 'order created');
```

Mobile mengirim `X-Request-Id` (UUID per request) dan mencatatnya di breadcrumb → laporan bug bisa dicocokkan dengan log server.

### Symbol & mapping

```bash
flutter build appbundle --obfuscate --split-debug-info=build/symbols
firebase crashlytics:symbols:upload --app=<APP_ID> build/symbols      # Dart symbols
# Android: mapping.txt R8 diunggah plugin Gradle Crashlytics; iOS: dSYM diunggah build phase
```

## Best Practices

- **Tangkap semua jalur**: `FlutterError.onError`, `PlatformDispatcher.onError`, isolate, native crash.
- **Bedakan error yang diharapkan** (offline, validasi) dari bug — jangan banjiri dashboard.
- **Structured log + request ID** lintas mobile dan backend.
- **Redaksi PII & secret** sebelum log keluar perangkat.
- **Unggah symbol di CI** untuk setiap rilis.
- **Alert berdasarkan tren** (issue baru/regresi di versi baru, lonjakan crash) bukan setiap event.

## Anti-Patterns

- `print()` di mana-mana, tetap ada di release.
- `catch (e) {}` tanpa log.
- Mengirim token, password, OTP, atau data kartu ke log.
- Melaporkan setiap timeout jaringan sebagai error.
- Stack trace tanpa symbol sehingga tidak terbaca.

## Performance Considerations

Logging sinkron yang berat di main thread mengganggu frame; gunakan level dan sampling, batasi ukuran breadcrumb, dan
biarkan SDK mengirim secara batch. Di backend, log JSON asinkron (pino) jauh lebih ringan daripada console berformat.

## Security Considerations

Log adalah data: patuhi retensi, akses terbatas, dan regulasi perlindungan data pribadi (di Indonesia, UU PDP). Gunakan
user ID anonim/hash, jangan email/nomor telepon. Mintalah persetujuan pengguna bila kebijakan mewajibkan.

## Real-World Use Cases

- Staged rollout dihentikan karena crash-free users versi baru turun di bawah ambang.
- Menelusuri keluhan "pembayaran gagal" dengan request ID dari breadcrumb ke log server.
- Custom key `outbox_size` mengungkap crash hanya terjadi saat antrean sinkron sangat besar.

## Interview Questions

1. Bagaimana menangkap semua error di aplikasi Flutter?
2. Apa beda fatal dan non-fatal error?
3. Apa itu structured logging dan correlation ID?
4. Mengapa stack trace release bisa tidak terbaca dan bagaimana memperbaikinya?
5. Data apa yang tidak boleh masuk log?

## Sample Answers

1. Set `FlutterError.onError` untuk error framework, `PlatformDispatcher.instance.onError` untuk error async tak tertangkap, tangani error isolate, dan andalkan SDK untuk crash native; kirim ke Crashlytics/Sentry.
2. Fatal menghentikan aplikasi (crash); non-fatal adalah exception yang ditangkap tetapi dilaporkan agar terlihat polanya.
3. Structured logging menulis log sebagai field terstruktur (JSON) yang mudah dicari; correlation ID adalah ID per permintaan yang dibawa lintas komponen untuk menelusuri satu alur.
4. Kode di-obfuscate (R8, Dart `--obfuscate`) atau native tanpa symbol; unggah mapping/symbol/dSYM per build agar layanan bisa melakukan symbolication.
5. Password, token, OTP, data kartu, PII seperti email/nomor telepon/alamat lengkap, dan isi body sensitif.

## Practical Exercises

1. Pasang handler error global dan uji dengan exception sinkron, async, dan dari widget build.
2. Tambahkan request ID dari aplikasi ke backend dan cari satu alur di log.
3. Buat aturan redaksi untuk field sensitif dan tulis test-nya.

## Quick Reference

```text
FlutterError.onError + PlatformDispatcher.onError · fatal vs non-fatal · breadcrumb · custom key
Structured log (JSON) · X-Request-Id · pino redact · level debug/info/warn/error
Upload symbol (Dart, mapping.txt, dSYM) di CI · alert pada regresi · tanpa PII/secret
```

## Related Topics

- [Debugging Techniques](/testing-performance/debugging-techniques/)
- [Performance Monitoring](/testing-performance/performance-monitoring/)
- [Mobile Monitoring & Crash Reporting](/devops/mobile-monitoring/)
