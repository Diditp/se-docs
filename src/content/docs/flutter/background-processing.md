---
title: "Background Processing"
description: "Menjalankan pekerjaan di luar UI Flutter: isolate untuk CPU, WorkManager untuk tugas tertunda yang dijamin, foreground service untuk pekerjaan panjang yang terlihat user, serta batasan Android & iOS."
level: advanced
status: complete
version: "Flutter 3.x · workmanager · Android 14+ · iOS 17+"
updated: 2026-11-12
tags: [flutter, background, workmanager, isolate, android, ios]
---

## Overview

"Background" punya tiga arti yang sering tertukar:

| Jenis | Kapan | Alat di Flutter |
| --- | --- | --- |
| **Di luar thread UI**, app tetap terbuka | Parsing JSON besar, enkripsi, kompresi | `Isolate.run` / `compute` |
| **Tertunda & dijamin**, walau app ditutup | Sync data, upload log, backup | `workmanager` (Android WorkManager, iOS BGTaskScheduler) |
| **Panjang & terlihat user** | Navigasi/tracking lokasi, upload besar, pemutar audio | Foreground service (Android), mode background khusus (iOS) |

## Why It Matters

Sistem operasi modern agresif menghemat baterai: Android punya Doze, App Standby Buckets, dan pembatasan foreground
service; iOS hampir tidak mengizinkan app berjalan di background tanpa alasan yang jelas. Asumsi "timer jalan terus di
background" pasti gagal di device nyata — data tidak tersinkron, user mengira transaksi sudah terkirim.

## Core Concepts

- **Isolate** — paralelisme CPU selama proses app hidup; hilang saat app dimatikan.
- **WorkManager (Android)** — menjadwalkan pekerjaan yang **pasti dieksekusi** dengan constraint (jaringan, charging), retry backoff, bertahan reboot. Periodic minimum **15 menit**.
- **BGTaskScheduler (iOS)** — iOS yang menentukan *kapan* task berjalan (berdasarkan pola pemakaian, baterai); tidak ada jaminan interval.
- **Foreground service (Android)** — pekerjaan panjang dengan notifikasi permanen; Android 14+ mewajibkan **tipe** foreground service yang sesuai (dataSync, location, mediaPlayback, …) beserta izinnya.
- **Headless execution** — callback Dart dijalankan di isolate/engine baru tanpa UI; harus inisialisasi dependency sendiri.

## How It Works

```text
App ditutup
   │
   ├─ Android: WorkManager menyimpan job di database sistem → menjalankan saat constraint terpenuhi
   │            → membuat Flutter engine headless → memanggil callbackDispatcher (top-level Dart)
   └─ iOS: BGTaskScheduler memutuskan kapan (bisa jam kemudian, atau tidak sama sekali bila app jarang dipakai)
```

Karena callback berjalan di isolate baru, **state di memori app (singleton, Bloc, cache) tidak tersedia** — inisialisasi
ulang database, DI, dan konfigurasi di dalam callback.

## Implementation

### Isolate untuk pekerjaan CPU

```dart
final compressed = await Isolate.run(() => compressJpeg(rawBytes, quality: 75));
```

### WorkManager: sync periodik & sekali jalan

```dart
const syncTask = 'outbox-sync';

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, input) async {
    WidgetsFlutterBinding.ensureInitialized();
    final container = await buildBackgroundContainer();      // DB, Dio, token store — instance baru
    try {
      final result = await container.syncService.sync();     // idempotent, push lalu pull
      return result.isSuccess;                               // false → WorkManager retry dengan backoff
    } catch (e, st) {
      await container.crashReporter.recordError(e, st);
      return false;
    } finally {
      await container.dispose();
    }
  });
}

Future<void> scheduleSync() async {
  await Workmanager().initialize(callbackDispatcher);
  await Workmanager().registerPeriodicTask(
    'periodic-sync', syncTask,
    frequency: const Duration(minutes: 15),                  // minimum Android
    constraints: Constraints(networkType: NetworkType.connected, requiresBatteryNotLow: true),
    backoffPolicy: BackoffPolicy.exponential,
    backoffPolicyDelay: const Duration(minutes: 1),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
  );
}

// Setelah transaksi dibuat: minta sync secepatnya (tetap patuh constraint)
Future<void> requestSyncSoon() => Workmanager().registerOneOffTask(
      'sync-now', syncTask,
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingWorkPolicy.replace,
    );
```

iOS memerlukan konfigurasi tambahan: `BGTaskSchedulerPermittedIdentifiers` di `Info.plist`, Background Modes
(*Background fetch* / *Background processing*), dan registrasi di `AppDelegate` sesuai dokumentasi plugin.

### Strategi sync yang realistis (gabungan pemicu)

```text
1. Langsung setelah aksi user (app terbuka)           → sync in-process (cepat, terlihat)
2. Saat koneksi kembali / app resume                  → sync in-process
3. WorkManager one-off "sync-now" dengan constraint   → menjamin terkirim walau app ditutup (Android)
4. WorkManager periodik 15 menit                      → jaring pengaman
5. Tampilkan status "X transaksi belum tersinkron"    → transparan ke user, khususnya di iOS
```

### Foreground service (Android) — hanya bila benar perlu

```xml
<!-- AndroidManifest.xml (Android 14+: tipe & izin wajib) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<service android:name=".UploadService" android:foregroundServiceType="dataSync" android:exported="false" />
```

