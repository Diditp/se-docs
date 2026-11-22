---
title: "Widget Lifecycle"
description: "Siklus hidup StatelessWidget dan StatefulWidget, hubungan Widget–Element–RenderObject, Key, dan app lifecycle."
level: beginner
status: complete
version: "Flutter 3.x"
updated: 2026-11-07
tags: [flutter, widget, lifecycle, element, key]
---

## Overview

Di Flutter, **widget adalah konfigurasi immutable** yang dibuat ulang setiap rebuild. Yang bertahan lama adalah
**Element** (posisi widget di tree) dan **State** (untuk `StatefulWidget`). Lifecycle menjelaskan kapan State dibuat,
diperbarui, dan dibuang — dan karena itu, **di mana** Anda harus memulai dan membersihkan resource.

## Why It Matters

Hampir semua bug klasik Flutter berakar di sini: memory leak karena controller tidak di-dispose,
`setState() called after dispose()`, request API terpanggil berulang karena diletakkan di `build()`,
dan state yang "tertukar" di list karena tidak memakai `Key`.

## Core Concepts

- **Tiga tree:** Widget (blueprint) → Element (instance & posisi, pemilik State) → RenderObject (layout, paint, hit-test).
- **`build()` harus murni & murah** — bisa dipanggil sangat sering (tiap frame animasi, perubahan parent, perubahan InheritedWidget).
- **`BuildContext`** = Element itu sendiri; menunjukkan posisi widget di tree.
- **`mounted`** — `true` selama State masih terpasang di tree.
- **Key** — identitas widget saat Flutter mencocokkan widget lama & baru (`runtimeType` + `key`).
- **App lifecycle** (`AppLifecycleState`): `resumed`, `inactive`, `hidden`, `paused`, `detached`.

## How It Works

```text
createState()
   ↓
initState()                  ← sekali. Inisialisasi controller, subscription, request awal
   ↓
didChangeDependencies()      ← setelah initState & setiap InheritedWidget yang di-depend berubah
   ↓
build()  ⟲                   ← setiap setState / parent rebuild / dependency berubah
   ↓   ↖
didUpdateWidget(old)         ← parent rebuild dengan widget baru bertipe & key sama (konfigurasi baru)
   ↓
deactivate()                 ← dilepas dari tree (bisa dipasang lagi via GlobalKey dalam frame yang sama)
   ↓
dispose()                    ← sekali, permanen. Bersihkan semua resource
```

**Rekonsiliasi:** saat parent rebuild, untuk setiap posisi Flutter membandingkan widget baru dengan Element lama.
Jika `runtimeType` dan `key` sama → Element & State **dipakai ulang** dan `didUpdateWidget` dipanggil. Jika berbeda →
Element lama di-unmount (`dispose`) dan yang baru dibuat. Inilah mengapa rebuild murah dan mengapa Key penting.

## Implementation

```dart
class OrderTimer extends StatefulWidget {
  const OrderTimer({super.key, required this.orderId});
  final String orderId;
  @override
  State<OrderTimer> createState() => _OrderTimerState();
}

class _OrderTimerState extends State<OrderTimer>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _pulse;
  late Future<Order> _order;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();                                  // selalu pertama
    WidgetsBinding.instance.addObserver(this);
    _pulse = AnimationController(vsync: this, duration: const Duration(seconds: 1));
    _order = context.read<OrderRepository>().get(widget.orderId); // ✅ Future dibuat sekali
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) => _refresh());
  }

  @override
  void didUpdateWidget(covariant OrderTimer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.orderId != widget.orderId) {           // konfigurasi berubah → muat ulang
      _order = context.read<OrderRepository>().get(widget.orderId);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) _ticker?.cancel();    // hemat baterai
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final next = context.read<OrderRepository>().get(widget.orderId);
    await next;
    if (!mounted) return;                                 // ✅ widget mungkin sudah hilang
    setState(() => _order = next);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    _pulse.dispose();
    super.dispose();                                      // selalu terakhir
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Order>(
        future: _order,                                   // ✅ bukan repo.get(...) langsung di sini
        builder: (_, s) => Text(s.data?.status ?? '...'),
      );
}
```

**Key di list yang bisa diurutkan ulang/dihapus:**

```dart
ListView(
  children: [
    for (final item in cart.items)
      CartItemTile(key: ValueKey(item.id), item: item),  // state qty input ikut item yang benar
  ],
);
```

## Best Practices

- **Mulai resource di `initState`, bersihkan di `dispose`** — simetris dan mudah diaudit.
- **Jangan memanggil `context.dependOnInheritedWidgetOfExactType` (mis. `Theme.of`, `MediaQuery.of`) di `initState`** — gunakan `didChangeDependencies` atau `build`.
- **Jangan membuat Future/Stream di `build`** untuk FutureBuilder/StreamBuilder — simpan di State atau state management.
- **Cek `mounted` setelah setiap `await`** sebelum `setState` atau memakai `context`.
- **Gunakan `ValueKey(id)`** untuk item stateful dalam list dinamis; hindari `GlobalKey` kecuali perlu (mahal).
- **`super.initState()` pertama, `super.dispose()` terakhir.**
- **Gunakan `const` constructor** untuk subtree statis agar dilewati saat rebuild.

