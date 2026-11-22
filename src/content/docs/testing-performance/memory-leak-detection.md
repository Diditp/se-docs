---
title: "Memory Leak Detection"
description: "Mendeteksi dan mencegah memory leak di Flutter, Android, dan Node.js: penyebab umum (controller/subscription tidak di-dispose, listener, closure, cache tanpa batas, Context Activity), Flutter DevTools Memory & leak_tracker, LeakCanary, Android Studio Profiler, heap snapshot Node, OOM, dan image memory."
level: advanced
status: complete
version: "Flutter DevTools · leak_tracker · LeakCanary 2.x · Node --inspect heap snapshot"
updated: 2026-11-13
tags: [performance, memory, leak, devtools, leakcanary, oom]
---

## Overview

**Memory leak** terjadi saat objek yang tidak lagi dibutuhkan tetap **direferensikan**, sehingga garbage collector tidak
bisa membebaskannya. Memori naik terus → GC lebih sering (jank) → akhirnya **OOM crash** atau aplikasi dimatikan OS di
background.

## Why It Matters

Perangkat Android kelas bawah (RAM 2–3 GB, umum di pasar Indonesia) sangat sensitif terhadap memori. Leak sering baru
terlihat setelah pemakaian lama — misalnya kasir yang membuka layar transaksi ratusan kali per shift.

## Core Concepts

| Platform | Penyebab umum |
| --- | --- |
| Flutter | `AnimationController`, `TextEditingController`, `ScrollController`, `StreamSubscription`, `Timer` tidak di-dispose/cancel; listener tidak dilepas; closure menangkap `BuildContext`/State; cache static tanpa batas; gambar besar di-decode penuh |
| Android | Static/singleton menyimpan `Activity`/`View`/`Context`; listener/callback tidak di-unregister; coroutine di `GlobalScope`; inner class anonim memegang Activity; Fragment view binding tidak di-null-kan |
| Node.js | Cache/Map global tanpa eviction; event listener bertambah tiap request; closure di timer; objek per request disimpan di modul |

| Istilah | Arti |
| --- | --- |
| Retained size | Memori yang akan bebas bila objek tersebut dibebaskan |
| GC root | Titik awal referensi (static, thread aktif, stack) |
| Retaining path | Rantai referensi dari GC root ke objek yang bocor — kunci menemukan penyebab |

## How It Works

```text
Ulangi skenario (buka-tutup layar N kali) → paksa GC → bandingkan heap snapshot/jumlah instance
Instance yang seharusnya hilang masih ada → lihat retaining path → temukan referensi yang tertinggal → perbaiki
```

## Implementation

### Flutter: pola dispose yang benar

```dart
class _ScannerPageState extends State<ScannerPage> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(seconds: 1));
  final _search = TextEditingController();
  StreamSubscription<Barcode>? _sub;
  Timer? _idle;

  @override
  void initState() {
    super.initState();
    _sub = context.read<ScannerService>().barcodes.listen(_onBarcode);
    _idle = Timer.periodic(const Duration(seconds: 30), (_) => _checkIdle());
  }

  @override
  void dispose() {
    _sub?.cancel();
    _idle?.cancel();
    _pulse.dispose();
    _search.dispose();
    super.dispose();
  }
}
```

Bloc/Cubit: tutup subscription di `close()`. Riverpod: gunakan `autoDispose` dan `ref.onDispose`.

### Flutter: deteksi dengan DevTools & leak_tracker

```text
DevTools → Memory:
  1. Snapshot awal  2. Buka-tutup layar 10×  3. GC  4. Snapshot lagi  5. Diff → cari class milik Anda yang bertambah
leak_tracker (dipakai framework untuk test): mendeteksi objek disposable yang tidak di-dispose atau tidak di-GC
```

```dart
// Mengaktifkan pelacakan leak di widget test (API dapat berubah — cek dokumentasi leak_tracker_flutter_testing)
testWidgets('ScannerPage tidak bocor', experimentalLeakTesting: LeakTesting.settings.withTrackedAll(), (t) async {
  await t.pumpWidget(const MaterialApp(home: ScannerPage()));
  await t.pumpWidget(const SizedBox());
});
```

### Android: LeakCanary

```kotlin
// build.gradle.kts — hanya debug
debugImplementation("com.squareup.leakcanary:leakcanary-android:<versi>")
// Tidak perlu kode init; LeakCanary memantau Activity, Fragment, View, ViewModel yang dihancurkan
// dan menampilkan retaining path saat objek tidak di-GC.
```

