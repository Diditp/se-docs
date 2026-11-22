---
title: "Push Notifications"
description: "Cara kerja push notification (FCM & APNs), jenis pesan notification vs data, izin Android 13+/iOS, foreground/background/terminated handling, deep link dari notifikasi, dan pengiriman dari backend."
level: intermediate
status: complete
version: "firebase_messaging · flutter_local_notifications · Android 13+ · iOS 16+"
updated: 2026-11-12
tags: [flutter, fcm, apns, notifications, deep-link]
---

## Overview

**Push notification** adalah pesan yang dikirim server ke device melalui layanan push milik platform: **FCM** (Firebase
Cloud Messaging) untuk Android dan **APNs** (Apple Push Notification service) untuk iOS — FCM juga bisa meneruskan ke
APNs sehingga backend cukup memakai satu API. Di Flutter, `firebase_messaging` menerima pesan dan
`flutter_local_notifications` menampilkan notifikasi kustom (terutama saat app di foreground).

## Why It Matters

Notifikasi adalah kanal penting untuk status transaksi, tiket, tugas lapangan, dan promosi — tetapi juga sumber bug:
notifikasi tidak muncul di Android 13+ karena izin, tap notifikasi tidak membuka halaman yang benar, notifikasi ganda,
atau token tidak diperbarui di server.

## Core Concepts

| Konsep | Arti |
| --- | --- |
| Registration token | ID tujuan per instalasi app; bisa berubah (reinstall, clear data, rotasi) |
| Notification message | Payload `notification` (title/body) — ditampilkan otomatis oleh sistem saat app di background/terminated |
| Data message | Payload `data` (key-value) — diproses kode app; cocok untuk deep link & logika |
| Topic | Kanal publish-subscribe (`promo-outlet-12`) |
| App state | foreground · background · terminated — handler berbeda |
| Notification channel (Android 8+) | Kategori dengan tingkat kepentingan; user bisa mematikan per channel |
| `POST_NOTIFICATIONS` (Android 13+) | Izin runtime wajib untuk menampilkan notifikasi |
| Priority | Pesan high-priority untuk hal penting yang butuh tindakan segera; jangan disalahgunakan |

## How It Works

```text
Backend ── FCM HTTP v1 API (OAuth service account) ──► FCM ──► Android device (Google Play services)
                                                         └──► APNs ──► iOS device
App start → minta izin → dapat token → kirim token ke backend (POST /v1/devices) → backend simpan per user+device
onTokenRefresh → kirim token baru · logout → hapus token di backend
```

| State app | Notification message | Data message |
| --- | --- | --- |
| Foreground | **Tidak** ditampilkan otomatis → tampilkan sendiri (local notification) | `FirebaseMessaging.onMessage` |
| Background | Ditampilkan sistem; tap → `onMessageOpenedApp` | Background handler (top-level function) |
| Terminated | Ditampilkan sistem; tap → `getInitialMessage()` saat app start | Background handler (dengan batasan platform) |

## Implementation

### Inisialisasi, izin, dan token

