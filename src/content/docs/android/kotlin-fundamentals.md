---
title: "Kotlin Fundamentals"
description: "Dasar Kotlin untuk mobile developer: val/var, tipe & type inference, null safety, fungsi, string template, control flow sebagai ekspresi, collections, data class, when, extension function, lambda, dan perbandingan cepat dengan Dart."
level: beginner
status: complete
version: "Kotlin 2.x"
updated: 2026-11-13
tags: [kotlin, android, fundamentals, null-safety]
---

## Overview

**Kotlin** adalah bahasa utama pengembangan Android (Google menyatakannya *Kotlin-first*). Kotlin berjalan di JVM,
interoperabel penuh dengan Java, dan juga bisa dikompilasi ke native/JS (Kotlin Multiplatform). Bagi Flutter developer,
sintaks Kotlin terasa familiar: null safety, type inference, lambda, dan extension mirip dengan Dart.

## Why It Matters

- Lowongan mobile engineer sering meminta Kotlin, termasuk untuk posisi Flutter (plugin, platform channel, debugging native).
- Kotlin dipakai untuk kode Android di proyek Flutter (`android/app/src/main/kotlin/...`) dan file Gradle (`*.gradle.kts`).
- Interview Android hampir selalu mulai dari dasar bahasa: null safety, data class, collections.

## Core Concepts

| Konsep | Kotlin | Padanan Dart |
| --- | --- | --- |
| Variabel read-only / mutable | `val` / `var` | `final` / `var` |
| Konstanta compile-time | `const val` (top-level/object) | `const` |
| Nullable | `String?` | `String?` |
| Safe call / Elvis | `a?.b ?: default` | `a?.b ?? default` |
| Not-null assertion | `a!!` | `a!` |
| String template | `"Total: $total, ${items.size} item"` | `'Total: $total, ${items.length} item'` |
| Fungsi satu baris | `fun area(r: Double) = PI * r * r` | `double area(double r) => pi * r * r;` |
| Default & named argument | `greet(name = "Rina")` | `greet(name: 'Rina')` |
| Data class | `data class User(val id: String)` | class + `==`/`hashCode`/`copyWith` (manual/freezed) |
| Pattern/when | `when (x) { ... }` | `switch` expression |
| Extension | `fun String.isPhone(): Boolean` | `extension on String` |

Tipe dasar: `Int`, `Long`, `Double`, `Boolean`, `Char`, `String`, `Unit` (≈ `void`), `Nothing` (fungsi tidak pernah
kembali), `Any` (≈ `Object`).

## How It Works

```text
Kotlin source (.kt) → kotlinc → JVM bytecode (.class) → D8/R8 → DEX → APK/AAB → ART (Android Runtime)
Null safety dicek saat compile: tipe non-null tidak bisa diberi null tanpa ?.
```

## Implementation

```kotlin
// Variabel & inferensi
val outletName = "Kopi Kita"          // String, read-only
var stock = 10                        // Int, mutable
const val MAX_ITEMS = 50              // top-level konstanta

// Null safety
fun phoneLabel(phone: String?): String = phone?.trim()?.takeIf { it.isNotEmpty() } ?: "-"

// Fungsi dengan default & named argument
fun formatRupiah(amount: Long, withSymbol: Boolean = true): String {
    val formatted = String.format(java.util.Locale.US, "%,d", amount).replace(',', '.')
    return if (withSymbol) "Rp$formatted" else formatted
}
formatRupiah(18000)                    // "Rp18.000"
formatRupiah(amount = 18000, withSymbol = false)

// if & when sebagai ekspresi
val label = if (stock > 0) "Tersedia" else "Habis"
fun statusText(code: Int) = when (code) {
    200, 201 -> "Sukses"
    in 400..499 -> "Kesalahan klien"
    in 500..599 -> "Kesalahan server"
    else -> "Tidak diketahui"
}

// Data class: equals, hashCode, toString, copy, componentN otomatis
data class Product(val id: String, val name: String, val price: Long, val stock: Int = 0)
val latte = Product("p1", "Latte", 25_000)
val promo = latte.copy(price = 20_000)
val (id, name) = latte                 // destructuring

// Collections (default read-only)
val products = listOf(latte, Product("p2", "Teh", 12_000, stock = 5))
val available = products.filter { it.stock > 0 }.map { it.name }      // ["Teh"]
val total = products.sumOf { it.price }
val byId = products.associateBy { it.id }
val mutable = mutableListOf<Product>().apply { add(latte) }

// Extension function
fun String.isIndonesianPhone(): Boolean = matches(Regex("^(\\+62|62|0)8\\d{8,11}$"))

// Lambda & higher-order function
fun <T> List<T>.countWhere(predicate: (T) -> Boolean): Int = count(predicate)
val cheap = products.countWhere { it.price < 15_000 }

// Loop & range
for (i in 1..3) println(i)             // 1, 2, 3
for (i in 0 until products.size) {}    // 0..size-1
products.forEachIndexed { i, p -> println("$i ${p.name}") }
```

