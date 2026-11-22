---
title: "Error Handling"
description: "Strategi error handling Flutter berlapis: exception vs error, Failure domain, Result type, global handler (FlutterError, PlatformDispatcher), error boundary UI, pesan ramah, logging, dan crash reporting."
level: intermediate
status: complete
version: "Flutter 3.x · Dart 3.x"
updated: 2026-11-12
tags: [flutter, error-handling, crashlytics, logging, ux]
---

## Overview

Error handling yang baik menjawab tiga pertanyaan untuk setiap kegagalan: **apa yang dilihat user**, **apa yang
dicatat untuk developer**, dan **bagaimana sistem pulih**. Di Flutter, error datang dari banyak sumber: jaringan,
database, parsing, platform channel, bug logika, dan error rendering (layout overflow, null).

## Why It Matters

- Error yang ditelan → data rusak & bug yang tidak bisa direproduksi.
- Error yang ditampilkan mentah (`DioException [connection timeout]...`) → user bingung dan detail teknis bocor.
- Error async yang tidak tertangkap → crash yang tidak pernah sampai ke crash reporter.

## Core Concepts

| Konsep | Arti |
| --- | --- |
| `Exception` | Kondisi yang **diharapkan bisa terjadi** dan ditangani (timeout, validasi) |
| `Error` | **Bug program** (`StateError`, `RangeError`, `TypeError`) — jangan ditangkap untuk disembunyikan; perbaiki kodenya |
| Failure | Representasi error di domain (`NetworkFailure`, `ValidationFailure`) — bebas dari library |
| Result type | `Ok<T>` / `Err<Failure>` — error menjadi bagian tipe kembalian |
| Error boundary | UI pengganti saat bagian layar gagal (`ErrorWidget.builder`, state error per halaman) |
| Global handler | `FlutterError.onError` (framework), `PlatformDispatcher.instance.onError` (async/zona root) |
| Non-fatal | Error yang tertangani tetapi tetap dilaporkan untuk analisis |

## How It Works

```text
Data source: DioException / SqliteException / FormatException
     ▼ map (sekali, di data layer)
Repository → Result<Err(NetworkFailure | ValidationFailure | StorageFailure | ...)>
     ▼
Bloc/Cubit → state Failure(type, fieldErrors?) — tanpa teks teknis
     ▼
UI → pesan lokal + aksi (Coba lagi, Login ulang, Perbaiki field)
Bug yang tidak tertangani → FlutterError.onError / PlatformDispatcher.onError → crash reporter
```

## Implementation

### Hierarki Failure & mapping

```dart
sealed class Failure {
  const Failure();
}
final class NetworkFailure extends Failure { const NetworkFailure(); }
final class TimeoutFailure extends Failure { const TimeoutFailure(); }
final class UnauthorizedFailure extends Failure { const UnauthorizedFailure(); }
final class ValidationFailure extends Failure {
  const ValidationFailure(this.fieldErrors);
  final Map<String, String> fieldErrors;      // field → kode pesan
}
final class ConflictFailure extends Failure { const ConflictFailure(); }
final class StorageFailure extends Failure { const StorageFailure(); }
final class UnexpectedFailure extends Failure {
  const UnexpectedFailure(this.error, this.stackTrace);
  final Object error;
  final StackTrace stackTrace;
}
```

```dart
Future<Result<T>> guard<T>(Future<T> Function() body, {required ErrorReporter reporter}) async {
  try {
    return Ok(await body());
  } on DioException catch (e) {
    return Err(mapDioError(e));                // lihat REST API Integration
  } on SqliteException catch (e, st) {
    reporter.nonFatal(e, st, reason: 'db');
    return const Err(StorageFailure());
  } on FormatException catch (e, st) {
    reporter.nonFatal(e, st, reason: 'parse');
    return Err(UnexpectedFailure(e, st));
  }
  // Error (bug) sengaja TIDAK ditangkap di sini → sampai ke global handler
}
```

### Pesan untuk user (lokal, actionable)

```dart
String failureMessage(BuildContext context, Failure f) {
  final t = AppLocalizations.of(context);
  return switch (f) {
    NetworkFailure() => t.errorNoConnection,          // "Tidak ada koneksi. Data tersimpan dan akan dikirim otomatis."
    TimeoutFailure() => t.errorTimeout,
    UnauthorizedFailure() => t.errorSessionExpired,
    ValidationFailure() => t.errorCheckForm,
    ConflictFailure() => t.errorConflict,
    StorageFailure() => t.errorStorage,
    UnexpectedFailure() => t.errorGeneric,           // "Terjadi kesalahan. Coba lagi."
  };
}
```

### Global handler di bootstrap

```dart
Future<void> bootstrap(Widget Function() builder) async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (details) {
    FlutterError.presentError(details);                   // tetap tampil di console debug
    reporter.fatal(details.exception, details.stack);
  };
  PlatformDispatcher.instance.onError = (error, stack) {  // error async yang tidak tertangkap
    reporter.fatal(error, stack);
    return true;
  };

  // Ganti layar merah di release dengan UI yang aman
  ErrorWidget.builder = (details) => kReleaseMode
      ? const Center(child: Text('Bagian ini gagal dimuat'))
      : ErrorWidget(details.exception);

  runApp(builder());
}
```

### State error di halaman & retry

