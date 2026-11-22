---
title: "Platform Channels & Native Integration"
description: "Mengintegrasikan Flutter dengan kode Android native: MethodChannel, EventChannel, BasicMessageChannel, Pigeon (type-safe), threading, error handling, lifecycle & ActivityAware plugin, platform view, FFI, menyusun plugin sendiri, serta testing — dengan contoh printer Bluetooth & scanner."
level: advanced
status: complete
version: "Flutter 3.x · Pigeon 22+ · Android embedding v2 — cek dokumentasi resmi"
updated: 2026-11-13
tags: [android, flutter, platform-channel, pigeon, plugin, native-integration]
---

## Overview

**Platform channel** adalah mekanisme komunikasi asinkron antara kode Dart dan kode platform (Kotlin/Java di Android,
Swift/Objective-C di iOS) melalui pesan yang di-serialisasi. Digunakan ketika fitur belum tersedia sebagai plugin,
atau saat mengintegrasikan SDK vendor (printer, payment terminal, scanner). **Pigeon** menghasilkan kode channel yang
**type-safe** dari definisi Dart.

## Why It Matters

Aplikasi bisnis (kasir, logistik, lapangan) hampir selalu butuh integrasi perangkat atau SDK native. Kemampuan menulis
plugin yang aman, tidak memblokir UI, dan menangani error dengan baik adalah pembeda Flutter developer senior.

## Core Concepts

| Channel | Pola | Contoh |
| --- | --- | --- |
| `MethodChannel` | Request–response (pemanggilan method) | `printReceipt()`, `getBatteryLevel()` |
| `EventChannel` | Stream dari native ke Dart | Hasil scan barcode, status koneksi printer |
| `BasicMessageChannel` | Pesan bebas dengan codec | Jarang dipakai langsung |
| Pigeon | Generator API type-safe (host & Flutter API) | Kontrak antarmuka yang kompleks |
| Platform view | Menampilkan view native di tree Flutter | Peta, preview kamera SDK vendor |
| FFI (`dart:ffi`) | Panggil library C langsung (sinkron) | Library kriptografi/pemrosesan native |

**Codec standar** mendukung: null, bool, int, double, String, Uint8List & typed list, List, Map.

## How It Works

```text
Dart: channel.invokeMethod('print', args) → encode (StandardMessageCodec) → binary messenger
Android: handler dipanggil di MAIN (platform) thread → kerjakan di background → result.success/error di main thread
→ decode → Future di Dart selesai
Nama channel harus unik & sama di kedua sisi (mis. "com.example.pos/printer")
```

## Implementation

### MethodChannel sederhana

```dart
// Dart
class PrinterChannel {
  static const _channel = MethodChannel('com.example.pos/printer');

  Future<void> printReceipt(Uint8List escPosBytes, {required String address}) async {
    try {
      await _channel.invokeMethod<void>('printReceipt', {'address': address, 'data': escPosBytes});
    } on PlatformException catch (e) {
      throw PrinterFailure(code: e.code, message: e.message ?? 'Gagal mencetak');
    } on MissingPluginException {
      throw const PrinterFailure(code: 'UNSUPPORTED', message: 'Printer tidak didukung di platform ini');
    }
  }
}
```

```kotlin
// Android — MainActivity.kt (atau di dalam plugin)
class MainActivity : FlutterActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.example.pos/printer")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "printReceipt" -> {
                        val address = call.argument<String>("address")
                        val data = call.argument<ByteArray>("data")
                        if (address == null || data == null || data.size > 64 * 1024) {
                            result.error("INVALID_ARGS", "address/data tidak valid", null); return@setMethodCallHandler
                        }
                        scope.launch {
                            try {
                                withContext(Dispatchers.IO) { BluetoothPrinter(address).use { it.write(data) } }
                                result.success(null)                       // kembali di main thread
                            } catch (e: SecurityException) {
                                result.error("PERMISSION_DENIED", "Izin Bluetooth belum diberikan", null)
                            } catch (e: IOException) {
                                result.error("PRINTER_UNREACHABLE", e.message, null)
                            }
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
```

### EventChannel: stream hasil scanner

```kotlin
EventChannel(messenger, "com.example.pos/scanner").setStreamHandler(object : EventChannel.StreamHandler {
    private var receiver: BroadcastReceiver? = null
    override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
        receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) { i.getStringExtra("barcode")?.let(events::success) }
        }
        ContextCompat.registerReceiver(context, receiver, IntentFilter(SCAN_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED)
    }
    override fun onCancel(arguments: Any?) { receiver?.let(context::unregisterReceiver); receiver = null }
})
```

```dart
final scans = const EventChannel('com.example.pos/scanner').receiveBroadcastStream().cast<String>();
```

### Pigeon (type-safe)

```dart
// pigeons/printer_api.dart
import 'package:pigeon/pigeon.dart';

class PrintJob { PrintJob({required this.address, required this.data}); String address; Uint8List data; }

@HostApi()
abstract class PrinterHostApi {
  @async
  void printReceipt(PrintJob job);
  List<String> pairedPrinters();
}
// dart run pigeon --input pigeons/printer_api.dart  → menghasilkan kode Dart & Kotlin
```

```kotlin
class PrinterHostApiImpl(private val scope: CoroutineScope) : PrinterHostApi {
    override fun printReceipt(job: PrintJob, callback: (Result<Unit>) -> Unit) {
        scope.launch {
            val r = runCatching { withContext(Dispatchers.IO) { BluetoothPrinter(job.address).use { it.write(job.data) } } }
            callback(r)
        }
    }
    override fun pairedPrinters(): List<String> = bluetoothAdapter.bondedDevices.map { it.address }
}
// Registrasi: PrinterHostApi.setUp(flutterEngine.dartExecutor.binaryMessenger, PrinterHostApiImpl(scope))
```

