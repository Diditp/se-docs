---
title: "Background Services"
description: "Pekerjaan background di Android modern: batasan background (Doze, App Standby Buckets, background start restrictions), foreground service dan tipe wajib, bound service, AlarmManager & exact alarm, FCM high-priority sebagai pemicu, serta memilih alat yang tepat dan implikasinya untuk Flutter."
level: advanced
status: complete
version: "Android 8–15 — aturan background sangat bergantung versi; cek dokumentasi resmi"
updated: 2026-11-13
tags: [android, service, foreground-service, doze, background]
---

## Overview

Android memprioritaskan baterai dan privasi, sehingga **pekerjaan background makin dibatasi** di setiap versi. Pilihan
modern: **WorkManager** untuk pekerjaan tertunda yang harus selesai, **foreground service** untuk pekerjaan yang sedang
berlangsung dan terlihat pengguna, **AlarmManager** untuk waktu tepat, dan **FCM** untuk memicu pekerjaan dari server.

## Why It Matters

Banyak aplikasi lapangan (pelacakan kurir, upload, sinkronisasi, printer) bergantung pada background. Implementasi yang
salah menyebabkan pekerjaan berhenti tiba-tiba di perangkat tertentu, crash `ForegroundServiceStartNotAllowedException`,
atau aplikasi ditolak Play karena tipe foreground service yang tidak sesuai.

## Core Concepts

| Mekanisme | Kegunaan | Catatan |
| --- | --- | --- |
| WorkManager | Sync, upload, cleanup yang dapat ditunda | Persisten, menghormati Doze; lihat [WorkManager](/android/workmanager/) |
| Foreground service (FGS) | Pekerjaan berkelanjutan yang disadari user (navigasi, pelacakan aktif, pemutaran, panggilan) | Wajib notifikasi; Android 14+ wajib `foregroundServiceType` + izinnya |
| Bound service | Komponen lain terikat & berkomunikasi selama terhubung | Untuk IPC/klien-server dalam app |
| Started service (background) | Dulu umum; sejak Android 8 sangat dibatasi saat app di background | Hindari untuk kode baru |
| AlarmManager | Pemicu pada waktu tertentu | Exact alarm butuh izin khusus (`SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` sesuai kasus) |
| FCM high-priority | Server membangunkan app untuk pekerjaan mendesak | Gunakan untuk pesan yang benar-benar terlihat user |

### Batasan sistem

| Fitur | Efek |
| --- | --- |
| Doze | Saat perangkat diam & layar mati, jaringan & job ditunda ke jendela maintenance |
| App Standby Buckets | Frekuensi job/alarm dibatasi menurut seberapa sering app dipakai |
| Background execution limits (8+) | Tidak bisa memulai service background saat app di background |
| FGS start restriction (12+) | Tidak bisa memulai FGS dari background kecuali pengecualian tertentu |
| Battery optimization OEM | Beberapa produsen lebih agresif mematikan app |

## How It Works

```text
Butuh berjalan SEKARANG dan user tahu? ─ya→ Foreground service (dengan tipe & notifikasi)
          │tidak
Harus selesai walau app ditutup? ─ya→ WorkManager (constraint + backoff)
          │tidak
Waktu tepat (pengingat jam 08.00)? ─ya→ AlarmManager (exact bila benar-benar perlu)
          │tidak
Hanya selama layar terbuka → coroutine di viewModelScope
```

## Implementation

### Foreground service untuk pelacakan lokasi kurir (Android 14+)

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<service
    android:name=".tracking.DeliveryTrackingService"
    android:exported="false"
    android:foregroundServiceType="location" />
```

```kotlin
@AndroidEntryPoint
class DeliveryTrackingService : LifecycleService() {
    @Inject lateinit var tracker: LocationTracker

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        val notification = NotificationCompat.Builder(this, CHANNEL_TRACKING)
            .setContentTitle("Pengantaran aktif")
            .setContentText("Lokasi dibagikan ke pelanggan")
            .setSmallIcon(R.drawable.ic_delivery)
            .setOngoing(true)
            .build()
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
        )
        lifecycleScope.launch { tracker.updates().collect { sendLocation(it) } }
        return START_STICKY
    }
}

