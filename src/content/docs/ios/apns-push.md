---
title: "Push Notification: APNs & FCM"
description: "Push notification di iOS untuk aplikasi Flutter: arsitektur APNs, kunci .p8 token-based, capability Push & Background Modes, alur token APNs → FCM, izin notifikasi & provisional, notifikasi alert vs silent (content-available), Notification Service Extension untuk gambar, deep link dari notifikasi, testing, dan troubleshooting."
level: intermediate
status: complete
version: "iOS 15+ · firebase_messaging 15+ · perilaku pengiriman ditentukan Apple"
updated: 2026-11-13
tags: [ios, push-notification, apns, fcm, firebase]
---

## Overview

Di iOS, semua push notification dikirim melalui **Apple Push Notification service (APNs)**. Ketika memakai Firebase
Cloud Messaging (FCM) di Flutter, FCM bertindak sebagai perantara: server Anda → FCM → APNs → iPhone. Karena itu
konfigurasi iOS (kunci APNs, capability, izin) wajib benar — penyebab nomor satu "push jalan di Android tapi tidak di
iOS".

## Why It Matters

Notifikasi pesanan, status tiket, dan pengingat tagihan adalah fitur inti banyak aplikasi. Troubleshooting push iOS
adalah keterampilan praktis yang sangat dihargai.

## Core Concepts

| Komponen | Fungsi |
| --- | --- |
| APNs | Layanan Apple yang mengirim notifikasi ke perangkat |
| Device token APNs | Alamat perangkat+aplikasi; berubah bila app di-install ulang/restore |
| FCM registration token | Token FCM yang dipetakan ke token APNs |
| APNs auth key (.p8) | Kunci token-based (satu kunci untuk semua app di tim), diunggah ke Firebase |
| Capability "Push Notifications" | Entitlement `aps-environment` (development/production) |
| Background Modes → Remote notifications | Agar silent push dapat membangunkan app |
| Notification Service Extension | Memodifikasi notifikasi sebelum tampil (gambar, dekripsi) |

| Jenis | Payload | Perilaku |
| --- | --- | --- |
| Alert | `aps.alert` | Ditampilkan sistem walau app tertutup |
| Silent/background | `aps.content-available: 1` tanpa alert | Membangunkan app sebentar; **dibatasi/di-throttle**, tidak dijamin terkirim |
| Provisional | Izin `.provisional` | Dikirim senyap ke Notification Center tanpa dialog izin |

## How It Works

```text
App start → minta izin → registerForRemoteNotifications → APNs memberi device token
→ firebase_messaging memetakan ke FCM token → app mengirim FCM token ke backend
Backend → FCM HTTP v1 API (target token/topic) → FCM → APNs (pakai .p8) → perangkat
App foreground: notifikasi tidak otomatis tampil kecuali diatur (presentation options)
Tap notifikasi → app dibuka → handler membaca data → navigasi (deep link)
```

## Implementation

### Checklist konfigurasi

```markdown
- [ ] Apple Developer: buat APNs Auth Key (.p8), catat Key ID & Team ID
- [ ] Firebase Console → Project settings → Cloud Messaging → unggah .p8 (Key ID, Team ID)
- [ ] Xcode → Runner → Signing & Capabilities: + Push Notifications, + Background Modes (Remote notifications)
- [ ] GoogleService-Info.plist untuk bundle ID yang benar (per flavor)
- [ ] Izin notifikasi diminta di aplikasi
- [ ] Tes di perangkat fisik (atau simulator yang mendukung push di versi Xcode/macOS Anda)
```

### Flutter

```dart
Future<void> setupPush(ApiClient api) async {
  final messaging = FirebaseMessaging.instance;

  final settings = await messaging.requestPermission(alert: true, badge: true, sound: true);
  if (settings.authorizationStatus == AuthorizationStatus.denied) return;

  // Tampilkan notifikasi meski app sedang di foreground (iOS)
  await messaging.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

  // Di iOS, token FCM baru tersedia setelah token APNs ada
  final apnsToken = await messaging.getAPNSToken();
  if (apnsToken == null) { /* coba lagi nanti; jangan anggap error fatal */ }

  final token = await messaging.getToken();
  if (token != null) await api.registerDevice(token: token, platform: 'ios');
  messaging.onTokenRefresh.listen((t) => api.registerDevice(token: t, platform: 'ios'));

  // Tap notifikasi saat app di background
  FirebaseMessaging.onMessageOpenedApp.listen((m) => openFromPush(m.data));
  // App dibuka dari keadaan tertutup lewat notifikasi
  final initial = await messaging.getInitialMessage();
  if (initial != null) openFromPush(initial.data);
}

void openFromPush(Map<String, dynamic> data) {
  final orderId = data['order_id'];
  if (orderId is String && RegExp(r'^[A-Za-z0-9-]{1,40}$').hasMatch(orderId)) {
    router.go('/orders/$orderId');            // validasi sebelum navigasi
  }
}
```

### Payload dari backend (FCM HTTP v1)