### Plugin yang butuh Activity (izin, activity result)

```kotlin
class PosPrinterPlugin : FlutterPlugin, ActivityAware {
    private var activity: Activity? = null
    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) { /* daftar channel */ }
    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) { /* lepas channel */ }
    override fun onAttachedToActivity(binding: ActivityPluginBinding) { activity = binding.activity }
    override fun onDetachedFromActivityForConfigChanges() { activity = null }
    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) { activity = binding.activity }
    override fun onDetachedFromActivity() { activity = null }
}
```

### Testing

```dart
TestWidgetsFlutterBinding.ensureInitialized();
test('printReceipt memetakan error native', () async {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
    const MethodChannel('com.example.pos/printer'),
    (call) async => throw PlatformException(code: 'PRINTER_UNREACHABLE'),
  );
  expect(() => PrinterChannel().printReceipt(Uint8List(1), address: 'AA'), throwsA(isA<PrinterFailure>()));
});
```

## Best Practices

- **Pigeon untuk API yang lebih dari 1–2 method** — type-safe dan mengurangi bug kunci string.
- **Kerjakan I/O di background thread**, balas `result` sekali dan di main thread.
- **Validasi argumen** di sisi native; kembalikan **kode error yang stabil** (`PERMISSION_DENIED`, `PRINTER_UNREACHABLE`).
- **Bungkus channel di kelas Dart** (repository/service) yang memetakan error ke domain.
- **Lepas resource** (`onCancel`, `onDetachedFromEngine`, cancel scope).
- **Nama channel ber-namespace** (`com.company.app/feature`).

## Anti-Patterns

- Operasi Bluetooth/jaringan/disk langsung di handler (memblokir UI thread platform).
- Memanggil `result` dua kali atau tidak pernah (Future Dart menggantung).
- Mengirim data besar (foto MB) berulang lewat channel — kirim path file.
- Menyimpan `Activity` tanpa menghapusnya saat detach (leak).
- Melempar exception native tanpa ditangkap (crash aplikasi).

## Performance Considerations

Setiap panggilan channel melibatkan serialisasi dan perpindahan thread — hindari panggilan per-frame. Gabungkan data
(batch), gunakan `Uint8List` untuk biner, kirim path untuk file besar, dan pertimbangkan FFI untuk pemanggilan sinkron
berfrekuensi tinggi ke library C.

## Security Considerations

Channel adalah batas kepercayaan: validasi semua argumen di native (ukuran, format, alamat), jangan mengekspos method
berbahaya (eksekusi perintah, akses file bebas), periksa izin runtime sebelum memakai API sensitif, dan jangan
mengirim token/PIN lewat log native.

## Real-World Use Cases

- Cetak struk ESC/POS ke printer Bluetooth/USB.
- Membaca barcode dari scanner hardware bawaan perangkat genggam (broadcast intent).
- Integrasi SDK EDC/payment terminal vendor.
- Membaca data NFC kartu member.

## Interview Questions

1. Apa itu platform channel dan jenis-jenisnya?
2. Di thread mana handler MethodChannel Android dipanggil, dan apa implikasinya?
3. Apa keuntungan Pigeon?
4. Bagaimana menangani error dari native ke Dart?
5. Kapan memakai FFI dibanding platform channel?
6. Bagaimana plugin mendapatkan akses ke Activity?

## Sample Answers

1. Mekanisme pesan asinkron Dart ↔ native: MethodChannel (pemanggilan method), EventChannel (stream native ke Dart), BasicMessageChannel (pesan bebas); Pigeon menghasilkan channel type-safe.
2. Di main/platform thread; pekerjaan berat harus dipindah ke background (coroutine Dispatchers.IO) lalu membalas `result` di main thread agar UI tidak macet dan tidak ANR.
3. Kontrak bertipe di satu definisi, kode Dart & Kotlin/Swift dihasilkan otomatis, menghindari kesalahan nama method/kunci argumen dan casting manual.
4. Native memanggil `result.error(code, message, details)` (atau `Result.failure` di Pigeon); Dart menangkap `PlatformException` dan memetakannya ke failure domain dengan kode yang stabil.
5. FFI untuk memanggil library C secara sinkron dengan overhead rendah (pemrosesan data, kriptografi); platform channel untuk API platform (Android SDK/Kotlin) yang asinkron.
6. Mengimplementasikan `ActivityAware` untuk menerima `ActivityPluginBinding` (activity, listener permission/activity result) dan melepas referensi saat detach.

## Practical Exercises

1. Buat MethodChannel `getDeviceInfo` lalu migrasikan ke Pigeon.
2. Implementasikan EventChannel untuk status konektivitas native.
3. Tulis plugin printer dengan kode error stabil dan test Dart dengan mock handler.

## Quick Reference

```text
MethodChannel (call/result) · EventChannel (stream) · Pigeon (type-safe) · Platform view · FFI (C, sinkron)
Handler di main thread → kerja di Dispatchers.IO → result sekali · validasi argumen · kode error stabil
ActivityAware untuk Activity · lepas resource saat detach/onCancel · kirim path bukan blob besar
Test: setMockMethodCallHandler
```

## Related Topics

- [Flutter vs Native Android](/android/flutter-vs-native/)
- [Android Permissions](/android/permissions/)
- [Background Processing (Flutter)](/flutter/background-processing/)