```dart
@pragma('vm:entry-point')                                    // wajib agar tidak di-tree-shake
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  // Pekerjaan ringan saja: simpan ke DB lokal, update badge. Jangan UI.
}

class PushService {
  PushService(this._api, this._router, this._local);
  final DeviceApi _api;
  final GoRouter _router;
  final FlutterLocalNotificationsPlugin _local;
  final _fm = FirebaseMessaging.instance;

  Future<void> init() async {
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    final settings = await _fm.requestPermission(alert: true, badge: true, sound: true);  // iOS & Android 13+
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    await _registerToken(await _fm.getToken());
    _fm.onTokenRefresh.listen(_registerToken);

    FirebaseMessaging.onMessage.listen(_showForeground);                 // foreground
    FirebaseMessaging.onMessageOpenedApp.listen(_openFromMessage);       // tap saat background
    final initial = await _fm.getInitialMessage();                       // tap saat terminated
    if (initial != null) _openFromMessage(initial);
  }

  Future<void> _registerToken(String? token) async {
    if (token == null) return;
    await _api.registerDevice(token: token, platform: defaultTargetPlatform.name);
  }

  void _openFromMessage(RemoteMessage m) {
    final route = m.data['route'];                                       // mis. "/tickets/123"
    if (route is String && _isAllowedRoute(route)) _router.go(route);
  }

  bool _isAllowedRoute(String r) => RegExp(r'^/(orders|tickets)/[A-Za-z0-9-]{1,64}$').hasMatch(r);

  Future<void> _showForeground(RemoteMessage m) async {
    final n = m.notification;
    if (n == null) return;
    await _local.show(
      m.hashCode, n.title, n.body,
      const NotificationDetails(android: AndroidNotificationDetails(
        'transactions', 'Transaksi', importance: Importance.high, priority: Priority.high)),
      payload: m.data['route'] as String?,
    );
  }
}
```

### Channel Android & tap pada local notification

```dart
await _local.initialize(
  const InitializationSettings(
    android: AndroidInitializationSettings('@drawable/ic_notification'),
    iOS: DarwinInitializationSettings(),
  ),
  onDidReceiveNotificationResponse: (r) {
    final route = r.payload;
    if (route != null && _isAllowedRoute(route)) _router.go(route);
  },
);
await _local
    .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
    ?.createNotificationChannel(const AndroidNotificationChannel(
        'transactions', 'Transaksi', description: 'Status pembayaran & transaksi', importance: Importance.high));
```

### Mengirim dari backend Node.js (FCM HTTP v1 via Admin SDK)

```ts
import { getMessaging } from 'firebase-admin/messaging';

export async function notifyTicketUpdated(userId: string, ticketId: string, status: string) {
  const tokens = await devices.tokensFor(userId);                        // bisa banyak device
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: 'Tiket diperbarui', body: `Status tiket: ${status}` },
    data: { route: `/tickets/${ticketId}`, type: 'TICKET_UPDATED' },     // data selalu string
    android: { priority: 'high', notification: { channelId: 'transactions' } },
    apns: { payload: { aps: { sound: 'default' } } },
  });
  // Hapus token yang tidak valid lagi
  res.responses.forEach((r, i) => {
    if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') devices.remove(tokens[i]);
  });
}
```

Kirim notifikasi dari **background job/queue** (bukan di dalam request utama) dengan retry dan dedup per event.

:::caution[Version-dependent]
Android 13+ mewajibkan izin `POST_NOTIFICATIONS`; iOS butuh capability Push Notifications + Background Modes dan APNs key
di Firebase Console. API legacy FCM sudah dihentikan — gunakan HTTP v1 / Admin SDK. Perilaku background handler berbeda per platform.
:::

## Best Practices

- **Minta izin pada momen yang bermakna** (mis. setelah transaksi pertama: "Aktifkan notifikasi status pembayaran?") — bukan saat app pertama dibuka.
- **Data message berisi ID/route**; halaman tujuan memuat data terbaru sendiri.
- **Validasi route dari payload** dengan allowlist sebelum navigasi.
- **Token per device di backend**, diperbarui `onTokenRefresh`, dihapus saat logout & saat FCM menyatakan tidak valid.
- **Channel per kategori** (transaksi, promo) agar user bisa mematikan promo tanpa kehilangan notifikasi penting.
- **Kirim dari worker** dengan idempotency (satu event → satu notifikasi).
- **Hormati preferensi user** dan jam tenang untuk notifikasi non-kritis.

## Anti-Patterns

- Mengandalkan push sebagai satu-satunya sumber data (push bisa terlambat/hilang) — selalu ada sync/pull.
- Menaruh data sensitif (nominal saldo lengkap, OTP) di isi notifikasi yang tampil di lock screen.
- Background handler yang berat atau memanggil UI.
- Mengirim high priority untuk promosi → sistem dapat menurunkan prioritas app.
- Tidak menghapus token saat logout → user lain di device yang sama menerima notifikasi akun sebelumnya.

