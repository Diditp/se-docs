---
title: "Design: Deep Link & Navigasi Lintas Kanal"
description: "Mobile system design deep linking: custom scheme vs App Links vs Universal Links, deferred deep link, sumber link (push, email, QR, web, iklan), routing terpusat di Flutter (go_router), autentikasi & state saat link dibuka, validasi parameter, fallback web, tracking atribusi, dan pengujian di Android & iOS."
level: intermediate
status: complete
version: "go_router 14+ · Android App Links · iOS Universal Links"
updated: 2026-11-13
tags: [system-design, mobile, deep-link, navigation, go-router]
---

## Overview

**Deep link** membuka layar tertentu di aplikasi dari luar: notifikasi push, email, SMS, QR code, situs web, atau
aplikasi lain. Soal desainnya: **satu skema URL konsisten** yang bekerja di Android, iOS, dan web, menangani pengguna yang
belum login atau belum memasang aplikasi, dan **aman** terhadap parameter yang dimanipulasi.

## Why It Matters

Hampir semua aplikasi butuh deep link (promo, reset password, detail order dari notifikasi, QR di outlet). Implementasi
yang buruk menyebabkan link membuka layar salah, crash karena parameter tidak valid, atau kebocoran data.

## Core Concepts

| Jenis | Contoh | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| Custom URL scheme | `kasirkita://orders/A1` | Mudah | Bisa dibajak app lain; tidak ada fallback web |
| Android App Links | `https://pos.example.com/orders/A1` | Terverifikasi domain (`assetlinks.json`), fallback web | Butuh konfigurasi domain |
| iOS Universal Links | `https://pos.example.com/orders/A1` | Terverifikasi (`apple-app-site-association`), fallback web | Butuh entitlement & file di domain |
| Deferred deep link | Link sebelum install → setelah install langsung ke layar tujuan | UX onboarding/promo | Butuh layanan atribusi atau mekanisme sendiri |

## How It Works

```text
Link https://pos.example.com/orders/A1
 ├─ App terpasang & domain terverifikasi → OS membuka app → router menerima URI
 │    → belum login? simpan "pending route" → login → lanjutkan ke /orders/A1
 │    → sudah login → validasi parameter → cek otorisasi (via API) → tampilkan / 404 / 403
 └─ App tidak terpasang → halaman web (detail order versi web atau "unduh aplikasi")
```

## Implementation

### Skema URL terpusat

```text
https://pos.example.com/orders/{orderId}
https://pos.example.com/products/{sku}
https://pos.example.com/promo/{code}
https://pos.example.com/reset-password?token=...     (token sekali pakai, berumur pendek)
```

Satu tabel rute yang sama dipakai untuk: push notification (field `link`), email, QR, dan web.

### go_router dengan redirect autentikasi

```dart
final router = GoRouter(
  refreshListenable: authState,                             // rebuild saat status login berubah
  redirect: (context, state) {
    final loggedIn = authState.isLoggedIn;
    final goingToLogin = state.matchedLocation == '/login';
    if (!loggedIn && !goingToLogin) {
      return Uri(path: '/login', queryParameters: {'from': state.uri.toString()}).toString();
    }
    if (loggedIn && goingToLogin) {
      final from = state.uri.queryParameters['from'];
      return (from != null && from.startsWith('/')) ? from : '/';   // hanya path internal
    }
    return null;
  },
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(
      path: '/orders/:orderId',
      builder: (_, state) {
        final id = state.pathParameters['orderId']!;
        if (!RegExp(r'^[A-Za-z0-9-]{1,40}$').hasMatch(id)) return const NotFoundScreen();
        return OrderDetailScreen(orderId: id);              // otorisasi tetap dicek server saat memuat
      },
    ),
  ],
  errorBuilder: (_, __) => const NotFoundScreen(),
);
```

### Konfigurasi platform

```text
Android: intent-filter autoVerify (scheme https, host, pathPrefix) + https://pos.example.com/.well-known/assetlinks.json
iOS: Associated Domains entitlement "applinks:pos.example.com" + https://pos.example.com/.well-known/apple-app-site-association
Keduanya: file disajikan via HTTPS tanpa redirect, content-type JSON
```

### Deep link dari push notification

