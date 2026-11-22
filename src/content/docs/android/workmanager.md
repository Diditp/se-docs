---
title: "WorkManager"
description: "WorkManager untuk pekerjaan background yang harus terjamin: OneTime vs Periodic, CoroutineWorker, constraints, backoff & retry, unique work, chaining, input/output data, expedited work, progress, Hilt integration, testing, dan hubungannya dengan plugin Flutter."
level: intermediate
status: complete
version: "WorkManager 2.9+ · Android 8–15"
updated: 2026-11-13
tags: [android, workmanager, background, sync, scheduling]
---

## Overview

**WorkManager** adalah API yang direkomendasikan untuk **pekerjaan background yang dapat ditunda tetapi harus selesai**,
bahkan jika aplikasi ditutup atau perangkat di-restart: sinkronisasi data, upload foto, membersihkan cache, mengirim log.
WorkManager memilih mekanisme sistem yang tepat (JobScheduler, dll.) dan menghormati batasan baterai Android.

## Why It Matters

Android membatasi pekerjaan background (Doze, App Standby, batasan service background). Thread biasa atau coroutine di
`Application` akan mati bersama proses. WorkManager adalah cara yang andal untuk sync offline-first — dan plugin Flutter
`workmanager` memakainya di Android.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| `CoroutineWorker` | Worker berbasis coroutine (`suspend fun doWork()`) |
| `Result` | `success()`, `retry()`, `failure()` |
| `OneTimeWorkRequest` | Dijalankan sekali |
| `PeriodicWorkRequest` | Berulang; interval minimum 15 menit, waktu tepat tidak dijamin |
| Constraints | Jaringan, baterai tidak lemah, sedang mengisi daya, storage cukup, idle |
| Backoff | `EXPONENTIAL`/`LINEAR` dengan delay awal (minimum 10 detik) |
| Unique work | `enqueueUniqueWork(name, policy, request)` — mencegah duplikasi |
| Chaining | `beginWith(a).then(b).enqueue()` |
| Expedited | Pekerjaan penting yang perlu segera (kuota terbatas) |
| Persisted | Antrian disimpan di database internal → bertahan reboot |

### Kapan memakai apa

| Kebutuhan | Alat |
| --- | --- |
| Harus selesai walau app ditutup (sync, upload) | WorkManager |
| Sedang berjalan dan terlihat user (navigasi, rekam, pelacakan aktif) | Foreground service |
| Hanya selama layar terbuka | Coroutine di `viewModelScope` |
| Waktu tepat (alarm, pengingat jam tertentu) | `AlarmManager` (dengan izin exact alarm bila perlu) |
| Dipicu server | Push notification (FCM) → enqueue WorkManager |

## How It Works

```text
enqueue(request) → disimpan di DB internal WorkManager → constraint terpenuhi → doWork()
  Result.retry() → dijadwalkan ulang dengan backoff
  proses dimatikan / reboot → antrian tetap ada → dijalankan lagi saat kondisi terpenuhi
Pekerjaan normal punya batas waktu eksekusi (≈10 menit); pekerjaan panjang → setForeground (foreground service)
```

## Implementation

### Worker sinkronisasi outbox (Hilt)

```kotlin
@HiltWorker
class SyncOutboxWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val syncRepository: SyncRepository,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        val pushed = syncRepository.pushPendingOutbox(batchSize = 50)    // idempoten: event id unik
        syncRepository.pullChanges()
        Result.success(workDataOf("pushed" to pushed))
    } catch (e: IOException) {
        if (runAttemptCount < 5) Result.retry() else Result.failure()
    } catch (e: HttpException) {
        if (e.code() in 500..599) Result.retry() else Result.failure()   // 4xx: data bermasalah, jangan retry tanpa akhir
    }

    companion object { const val UNIQUE_NAME = "sync-outbox" }
}
```

### Menjadwalkan

```kotlin
val constraints = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)
    .setRequiresBatteryNotLow(true)
    .build()

// Periodik: setiap ±15 menit saat ada jaringan
val periodic = PeriodicWorkRequestBuilder<SyncOutboxWorker>(15, TimeUnit.MINUTES)
    .setConstraints(constraints)
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
    .build()
WorkManager.getInstance(context)
    .enqueueUniquePeriodicWork(SyncOutboxWorker.UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, periodic)

// Sekali, segera setelah transaksi baru dibuat
val now = OneTimeWorkRequestBuilder<SyncOutboxWorker>()
    .setConstraints(constraints)
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .build()
WorkManager.getInstance(context).enqueueUniqueWork("sync-now", ExistingWorkPolicy.REPLACE, now)
```

Catatan: pekerjaan *expedited* di Android versi lama dapat membutuhkan `getForegroundInfo()` — cek dokumentasi.

### Chaining: kompres foto lalu upload

```kotlin
WorkManager.getInstance(context)
    .beginUniqueWork("upload-${ticketId}", ExistingWorkPolicy.KEEP, compressRequest)
    .then(uploadRequest)
    .enqueue()
```

### Mengamati status di UI

