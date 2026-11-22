---
title: "Async Programming: Future, Stream & Isolate"
description: "Cara kerja event loop Dart, Future, Stream, dan Isolate — kapan memakai masing-masing dan bagaimana menghindari jank."
level: intermediate
status: complete
version: "Dart 3.x / Flutter 3.x"
updated: 2026-11-07
tags: [dart, async, future, stream, isolate, event-loop]
---

## Overview

Dart menjalankan kode di dalam **isolate** — unit eksekusi dengan memory heap sendiri dan **satu thread** yang
memproses antrian event melalui **event loop**. Asynchrony di Dart punya tiga alat utama:

| Alat | Menghasilkan | Dipakai untuk |
| --- | --- | --- |
| `Future<T>` | Satu nilai (atau error) di masa depan | HTTP request, query DB, baca file |
| `Stream<T>` | Banyak nilai seiring waktu | Data real-time, event UI, hasil query yang di-*watch* |
| `Isolate` | Eksekusi paralel sungguhan | Pekerjaan **CPU-bound** berat (parsing besar, enkripsi, image processing) |

Kunci pemahaman: **`async/await` bukan multithreading.** Ia hanya cara menulis kode yang menunggu tanpa memblokir event loop.

## Why It Matters

Flutter harus menggambar frame setiap ~16 ms (60 Hz) atau ~8 ms (120 Hz). UI, gesture, dan kode Dart Anda berbagi
thread yang sama di main isolate. Jika satu fungsi berjalan 200 ms secara sinkron, **12 frame terlewat** — user melihat jank
atau aplikasi terasa *freeze*. Memahami async membuat Anda bisa:

- Menjaga UI tetap responsif saat I/O dan komputasi berat.
- Menghindari bug klasik: `setState() called after dispose()`, race condition saat user mengetik cepat, stream yang bocor.
- Menjawab pertanyaan interview yang hampir selalu muncul: *"Apa beda Future, Stream, dan Isolate?"*

## Core Concepts

- **Event loop** — memproses dua antrian: **microtask queue** (prioritas tinggi) lalu **event queue** (I/O, timer, gesture, frame).
- **Future** — status *uncompleted* → *completed with value* atau *completed with error*.
- **`async` / `await`** — fungsi `async` selalu mengembalikan `Future`; `await` menangguhkan fungsi (bukan thread) sampai Future selesai.
- **Stream** — *single-subscription* (satu listener, data berurutan) atau *broadcast* (banyak listener, event bisa terlewat).
- **StreamController / `async*` / `yield`** — cara membuat stream.
- **StreamSubscription** — handle untuk `pause`, `resume`, dan **`cancel`** (wajib dibersihkan).
- **Isolate** — memory tidak dibagi; komunikasi lewat **message passing** (`SendPort`/`ReceivePort`). `Isolate.run()` (Dart 2.19+) dan `compute()` adalah API praktis.

## How It Works

```text
main isolate (1 thread)
┌──────────────────────────────────────────────────────────┐
│ while (true) {                                           │
│   while (microtaskQueue.isNotEmpty) run(microtask);      │ ← Future.then dari future yg sudah selesai, scheduleMicrotask
│   if (eventQueue.isNotEmpty) run(eventQueue.next);       │ ← I/O callback, Timer, tap, frame (vsync)
│ }                                                        │
└──────────────────────────────────────────────────────────┘
```

1. `await http.get(...)` → request diserahkan ke I/O sistem; fungsi Anda **ditangguhkan**, event loop bebas menggambar frame.
2. Saat respons datang, sebuah event masuk queue → continuation fungsi Anda dijalankan.
3. Sebaliknya, `jsonDecode(stringBesar)` adalah kerja CPU murni: tidak ada yang bisa "ditunggu", jadi ia memblokir loop sampai selesai — **di sinilah Isolate dibutuhkan**.

Urutan eksekusi:

