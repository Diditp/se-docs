---
title: "Swift Fundamentals"
description: "Dasar Swift untuk Flutter developer: let/var, optional & guard, struct vs class (value vs reference), enum dengan associated value, protocol & extension, closure, error handling, async/await & actor, Codable, ARC dan weak self — dengan perbandingan ke Dart dan Kotlin."
level: beginner
status: complete
version: "Swift 5.9–6.x"
updated: 2026-11-13
tags: [ios, swift, fundamentals, optionals, arc]
---

## Overview

**Swift** adalah bahasa utama pengembangan iOS. Sebagai Flutter developer, Anda tidak perlu menguasai UI iOS
(SwiftUI/UIKit) secara mendalam, tetapi perlu bisa **membaca dan menulis Swift dasar**: `AppDelegate.swift`, plugin dan
platform channel, konfigurasi push notification, serta memahami error saat build iOS.

## Why It Matters

- Integrasi SDK/perangkat di iOS (printer, pembayaran, NFC) ditulis dalam Swift.
- Banyak masalah rilis Flutter terjadi di sisi iOS; membaca kode dan log Swift mempercepat debugging.
- Interview Flutter sering menanyakan "bagaimana di iOS?"; pemahaman dasar Swift menunjukkan Anda siap menangani kedua platform.

## Core Concepts

| Konsep | Swift | Dart | Kotlin |
| --- | --- | --- | --- |
| Konstanta / variabel | `let` / `var` | `final` / `var` | `val` / `var` |
| Nullable | `String?` (Optional) | `String?` | `String?` |
| Unwrap aman | `if let x`, `guard let x else { return }` | `if (x != null)` | `x?.let {}` |
| Default bila nil | `x ?? "-"` | `x ?? '-'` | `x ?: "-"` |
| Paksa unwrap | `x!` (crash bila nil) | `x!` | `x!!` |
| Tipe nilai | `struct`, `enum` (disalin) | — (class semua reference) | `data class` tetap reference |
| Tipe reference | `class` | `class` | `class` |
| Kontrak | `protocol` | abstract class / interface implisit | `interface` |
| Tambah method | `extension` | `extension` | extension function |
| Hasil/error | `throws` + `do/try/catch`, `Result` | `throw`/`try`/`catch` | exception, `Result` |
| Async | `async/await`, `Task`, `actor` | `async/await`, `Future`, isolate | coroutines |
| JSON | `Codable` | `json_serializable` | kotlinx.serialization |
| Memori | ARC (reference counting) | GC | GC |

## How It Works

```text
Swift dikompilasi ke kode native (LLVM) — tidak ada garbage collector.
ARC: setiap referensi strong menaikkan hitungan; objek dibebaskan saat hitungan 0.
Siklus referensi (A → B → A, atau closure menangkap self) → tidak pernah 0 → memory leak → putus dengan weak/unowned.
struct disalin saat di-assign (value semantics); class berbagi instance (reference semantics).
```

## Implementation

```swift
import Foundation

// let/var & type inference
let outletName = "Kopi Kita"
var stock = 10

// Optional & guard
func phoneLabel(_ phone: String?) -> String {
    guard let phone, !phone.isEmpty else { return "-" }   // Swift 5.7+ shorthand
    return phone
}

// struct (value type) + Codable
struct Product: Codable, Equatable {
    let id: String
    let name: String
    let price: Int            // rupiah, integer
    var stock: Int = 0

    enum CodingKeys: String, CodingKey {
        case id, name, price, stock
    }
}

var a = Product(id: "p1", name: "Latte", price: 25_000)
var b = a          // salinan
b.stock = 5        // a.stock tetap 0

// enum dengan associated value (mirip sealed class)
enum PrintResult {
    case success
    case failure(code: String, message: String)
}

func describe(_ r: PrintResult) -> String {
    switch r {                                    // harus exhaustive
    case .success: return "Tercetak"
    case let .failure(code, message): return "[\(code)] \(message)"
    }
}

// protocol + extension
protocol ReceiptPrinter {
    func print(_ data: Data) async throws
}

extension Int {
    var rupiah: String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "id_ID")
        return "Rp" + (f.string(from: NSNumber(value: self)) ?? "\(self)")
    }
}
// 18000.rupiah → "Rp18.000"

// Error handling
enum PrinterError: Error { case notConnected, timeout }

func printReceipt(_ printer: ReceiptPrinter, data: Data) async -> PrintResult {
    do {
        try await printer.print(data)
        return .success
    } catch PrinterError.notConnected {
        return .failure(code: "NOT_CONNECTED", message: "Printer belum terhubung")
    } catch {
        return .failure(code: "UNKNOWN", message: error.localizedDescription)
    }
}

// Closure & weak self (hindari retain cycle)
final class ScannerController {
    var onScan: ((String) -> Void)?
    private let scanner = BarcodeScanner()

    func start() {
        scanner.onResult = { [weak self] code in   // tanpa weak: scanner → closure → self → scanner (cycle)
            self?.onScan?(code)
        }
    }
}

// actor: state aman dari data race
actor TokenStore {
    private var token: String?
    func set(_ value: String) { token = value }
    func get() -> String? { token }
}

// Decode JSON
let json = #"{"id":"p1","name":"Latte","price":25000,"stock":3}"#.data(using: .utf8)!
let product = try JSONDecoder().decode(Product.self, from: json)
```