```kotlin
val syncInfo: Flow<List<WorkInfo>> =
    WorkManager.getInstance(context).getWorkInfosForUniqueWorkFlow(SyncOutboxWorker.UNIQUE_NAME)
```

### Test

```kotlin
@Test fun syncSuccess() = runTest {
    val worker = TestListenableWorkerBuilder<SyncOutboxWorker>(context)
        .setWorkerFactory(TestFactory(fakeSyncRepository))
        .build()
    assertEquals(ListenableWorker.Result.success(workDataOf("pushed" to 3)), worker.doWork())
}
```

### Dari Flutter

Plugin `workmanager` (Android memakai WorkManager) menjalankan callback Dart di isolate terpisah — inisialisasi ulang
dependensi (database, HTTP client) di dalam callback, dan ingat data tetap harus idempoten. Di iOS, mekanisme background
jauh lebih terbatas (BGTaskScheduler), jadi jangan mengandalkan jadwal yang sama. Lihat
[Background Processing (Flutter)](/flutter/background-processing/).

## Best Practices

- **Unique work** untuk mencegah sync ganda.
- **Worker idempoten** — bisa dijalankan ulang kapan saja.
- **Bedakan retry (sementara) dan failure (permanen)**; batasi jumlah percobaan.
- **Constraint jaringan** untuk pekerjaan berbasis server.
- **Data input kecil** (ID), ambil data lengkap dari database di dalam worker.
- **Pantau status** (`WorkInfo`) dan tampilkan indikator sinkron di UI.

## Anti-Patterns

- Mengharapkan periodic work berjalan tepat setiap X menit.
- `enqueue` tanpa unique name setiap kali app dibuka → puluhan worker duplikat.
- Pekerjaan sangat panjang tanpa `setForeground` (dihentikan sistem).
- `Result.retry()` tanpa batas untuk error 4xx yang tidak akan pernah berhasil.
- Mengirim payload besar lewat `Data` (dibatasi ±10 KB).

## Performance Considerations

Gabungkan pekerjaan kecil menjadi batch, gunakan constraint agar berjalan saat kondisi baik (jaringan, baterai), dan
hindari periodic work yang tidak perlu. Expedited work memiliki kuota; gunakan hanya untuk tugas yang benar-benar
mendesak.

## Security Considerations

Worker berjalan tanpa UI — pastikan token diambil dari penyimpanan aman dan refresh token ditangani; jangan menulis data
sensitif ke `Data` input/output (tersimpan di database WorkManager). Hentikan/batalkan pekerjaan terkait pengguna saat
logout (`cancelUniqueWork`).

## Real-World Use Cases

- Sinkronisasi transaksi kasir offline setiap 15 menit dan segera setelah transaksi baru.
- Upload foto bukti pekerjaan teknisi lapangan saat mendapat jaringan.
- Pembersihan cache gambar mingguan saat perangkat mengisi daya.

## Interview Questions

1. Kapan memakai WorkManager dibanding coroutine biasa atau foreground service?
2. Apakah PeriodicWorkRequest berjalan tepat waktu?
3. Bagaimana mencegah worker duplikat?
4. Apa beda `Result.retry()` dan `Result.failure()`?
5. Apa yang terjadi pada pekerjaan yang dijadwalkan saat perangkat restart?

## Sample Answers

1. WorkManager untuk pekerjaan yang dapat ditunda tetapi harus selesai walau app ditutup/reboot; coroutine biasa untuk pekerjaan selama layar/proses aktif; foreground service untuk pekerjaan berkelanjutan yang terlihat pengguna saat ini.
2. Tidak — interval minimum 15 menit dan sistem dapat menunda sesuai Doze, constraint, dan optimasi baterai; untuk waktu tepat gunakan AlarmManager.
3. `enqueueUniqueWork`/`enqueueUniquePeriodicWork` dengan nama unik dan kebijakan (`KEEP`, `REPLACE`, `APPEND_OR_REPLACE`/`UPDATE`).
4. `retry` menjadwalkan ulang dengan backoff untuk kegagalan sementara (jaringan, 5xx); `failure` menandai gagal permanen dan menghentikan rantai.
5. WorkManager menyimpan antrian di database internal dan menjadwalkan ulang setelah reboot.

## Practical Exercises

1. Implementasikan `SyncOutboxWorker` dengan unique periodic + one-time expedited.
2. Tampilkan status sinkron dari `WorkInfo` di layar.
3. Uji worker dengan `TestListenableWorkerBuilder` untuk sukses, retry, dan failure.

## Quick Reference

```text
CoroutineWorker.doWork() → success/retry/failure · Constraints (network, battery) · Backoff EXPONENTIAL
OneTime vs Periodic (≥15 mnt, tidak tepat waktu) · enqueueUnique* · chaining · expedited (kuota)
Idempoten · Data kecil (ID) · runAttemptCount untuk batas retry · cancel saat logout
```

## Related Topics

- [Background Services](/android/background-services/)
- [Background Processing (Flutter)](/flutter/background-processing/)
- [Data Sync & Conflict Resolution](/flutter/data-sync-conflict-resolution/)
