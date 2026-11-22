---
title: "Background Execution di iOS"
description: "Apa yang bisa dan tidak bisa berjalan di background iOS: waktu tambahan (beginBackgroundTask), BGTaskScheduler (app refresh & processing), background URLSession untuk upload/download, background modes (location, audio, VoIP, remote notifications), silent push, batasan & throttling sistem, serta strategi desain fitur Flutter yang andal di iOS."
level: advanced
status: complete
version: "iOS 13+ (BGTaskScheduler) — Apple terus menambah/mengubah API background; cek dokumentasi resmi"
updated: 2026-11-13
tags: [ios, background, bgtaskscheduler, urlsession, flutter]
---

## Overview

iOS jauh lebih ketat daripada Android untuk pekerjaan background. Tidak ada padanan WorkManager yang menjamin eksekusi
periodik; sistem memutuskan **kapan** (dan **apakah**) tugas background dijalankan berdasarkan baterai, jaringan, dan
pola penggunaan aplikasi. Kuncinya adalah **mendesain fitur agar tetap benar walau background tidak pernah berjalan**.

## Why It Matters

Fitur seperti "sinkronisasi otomatis setiap 15 menit" yang bekerja di Android sering tidak berjalan di iOS. Engineer
yang memahami batasan ini merancang alternatif (sync saat dibuka, push, background URLSession) sejak awal.

## Core Concepts

| Mekanisme | Kegunaan | Batasan |
| --- | --- | --- |
| `beginBackgroundTask` | Menyelesaikan tugas yang sedang berjalan saat masuk background | Waktu singkat (sekitar puluhan detik) |
| `BGAppRefreshTask` | Refresh konten ringan secara oportunistik | Durasi pendek; jadwal ditentukan sistem; bisa jarang/tidak berjalan |
| `BGProcessingTask` | Pekerjaan berat (cleanup, ML, sync besar) | Biasanya saat mengisi daya & idle; dapat diminta butuh jaringan/daya |
| Background `URLSession` | Upload/download besar yang berlanjut walau app suspend/dihentikan | Diproses sistem; app dibangunkan saat selesai |
| Background modes | Location, audio, VoIP, Bluetooth LE, remote notifications | Hanya untuk kasus yang sesuai; diperiksa App Review |
| Silent push (`content-available`) | Server membangunkan app untuk fetch | Di-throttle; tidak dijamin |
| Significant location change / region monitoring | Pemicu lokasi hemat daya | Butuh izin lokasi yang sesuai |

### Perbandingan dengan Android

| Kebutuhan | Android | iOS |
| --- | --- | --- |
| Sync periodik terjamin | WorkManager (≥15 mnt, tidak tepat waktu) | Tidak ada jaminan — BGAppRefresh oportunistik |
| Upload besar | WorkManager + foreground info | Background URLSession |
| Pelacakan aktif | Foreground service tipe location | Background mode location (dengan indikator) |
| Dipicu server | FCM data message → WorkManager | Silent push (di-throttle) / alert push |

## How It Works

```text
App masuk background → beberapa detik → suspended
BGTaskScheduler.submit(request) → sistem menyimpan permintaan → menjalankan "kapan-kapan" saat kondisi baik
  → launch handler dipanggil → kerjakan → setTaskCompleted(success:) → jadwalkan berikutnya
  → expirationHandler bila waktu habis → batalkan pekerjaan dengan rapi
Pengguna force-quit app dari app switcher → umumnya background task/silent push tidak berjalan sampai app dibuka lagi
```

## Implementation

### Registrasi BGTaskScheduler (Swift)

```xml
<!-- Info.plist -->
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array><string>com.example.pos.refresh</string></array>
<key>UIBackgroundModes</key>
<array><string>fetch</string><string>processing</string></array>
```

```swift
import BackgroundTasks

// Di application(_:didFinishLaunchingWithOptions:) — sebelum launch selesai
BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.example.pos.refresh", using: nil) { task in
  handleRefresh(task as! BGAppRefreshTask)
}

func scheduleRefresh() {
  let request = BGAppRefreshTaskRequest(identifier: "com.example.pos.refresh")
  request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)   // paling cepat; bukan jaminan
  try? BGTaskScheduler.shared.submit(request)
}

func handleRefresh(_ task: BGAppRefreshTask) {
  scheduleRefresh()                                               // jadwalkan berikutnya
  let work = Task { try await SyncService.shared.pushPendingOutbox(limit: 20) }
  task.expirationHandler = { work.cancel() }
  Task {
    let ok = (try? await work.value) != nil
    task.setTaskCompleted(success: ok)
  }
}
```

### Dari Flutter

Plugin seperti `workmanager` atau `background_fetch` membungkus BGTaskScheduler di iOS — tetap perlu `Info.plist`
(identifier & background modes) dan callback Dart berjalan di isolate terpisah. Perlakukan jadwalnya sebagai "bonus".

