---
title: "Navigation & Routing"
description: "Navigator 1.0 vs Router API, go_router untuk deklaratif routing, nested navigation dengan ShellRoute, redirect berbasis auth, deep link, dan mengirim data antar halaman dengan aman."
level: intermediate
status: complete
version: "Flutter 3.x · go_router 14+"
updated: 2026-11-12
tags: [flutter, navigation, go_router, deep-link]
---

## Overview

Flutter punya dua API navigasi:

- **Navigator (imperatif, "1.0")** — `Navigator.push(context, MaterialPageRoute(...))`. Sederhana, cocok untuk alur kecil dan dialog.
- **Router API (deklaratif, "2.0")** — stack halaman diturunkan dari *state* (URL/route). Mendukung deep link, URL web, dan tombol back browser. Biasanya dipakai lewat package **go_router** (dikelola tim Flutter).

## Why It Matters

Navigasi menentukan pengalaman utama aplikasi: login/logout, deep link dari notifikasi, bottom navigation yang
mempertahankan state, dan tombol back Android. Implementasi yang buruk menyebabkan user bisa kembali ke halaman setelah
logout, halaman dobel di stack, atau deep link yang crash karena data belum dimuat.

## Core Concepts

| Konsep | Arti |
| --- | --- |
| Route / Page | Satu entri di stack navigasi |
| Path & parameter | `/orders/:id` (path param), `?tab=paid` (query param) |
| `go` vs `push` | `go` mengganti stack sesuai lokasi tujuan; `push` menumpuk di atas stack saat ini |
| Redirect | Fungsi yang mengalihkan route berdasarkan state (mis. belum login → `/login`) |
| ShellRoute / StatefulShellRoute | Layout bersama (bottom nav) dengan navigator bersarang; *Stateful* menjaga state tiap tab |
| Deep link | Membuka app langsung ke route tertentu dari URL/notifikasi |
| `PopScope` | Mengontrol tombol back (pengganti `WillPopScope`) |

## How It Works

```text
URL / event  ──► GoRouter.redirect (auth? onboarding?) ──► cocokkan route tree ──► bangun stack Page
                   ▲                                                              │
refreshListenable (status auth berubah) ──────────────────────────────────────────┘
```

Router mendengarkan `refreshListenable` (mis. stream auth). Saat status login berubah, `redirect` dievaluasi ulang
sehingga user otomatis diarahkan ke `/login` atau `/home` tanpa kode navigasi manual di banyak tempat.

## Implementation

### Konfigurasi go_router dengan redirect auth & bottom navigation

```dart
GoRouter buildRouter(AuthCubit auth) => GoRouter(
      initialLocation: '/home',
      refreshListenable: GoRouterRefreshStream(auth.stream),
      redirect: (context, state) {
        final loggedIn = auth.state is Authenticated;
        final atLogin = state.matchedLocation == '/login';
        if (!loggedIn) return atLogin ? null : '/login?from=${Uri.encodeComponent(state.uri.toString())}';
        if (atLogin) return state.uri.queryParameters['from'] ?? '/home';
        return null;                                   // tidak redirect
      },
      routes: [
        GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
        StatefulShellRoute.indexedStack(
          builder: (_, __, shell) => HomeShell(shell: shell),   // Scaffold + NavigationBar
          branches: [
            StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, __) => const HomePage())]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/orders', builder: (_, __) => const OrdersPage(), routes: [
                GoRoute(path: ':id', builder: (_, s) => OrderDetailPage(orderId: s.pathParameters['id']!)),
              ]),
            ]),
            StatefulShellBranch(routes: [GoRoute(path: '/settings', builder: (_, __) => const SettingsPage())]),
          ],
        ),
      ],
      errorBuilder: (_, s) => NotFoundPage(location: s.uri.toString()),
    );

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) { _sub = stream.listen((_) => notifyListeners()); }
  late final StreamSubscription<dynamic> _sub;
  @override
  void dispose() { _sub.cancel(); super.dispose(); }
}
```

```dart
class HomeShell extends StatelessWidget {
  const HomeShell({super.key, required this.shell});
  final StatefulNavigationShell shell;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: shell,
        bottomNavigationBar: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home), label: 'Beranda'),
            NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Transaksi'),
            NavigationDestination(icon: Icon(Icons.settings), label: 'Pengaturan'),
          ],
        ),
      );
}
```

### Navigasi & mengirim data

```dart
context.go('/orders/0192f…');                 // pindah ke lokasi (stack mengikuti route tree)
context.push('/orders/0192f…');               // tumpuk di atas halaman saat ini
final picked = await context.push<Product>('/products/picker');   // menunggu hasil
context.pop(selectedProduct);                 // kembalikan hasil
```

Kirim **ID** lewat path/query, lalu halaman tujuan memuat datanya sendiri. Objek lewat `extra` tidak bertahan saat deep
link, restart, atau URL web — jadi hanya untuk optimasi (data awal), bukan satu-satunya sumber.

### Tombol back dengan PopScope

```dart
PopScope(
  canPop: !hasUnsavedChanges,
  onPopInvokedWithResult: (didPop, _) async {
    if (didPop) return;
    final leave = await showDialog<bool>(context: context, builder: (_) => const DiscardDialog());
    if (leave == true && context.mounted) context.pop();
  },
  child: const CheckoutForm(),
);
```

### Deep link (Android App Links / iOS Universal Links)

```xml
<!-- android/app/src/main/AndroidManifest.xml, di dalam <activity> -->
<meta-data android:name="flutter_deeplinking_enabled" android:value="true" />
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="app.example.com" android:pathPrefix="/orders" />
</intent-filter>
```

