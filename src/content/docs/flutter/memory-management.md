---
title: "Memory Management"
description: "Cara Dart/Flutter mengelola memori (heap per isolate, generational GC), sumber memory leak umum, image cache, mendeteksi leak dengan DevTools & leak_tracker, dan praktik agar app stabil di device RAM kecil."
level: advanced
status: complete
version: "Flutter 3.x · DevTools Memory view · leak_tracker"
updated: 2026-11-12
tags: [flutter, memory, leak, performance, devtools]
---

## Overview

Dart memakai **garbage collection (GC) otomatis**: objek yang tidak lagi dapat dijangkau (*unreachable*) dibersihkan.
**Memory leak** di Flutter terjadi ketika objek yang seharusnya mati **masih direferensikan** — biasanya oleh listener,
subscription, timer, closure, cache tanpa batas, atau singleton — sehingga GC tidak bisa membebaskannya. Selain heap
Dart, ada memori **native**: gambar yang di-decode, tekstur GPU, dan buffer plugin.

## Why It Matters

Device kasir/field Android kelas menengah sering punya RAM 2–4 GB dengan banyak app lain. Leak kecil per navigasi
menumpuk selama shift 8 jam → app lambat, jank karena GC sering, lalu di-kill sistem (OOM) — transaksi yang sedang
diproses bisa terganggu.

## Core Concepts

- **Heap per isolate** — setiap isolate punya heap sendiri.
- **Generational GC** — *new space* (objek muda, dikumpulkan sangat cepat dan sering) dan *old space* (objek yang bertahan, dikumpulkan lebih jarang dan lebih mahal). Membuat banyak widget kecil berumur pendek itu murah.
- **Reachability** — objek hidup selama ada rantai referensi dari *root* (variabel global/static, stack, handle native).
- **Retaining path** — rantai referensi yang membuat objek tetap hidup; kunci untuk menemukan leak.
- **ImageCache** — cache gambar yang sudah di-decode (default dibatasi jumlah & ukuran byte); gambar beresolusi tinggi memakan memori native besar.
- **Dispose pattern** — objek yang memegang resource (controller, subscription) wajib `dispose()`/`cancel()`.

## How It Works

```text
State widget ditutup (dispose)            Leak:
  └─ AnimationController (ticker)           Singleton EventBus ──listeners──► closure ──► _PageState (sudah dispose)
  └─ StreamSubscription                       → _PageState + seluruh element subtree + controller tetap hidup
Jika semua dilepas → unreachable → GC       → bertambah setiap kali halaman dibuka
```

Gambar: file JPEG 4000×3000 di-decode menjadi bitmap ±4000×3000×4 byte ≈ **48 MB** di memori, walau ditampilkan di
thumbnail 100×100 — kecuali di-decode pada ukuran tampilan (`cacheWidth`/`cacheHeight`).

## Implementation

### Dispose semua resource

```dart
class _ScannerPageState extends State<ScannerPage> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(seconds: 1));
  final _search = TextEditingController();
  final _focus = FocusNode();
  StreamSubscription<ScanResult>? _scanSub;
  Timer? _idleTimer;

  @override
  void initState() {
    super.initState();
    _scanSub = widget.scanner.results.listen(_onScan);
  }

  @override
  void dispose() {
    _scanSub?.cancel();
    _idleTimer?.cancel();
    _pulse.dispose();
    _search.dispose();
    _focus.dispose();
    super.dispose();
  }
  ...
}
```

### Listener pada objek berumur panjang harus dilepas

```dart
@override
void initState() {
  super.initState();
  widget.cart.addListener(_onCartChanged);           // cart = ChangeNotifier singleton
}

@override
void dispose() {
  widget.cart.removeListener(_onCartChanged);        // tanpa ini, State tertahan oleh cart
  super.dispose();
}
```

### Gambar: decode sesuai ukuran tampilan

```dart
Image.network(
  product.imageUrl,
  width: 96, height: 96, fit: BoxFit.cover,
  cacheWidth: (96 * MediaQuery.devicePixelRatioOf(context)).round(),   // decode kecil
);

// Atau dengan cached_network_image
CachedNetworkImage(imageUrl: url, memCacheWidth: 300);

// Batasi image cache global bila app banyak gambar (sesuaikan dengan pengukuran)
PaintingBinding.instance.imageCache.maximumSizeBytes = 80 << 20;   // 80 MB
```

### Cache dengan batas

```dart
class LruCache<K, V> {
  LruCache(this.capacity);
  final int capacity;
  final _map = <K, V>{};                         // LinkedHashMap menjaga urutan sisip
  V? get(K key) {
    final v = _map.remove(key);
    if (v != null) _map[key] = v;                // pindahkan ke paling baru
    return v;
  }
  void put(K key, V value) {
    _map.remove(key);
    _map[key] = value;
    if (_map.length > capacity) _map.remove(_map.keys.first);
  }
}
```

### Deteksi leak di test (leak_tracker)

```dart
// test/flutter_test_config.dart — aktifkan pelacakan leak untuk widget test
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:leak_tracker_flutter_testing/leak_tracker_flutter_testing.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  LeakTesting.enable();
  LeakTesting.settings = LeakTesting.settings.withIgnoredAll();   // mulai longgar, lalu perketat per test/kelas
  await testMain();
}
```

### Investigasi dengan DevTools