```json
{
  "message": {
    "token": "<fcm-token>",
    "notification": { "title": "Pesanan baru", "body": "Order #A123 menunggu konfirmasi" },
    "data": { "order_id": "A123", "type": "order_created" },
    "apns": {
      "headers": { "apns-priority": "10" },
      "payload": { "aps": { "sound": "default", "badge": 1, "mutable-content": 1 } }
    }
  }
}
```

### Gambar di notifikasi

Tambahkan target **Notification Service Extension** di Xcode; extension mengunduh gambar dari URL di payload
(`mutable-content: 1`) dan melampirkannya. Extension punya bundle ID & provisioning sendiri.

### Troubleshooting

| Gejala | Periksa |
| --- | --- |
| Token FCM null / error APNs token | Capability Push belum ditambah, belum minta izin, menjalankan di lingkungan yang tidak mendukung push |
| Android dapat, iOS tidak | Kunci .p8 belum diunggah / salah Team ID / bundle ID berbeda |
| Notifikasi tidak tampil saat foreground | Presentation options belum diatur |
| Silent push tidak selalu diterima | Normal: APNs/iOS men-throttle; jangan andalkan untuk logika kritis |
| Push berhenti setelah install ulang | Token berubah — perbarui di backend via `onTokenRefresh` |

## Best Practices

- **Token-based auth (.p8)** — tidak kedaluwarsa tahunan seperti sertifikat.
- **Kirim token ke backend setiap startup & saat refresh**; hapus saat logout.
- **Data minimal di payload** (ID), ambil detail dari API setelah dibuka.
- **Jangan andalkan silent push** untuk sinkronisasi kritis — gunakan juga sync saat app dibuka.
- **Uji di perangkat nyata** termasuk skenario app tertutup, background, foreground.

## Anti-Patterns

- Menyimpan token sekali saat install dan tidak pernah memperbarui.
- Data sensitif di judul/isi notifikasi (terlihat di lock screen).
- Navigasi dari payload tanpa validasi.
- Mengirim banyak silent push untuk "menjaga app tetap hidup".

## Performance Considerations

Notifikasi dengan gambar menambah waktu (extension mengunduh gambar dengan batas waktu). Badge & grouping (thread
identifier) membantu pengguna tanpa membanjiri. Gunakan topic/segment untuk broadcast agar backend tidak mengirim satu
per satu.

## Security Considerations

Simpan kunci .p8 dan kredensial service account FCM sebagai secret di server, bukan di aplikasi. Jangan masukkan OTP
penuh atau data pribadi di notifikasi bila lock screen bisa terlihat orang lain; validasi deep link sebelum membuka layar.

## Real-World Use Cases

- Notifikasi pesanan baru ke kasir/admin.
- Status tiket gangguan untuk pelanggan.
- Pengingat jadwal kunjungan teknisi.

## Interview Questions

1. Bagaimana alur push notification di iOS dengan FCM?
2. Apa yang dibutuhkan agar push iOS bekerja?
3. Apa beda alert dan silent push?
4. Mengapa notifikasi tidak tampil saat app di foreground?
5. Bagaimana membuka layar tertentu dari notifikasi?

## Sample Answers

1. App meminta izin dan mendaftar ke APNs → mendapat device token → FCM memetakan menjadi FCM token → token dikirim ke backend → backend memanggil FCM → FCM mengirim ke APNs memakai kunci .p8 → APNs mengirim ke perangkat.
2. Kunci APNs (.p8) di Firebase dengan Team ID/Key ID yang benar, capability Push Notifications (dan Background Modes untuk silent push), bundle ID & GoogleService-Info.plist yang cocok, izin notifikasi, dan pengujian di lingkungan yang mendukung push.
3. Alert ditampilkan sistem kepada pengguna; silent (`content-available`) membangunkan app sebentar tanpa tampilan, dibatasi sistem dan tidak dijamin terkirim.
4. Secara default iOS tidak menampilkan notifikasi untuk app yang sedang aktif; atur `setForegroundNotificationPresentationOptions` atau tampilkan notifikasi lokal.
5. Sertakan ID di data payload, tangani `getInitialMessage` (dari tertutup) dan `onMessageOpenedApp` (dari background), validasi data, lalu navigasi lewat router.

## Practical Exercises

1. Konfigurasikan push iOS end-to-end di proyek sampel dan catat setiap langkah.
2. Kirim notifikasi dengan data `order_id` dan buka detail order dari tiga kondisi app.
3. Tambahkan Notification Service Extension untuk menampilkan gambar produk.

## Quick Reference

```text
Server → FCM → APNs → iPhone · .p8 (Key ID + Team ID) di Firebase · Capability Push + Background Modes
requestPermission → getAPNSToken → getToken → kirim ke backend · onTokenRefresh · hapus saat logout
Foreground: setForegroundNotificationPresentationOptions · tap: getInitialMessage + onMessageOpenedApp
Silent push di-throttle · payload minimal · validasi deep link
```

## Related Topics

- [Push Notifications (Flutter)](/flutter/push-notifications/)
- [Design a Notification System](/interview/system-design/notification-system/)
- [Background Execution di iOS](/ios/ios-background/)
