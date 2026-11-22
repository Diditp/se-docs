---
title: "iOS App & Scene Lifecycle"
description: "Siklus hidup aplikasi iOS: state (not running, inactive, active, background, suspended), AppDelegate vs SceneDelegate/UIScene, termination oleh sistem, state restoration, pemetaannya ke AppLifecycleState di Flutter, dan perbedaannya dengan Android."
level: intermediate
status: complete
version: "iOS 13+ (UIScene) · Flutter 3.x — adopsi UIScene di Flutter bergantung versi"
updated: 2026-11-13
tags: [ios, lifecycle, uiscene, appdelegate, flutter]
---

## Overview

Aplikasi iOS berpindah antar **state** sesuai interaksi pengguna dan keputusan sistem. Berbeda dengan Android, iOS
**sangat cepat menangguhkan (suspend)** aplikasi di background: kode Anda berhenti berjalan beberapa saat setelah
pengguna keluar, kecuali memakai mekanisme background yang diizinkan.

## Why It Matters

Banyak bug "berjalan di Android, tidak di iOS" berasal dari asumsi bahwa aplikasi tetap berjalan di background: timer
berhenti, socket terputus, upload tidak selesai. Memahami lifecycle iOS penting untuk mendesain fitur Flutter yang andal
di kedua platform.

## Core Concepts

| State | Arti |
| --- | --- |
| Not running | Belum dijalankan atau sudah dihentikan |
| Inactive | Di foreground tetapi tidak menerima event (transisi, panggilan masuk, Control Center) |
| Active | Foreground dan menerima event |
| Background | Masih menjalankan kode untuk waktu singkat (atau lebih lama dengan background mode) |
| Suspended | Di memori tetapi tidak menjalankan kode; dapat dihentikan sistem tanpa pemberitahuan |

| Komponen | Peran |
| --- | --- |
| `UIApplicationDelegate` (AppDelegate) | Event tingkat aplikasi: launch, push token, URL (lama), background fetch |
| `UISceneDelegate` (SceneDelegate, iOS 13+) | Event per jendela/scene: foreground/background, URL, state restoration |
| `UIApplication.beginBackgroundTask` | Minta waktu tambahan singkat untuk menyelesaikan tugas saat masuk background |

### Pemetaan ke Flutter

| iOS | Flutter `AppLifecycleState` |
| --- | --- |
| Active | `resumed` |
| Inactive | `inactive` |
| Background (sebelum suspend) | `hidden` → `paused` |
| Terminated | `detached` (tidak selalu sempat terkirim) |

## How It Works

```text
Tap ikon → Not running → (launch) Inactive → Active
Home / pindah app → Active → Inactive → Background (± beberapa detik) → Suspended
Memori kurang / lama tidak dipakai → Suspended → Terminated (tanpa callback)
Buka lagi → bila masih suspended: Background → Inactive → Active (state Dart masih ada)
           bila sudah terminated: launch baru (state Dart hilang)
```

## Implementation

### Menyelesaikan tugas singkat saat masuk background (Swift)

```swift
var bgTask: UIBackgroundTaskIdentifier = .invalid

func flushOutbox() {
  bgTask = UIApplication.shared.beginBackgroundTask(withName: "flush-outbox") {
    UIApplication.shared.endBackgroundTask(self.bgTask)      // waktu habis → wajib diakhiri
    self.bgTask = .invalid
  }
  Task {
    try? await syncService.pushPending()
    UIApplication.shared.endBackgroundTask(bgTask)
    bgTask = .invalid
  }
}
```

### Memantau lifecycle di Flutter

```dart
class AppLifecycleWatcher extends StatefulWidget {
  const AppLifecycleWatcher({super.key, required this.child});
  final Widget child;
  @override
  State<AppLifecycleWatcher> createState() => _AppLifecycleWatcherState();
}

class _AppLifecycleWatcherState extends State<AppLifecycleWatcher> {
  late final AppLifecycleListener _listener;

  @override
  void initState() {
    super.initState();
    _listener = AppLifecycleListener(
      onHide: () => context.read<SyncService>().flushNow(),     // simpan/kirim sebelum ditangguhkan
      onResume: () => context.read<SessionService>().checkLock(),
    );
  }

  @override
  void dispose() {
    _listener.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
```

