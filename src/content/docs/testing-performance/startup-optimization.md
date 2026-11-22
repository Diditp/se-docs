---
title: "Startup Optimization"
description: "Mempercepat waktu startup aplikasi mobile: cold/warm/hot start, TTID & TTFD, mengukur startup Flutter dan Android, inisialisasi malas (lazy init), menunda SDK, splash screen API, Baseline Profiles, ukuran aplikasi, dan anggaran startup di CI."
level: advanced
status: complete
version: "Flutter 3.x · Android 12+ SplashScreen API · Baseline Profiles — cek dokumentasi resmi untuk detail versi"
updated: 2026-11-13
tags: [performance, startup, android, flutter, baseline-profile]
---

## Overview

**Startup time** adalah waktu dari pengguna mengetuk ikon sampai aplikasi **terlihat** dan **bisa dipakai**. Ini kesan
pertama pengguna, dan Android vitals di Play Console menandai startup yang lambat.

## Why It Matters

Startup lambat menurunkan retensi. Pada aplikasi operasional (kasir, kurir), aplikasi sering dibuka ulang setelah process
death sehingga startup terjadi berkali-kali dalam sehari.

## Core Concepts

| Istilah | Arti |
| --- | --- |
| Cold start | Proses belum ada: OS membuat proses, memuat app, engine Flutter, frame pertama |
| Warm start | Proses ada tetapi Activity dibuat ulang |
| Hot start | Activity dibawa ke depan dari background |
| TTID (Time To Initial Display) | Frame pertama tergambar |
| TTFD (Time To Full Display) | Konten utama siap dipakai (dilaporkan app via `reportFullyDrawn`) |

Panduan umum Android vitals (dapat berubah): cold start ≥ 5 s, warm ≥ 2 s, hot ≥ 1,5 s dianggap berlebihan.

## How It Works

```text
Tap ikon → Zygote fork proses → Application.onCreate (SDK init!) → Activity.onCreate
→ Flutter engine init → main() Dart → runApp → frame pertama (TTID) → data dimuat (TTFD)
Setiap pekerjaan sinkron di jalur ini menambah waktu startup.
```

## Implementation

### Mengukur

```bash
# Android: waktu Activity tampil
adb shell am start -W -n com.example.pos/.MainActivity          # TotalTime = TTID (cold bila proses dimatikan dulu)
adb shell am force-stop com.example.pos                          # siapkan cold start

# Flutter
flutter run --profile --trace-startup                             # menghasilkan build/start_up_info.json
```

Logcat juga menampilkan baris `Displayed com.example.pos/.MainActivity: +1s200ms`.