## Performance Considerations

- Push adalah *best effort*; untuk real-time ketat saat app terbuka gunakan WebSocket/SSE.
- Batasi frekuensi & gabungkan notifikasi (collapse key / thread) untuk menghemat baterai dan mengurangi gangguan.
- Background handler harus singkat; pekerjaan berat dijadwalkan (WorkManager) atau dilakukan saat app dibuka.

## Security Considerations

- Kredensial service account FCM hanya di backend (secret manager), tidak pernah di app.
- Payload data diperlakukan sebagai input tidak tepercaya: validasi route/ID.
- Jangan menampilkan OTP/PIN/detail finansial lengkap di notifikasi.
- Pastikan endpoint `POST /v1/devices` terautentikasi dan mengikat token ke user yang login.

## Real-World Use Cases

- **Status pembayaran QRIS** → notifikasi "Pembayaran diterima" + buka detail transaksi.
- **Tiket gangguan pelanggan** → update status tiket dengan deep link.
- **Work order teknisi** → tugas baru di-assign; app menarik detail dan menyimpan offline.
- **Topic per outlet** untuk pengumuman operasional.

## Interview Questions

1. Apa beda notification message dan data message di FCM?
2. Bagaimana menangani notifikasi saat app foreground, background, dan terminated?
3. Bagaimana membuka halaman tertentu saat notifikasi di-tap?
4. Apa yang berubah di Android 13 terkait notifikasi?
5. Bagaimana backend mengelola token device?

## Sample Answers

1. Notification message berisi title/body dan ditampilkan otomatis oleh sistem saat app tidak di foreground. Data message berisi key-value yang diproses kode app — cocok untuk logika dan deep link. Keduanya bisa digabung.
2. Foreground: `onMessage`, tampilkan sendiri dengan local notification. Background: sistem menampilkan, tap ditangani `onMessageOpenedApp`. Terminated: tap ditangani lewat `getInitialMessage()` saat start. Data message di background diproses top-level background handler.
3. Sertakan `route`/ID di `data`, validasi dengan allowlist, lalu navigasi dengan router (`go`) — halaman tujuan memuat data terbaru berdasarkan ID.
4. Izin runtime `POST_NOTIFICATIONS` wajib; tanpa izin notifikasi tidak tampil. Minta izin pada momen yang tepat dengan penjelasan.
5. Simpan token per user & device saat login/refresh, hapus saat logout, kirim multicast ke semua device user, dan hapus token yang dilaporkan tidak valid oleh FCM.

## Practical Exercises

1. Implementasikan PushService lengkap dengan izin, token registration, dan tiga skenario tap (foreground/background/terminated).
2. Buat endpoint backend `POST /v1/devices` dan job pengirim notifikasi dengan pembersihan token invalid.
3. Uji deep link dari notifikasi ke `/tickets/:id` termasuk payload route tidak valid.

## Quick Reference

```text
Token → POST /v1/devices (per user+device) · onTokenRefresh · hapus saat logout
Foreground: onMessage → local notification · Background tap: onMessageOpenedApp · Terminated: getInitialMessage
Background handler: top-level + @pragma('vm:entry-point') + ringan
data.route + allowlist → router.go · Android 13+: POST_NOTIFICATIONS · channel per kategori
Backend: FCM HTTP v1 / Admin SDK dari worker · tanpa data sensitif di isi notifikasi
```

## Related Topics

- [Firebase Integration](/flutter/firebase-integration/)
- [Navigation & Routing](/flutter/navigation-routing/)
- [Background Processing](/flutter/background-processing/)
- [Monitoring & Notification System](/system-design/case-studies/monitoring-notification/)
- Referensi resmi: [FlutterFire Messaging](https://firebase.google.com/docs/cloud-messaging/flutter/client), [Android notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission), [flutter_local_notifications](https://pub.dev/packages/flutter_local_notifications).