## Best Practices

- **`let` secara default**, `var` bila perlu berubah.
- **Hindari `!`**; gunakan `guard let`/`if let`/`??`.
- **`struct` untuk model data**, `class` bila butuh identitas/reference atau interop Objective-C.
- **`[weak self]` di closure** yang disimpan oleh objek lain atau berumur panjang.
- **`enum` dengan associated value** untuk hasil/state.
- **`async/await`** untuk kode asinkron baru; ingat UI harus di main thread (`@MainActor`).

## Anti-Patterns

- Force unwrap (`!`) data dari luar (JSON, argumen channel).
- Closure yang menangkap `self` secara strong pada objek berumur panjang (leak).
- Mengubah UI dari background thread.
- `try!` di kode production.
- Class untuk semua model (kehilangan keamanan value semantics).

## Performance Considerations

ARC memiliki biaya kecil per referensi; struct menghindari alokasi heap untuk data kecil. Swift memakai copy-on-write
untuk koleksi (Array, Dictionary) sehingga penyalinan murah sampai salah satu diubah. Kerja berat dijalankan di luar
main thread (`Task.detached`, `DispatchQueue.global`).

## Security Considerations

Validasi semua data dari luar (argumen platform channel, deep link, JSON) sebelum dipakai; jangan mencetak token di
`print`/`os_log` di build release. Data sensitif disimpan di Keychain, bukan `UserDefaults`.

## Real-World Use Cases

- Menulis handler `FlutterMethodChannel` di `AppDelegate.swift`.
- Membungkus SDK printer/pembayaran iOS menjadi plugin Flutter.
- Membaca stack trace crash iOS di Crashlytics.

## Interview Questions

1. Apa itu Optional di Swift dan cara aman membukanya?
2. Apa beda struct dan class?
3. Apa itu ARC dan retain cycle?
4. Apa fungsi `[weak self]`?
5. Bandingkan enum Swift dengan sealed class Kotlin.

## Sample Answers

1. Tipe yang dapat berisi nilai atau `nil` (`String?`). Dibuka dengan `if let`, `guard let`, optional chaining `?.`, atau `??` untuk default; `!` hanya bila pasti tidak nil.
2. Struct adalah value type (disalin saat di-assign, tanpa inheritance), class adalah reference type (berbagi instance, mendukung inheritance, dikelola ARC). Struct cocok untuk model data, class untuk objek dengan identitas/umur bersama.
3. Automatic Reference Counting menghitung referensi strong ke objek dan membebaskannya saat hitungan nol. Retain cycle terjadi bila dua objek (atau objek dan closure) saling memegang secara strong sehingga tidak pernah dibebaskan.
4. Menangkap `self` secara weak di closure sehingga closure tidak menahan objek; `self` menjadi optional di dalam closure dan bisa nil bila objek sudah dibebaskan.
5. Keduanya memodelkan himpunan tertutup dengan data per kasus dan `switch`/`when` yang exhaustive; enum Swift memakai associated value, sealed class Kotlin memakai subclass.

## Practical Exercises

1. Tulis ulang 3 model Dart Anda sebagai `struct Codable`.
2. Buat enum hasil operasi printer dan fungsi `describe`.
3. Temukan dan perbaiki retain cycle pada closure di contoh kecil (gunakan Memory Graph Debugger Xcode).

## Quick Reference

```text
let/var · String? · if let / guard let · ?? · hindari ! dan try!
struct (value) vs class (reference) · enum + associated value · protocol + extension
throws/do-try-catch · async/await · actor · @MainActor untuk UI · Codable untuk JSON
ARC: [weak self] untuk mencegah retain cycle
```

## Related Topics

- [Kotlin Fundamentals](/android/kotlin-fundamentals/)
- [Platform Channel & Pigeon di Swift](/ios/swift-platform-channels/)
- [Dart Fundamentals](/flutter/dart-fundamentals/)
- Dokumentasi resmi: docs.swift.org