Untuk upload besar yang dimulai user, lebih disarankan WorkManager dengan *expedited/long-running work* (setForeground) daripada service manual.

:::caution[Version-dependent]
Aturan background berubah hampir setiap versi Android/iOS (batas exact alarm, tipe foreground service, kuota expedited work,
izin notifikasi). Uji di versi OS target dan baca changelog plugin `workmanager`.
:::

## Best Practices

- **Pilih alat sesuai jenis pekerjaan** (tabel di Overview) — jangan memakai timer Dart untuk pekerjaan yang harus bertahan setelah app ditutup.
- **Pekerjaan background idempotent & dapat diulang** — sistem bisa menjalankan ulang atau menghentikan di tengah jalan.
- **Inisialisasi dependency di callback** (DB, Dio, token) dan tutup setelah selesai.
- **Constraint jaringan & baterai** untuk sync; backoff eksponensial.
- **Jangan berasumsi iOS akan menjalankan task** — sediakan sync saat app dibuka dan indikator data pending.
- **Logging & crash reporting di callback** — error background mudah tidak terlihat.
- **Uji dengan alat platform**: `adb shell dumpsys jobscheduler`, App Inspection → Background Task Inspector (Android Studio).

## Anti-Patterns

- `Timer.periodic` untuk sync saat app di background.
- Mengakses singleton/Bloc dari callback background (isolate berbeda → instance kosong).
- Foreground service tanpa alasan kuat (ditolak Play Store policy / mengganggu user).
- Tugas background yang lama tanpa checkpoint → dihentikan sistem dan mulai ulang dari nol.
- Menjadwalkan ulang periodic task setiap app start dengan policy `replace` → interval tidak pernah tercapai.

## Performance Considerations

- Background work menghabiskan baterai & data — batasi frekuensi, gabungkan pekerjaan (batch), dan gunakan constraint.
- Isolate punya biaya spawn & copy data; untuk banyak tugas kecil gunakan isolate jangka panjang.
- Android App Standby Buckets menurunkan frekuensi job untuk app yang jarang dipakai.

## Security Considerations

- Callback background membaca token dari secure storage; pastikan akses Keychain di iOS memakai accessibility yang mengizinkan saat device terkunci bila memang diperlukan (`first_unlock`), dengan pertimbangan risikonya.
- Jangan menulis data sensitif ke log background.
- Hentikan/cancel semua task terjadwal saat logout (`Workmanager().cancelAll()`).

## Real-World Use Cases

- **POS**: outbox sync via WorkManager one-off + periodik; badge "3 transaksi belum terkirim".
- **Field app**: upload foto bukti saat Wi-Fi/charging tersedia.
- **Aplikasi logistik**: tracking lokasi dengan foreground service tipe `location` dan notifikasi permanen.

## Interview Questions

1. Apa beda isolate dan WorkManager?
2. Mengapa periodic sync di Android minimum 15 menit, dan bagaimana dengan iOS?
3. Apa yang perlu diperhatikan saat menulis callback background di Flutter?
4. Kapan memakai foreground service?
5. Bagaimana memastikan transaksi offline akhirnya terkirim?

## Sample Answers

1. Isolate memindahkan komputasi ke thread lain selama app hidup; WorkManager menjadwalkan pekerjaan yang dijalankan sistem bahkan setelah app ditutup atau device reboot, dengan constraint dan retry.
2. Itu batas WorkManager/JobScheduler untuk menghemat baterai. Di iOS tidak ada jaminan interval — BGTaskScheduler menjalankan task berdasarkan heuristik sistem, sehingga sync juga harus dilakukan saat app dibuka.
3. Fungsi top-level dengan `@pragma('vm:entry-point')`, inisialisasi binding & dependency sendiri karena isolate baru, idempotent, singkat, menangani error dan mengembalikan status untuk retry, serta menutup resource.
4. Untuk pekerjaan panjang yang dimulai/diketahui user dan harus terus berjalan (navigasi, tracking, pemutaran media, upload besar), dengan notifikasi permanen dan tipe service yang sesuai di Android 14+.
5. Outbox di DB lokal dalam transaksi yang sama, sync idempotent; pemicu berlapis (setelah aksi, saat online/resume, WorkManager one-off & periodik); status pending ditampilkan ke user.

## Practical Exercises

1. Implementasikan `callbackDispatcher` yang menjalankan sync outbox dan uji dengan mematikan jaringan lalu menyalakannya kembali.
2. Gunakan Background Task Inspector untuk melihat status, retry, dan constraint job.
3. Tampilkan indikator jumlah transaksi pending di app bar.

## Quick Reference

```text
CPU berat (app terbuka) → Isolate.run · Tertunda & dijamin → WorkManager (periodik ≥15 mnt, constraint, backoff)
Panjang & terlihat user → foreground service (Android 14+: tipe + izin) · iOS: tidak ada jaminan → sync saat app dibuka
Callback: top-level + @pragma('vm:entry-point') + init DI sendiri + idempotent + return false untuk retry
```

## Related Topics

- [Async Programming](/flutter/async-programming/)
- [Offline-First Application](/flutter/offline-first/)
- [WorkManager (Android)](/android/workmanager/)
- [Background Services (Android)](/android/background-services/)
- Referensi: [workmanager plugin](https://pub.dev/packages/workmanager), [Android background work guide](https://developer.android.com/develop/background-work), [Flutter background processes](https://docs.flutter.dev/packages-and-plugins/background-processes).