### Strategi sinkronisasi yang andal di kedua platform

```text
1. Sync saat app dibuka & saat resumed (paling andal)
2. Sync segera setelah aksi penting (transaksi baru) selama app aktif
3. beginBackgroundTask saat masuk background untuk menyelesaikan antrian yang sedang dikirim
4. Android: WorkManager periodik · iOS: BGAppRefreshTask oportunistik
5. Push dari server untuk perubahan penting (alert; silent sebagai bonus)
6. UI selalu menampilkan status: "3 transaksi belum tersinkron"
```

### Upload foto besar

Gunakan background `URLSession` (atau plugin yang memakainya, mis. untuk upload/download latar belakang) agar transfer
berlanjut walau aplikasi suspend; simpan status di database lokal dan rekonsiliasi saat app dibuka.

## Best Practices

- **Desain offline-first**: kebenaran data tidak bergantung pada background.
- **Sync saat foreground** sebagai jalur utama di iOS.
- **Tugas background idempoten, singkat, dan dapat dibatalkan** (`expirationHandler`).
- **Background mode hanya bila fitur benar-benar membutuhkannya** (App Review memeriksa).
- **Uji di perangkat nyata**; di Xcode Anda dapat memicu task saat debug untuk pengujian.

## Anti-Patterns

- Menjanjikan "sync otomatis tiap 15 menit" di iOS.
- Audio/location background mode palsu untuk menjaga app hidup (ditolak review).
- Silent push sebagai satu-satunya mekanisme sinkronisasi.
- Tidak menangani `expirationHandler` (sistem dapat menghukum app dengan menjadwalkan lebih jarang).

## Performance Considerations

iOS belajar dari pola penggunaan: aplikasi yang sering dipakai dan tugas background yang cepat cenderung diberi
kesempatan lebih sering. Pekerjaan berat sebaiknya `BGProcessingTask` yang meminta kondisi mengisi daya.

## Security Considerations

Tugas background berjalan saat perangkat mungkin terkunci — data di Keychain dengan kelas akses
`WhenUnlocked` tidak dapat dibaca. Gunakan kelas `AfterFirstUnlock` untuk token yang dibutuhkan background, dengan
pertimbangan risiko. Jangan mengirim data sensitif di silent push.

## Real-World Use Cases

- Aplikasi kasir: sync saat dibuka + BGAppRefresh oportunistik + status tersinkron di UI.
- Upload foto inspeksi besar dengan background URLSession.
- Aplikasi kurir: background location hanya selama pengantaran aktif.

## Interview Questions

1. Apa beda background di iOS dan Android?
2. Apa itu BGTaskScheduler dan batasannya?
3. Bagaimana memastikan data tersinkron di iOS bila background tidak berjalan?
4. Kapan memakai background URLSession?
5. Mengapa silent push tidak boleh diandalkan?

## Sample Answers

1. Android menyediakan WorkManager dengan eksekusi yang (pada akhirnya) terjamin dan foreground service; iOS menangguhkan app dengan cepat dan hanya menyediakan eksekusi background oportunistik yang dijadwalkan sistem atau background mode khusus.
2. API untuk meminta waktu background (app refresh singkat, processing berat); sistem yang menentukan waktu eksekusi, `earliestBeginDate` hanyalah batas paling cepat, dan tugas dapat tidak berjalan sama sekali.
3. Offline-first dengan database lokal & outbox, sync saat app dibuka/resumed dan setelah aksi penting, `beginBackgroundTask` untuk menyelesaikan antrian, BGAppRefresh sebagai tambahan, serta indikator status sinkron.
4. Untuk upload/download besar yang harus berlanjut walau app suspend atau dihentikan — transfer dikelola sistem.
5. Apple men-throttle pengiriman silent push berdasarkan kondisi perangkat dan frekuensi, dan tidak dikirim bila app di-force-quit, sehingga tidak dijamin sampai.

## Practical Exercises

1. Tambahkan indikator "belum tersinkron" di aplikasi Anda dan sync saat resumed.
2. Implementasikan BGAppRefreshTask sederhana dan uji pemicuannya saat debug.
3. Buat tabel perbandingan mekanisme background Android vs iOS untuk fitur aplikasi Anda.

## Quick Reference

```text
iOS: suspend cepat · tidak ada jaminan periodik
beginBackgroundTask (singkat) · BGAppRefreshTask (oportunistik) · BGProcessingTask (berat, charging)
Background URLSession (upload/download besar) · background modes sesuai kasus · silent push di-throttle
Andalkan: sync saat foreground + offline-first + status di UI
```

## Related Topics

- [iOS App & Scene Lifecycle](/ios/ios-app-lifecycle/)
- [WorkManager (Android)](/android/workmanager/)
- [Background Processing (Flutter)](/flutter/background-processing/)
