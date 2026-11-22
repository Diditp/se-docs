---
title: "Flutter & Dart Questions"
description: "Bank pertanyaan interview Flutter & Dart dari dasar hingga lanjut: Dart language, widget & lifecycle, rendering, state management, async & isolate, arsitektur, performa, testing, dan rilis — dengan jawaban ringkas dan contoh kode."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, flutter, dart, question-bank]
---

## Overview

Halaman ini adalah **bank pertanyaan** Flutter & Dart yang sering muncul di interview mobile engineer, dikelompokkan per
topik dan level. Gunakan sebagai latihan menjawab lisan; materi lengkap setiap topik ada di domain
[Flutter & Dart](/flutter/dart-fundamentals/).

:::note
Detail API dapat berubah antar versi Flutter/Dart. Jawaban ini mengikuti Flutter 3.x / Dart 3.x — sebutkan versi yang
Anda gunakan saat menjawab, dan verifikasi di dokumentasi resmi bila ragu.
:::

## Why It Matters

Interviewer biasanya mulai dari dasar (widget, state) lalu menggali hingga Anda berhenti yakin. Jawaban yang baik:
definisi singkat → cara kerja → contoh dari pengalaman → trade-off.

## Core Concepts

| Area | Topik kunci | Level |
| --- | --- | --- |
| Dart | null safety, `final` vs `const`, async/await, Future vs Stream, isolate, mixin, extension, records, sealed class, pattern matching | B–I |
| Widget | Stateless vs Stateful, lifecycle, `BuildContext`, keys, InheritedWidget | B–I |
| Rendering | Widget/Element/RenderObject tree, constraints, rebuild vs repaint | I–A |
| State management | setState, Provider, Riverpod, Bloc — kapan memakai apa | I |
| Arsitektur | Clean Architecture, repository, DI, feature-first | I–A |
| Performa | jank, `const`, `ListView.builder`, DevTools, isolate | I–A |
| Data & jaringan | Dio interceptor, serialisasi, database lokal, offline-first | I |
| Testing | unit, widget, golden, integration test, mocking | I |
| Rilis | flavors, obfuscation, signing, CI/CD, OTA (Shorebird) | I–A |

## How It Works

Struktur jawaban teknis yang efektif:

```text
Definisi 1 kalimat → bagaimana bekerja (mekanisme) → contoh kode/pengalaman → kapan TIDAK dipakai / trade-off
```

## Implementation

### Contoh yang sering diminta ditulis/dijelaskan

```dart
// const vs final
const pi = 3.14;                 // compile-time constant, canonicalized
final now = DateTime.now();      // ditetapkan sekali saat runtime

// Sealed class + pattern matching (Dart 3)
sealed class Result<T> {}
final class Ok<T> extends Result<T> { Ok(this.value); final T value; }
final class Err<T> extends Result<T> { Err(this.message); final String message; }

String render(Result<int> r) => switch (r) {
  Ok(:final value) => 'Nilai $value',
  Err(:final message) => 'Error: $message',
};                                // compiler memastikan semua kasus tertangani

// Future vs Stream
Future<User> fetchUser() async => api.getUser();          // satu nilai
Stream<int> ticker() => Stream.periodic(const Duration(seconds: 1), (i) => i); // banyak nilai

// Komputasi berat di isolate
final parsed = await Isolate.run(() => parseHugeJson(raw));

// Keys: mempertahankan state saat item list berpindah posisi
ListView(children: [for (final t in todos) TodoTile(key: ValueKey(t.id), todo: t)]);

// Hindari memakai BuildContext setelah await tanpa cek mounted
Future<void> _save() async {
  await repo.save();
  if (!context.mounted) return;
  Navigator.of(context).pop();
}
```

## Best Practices

- Jawab dengan **mekanisme**, bukan hafalan ("`const` widget tidak dibuat ulang karena instance-nya canonicalized dan Element dapat melewati rebuild…").
- **Kaitkan dengan pengalaman nyata** (fitur, bug, metrik).
- **Akui batas pengetahuan** lalu jelaskan cara Anda akan mencari tahu.
- **Sebutkan versi** untuk fitur baru (Dart 3 records/patterns, Impeller).

## Anti-Patterns

- Menjawab "Bloc lebih bagus" tanpa konteks.
- Menyebut istilah tanpa bisa menjelaskan (mis. "Element tree") saat digali.
- Mencampur aturan lama yang sudah berubah tanpa menyebut versi.

## Performance Considerations

Siapkan cerita konkret optimasi: apa gejalanya (jank, memori), alat ukur (DevTools Performance/Memory, `--profile`),
perbaikan (`const`, memecah widget, `RepaintBoundary`, pagination, isolate, cache gambar), dan hasilnya.

## Security Considerations

Pertanyaan keamanan Flutter yang umum: penyimpanan token (`flutter_secure_storage`), obfuscation (`--obfuscate
--split-debug-info`), secret tidak boleh di kode klien, SSL pinning dan trade-off-nya, validasi deep link. Lihat
[Flutter Security Best Practices](/flutter/security-best-practices/).

## Real-World Use Cases

- Interview mobile engineer (Flutter) tahap teknis/user.
- Live coding kecil: membuat list dengan pagination, form dengan validasi, atau memperbaiki bug state.
- Diskusi arsitektur aplikasi yang tercantum di CV.

## Interview Questions

**Dasar**

1. Apa beda StatelessWidget dan StatefulWidget?
2. Apa beda `final` dan `const`?
3. Jelaskan lifecycle StatefulWidget.
4. Apa itu `BuildContext`?
5. Apa beda Future dan Stream?

**Menengah**