```dart
BlocBuilder<OrdersCubit, OrdersState>(
  builder: (context, s) => switch (s) {
    OrdersLoading() => const LoadingView(),
    OrdersLoaded(:final items) when items.isEmpty => const EmptyView(message: 'Belum ada transaksi'),
    OrdersLoaded(:final items) => OrderList(items: items),
    OrdersFailure(:final failure) => ErrorView(
        message: failureMessage(context, failure),
        onRetry: failure is UnauthorizedFailure ? null : () => context.read<OrdersCubit>().load(),
      ),
  },
);
```

### Logging terstruktur

```dart
abstract interface class AppLogger {
  void info(String msg, {Map<String, Object?> ctx});
  void warn(String msg, {Map<String, Object?> ctx});
  void error(String msg, Object error, StackTrace st, {Map<String, Object?> ctx});
}
// Implementasi debug → console; release → crash reporter (breadcrumb) dengan redaksi field sensitif
```

## Best Practices

- **Map error sekali di batas data layer**; lapisan atas hanya mengenal `Failure`.
- **Bedakan exception (ditangani) dan error (bug)** — jangan `catch (e)` semua lalu diam.
- **Setiap state error punya aksi** (coba lagi, login ulang, perbaiki input, hubungi support).
- **Offline bukan error fatal** untuk app offline-first — tampilkan sebagai status ("akan dikirim otomatis").
- **Global handler + crash reporter** di release; laporkan non-fatal penting dengan konteks (fitur, versi) tanpa PII.
- **Validasi input lokal sebelum request** untuk mengurangi error server; tetap tangani `ValidationFailure` dari server per field.
- **`context.mounted`/`mounted` setelah `await`** sebelum menampilkan dialog/snackbar.

## Anti-Patterns

- `catch (e) {}` atau `catch (e) { print(e); }`.
- Menampilkan `e.toString()` ke user.
- Melempar `Exception('...')` string generik dari repository — sulit dibedakan di UI.
- Menangkap `Error` (mis. `TypeError`) untuk "mencegah crash" → menyembunyikan bug.
- Logging yang sama di setiap layer → satu error muncul lima kali di log.
- Retry otomatis tanpa batas untuk error permanen (4xx validasi).

## Performance Considerations

- Membuat & mengirim laporan error itu murah, tetapi hindari melaporkan error yang sama ribuan kali dalam loop (rate-limit/dedup non-fatal).
- Stack trace besar di log release memperbesar payload — kirim ke crash reporter, bukan ke analytics.
- `ErrorWidget` di release yang ringan mencegah layout mahal saat error berulang.

## Security Considerations

- Pesan ke user tidak boleh berisi URL internal, query SQL, token, atau stack trace.
- Redaksi data sensitif di log/breadcrumb (token, nomor kartu, NIK, nomor HP lengkap).
- `UnauthorizedFailure` → bersihkan sesi dan arahkan ke login, jangan terus mencoba dengan token tidak valid.

## Real-World Use Cases

- **Checkout offline**: `NetworkFailure` saat sync → transaksi tetap tersimpan, banner "Menunggu koneksi".
- **Form registrasi pelanggan**: `ValidationFailure` dari server dipetakan ke field yang tepat.
- **Crash dashboard**: non-fatal `StorageFailure` meningkat setelah rilis → indikasi migrasi DB bermasalah.

## Interview Questions

1. Apa beda `Exception` dan `Error` di Dart?
2. Bagaimana menangkap error async yang tidak tertangani di Flutter?
3. Di layer mana error library dipetakan, dan mengapa?
4. Bagaimana menampilkan error validasi dari server per field?
5. Apa yang Anda kirim ke crash reporter dan apa yang tidak?

## Sample Answers

1. `Exception` mewakili kondisi yang dapat diantisipasi dan ditangani (timeout, format salah). `Error` menandakan bug program yang seharusnya diperbaiki, bukan ditangkap untuk disembunyikan.
2. `FlutterError.onError` untuk error framework (build/layout/paint) dan `PlatformDispatcher.instance.onError` untuk error async yang lolos dari zona root; keduanya diteruskan ke crash reporter.
3. Di data layer (repository/data source), agar domain dan UI tidak bergantung pada tipe exception library dan pemetaan konsisten di satu tempat.
4. Server mengirim Problem Details dengan daftar `errors[{field, code}]`; data layer memetakannya ke `ValidationFailure(fieldErrors)`; Bloc menyimpannya di state form; widget menampilkan `errorText` per field dari pesan lokal.
5. Exception, stack trace, versi app, fitur/route, perangkat, breadcrumb non-sensitif; tidak mengirim token, password, data pribadi lengkap, atau isi request sensitif.

## Practical Exercises

1. Buat hierarki `Failure` dan fungsi `guard()`; refactor dua repository memakainya.
2. Pasang global handler + crash reporter dan picu error async untuk memastikan tercatat.
3. Implementasikan error validasi per field dari respons Problem Details.

## Quick Reference

```text
Exception = ditangani · Error = bug (perbaiki) · map → Failure di data layer · Result<T> ke atas
UI: switch(Failure) → pesan lokal + aksi · offline ≠ fatal di app offline-first
bootstrap: FlutterError.onError + PlatformDispatcher.onError + ErrorWidget.builder (release)
Log sekali, terstruktur, ter-redaksi · mounted setelah await
```

## Related Topics

- [REST API Integration](/flutter/rest-api-integration/)
- [Firebase Integration (Crashlytics)](/flutter/firebase-integration/)
- [Logging & Error Tracking](/testing-performance/logging-error-tracking/)
- [Null Safety, Generics & Extensions](/flutter/null-safety-generics-extensions/)
- Referensi resmi: [Handling errors in Flutter](https://docs.flutter.dev/testing/errors), [Dart error handling](https://dart.dev/language/error-handling).