1. Jalankan app di **profile mode** pada device nyata.
2. DevTools → **Memory**: perhatikan grafik heap saat membuka/menutup halaman yang sama 10×. Heap yang terus naik dan tidak turun setelah GC = indikasi leak.
3. Ambil **heap snapshot** sebelum & sesudah, lalu **diff**: cari class yang jumlah instance-nya terus bertambah (mis. `_CheckoutPageState`).
4. Lihat **retaining path** instance tersebut untuk menemukan referensi yang menahannya.

:::caution[Version-dependent]
API `leak_tracker` dan tampilan DevTools Memory berkembang cepat; ikuti dokumentasi versi Flutter yang Anda pakai.
:::

## Best Practices

- **Setiap `create`/`listen`/`addListener` punya pasangan `dispose`/`cancel`/`removeListener`** di lifecycle yang sama.
- **Biarkan state management mengelola lifetime** (BlocProvider menutup Bloc otomatis; Riverpod `autoDispose`).
- **Decode gambar sesuai ukuran tampilan**; kompres foto kamera sebelum disimpan/diunggah.
- **Cache selalu punya batas** (jumlah/ukuran/TTL).
- **Jangan menyimpan `BuildContext`, `State`, atau widget di singleton/global.**
- **Uji di device RAM kecil** dan sesi panjang (buka-tutup halaman berulang).

## Anti-Patterns

- `static List<Order> cache` yang terus bertambah sepanjang sesi.
- Closure yang menangkap `this` State dikirim ke service global (event bus, callback plugin) tanpa unregister.
- Memuat ribuan item ke `ListView(children: [...])` alih-alih `ListView.builder`.
- Menyimpan `Uint8List` foto resolusi penuh di state Bloc.
- Mengabaikan `dispose()` pada `TextEditingController` "karena kecil".

## Performance Considerations

- Leak menyebabkan GC lebih sering & lebih lama di old space → jank.
- Alokasi berumur pendek murah (new space), tetapi alokasi besar berulang di setiap frame (list/collection baru di `build`) tetap menambah tekanan GC — hoist ke luar `build` bila statis.
- Gambar adalah konsumen memori terbesar pada kebanyakan app; atur `cacheWidth` dan batas image cache.
- Isolate baru = heap baru; jangan spawn isolate per item kecil.

## Security Considerations

- Data sensitif (PIN, token) di memori sebaiknya disimpan sesingkat mungkin dan tidak di objek global yang hidup sepanjang app.
- Bersihkan cache in-memory berisi data user saat logout.
- Heap dump / log debug bisa berisi data sensitif — jangan dibagikan sembarangan dari device produksi.

## Real-World Use Cases

- **POS 8 jam nonstop**: leak di halaman checkout (listener cart tidak dilepas) membuat app lambat menjelang tutup shift → diperbaiki dengan `removeListener` & pengujian buka-tutup 50×.
- **Field app dengan foto**: foto 12 MP dikompres ke 1600 px sebelum disimpan, thumbnail dengan `cacheWidth`.
- **Katalog besar**: `ListView.builder` + gambar `memCacheWidth`.

## Interview Questions

1. Bagaimana garbage collection Dart bekerja secara garis besar?
2. Apa penyebab umum memory leak di Flutter?
3. Bagaimana Anda menemukan memory leak?
4. Mengapa gambar bisa menghabiskan memori dan bagaimana mengatasinya?
5. Apakah membuat banyak widget di setiap `build` menyebabkan masalah memori?

## Sample Answers

1. GC generasional: objek baru di new space yang dikumpulkan cepat & sering; objek yang bertahan dipindah ke old space yang dikumpulkan lebih jarang. Objek dibersihkan saat tidak lagi dapat dijangkau dari root.
2. Controller/subscription/timer tidak di-dispose, listener pada objek berumur panjang tidak dilepas, `BuildContext`/State disimpan di singleton, cache tanpa batas, dan gambar resolusi tinggi yang di-decode penuh.
3. Reproduksi dengan membuka-tutup fitur berulang di profile mode, pantau grafik heap di DevTools Memory, bandingkan heap snapshot, cari class yang instance-nya terus bertambah, lalu telusuri retaining path. Di test, aktifkan leak_tracker.
4. Gambar dikompresi di file tetapi di-decode menjadi bitmap mentah (lebar × tinggi × 4 byte). Decode pada ukuran tampilan (`cacheWidth/Height`), kompres sebelum simpan, dan batasi image cache.
5. Umumnya tidak — widget adalah objek kecil berumur pendek dan GC new space sangat efisien. Masalah muncul jika membuat objek besar/collection besar berulang setiap frame atau menahan referensi ke objek lama.

## Practical Exercises

1. Buka-tutup satu halaman 20× dan bandingkan heap snapshot; perbaiki leak yang ditemukan.
2. Ukur memori list 200 gambar dengan dan tanpa `cacheWidth`.
3. Aktifkan `leak_tracker` di widget test dan perbaiki satu temuan.

## Quick Reference

```text
create/listen/addListener ↔ dispose/cancel/removeListener · BlocProvider/autoDispose kelola lifetime
Jangan simpan BuildContext/State di global · cache selalu berbatas (LRU/TTL)
Gambar: cacheWidth/memCacheWidth · kompres foto · batasi imageCache
DevTools Memory (profile mode): heap trend → snapshot diff → retaining path · leak_tracker di test
```

## Related Topics

- [Widget Lifecycle](/flutter/widget-lifecycle/)
- [Rendering & Performance Optimization](/flutter/rendering-performance/)
- [Memory Leak Detection](/testing-performance/memory-leak-detection/)
- Referensi resmi: [DevTools Memory view](https://docs.flutter.dev/tools/devtools/memory), [leak_tracker](https://pub.dev/packages/leak_tracker).