### main() yang ramping

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Hanya yang WAJIB sebelum frame pertama
  await Firebase.initializeApp();                       // dibutuhkan crash reporting sejak awal
  final prefs = await SharedPreferences.getInstance();  // dibutuhkan untuk tema/sesi

  runApp(App(prefs: prefs));

  // Tunda yang tidak kritis sampai setelah frame pertama
  WidgetsBinding.instance.addPostFrameCallback((_) {
    unawaited(RemoteConfigService.instance.fetch());
    unawaited(AnalyticsService.instance.init());
    unawaited(PrinterService.instance.warmUp());
  });
}
```

### Paralelkan inisialisasi independen

```dart
final (db, config) = await (openDatabase(), loadLocalConfig()).wait;   // Dart 3 record .wait
```

### Tampilkan UI dari cache lokal dulu

```text
Startup → tampilkan data terakhir dari DB lokal (cepat) → refresh dari jaringan di belakang (stale-while-revalidate)
Jangan menunggu request jaringan sebelum menampilkan layar utama.
```

### Android native: lazy init & SplashScreen API

```kotlin
class PosApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // ❌ inisialisasi 8 SDK sinkron di sini
        // ✅ hanya yang kritis; sisanya lazy (Hilt Lazy<T>/Provider<T>) atau App Startup library dengan dependency eksplisit
    }
}
```

```kotlin
// Activity — splash sistem (Android 12+, kompatibel lewat androidx.core:core-splashscreen)
installSplashScreen().setKeepOnScreenCondition { viewModel.isLoadingSession.value }
```

Jangan membuat Activity splash terpisah yang menambah satu Activity lagi dan delay buatan.

### Baseline Profiles (Android)

Baseline Profile memberi tahu ART kode mana yang perlu dikompilasi AOT saat instalasi, sehingga jalur startup dan
interaksi kritis lebih cepat sejak pembukaan pertama. Dibuat dengan modul Macrobenchmark/Baseline Profile Gradle plugin
untuk aplikasi native/Compose. Untuk aplikasi Flutter, porsi kode Dart sudah AOT; manfaat terutama pada sisi Kotlin/Java.

### Ukuran aplikasi juga memengaruhi

```bash
flutter build appbundle --analyze-size --target-platform android-arm64    # lihat kontributor ukuran
```

Kurangi aset besar, font yang tidak dipakai, dan dependency berat; Play akan mengirim APK per ABI dari AAB.

## Best Practices

- **Ukur cold start di perangkat low-end** dalam release/profile mode.
- **Hanya inisialisasi yang dibutuhkan frame pertama**; tunda sisanya.
- **Paralelkan** pekerjaan I/O independen.
- **Data lokal dulu**, jaringan menyusul.
- **Gunakan SplashScreen API** dan hindari delay buatan.
- **Pasang anggaran startup** dan pantau di Android vitals/performance monitoring.

## Anti-Patterns

- `await` request jaringan di `main()` sebelum `runApp`.
- `Future.delayed(Duration(seconds: 3))` di splash agar "logo terlihat".
- Memuat semua fitur/modul dan database besar saat startup.
- Migrasi database berat tanpa indikator di startup.

## Performance Considerations

Startup adalah gabungan CPU (init), I/O (disk/DB), dan jaringan. Disk di perangkat murah lambat — hindari membaca file
besar sinkron. Pantau juga warm start setelah process death, bukan hanya instalasi baru.

## Security Considerations

Menunda inisialisasi tidak boleh melewati pemeriksaan keamanan penting (mis. validasi sesi, root/integrity check bila
diwajibkan) sebelum menampilkan data sensitif — tampilkan placeholder sampai pemeriksaan selesai.

## Real-World Use Cases

- Memindahkan init analytics, remote config, dan printer ke setelah frame pertama memotong cold start ~40%.
- Dashboard kasir menampilkan penjualan terakhir dari Drift lalu sinkron di background.

## Interview Questions

1. Apa beda cold, warm, dan hot start?
2. Bagaimana mengukur startup time?
3. Apa saja cara mempercepat startup aplikasi Flutter?
4. Apa itu Baseline Profile?
5. Apa itu TTID dan TTFD?

## Sample Answers

1. Cold: proses dibuat dari nol; warm: proses ada tetapi Activity dibuat ulang; hot: Activity yang ada dibawa ke depan.
2. `adb shell am start -W`, log "Displayed" di Logcat, `flutter run --trace-startup`, Macrobenchmark, serta data lapangan dari Android vitals/Firebase Performance.
3. Ramping-kan `main()`, tunda SDK non-kritis setelah frame pertama, paralelkan I/O, tampilkan data lokal dulu, kurangi ukuran app & aset, dan hindari kerja berat di frame pertama.
4. Daftar kelas/metode yang dikompilasi AOT oleh ART saat instalasi sehingga jalur kritis cepat sejak pertama dijalankan.
5. TTID: frame pertama tergambar; TTFD: konten utama sudah siap dipakai, dilaporkan aplikasi melalui `reportFullyDrawn`.

## Practical Exercises

1. Ukur cold start aplikasi Anda 5 kali dan hitung median.
2. Daftar semua inisialisasi di `main()` dan klasifikasikan: wajib sebelum frame pertama vs bisa ditunda.
3. Terapkan perubahan dan ukur ulang.

## Quick Reference

```text
Cold/warm/hot · TTID/TTFD · am start -W · --trace-startup · Android vitals
main() ramping · postFrameCallback · Future.wait/.wait · data lokal dulu · SplashScreen API
Baseline Profiles (native) · --analyze-size · tanpa delay buatan
```

## Related Topics

- [CPU & Network Profiling](/testing-performance/cpu-network-profiling/)
- [Performance Monitoring](/testing-performance/performance-monitoring/)
- [Activity Lifecycle](/android/activity-lifecycle/)