## Anti-Patterns

- HTTP request di `build()` → terpanggil setiap rebuild.
- `setState` setelah `await` tanpa cek `mounted`.
- Lupa `dispose()` untuk `TextEditingController`, `AnimationController`, `ScrollController`, `FocusNode`, `StreamSubscription`, `Timer`.
- Memakai index list sebagai Key (`ValueKey(index)`) pada list yang bisa dihapus/diurutkan — identitas berubah.
- Menyimpan `BuildContext` di field/singleton untuk dipakai nanti.

## Performance Considerations

- `setState` me-rebuild **seluruh** `build()` widget itu — turunkan state ke widget yang lebih kecil (push state down).
- Widget `const` dan widget yang diekstrak menjadi class (bukan method `_buildX()`) memungkinkan Flutter melewati rebuild.
- Gunakan DevTools **"Track widget rebuilds"** untuk menemukan rebuild berlebihan.

## Security Considerations

- Saat `AppLifecycleState.paused/hidden`, sembunyikan data sensitif (mis. overlay blur) agar tidak tampil di app switcher; di Android pertimbangkan `FLAG_SECURE`.
- Kunci ulang sesi (PIN/biometrik) setelah app di background melewati batas waktu — gunakan `didChangeAppLifecycleState`.

## Real-World Use Cases

- **Scanner barcode POS:** kamera dimulai di `initState`/`resumed`, dihentikan di `paused` & `dispose`.
- **Polling status pembayaran QRIS:** timer dibatalkan saat app di background, dilanjutkan saat `resumed`.
- **Form checkout:** semua `TextEditingController` dibuat di `initState`, di-dispose di `dispose`.

## Interview Questions

1. **(Fundamental)** Apa beda StatelessWidget dan StatefulWidget?
2. **(Fundamental)** Urutkan method lifecycle StatefulWidget.
3. **(Intermediate)** Kapan `didChangeDependencies` dan `didUpdateWidget` dipanggil?
4. **(Intermediate)** Apa itu Widget, Element, dan RenderObject?
5. **(Intermediate)** Kapan Anda membutuhkan Key?
6. **(Advanced)** Mengapa muncul error `setState() called after dispose()` dan bagaimana mencegahnya?

## Sample Answers

1. Stateless tidak memiliki state yang berubah; tampilannya hanya bergantung pada parameter konstruktor dan InheritedWidget. Stateful memiliki objek `State` yang bertahan antar rebuild dan bisa memicu rebuild dengan `setState`.
2. `createState → initState → didChangeDependencies → build → (didUpdateWidget / setState → build)* → deactivate → dispose`.
3. `didChangeDependencies`: setelah `initState` dan setiap InheritedWidget yang dibaca berubah (Theme, Locale, Provider). `didUpdateWidget`: saat parent rebuild dan memberikan widget baru dengan tipe & key sama — tempat membandingkan konfigurasi lama vs baru.
4. Widget = konfigurasi immutable; Element = instance di tree yang memegang State dan mengatur update; RenderObject = layout & painting. Widget sering dibuat ulang, Element dan RenderObject dipakai ulang sehingga rebuild murah.
5. Saat beberapa widget stateful bertipe sama ditambah, dihapus, atau diurutkan ulang dalam satu parent — Key memastikan State dipasangkan ke item yang benar. Juga `GlobalKey` untuk mengakses State (Form) lintas tree.
6. Async callback (Future/Timer/Stream) selesai setelah widget dibuang lalu memanggil `setState`. Cegah dengan membatalkan subscription/timer di `dispose`, dan cek `if (!mounted) return;` setelah `await`.

## Practical Exercises

1. Tambahkan `debugPrint` di setiap method lifecycle, lalu amati urutannya saat navigasi push/pop, rotasi, dan perubahan tema.
2. Buat list stateful (tiap item punya counter) yang bisa dihapus; amati bug tanpa Key, lalu perbaiki dengan `ValueKey`.
3. Buat widget yang melakukan polling setiap 10 detik dan berhenti saat app di background.

## Quick Reference

- `initState` → mulai · `dispose` → bersihkan · `build` → murni & murah.
- InheritedWidget → `didChangeDependencies`/`build`, **bukan** `initState`.
- Setelah `await` → `if (!mounted) return;`
- List dinamis stateful → `ValueKey(item.id)`.
- App lifecycle: `WidgetsBindingObserver` / `AppLifecycleListener`.

## Related Topics

- [Async Programming](/flutter/async-programming/)
- [Memory Management](/flutter/memory-management/)
- [Rendering & Performance Optimization](/flutter/rendering-performance/)
- [Activity Lifecycle (Android)](/android/activity-lifecycle/)
- Referensi resmi: [StatefulWidget API](https://api.flutter.dev/flutter/widgets/StatefulWidget-class.html), [State class lifecycle](https://api.flutter.dev/flutter/widgets/State-class.html).