6. Kapan perlu Key dan jenis-jenisnya?
7. Jelaskan Widget, Element, dan RenderObject tree.
8. Bagaimana Flutter menerapkan constraints ("constraints go down, sizes go up")?
9. Bagaimana memilih state management?
10. Apa itu isolate dan kapan dipakai?
11. Bagaimana menangani error dari API secara konsisten?

**Lanjut**

12. Bagaimana mendiagnosis dan memperbaiki jank?
13. Bagaimana menyusun arsitektur aplikasi besar/multi-tim?
14. Bagaimana strategi testing aplikasi Flutter?
15. Bagaimana merancang aplikasi offline-first?
16. Apa beda hot reload, hot restart, dan OTA patch?

## Sample Answers

1. Stateless tidak memiliki state yang berubah selama hidupnya; Stateful memiliki objek `State` yang bertahan antar rebuild dan memanggil `setState` untuk menjadwalkan rebuild.
2. `final` ditetapkan sekali saat runtime; `const` adalah konstanta compile-time yang di-canonicalize — `const` widget tidak perlu dibangun ulang dan menghemat alokasi.
3. `createState` → `initState` (sekali) → `didChangeDependencies` → `build` → `didUpdateWidget` (saat parent memberi konfigurasi baru) → `deactivate` → `dispose` (lepas controller/subscription). Detail: [Widget Lifecycle](/flutter/widget-lifecycle/).
4. Handle posisi widget di Element tree; dipakai untuk mencari ancestor (Theme, Navigator, provider). Jangan dipakai setelah widget di-unmount — cek `context.mounted` setelah `await`.
5. Future menghasilkan satu nilai/eror di masa depan; Stream menghasilkan rangkaian nilai dari waktu ke waktu (single-subscription atau broadcast).
6. Saat widget stateful sejenis berpindah posisi/ditambah/dihapus di list sehingga Flutter perlu mencocokkan state yang benar. `ValueKey`/`ObjectKey` untuk identitas data, `UniqueKey` untuk memaksa state baru, `GlobalKey` untuk akses state lintas tree (mahal, gunakan seperlunya).
7. Widget adalah konfigurasi immutable dan murah; Element adalah instance di tree yang menyimpan posisi dan state serta mencocokkan widget baru dengan yang lama; RenderObject melakukan layout, paint, dan hit-test. Rebuild widget tidak selalu berarti layout/paint ulang.
8. Parent mengirim constraints (min/max lebar & tinggi) ke anak, anak memilih ukuran dalam batas itu dan melaporkannya, parent menentukan posisi anak. Ini menjelaskan error seperti "unbounded height" pada `ListView` di dalam `Column`.
9. Sesuai kompleksitas & tim: `setState` untuk state lokal; Provider/Riverpod untuk DI & state sederhana–menengah dengan testability baik; Bloc untuk alur event→state yang eksplisit dan mudah diaudit di tim besar. Konsistensi dalam satu codebase lebih penting dari pilihan library.
10. Isolate adalah unit eksekusi dengan memori sendiri (tidak berbagi state), berkomunikasi lewat message. Dipakai untuk komputasi berat (parsing JSON besar, kompresi gambar) agar UI thread tidak jank — `Isolate.run`/`compute`.
11. Interceptor Dio memetakan error HTTP/jaringan menjadi tipe `Failure` domain; repository mengembalikan `Result`/`Either`; UI menampilkan pesan sesuai tipe; logging & crash reporting terpusat. Lihat [Error Handling](/flutter/error-handling/).
12. Reproduksi di mode profile pada perangkat nyata → DevTools timeline (UI vs raster thread) → cari rebuild berlebihan, layout mahal, `saveLayer`/opacity/clip, gambar besar → perbaiki (`const`, pecah widget, `RepaintBoundary`, cache/resize gambar, isolate) → ukur ulang. Lihat [Rendering & Performance](/flutter/rendering-performance/).
13. Feature-first + Clean Architecture per fitur, package terpisah untuk core/design system, DI, aturan dependensi yang diuji otomatis, kontrak antar fitur via interface, CI dengan analisis & test.
14. Piramida test: banyak unit test (use case, bloc, repository dengan mock), widget test untuk komponen penting, golden test untuk design system, sedikit integration test untuk alur kritis (login, checkout); dijalankan di CI.
15. Database lokal sebagai source of truth UI, outbox untuk perubahan, ID dari klien, sinkronisasi idempoten dengan delta sync, resolusi konflik eksplisit. Lihat [Offline-First](/flutter/offline-first/).
16. Hot reload menyuntikkan kode baru dan mempertahankan state (debug, JIT); hot restart menjalankan ulang app dan mereset state; OTA patch (mis. Shorebird) mengirim perubahan kode Dart ke aplikasi rilis tanpa melalui store — terbatas pada kode Dart dan harus sesuai kebijakan store.

## Practical Exercises

1. Jawab 16 pertanyaan di atas secara lisan, masing-masing ≤ 90 detik, rekam dan evaluasi.
2. Live coding 30 menit: daftar produk dengan pagination, pull-to-refresh, dan state loading/error/empty.
3. Ambil satu widget besar di proyek Anda dan jelaskan bagaimana Anda akan memecah dan mengujinya.

## Quick Reference

```text
Widget (konfigurasi) · Element (instance+state) · RenderObject (layout/paint)
Lifecycle: initState → didChangeDependencies → build → didUpdateWidget → dispose
const = canonicalized · Key saat state berpindah · context.mounted setelah await
Future (1 nilai) · Stream (banyak) · Isolate.run untuk CPU berat
Jank: profile mode + DevTools → const/split/RepaintBoundary/isolate → ukur ulang
```

## Related Topics

- [Dart Fundamentals](/flutter/dart-fundamentals/)
- [State Management](/flutter/state-management/)
- [Rendering & Performance](/flutter/rendering-performance/)
- [Flutter Testing](/flutter/testing/)