### State restoration

Di Flutter, gunakan `restorationScopeId` dan `RestorationMixin` untuk memulihkan state UI kecil setelah aplikasi
dihentikan sistem; data penting tetap disimpan di penyimpanan lokal (database, secure storage).

## Best Practices

- **Simpan data penting segera**, jangan menunggu `detached`/terminate.
- **Anggap aplikasi bisa dihentikan kapan saja** setelah masuk background.
- **Gunakan `beginBackgroundTask`** hanya untuk menyelesaikan tugas singkat yang sudah berjalan.
- **Sambungkan ulang socket/stream saat `resumed`**.
- **Kunci ulang layar sensitif** setelah lama di background.

## Anti-Patterns

- Timer/polling yang diharapkan tetap berjalan di background iOS.
- Menyimpan data hanya di `dispose`/`detached`.
- Mengandalkan perilaku Android yang lebih longgar sebagai acuan.
- Tidak mengakhiri background task (sistem dapat menghentikan app).

## Performance Considerations

Aplikasi suspended tetap di memori; aplikasi yang memakai memori besar lebih mungkin dihentikan. Bebaskan cache besar
saat masuk background atau menerima peringatan memori (`didReceiveMemoryWarning`) agar aplikasi tidak dihentikan.

## Security Considerations

iOS mengambil snapshot layar untuk app switcher saat masuk background — sembunyikan data sensitif (overlay/blur saat
`inactive`). Kunci ulang dengan PIN/biometrik setelah periode tertentu di background untuk aplikasi finansial.

## Real-World Use Cases

- Mengirim transaksi tertunda saat aplikasi kasir masuk background.
- Menutup koneksi WebSocket saat paused dan membukanya lagi saat resumed.
- Menyembunyikan saldo di snapshot app switcher.

## Interview Questions

1. Sebutkan state aplikasi iOS.
2. Apa beda background dan suspended?
3. Apa beda AppDelegate dan SceneDelegate?
4. Mengapa timer tidak berjalan di background iOS?
5. Bagaimana memetakan lifecycle iOS ke Flutter?

## Sample Answers

1. Not running, inactive, active, background, suspended.
2. Background masih menjalankan kode untuk waktu terbatas; suspended berada di memori tetapi tidak menjalankan kode sama sekali dan dapat dihentikan sistem tanpa pemberitahuan.
3. AppDelegate menangani event tingkat aplikasi (launch, push token); SceneDelegate (iOS 13+) menangani lifecycle per scene/jendela seperti masuk foreground/background dan URL.
4. Setelah masuk background, iOS segera menangguhkan aplikasi kecuali memakai background mode yang diizinkan atau waktu tambahan singkat; kode termasuk timer berhenti.
5. Active → `resumed`, inactive → `inactive`, background → `hidden`/`paused`, terminate → `detached` (tidak dijamin); pantau dengan `AppLifecycleListener`.

## Practical Exercises

1. Log semua perubahan `AppLifecycleState` di iPhone/simulator saat pindah aplikasi dan menerima panggilan.
2. Implementasikan flush outbox saat `onHide`.
3. Tambahkan overlay privasi saat aplikasi `inactive`.

## Quick Reference

```text
Not running → Inactive → Active → Background (singkat) → Suspended → (Terminated tanpa callback)
AppDelegate (aplikasi) · SceneDelegate (scene, iOS 13+) · beginBackgroundTask untuk tugas singkat
Flutter: resumed · inactive · hidden · paused · detached · AppLifecycleListener
Simpan segera · reconnect saat resumed · sembunyikan data sensitif di snapshot
```

## Related Topics

- [Background Execution di iOS](/ios/ios-background/)
- [Android Application & Process Lifecycle](/android/application-lifecycle/)
- [Widget Lifecycle (Flutter)](/flutter/widget-lifecycle/)