App Links butuh file `/.well-known/assetlinks.json` di domain; iOS butuh `apple-app-site-association` + Associated Domains.

:::caution[Version-dependent]
API go_router berubah antar versi mayor (mis. `onExit`, `PopScope`, nama callback). Cek CHANGELOG go_router sebelum upgrade.
:::

## Best Practices

- **Satu router di composition root** (`app/router.dart`), route per fitur digabungkan di sana.
- **Redirect berbasis state auth** — bukan `Navigator.push` manual setelah login/logout di banyak tempat.
- **Kirim ID, bukan objek** antar halaman; halaman tujuan memuat data (dengan cache) sendiri — deep link selalu bekerja.
- **`StatefulShellRoute`** untuk bottom navigation agar state & scroll tiap tab terjaga.
- **Nama path konsisten & stabil** — path adalah kontrak untuk deep link dan notifikasi.
- **Tangani route tidak dikenal** dengan halaman 404 yang ramah.
- **Gunakan `context.mounted`** sebelum navigasi setelah `await`.

## Anti-Patterns

- `Navigator.push` dari dalam Bloc/repository (butuh context, sulit dites) — navigasi di `BlocListener`.
- Menyimpan data penting hanya di `extra` → hilang saat deep link/restart.
- `pushReplacement` berantai untuk "membersihkan" stack setelah logout — gunakan redirect.
- Global `navigatorKey` dipakai di mana-mana untuk navigasi tanpa context.
- Menumpuk halaman yang sama berulang (`push` saat tap notifikasi berkali-kali) — gunakan `go` untuk lokasi absolut.

## Performance Considerations

- `StatefulShellRoute.indexedStack` mempertahankan semua tab di memori — baik untuk UX, perhatikan tab yang berat (lepaskan resource saat tidak aktif).
- Halaman yang jarang dipakai boleh lazy-loaded (web: deferred imports).
- Hindari membangun ulang `GoRouter` di dalam `build()` — buat sekali.

## Security Considerations

- **Redirect bukan otorisasi** — server tetap menolak akses tanpa hak; redirect hanya UX.
- **Validasi parameter deep link** (format ID, query) sebelum dipakai; deep link bisa dibuat siapa saja.
- **Jangan menaruh token/data sensitif di URL** — tercatat di log/analytics/riwayat.
- **Bersihkan stack saat logout** (redirect ke `/login`) agar back button tidak membuka halaman sensitif.
- Verifikasi App Links/Universal Links agar app lain tidak bisa membajak link domain Anda.

## Real-World Use Cases

- **POS**: shell dengan tab Kasir / Transaksi / Laporan; redirect ke pilih-outlet jika belum memilih outlet.
- **Notifikasi "Tiket #123 diperbarui"** → deep link `/tickets/123` membuka detail yang memuat data sendiri.
- **Onboarding**: redirect ke `/onboarding` sampai flag selesai disimpan.

## Interview Questions

1. Apa beda Navigator 1.0 dan Router API (Navigator 2.0)?
2. Apa beda `context.go` dan `context.push` di go_router?
3. Bagaimana Anda menangani redirect login/logout?
4. Bagaimana mempertahankan state tiap tab bottom navigation?
5. Mengapa sebaiknya mengirim ID, bukan objek, ke halaman detail?

## Sample Answers

1. Navigator 1.0 imperatif: push/pop halaman secara langsung — sederhana tetapi sulit untuk deep link dan URL web. Router API deklaratif: stack halaman diturunkan dari state/URL, mendukung deep link, URL browser, dan back button platform dengan konsisten.
2. `go` menavigasi ke lokasi absolut dan membangun stack sesuai hierarki route (mengganti stack). `push` menambahkan halaman di atas stack saat ini dan bisa mengembalikan hasil saat di-pop.
3. Router mendengarkan perubahan status auth (`refreshListenable`) dan fungsi `redirect` mengarahkan ke `/login` bila belum login, atau kembali ke tujuan awal (`from`) setelah login. Tidak ada navigasi manual tersebar.
4. `StatefulShellRoute.indexedStack` dengan satu branch per tab; setiap branch punya navigator sendiri sehingga stack & state tab terjaga saat berpindah.
5. Agar halaman bisa dibuka langsung via deep link/URL/restart, data selalu terbaru, dan tidak ada ketergantungan pada objek di memori yang mungkin sudah usang.

## Practical Exercises

1. Migrasikan alur login app Anda ke go_router dengan redirect & `refreshListenable`.
2. Buat bottom navigation 3 tab dengan `StatefulShellRoute` dan buktikan posisi scroll tiap tab tersimpan.
3. Tambahkan deep link `/orders/:id` dan uji dengan `adb shell am start -a android.intent.action.VIEW -d "https://app.example.com/orders/123"`.

## Quick Reference

```text
go = ganti lokasi · push = tumpuk (bisa await hasil) · pop(result)
redirect + refreshListenable(auth) untuk login/logout · StatefulShellRoute untuk tab
Kirim ID via path/query · extra hanya optimasi · PopScope untuk back · context.mounted setelah await
Deep link: AndroidManifest intent-filter + assetlinks.json · iOS Associated Domains
```

## Related Topics

- [Feature-First Architecture](/flutter/feature-first-architecture/)
- [Push Notifications](/flutter/push-notifications/)
- [State Management](/flutter/state-management/)
- Referensi resmi: [Flutter navigation and routing](https://docs.flutter.dev/ui/navigation), [go_router](https://pub.dev/packages/go_router), [Deep linking](https://docs.flutter.dev/ui/navigation/deep-linking).