```dart
void main() {
  print('1 sync');
  Future(() => print('4 event queue'));
  Future.microtask(() => print('3 microtask'));
  scheduleMicrotask(() => print('3b microtask'));
  print('2 sync');
}
// 1 sync, 2 sync, 3 microtask, 3b microtask, 4 event queue
```

## Implementation

### Future dengan error handling dan timeout

```dart
class ProductRepository {
  ProductRepository(this._dio);
  final Dio _dio;

  Future<List<Product>> fetchProducts() async {
    try {
      final res = await _dio
          .get<List<dynamic>>('/products')
          .timeout(const Duration(seconds: 10));
      return res.data!.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw NetworkFailure.fromDio(e); // map ke error domain, jangan bocorkan Dio ke UI
    } on TimeoutException {
      throw const NetworkFailure.timeout();
    }
  }
}
```

### Menjalankan beberapa Future secara paralel

```dart
// ❌ Serial: total = t1 + t2 + t3
final user = await api.getUser();
final orders = await api.getOrders();

// ✅ Paralel: total ≈ max(t1, t2) — gunakan record destructuring (Dart 3)
final (user, orders) = await (api.getUser(), api.getOrders()).wait;
```

### Stream: membuat, mentransformasi, dan membersihkan

```dart
// Generator stream
Stream<int> countdown(int from) async* {
  for (var i = from; i >= 0; i--) {
    await Future.delayed(const Duration(seconds: 1));
    yield i;
  }
}

// Debounce pencarian tanpa package tambahan
class SearchController {
  final _query = StreamController<String>();
  Timer? _debounce;
  void onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _query.add(q));
  }
  // asyncExpand memproses query BERURUTAN (tidak membatalkan yang lama).
  // Untuk "hanya hasil terbaru" gunakan switchMap dari package rxdart,
  // atau abaikan hasil yang query-nya sudah bukan yang terbaru (lihat Exercise 3).
  Stream<List<Product>> results(ProductRepository repo) =>
      _query.stream.distinct().asyncExpand((q) => Stream.fromFuture(repo.search(q)));
  void dispose() { _debounce?.cancel(); _query.close(); }
}
```

```dart
class _CartBadgeState extends State<CartBadge> {
  StreamSubscription<int>? _sub;
  int _count = 0;

  @override
  void initState() {
    super.initState();
    _sub = widget.cart.countStream.listen((c) {
      if (!mounted) return;       // jaga-jaga
      setState(() => _count = c);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();               // WAJIB — mencegah leak & setState after dispose
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Badge(label: Text('$_count'));
}
```

### Isolate untuk pekerjaan CPU-bound

```dart
// Isolate.run: spawn, jalankan, kembalikan hasil, tutup otomatis.
Future<List<Transaction>> parseTransactions(String rawJson) {
  return Isolate.run(() {
    final list = jsonDecode(rawJson) as List<dynamic>;
    return list.map((e) => Transaction.fromJson(e as Map<String, dynamic>)).toList();
  });
}
```

:::caution[Version-dependent]
`Isolate.run` tersedia sejak Dart 2.19. Di Flutter Web, isolate tidak berjalan paralel (compute dijalankan di thread yang sama).
Closure yang dikirim ke isolate tidak boleh menangkap objek yang tidak bisa dikirim (mis. `Socket`, `ReceivePort` milik isolate lain).
:::

## Best Practices

- **Pilih alat sesuai jenis kerja:** I/O-bound → `Future`/`await`; nilai berkelanjutan → `Stream`; CPU-bound > ~16 ms → `Isolate.run`. Alasannya: hanya isolate yang benar-benar memindahkan kerja dari thread UI.
- **Selalu tangani error di batas layer** (repository) dan ubah menjadi tipe error domain, agar UI tidak bergantung pada detail library.
- **Gunakan `.wait` / `Future.wait` untuk request independen** — memotong latency total.
- **Cancel subscription & close controller di `dispose`**, atau gunakan `StreamBuilder`/state management yang mengelolanya otomatis.
- **Cek `mounted` setelah `await` di dalam State** sebelum memakai `context` atau `setState` — widget bisa sudah hilang.
- **Beri timeout pada semua network call** — tanpa timeout, Future bisa menggantung sangat lama.
- **Aktifkan lint `unawaited_futures` & `discarded_futures`** agar Future yang lupa di-`await` terdeteksi; gunakan `unawaited()` jika memang disengaja.

