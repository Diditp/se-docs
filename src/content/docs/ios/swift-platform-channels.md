---
title: "Platform Channel & Pigeon di Swift"
description: "Implementasi sisi iOS untuk platform channel Flutter: FlutterMethodChannel di AppDelegate dan plugin (FlutterPlugin.register), threading & main thread, async/await, FlutterError, FlutterEventChannel, Pigeon untuk Swift, struktur plugin federated, serta testing — padanan dari versi Kotlin."
level: advanced
status: complete
version: "Flutter 3.x · Swift 5.9+ · Pigeon 22+"
updated: 2026-11-13
tags: [ios, swift, flutter, platform-channel, pigeon, plugin]
---

## Overview

Halaman ini adalah pasangan iOS dari [Platform Channels & Native Integration](/android/platform-channels/). Konsepnya
sama — Dart mengirim pesan, native membalas — tetapi sisi iOS ditulis dalam **Swift** menggunakan `FlutterMethodChannel`,
`FlutterEventChannel`, atau kode hasil **Pigeon**.

## Why It Matters

Plugin yang hanya diimplementasikan di Android membuat fitur gagal di iOS (`MissingPluginException`). Developer Flutter
yang bisa menulis sisi Swift dapat menyelesaikan integrasi SDK/perangkat di kedua platform tanpa menunggu tim native.

## Core Concepts

| Dart | Android (Kotlin) | iOS (Swift) |
| --- | --- | --- |
| `MethodChannel` | `MethodChannel.setMethodCallHandler` | `FlutterMethodChannel.setMethodCallHandler` |
| `PlatformException` | `result.error(code, msg, details)` | `result(FlutterError(code:message:details:))` |
| `notImplemented` | `result.notImplemented()` | `result(FlutterMethodNotImplemented)` |
| `EventChannel` | `EventChannel.StreamHandler` | `FlutterStreamHandler` (`onListen`/`onCancel`) |
| Registrasi plugin | `FlutterPlugin.onAttachedToEngine` | `FlutterPlugin.register(with registrar:)` |

Tipe codec standar di Swift: `nil`/`NSNull`, `Bool`, `Int`, `Double`, `String`, `FlutterStandardTypedData` (byte),
`[Any]`, `[String: Any]`.

## How It Works

```text
Dart invokeMethod → binary messenger → handler Swift dipanggil di MAIN thread
→ pekerjaan berat dipindah ke background (Task / DispatchQueue.global)
→ result(...) dipanggil SEKALI (sebaiknya kembali ke main thread) → Future Dart selesai
```

## Implementation

### Channel di AppDelegate