// Dimulai dari UI (app di foreground) setelah izin lokasi diberikan
ContextCompat.startForegroundService(context, Intent(context, DeliveryTrackingService::class.java))
```

### Pengingat waktu tepat dengan AlarmManager

```kotlin
val alarmManager = context.getSystemService(AlarmManager::class.java)
if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()) {
    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
} else {
    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)   // tidak tepat
}
```

### FCM memicu sinkronisasi

```kotlin
class PosMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["type"] == "catalog_updated") {
            WorkManager.getInstance(this).enqueueUniqueWork(
                "sync-catalog", ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<SyncCatalogWorker>().build(),
            )
        }
    }
}
```

### Flutter

Plugin background (mis. `workmanager`, plugin foreground service/geolocation) memakai mekanisme yang sama di bawahnya.
Konsekuensinya: tipe FGS dan izin tetap harus dideklarasikan di `AndroidManifest.xml` proyek Flutter, dan callback Dart
berjalan di isolate terpisah. iOS memiliki model berbeda (background modes, BGTaskScheduler) — rancang fitur agar tetap
berguna walau background tidak berjalan.

## Best Practices

- **Pilih alat sesuai kebutuhan** (pohon keputusan di atas).
- **FGS hanya untuk pekerjaan yang disadari pengguna**, dengan notifikasi jelas dan tombol berhenti.
- **Deklarasikan tipe FGS yang tepat** dan izin terkait.
- **Hentikan service segera** setelah selesai (`stopSelf`, `stopForeground`).
- **Rancang idempoten & tahan dihentikan** — sistem dapat menghentikan proses kapan saja.
- **Uji Doze**: `adb shell dumpsys deviceidle force-idle`.

## Anti-Patterns

- Service background tanpa henti untuk polling server.
- Foreground service "palsu" demi menjaga app tetap hidup.
- Exact alarm untuk hal yang tidak membutuhkan presisi.
- Memulai FGS dari background (crash di Android 12+).
- Meminta pengguna mematikan optimasi baterai tanpa alasan kuat.

## Performance Considerations

Pekerjaan background menghabiskan baterai dan data. Gunakan batching, constraint, interval longgar, dan push dari server
alih-alih polling. Pantau metrik Android vitals (wake locks berlebihan, background usage).

## Security Considerations

Set `android:exported="false"` untuk service internal, validasi Intent yang diterima, dan jangan menampilkan data
sensitif di notifikasi FGS (terlihat di lock screen). Lokasi background hanya bila benar-benar dibutuhkan dan
diungkapkan kepada pengguna.

## Real-World Use Cases

- Pelacakan lokasi kurir selama pengantaran aktif (FGS tipe location).
- Upload video inspeksi besar (WorkManager + `setForeground` untuk pekerjaan panjang).
- Pengingat jadwal kunjungan teknisi (AlarmManager).
- Sinkronisasi katalog yang dipicu FCM.

## Interview Questions

1. Mengapa background service dibatasi di Android modern?
2. Kapan memakai foreground service vs WorkManager?
3. Apa yang berubah untuk foreground service di Android 14?
4. Apa itu Doze dan dampaknya?
5. Bagaimana server bisa memicu pekerjaan di aplikasi?

## Sample Answers

1. Untuk menghemat baterai dan melindungi privasi/performa — pekerjaan background tak terkendali menguras baterai dan memori, sehingga sistem membatasi eksekusi, menunda jaringan (Doze), dan membatasi frekuensi berdasarkan penggunaan app.
2. FGS untuk pekerjaan berkelanjutan yang sedang terjadi dan disadari pengguna (dengan notifikasi); WorkManager untuk pekerjaan yang dapat ditunda tetapi harus selesai, termasuk setelah app ditutup/reboot.
3. Setiap FGS wajib mendeklarasikan `foregroundServiceType` yang sesuai di manifest dan meminta izin tipe tersebut (mis. `FOREGROUND_SERVICE_LOCATION`), serta memenuhi syarat penggunaan tipe itu.
4. Mode hemat daya saat perangkat diam dan layar mati: akses jaringan, job, dan alarm ditunda ke jendela maintenance berkala; pekerjaan harus toleran terhadap penundaan.
5. Push FCM (data message, prioritas tinggi bila mendesak dan terlihat pengguna) yang kemudian menjadwalkan WorkManager untuk melakukan pekerjaan.

## Practical Exercises

1. Buat FGS pelacakan dengan tipe location dan tombol "Selesai" di notifikasi.
2. Uji perilaku sync WorkManager dalam mode Doze paksa.
3. Petakan semua pekerjaan background di aplikasi Anda ke alat yang tepat.

## Quick Reference

```text
Sekarang + disadari user → FGS (notifikasi + foregroundServiceType + izin, 14+)
Harus selesai, boleh ditunda → WorkManager · waktu tepat → AlarmManager (exact = izin) · dari server → FCM → WorkManager
Batasan: Doze · App Standby Buckets · background start limits (8+) · FGS start limits (12+)
Uji: adb shell dumpsys deviceidle force-idle · exported=false · idempoten
```

## Related Topics

- [WorkManager](/android/workmanager/)
- [Android Permissions](/android/permissions/)
- [Background Processing (Flutter)](/flutter/background-processing/)