```kotlin
// ❌ Leak: singleton menyimpan Activity
object PrinterManager { var context: Context? = null }
// ✅ Gunakan applicationContext atau jangan simpan Context
class PrinterManager @Inject constructor(@ApplicationContext private val context: Context)
```

### Node.js: heap snapshot

```bash
node --inspect dist/main.js           # buka chrome://inspect → Memory → Heap snapshot (ambil 2–3 kali di bawah beban)
# atau programatik: import { writeHeapSnapshot } from 'node:v8'; writeHeapSnapshot();
```

```ts
// ❌ cache tanpa batas
const cache = new Map<string, Product>();
// ✅ batasi ukuran & TTL (mis. lru-cache)
const cache = new LRUCache<string, Product>({ max: 5_000, ttl: 60_000 });
```

### Memori gambar (sering disangka leak)

```dart
Image.network(url, cacheWidth: 300);              // decode sesuai ukuran tampil, bukan 4000×3000
PaintingBinding.instance.imageCache.maximumSizeBytes = 100 << 20;   // sesuaikan bila perlu
```

## Best Practices

- **Setiap `create/listen/start` punya pasangan `dispose/cancel/stop`** di lifecycle yang tepat.
- **Jangan simpan `BuildContext`/Activity** di objek berumur panjang.
- **Cache selalu dibatasi** (ukuran & TTL).
- **Pasang LeakCanary di debug** dan uji leak di skenario buka-tutup berulang.
- **Pantau memori di perangkat low-end** sebelum rilis.

## Anti-Patterns

- `GlobalScope.launch` atau `Timer.periodic` tanpa pembatalan.
- Menambahkan listener di `build()`.
- Singleton yang menyimpan View/Activity.
- Menyimpulkan leak dari satu snapshot tanpa memaksa GC dan membandingkan.

## Performance Considerations

Leak memperbesar heap sehingga GC lebih sering dan lebih lama → jank. Mengurangi alokasi (objek sementara di loop
`build`, decode gambar besar) juga menurunkan tekanan GC walau bukan leak.

## Security Considerations

Heap dump berisi data di memori (token, data pengguna) — perlakukan sebagai data sensitif, jangan diunggah ke tempat
publik, dan jangan aktifkan pengambilan heap dump di build release.

## Real-World Use Cases

- Layar scanner yang lupa `cancel()` stream kamera → memori naik setiap kali dibuka.
- Singleton printer Bluetooth menyimpan Activity → LeakCanary menunjukkan retaining path.
- Server Node OOM setelah beberapa hari karena Map cache tanpa eviction.

## Interview Questions

1. Apa itu memory leak di bahasa dengan garbage collector?
2. Sebutkan penyebab leak umum di Flutter.
3. Bagaimana menemukan leak di Android?
4. Bagaimana menyelidiki memori Node.js yang terus naik?
5. Apa beda leak dan penggunaan memori tinggi?

## Sample Answers

1. Objek yang tidak dibutuhkan masih direferensikan dari GC root sehingga tidak bisa dikumpulkan; memori tumbuh terus.
2. Controller/subscription/timer tidak di-dispose atau cancel, listener tidak dilepas, closure yang menangkap State/context, dan cache tanpa batas.
3. LeakCanary di debug untuk mendeteksi objek yang dihancurkan tetapi tidak di-GC beserta retaining path-nya, lalu Android Studio Memory Profiler/heap dump untuk analisis lebih dalam.
4. Ambil beberapa heap snapshot di bawah beban, bandingkan objek yang bertambah, lihat retainer-nya; periksa cache global, listener, dan closure.
5. Leak tumbuh tanpa batas dan tidak turun setelah GC; penggunaan tinggi bisa stabil (misalnya cache gambar besar) dan diatasi dengan mengurangi ukuran, bukan memperbaiki referensi.

## Practical Exercises

1. Buat layar dengan subscription yang tidak di-cancel, temukan dengan DevTools, lalu perbaiki.
2. Pasang LeakCanary dan uji rotasi layar & navigasi bolak-balik.
3. Simulasikan cache tanpa batas di Node dan bandingkan heap snapshot.

## Quick Reference

```text
create ↔ dispose · listen ↔ cancel · start ↔ stop · register ↔ unregister
DevTools Memory (snapshot diff) · leak_tracker · LeakCanary · Android Profiler · Node heap snapshot
Jangan simpan Context/Activity · cache LRU+TTL · cacheWidth untuk gambar · uji di low-end
```

## Related Topics

- [CPU & Network Profiling](/testing-performance/cpu-network-profiling/)
- [Image & Asset Optimization](/testing-performance/image-asset-optimization/)
- [ViewModel & Lifecycle-Aware Components](/android/viewmodel-lifecycle-aware/)