## Anti-Patterns

| Anti-pattern | Masalah | Perbaikan |
| --- | --- | --- |
| `async` dianggap membuat kode paralel | Parsing berat tetap memblokir UI | `Isolate.run` |
| `await` berurutan untuk request independen | Latency menumpuk | `.wait` / `Future.wait` |
| `Future.delayed(Duration.zero)` untuk "memperbaiki" bug timing | Menutupi race condition | Perbaiki urutan/state, gunakan `addPostFrameCallback` bila memang perlu setelah frame |
| `.listen()` tanpa `cancel()` | Memory leak, callback ke widget mati | Simpan subscription, cancel di `dispose` |
| `catch (e) {}` kosong | Error hilang tanpa jejak | Log + map ke failure |
| Membuat Future di dalam `build()` lalu dipasang ke `FutureBuilder` | Request ulang setiap rebuild | Buat Future di `initState` atau di state management |
| Spawn isolate untuk kerja kecil | Overhead spawn + copy data lebih mahal | Ukur dulu; isolate untuk kerja > beberapa ms |

## Performance Considerations

- **Biaya isolate:** spawn memakan waktu (ms) dan data dikopi saat dikirim (kecuali `TransferableTypedData` atau hasil terakhir `Isolate.exit` yang bisa dipindahkan tanpa copy). Untuk banyak tugas kecil berulang, gunakan **long-lived isolate** dengan port.
- **Microtask flood:** rantai microtask tanpa jeda menahan frame. Pecah kerja panjang atau pindah ke isolate.
- **Stream dengan banyak event (sensor, scroll):** gunakan throttle/debounce dan `distinct()` untuk mengurangi rebuild.
- **Ukur di profile mode** dengan DevTools → Performance; cari frame UI thread > 16 ms.

## Security Considerations

- Jangan menaruh token/secret di pesan log saat debugging async flow.
- Timeout dan retry harus memakai **backoff + jitter** dan batas maksimum agar tidak membebani server (self-DDoS) saat backend bermasalah.
- Race condition pada refresh token (beberapa request 401 bersamaan memicu banyak refresh) bisa mencabut sesi: gunakan **single-flight** (satu `Completer` bersama) untuk proses refresh.

```dart
Completer<String>? _refreshing;
Future<String> refreshToken() {
  if (_refreshing != null) return _refreshing!.future;     // request lain menunggu hasil yang sama
  final c = _refreshing = Completer<String>();
  _doRefresh().then(c.complete, onError: c.completeError).whenComplete(() => _refreshing = null);
  return c.future;
}
```

## Real-World Use Cases

- **POS:** sinkronisasi outbox transaksi di background sambil kasir tetap bisa input — `Stream` dari Drift `watch()` untuk daftar transaksi, `Future` untuk push ke server.
- **Import katalog produk 50.000 item** dari file CSV/JSON → parse di `Isolate.run`, insert batch di transaksi DB.
- **Pencarian produk** dengan debounce 300 ms dan hanya menampilkan hasil query terakhir.
- **Status koneksi** (`connectivity_plus`) sebagai `Stream` untuk memicu sync ketika online.

## Interview Questions

1. **(Fundamental)** Apa beda `Future` dan `Stream`?
2. **(Fundamental)** Apakah `async/await` membuat kode berjalan di thread lain?
3. **(Intermediate)** Jelaskan microtask queue vs event queue.
4. **(Intermediate)** Apa beda single-subscription dan broadcast stream?
5. **(Intermediate)** Bagaimana menjalankan tiga request API secara paralel dan menangani jika salah satu gagal?
6. **(Advanced)** Kapan memakai `Isolate.run` vs long-lived isolate? Apa biaya isolate?
7. **(Advanced)** Bagaimana mencegah banyak refresh token berjalan bersamaan?