## Best Practices

- **`val` secara default**, `var` hanya bila perlu berubah.
- **Hindari `!!`** — gunakan `?.`, `?:`, `requireNotNull` dengan pesan, atau `let`.
- **Gunakan `data class`** untuk model, **`listOf`** (read-only) untuk koleksi yang tidak diubah.
- **Ekspresi `when`/`if`** daripada variabel sementara yang diisi bercabang.
- **Ikuti Kotlin coding conventions** dan pakai ktlint/detekt.

## Anti-Patterns

- `lateinit var` di mana-mana untuk menghindari null safety.
- `!!` di kode produksi.
- Menulis Kotlin "gaya Java" (getter/setter manual, `for` indeks untuk semua hal).
- Koleksi mutable yang diekspos ke luar class.

## Performance Considerations

Operator koleksi (`filter`, `map`) membuat list baru setiap langkah; untuk rantai panjang atas data besar gunakan
`asSequence()` (lazy). `data class` di Compose sebaiknya immutable agar dianggap stabil dan menghindari recomposition
berlebihan.

## Security Considerations

Null safety mencegah banyak crash, tetapi data dari luar (Intent extra, JSON, platform channel) tetap harus divalidasi.
Jangan menyusun query SQL atau URL dengan string template dari input pengguna tanpa sanitasi/parameterisasi.

## Real-World Use Cases

- Menulis `MainActivity.kt` dan plugin native di proyek Flutter.
- Script build `build.gradle.kts`.
- Aplikasi Android native dengan Compose.

## Interview Questions

1. Apa beda `val` dan `var`? `val` dan `const val`?
2. Bagaimana null safety bekerja di Kotlin?
3. Apa yang dihasilkan `data class` secara otomatis?
4. Apa itu extension function?
5. Apa beda `listOf` dan `mutableListOf`?

## Sample Answers

1. `val` read-only (referensi tidak bisa diganti), `var` dapat diubah. `const val` adalah konstanta compile-time untuk tipe primitif/String di top-level atau object; `val` biasa dapat diinisialisasi saat runtime.
2. Tipe non-null dan nullable dibedakan (`String` vs `String?`); compiler mewajibkan penanganan nilai nullable lewat safe call `?.`, Elvis `?:`, smart cast setelah cek null, atau `!!` (yang melempar exception bila null).
3. `equals`, `hashCode`, `toString`, `copy`, dan `componentN` untuk destructuring, berdasarkan properti di primary constructor.
4. Fungsi yang "ditambahkan" ke tipe yang sudah ada tanpa mewarisi/mengubahnya, di-resolve secara statis, mis. `fun String.isPhone()`.
5. `listOf` menghasilkan `List` read-only (antarmuka tanpa operasi ubah); `mutableListOf` menghasilkan `MutableList` yang dapat ditambah/dihapus.

## Practical Exercises

1. Tulis ulang 3 model Dart Anda menjadi `data class` Kotlin.
2. Buat extension `Long.toRupiah()`.
3. Dari list transaksi, hitung total per kategori dengan `groupBy` + `mapValues`.

## Quick Reference

```text
val/var · const val · String? · ?. ?: · hindari !! · "$x ${expr}"
data class (equals/hashCode/copy) · when sebagai ekspresi · extension fun · lambda { it }
listOf (read-only) vs mutableListOf · filter/map/sumOf/groupBy/associateBy · asSequence untuk data besar
```

## Related Topics

- [OOP & Advanced Kotlin](/android/advanced-kotlin/)
- [Coroutines & Flow](/android/coroutines-flow/)
- [Dart Fundamentals](/flutter/dart-fundamentals/)
- Dokumentasi resmi: kotlinlang.org/docs