```dart
void handlePushData(Map<String, dynamic> data) {
  final link = data['link'];
  if (link is String) {
    final uri = Uri.tryParse(link);
    if (uri != null && uri.host == 'pos.example.com') router.go(uri.path + (uri.hasQuery ? '?${uri.query}' : ''));
  }
}
```

### Pengujian

```bash
# Android
adb shell am start -a android.intent.action.VIEW -d "https://pos.example.com/orders/A1"
adb shell pm get-app-links com.example.pos          # status verifikasi domain
# iOS simulator
xcrun simctl openurl booted "https://pos.example.com/orders/A1"
```

## Best Practices

- **App Links/Universal Links (HTTPS)** sebagai standar; custom scheme hanya pelengkap.
- **Satu tabel rute** untuk semua kanal; sama dengan URL web bila ada.
- **Pending route** setelah login agar tujuan tidak hilang.
- **Validasi parameter & otorisasi server**; 404 yang ramah untuk link tidak valid.
- **Fallback web** yang berguna saat app belum terpasang.
- **Uji kondisi app**: tertutup, background, foreground, belum login.

## Anti-Patterns

- Navigasi langsung dari parameter tanpa validasi (crash/akses tak sah).
- Token sensitif berumur panjang di URL.
- Logika deep link tersebar di banyak tempat (push handler, splash, layar).
- Open redirect: parameter `from`/`redirect` diarahkan ke URL luar.

## Performance Considerations

Saat dibuka dari link (cold start), tampilkan layar tujuan secepat mungkin: muat data minimal, gunakan cache bila ada, dan
hindari rantai redirect panjang melalui splash/onboarding.

## Security Considerations

Deep link adalah input tidak tepercaya: validasi format, cek otorisasi di server (ID valid belum tentu milik pengguna),
gunakan token sekali pakai berumur pendek untuk aksi seperti reset password, cegah open redirect, dan verifikasi domain
agar aplikasi lain tidak membajak link.

## Real-World Use Cases

- Notifikasi "Order A1 siap" membuka detail order.
- QR di meja outlet membuka menu outlet tertentu.
- Email reset password membuka layar ganti password di aplikasi.

## Interview Questions

1. Apa beda custom URL scheme dan App Links/Universal Links?
2. Bagaimana menangani deep link saat pengguna belum login?
3. Apa itu deferred deep link?
4. Bagaimana mengamankan deep link?
5. Bagaimana menguji deep link?

## Sample Answers

1. Custom scheme mudah tetapi dapat didaftarkan aplikasi lain dan tidak punya fallback web; App Links/Universal Links memakai URL HTTPS yang diverifikasi melalui file di domain, sehingga hanya aplikasi Anda yang membukanya dan ada fallback ke web.
2. Redirect ke login sambil menyimpan rute tujuan (hanya path internal), lalu setelah login lanjutkan ke tujuan tersebut.
3. Link yang dibuka sebelum aplikasi terpasang; setelah instal dan dibuka pertama kali, aplikasi tetap diarahkan ke konten yang dimaksud melalui layanan atribusi atau mekanisme pencocokan.
4. Validasi parameter, otorisasi di server, token sekali pakai berumur pendek, cegah open redirect, dan verifikasi domain.
5. `adb shell am start -d <url>` dan `pm get-app-links` di Android, `xcrun simctl openurl` di iOS simulator, serta uji di perangkat nyata dari push, email, dan QR dalam berbagai kondisi app.

## Practical Exercises

1. Definisikan tabel rute URL aplikasi Anda dan terapkan di go_router.
2. Konfigurasikan App Links & Universal Links untuk domain uji.
3. Implementasikan pending route setelah login dan uji dari push.

## Quick Reference

```text
HTTPS App Links (assetlinks.json) + Universal Links (AASA + Associated Domains) > custom scheme
Satu tabel rute untuk push/email/QR/web · redirect login + pending route (path internal saja)
Validasi param + otorisasi server · token sekali pakai · fallback web · uji adb/simctl
```

## Related Topics

- [Navigation & Routing (Flutter)](/flutter/navigation-routing/)
- [Navigation (Android)](/android/navigation/)
- [Push Notification: APNs & FCM](/ios/apns-push/)