## Sample Answers

1. **Future** mewakili **satu** hasil asinkron; **Stream** mewakili **urutan** hasil asinkron dari waktu ke waktu. HTTP GET → Future; perubahan isi keranjang → Stream.
2. **Tidak.** `await` menangguhkan fungsi dan mengembalikan kontrol ke event loop di thread yang sama. Kerja I/O dilakukan sistem; kerja CPU tetap di thread ini. Paralelisme sungguhan butuh Isolate.
3. Event loop mengosongkan **semua microtask** sebelum mengambil **satu event** berikutnya. Microtask: continuation Future, `scheduleMicrotask`. Event: I/O, timer, input, frame. Akibatnya microtask yang tidak berhenti bisa memblokir rendering.
4. Single-subscription hanya satu listener dan menyimpan event sampai di-listen — cocok untuk data berurutan (respons file/HTTP). Broadcast untuk banyak listener; event saat tidak ada listener hilang — cocok untuk event bus/notifikasi.
5. `final (a, b, c) = await (f1(), f2(), f3()).wait;` — jika ada yang gagal akan melempar `ParallelWaitError` yang berisi nilai & error per posisi, sehingga Anda bisa memakai hasil yang berhasil. Dengan `Future.wait(..., eagerError: true)` error pertama langsung dilempar.
6. `Isolate.run` untuk tugas sekali jalan (parse satu file). Long-lived isolate (spawn sekali, komunikasi via `SendPort`) untuk banyak tugas berulang karena menghindari biaya spawn tiap kali. Biaya: waktu spawn, memory heap baru, dan copy data antar isolate.
7. Simpan `Completer` refresh yang sedang berjalan; request berikutnya menunggu Future yang sama (single-flight). Setelah selesai, request asli di-retry dengan token baru; jika refresh gagal, logout sekali.

## Practical Exercises

1. Tulis program yang mencetak urutan sync/microtask/event, tebak dulu outputnya, lalu jalankan.
2. Ukur waktu `jsonDecode` 20 MB di main isolate vs `Isolate.run` menggunakan DevTools Performance (profile mode).
3. Buat fitur pencarian dengan debounce 300 ms yang membatalkan hasil query lama (hanya hasil terbaru yang tampil).
4. Implementasikan interceptor Dio dengan refresh token single-flight dan uji dengan 5 request paralel yang mendapat 401.
5. Buat `Stream` dari tabel Drift (`watch()`) dan tampilkan jumlah transaksi yang belum tersinkron.

## Quick Reference

- `Future` = 1 nilai · `Stream` = banyak nilai · `Isolate` = paralel sungguhan.
- `async/await` ≠ thread baru. CPU-bound > 16 ms → `Isolate.run`.
- Urutan: **sync → microtask → event**.
- Paralel: `await (a(), b()).wait` atau `Future.wait`.
- Selalu: timeout, try/catch di repository, `cancel()` subscription, cek `mounted` setelah `await`.
- Stream: single-subscription (1 listener) vs broadcast (banyak listener).

## Related Topics

- [Widget Lifecycle](/flutter/widget-lifecycle/) — kapan memulai & membersihkan async work.
- [State Management](/flutter/state-management/) — Bloc/Riverpod mengelola Future & Stream untuk Anda.
- [Rendering & Performance Optimization](/flutter/rendering-performance/)
- [Node.js Runtime & Event Loop](/backend/nodejs-event-loop/) — konsep event loop yang mirip di backend.
- [Coroutines & Flow](/android/coroutines-flow/) — padanan di Kotlin.
- Referensi resmi: [Dart asynchronous programming](https://dart.dev/libraries/async/async-await), [Concurrency in Dart](https://dart.dev/language/concurrency).