```swift
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let controller = window?.rootViewController as! FlutterViewController
    let channel = FlutterMethodChannel(name: "com.example.pos/printer", binaryMessenger: controller.binaryMessenger)

    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "printReceipt":
        guard
          let args = call.arguments as? [String: Any],
          let address = args["address"] as? String,
          let data = (args["data"] as? FlutterStandardTypedData)?.data,
          data.count <= 64 * 1024
        else {
          result(FlutterError(code: "INVALID_ARGS", message: "address/data tidak valid", details: nil))
          return
        }
        Task {
          do {
            try await PrinterService.shared.print(data, to: address)   // I/O di luar main thread
            await MainActor.run { result(nil) }
          } catch PrinterError.notConnected {
            await MainActor.run { result(FlutterError(code: "PRINTER_UNREACHABLE", message: "Printer tidak terhubung", details: nil)) }
          } catch {
            await MainActor.run { result(FlutterError(code: "UNKNOWN", message: error.localizedDescription, details: nil)) }
          }
        }
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

:::caution[Version-dependent]
Cara mengakses `window?.rootViewController` dapat berubah bila proyek bermigrasi ke UIScene lifecycle. Untuk kode yang
dapat dipakai ulang, lebih aman menaruh channel di **plugin** yang menerima `binaryMessenger` dari registrar.
:::

### Sebagai plugin

```swift
public class PosPrinterPlugin: NSObject, FlutterPlugin {
  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(name: "com.example.pos/printer", binaryMessenger: registrar.messenger())
    let instance = PosPrinterPlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "pairedPrinters": result(PrinterService.shared.pairedAddresses())
    default: result(FlutterMethodNotImplemented)
    }
  }
}
```

### EventChannel: status koneksi printer

```swift
final class PrinterStatusStreamHandler: NSObject, FlutterStreamHandler {
  private var observer: NSObjectProtocol?

  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
    observer = NotificationCenter.default.addObserver(forName: .printerStatusChanged, object: nil, queue: .main) { note in
      events(note.userInfo?["status"] as? String)
    }
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    if let observer { NotificationCenter.default.removeObserver(observer) }
    observer = nil
    return nil
  }
}
// FlutterEventChannel(name: "com.example.pos/printer_status", binaryMessenger: messenger).setStreamHandler(PrinterStatusStreamHandler())
```

### Pigeon (Swift)

```dart
// pigeons/printer_api.dart
@ConfigurePigeon(PigeonOptions(
  dartOut: 'lib/src/printer_api.g.dart',
  kotlinOut: 'android/src/main/kotlin/com/example/pos/PrinterApi.g.kt',
  swiftOut: 'ios/Classes/PrinterApi.g.swift',
))
@HostApi()
abstract class PrinterHostApi {
  @async
  void printReceipt(String address, Uint8List data);
  List<String> pairedPrinters();
}
```

```swift
final class PrinterHostApiImpl: PrinterHostApi {
  func printReceipt(address: String, data: FlutterStandardTypedData, completion: @escaping (Result<Void, Error>) -> Void) {
    Task {
      do { try await PrinterService.shared.print(data.data, to: address); completion(.success(())) }
      catch { completion(.failure(PigeonError(code: "PRINT_FAILED", message: error.localizedDescription, details: nil))) }
    }
  }
  func pairedPrinters() throws -> [String] { PrinterService.shared.pairedAddresses() }
}
// PrinterHostApiSetup.setUp(binaryMessenger: registrar.messenger(), api: PrinterHostApiImpl())
```

*(Nama tipe error dan signature hasil generate bergantung versi Pigeon — lihat file `.g.swift` yang dihasilkan.)*

### Struktur plugin federated

```text
pos_printer/                     (app-facing package, API Dart)
pos_printer_platform_interface/  (kontrak abstrak)
pos_printer_android/             (implementasi Kotlin)
pos_printer_ios/                 (implementasi Swift)
```

## Best Practices

- **Kode error yang sama di Android & iOS** agar Dart cukup menangani satu set error.
- **Validasi argumen** dengan `guard let` sebelum dipakai.
- **I/O di luar main thread**, `result` dipanggil sekali.
- **Pigeon** untuk API yang tumbuh — satu definisi, kode Kotlin & Swift konsisten.
- **Lepas observer/resource** di `onCancel`.

## Anti-Patterns

- Force cast/unwrap (`as!`, `!`) pada argumen dari Dart.
- Implementasi hanya di Android tanpa fallback iOS (`MissingPluginException`).
- Operasi Bluetooth/jaringan sinkron di handler (UI macet).
- Memanggil `result` dua kali (crash) atau tidak sama sekali (Future menggantung).

## Performance Considerations

Seperti di Android: hindari panggilan per frame, kirim byte sebagai `FlutterStandardTypedData`, dan kirim path file
untuk data besar. Pembuatan objek berat (mis. koneksi SDK) sebaiknya sekali lalu dipakai ulang.

## Security Considerations

Channel adalah batas kepercayaan — validasi ukuran & format argumen, jangan mengekspos operasi berbahaya, periksa izin
(Bluetooth, kamera) sebelum memakai API, dan jangan log data sensitif dengan `print`/`NSLog` di release.

## Real-World Use Cases

- Plugin printer struk dengan implementasi Kotlin & Swift.
- Integrasi SDK pembayaran vendor yang tersedia untuk Android dan iOS.
- Membaca NFC kartu member (Core NFC di iOS).

## Interview Questions

1. Bagaimana membuat MethodChannel di sisi iOS?
2. Bagaimana mengembalikan error dari Swift ke Dart?
3. Di thread mana handler iOS dipanggil?
4. Apa itu plugin federated?
5. Mengapa memakai Pigeon untuk plugin multiplatform?

## Sample Answers

1. Buat `FlutterMethodChannel(name:binaryMessenger:)` (di AppDelegate atau di `register(with:)` plugin) dan pasang `setMethodCallHandler` yang memeriksa `call.method` lalu memanggil `result`.
2. Panggil `result(FlutterError(code:message:details:))`; di Dart diterima sebagai `PlatformException` dengan kode yang sama.
3. Di main thread; pekerjaan berat dipindah ke `Task`/`DispatchQueue.global`, lalu `result` dipanggil sekali.
4. Struktur plugin yang memisahkan API Dart, platform interface, dan implementasi per platform ke paket berbeda sehingga platform dapat dikembangkan/ditambahkan secara independen.
5. Satu definisi API menghasilkan kode Dart, Kotlin, dan Swift yang bertipe dan konsisten, mengurangi bug nama method/argumen dan casting manual.

## Practical Exercises

1. Implementasikan sisi iOS dari channel `getDeviceInfo` yang sudah Anda buat di Android.
2. Migrasikan channel tersebut ke Pigeon untuk kedua platform.
3. Buat EventChannel status konektivitas di Swift.

## Quick Reference

```text
FlutterMethodChannel + setMethodCallHandler · result(value) / FlutterError / FlutterMethodNotImplemented
FlutterStreamHandler (onListen/onCancel) · FlutterPlugin.register(with:) · registrar.messenger()
Main thread → Task/background → result sekali · guard let untuk argumen · kode error = Android
Pigeon: dartOut + kotlinOut + swiftOut · plugin federated
```

## Related Topics

- [Platform Channels & Native Integration (Android)](/android/platform-channels/)
- [Swift Fundamentals](/ios/swift-fundamentals/)
- [Permission & Privacy di iOS](/ios/ios-permissions-privacy/)
