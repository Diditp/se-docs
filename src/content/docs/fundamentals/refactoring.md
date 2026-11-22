---
title: "Refactoring"
description: "Refactoring yang aman: definisi, code smell, katalog teknik (extract function, rename, replace conditional with polymorphism, introduce parameter object), characterization test, refactor bertahap, strangler pattern, dan cara menyisipkannya di pekerjaan fitur."
level: intermediate
status: complete
updated: 2026-11-12
tags: [fundamentals, refactoring, code-smell, technical-debt, testing]
---

## Overview

**Refactoring** adalah mengubah struktur internal kode **tanpa mengubah perilaku yang terlihat dari luar**, agar kode
lebih mudah dipahami dan diubah. Kuncinya: **langkah kecil + test** sehingga setiap langkah dapat diverifikasi.

## Why It Matters

Kode yang tidak pernah di-refactor membusuk: fitur baru makin lambat, bug makin sering. Refactoring rutin adalah cara
paling murah membayar [technical debt](/interview/behavioral/technical-debt/).

## Core Concepts

### Code smell (gejala)

| Smell | Gejala | Teknik umum |
| --- | --- | --- |
| Long function | Fungsi puluhan–ratusan baris | Extract Function |
| Large class / God widget | Banyak tanggung jawab | Extract Class, pisahkan layer |
| Duplicated code | Logika sama di beberapa tempat | Extract Function/Module |
| Long parameter list | > 3–4 parameter, flag boolean | Introduce Parameter Object |
| Switch/if berulang pada tipe | `if (type == ...)` di banyak tempat | Replace Conditional with Polymorphism |
| Feature envy | Fungsi lebih banyak memakai data kelas lain | Move Function |
| Primitive obsession | `String` untuk email, `double` untuk uang | Introduce Value Object |
| Shotgun surgery | Satu perubahan menyentuh banyak file | Move/combine ke satu modul |
| Dead code | Tidak pernah dipanggil | Hapus |

### Refactoring vs rewrite vs optimasi

- **Refactoring**: perilaku tetap, struktur membaik, langkah kecil.
- **Rewrite**: membangun ulang; risiko tinggi, nilai tertunda.
- **Optimasi**: mengubah performa; bisa membuat kode lebih rumit.

## How It Works

```text
1. Pastikan ada test yang menangkap perilaku saat ini (buat characterization test bila belum ada)
2. Lakukan satu perubahan kecil (rename, extract, move)
3. Jalankan test → hijau → commit
4. Ulangi
Jangan mencampur refactor dan perubahan perilaku dalam satu commit.
```

## Implementation

### Characterization test sebelum refactor

```dart
// Mengunci perilaku saat ini (termasuk keanehannya) sebelum menyentuh kode lama
test('calculateLegacyTotal — perilaku saat ini', () {
  expect(calculateLegacyTotal(sampleCart, memberType: 1), 99900);
  expect(calculateLegacyTotal([], memberType: 0), 0);
});
```

### Introduce Parameter Object

```ts
// Sebelum
createOrder(userId, outletId, items, note, isTakeaway, voucherCode, paymentMethod);

// Sesudah
interface CreateOrderInput {
  userId: string; outletId: string; items: OrderItem[];
  note?: string; takeaway: boolean; voucherCode?: string; paymentMethod: PaymentMethod;
}
createOrder(input);
```

### Replace Conditional with Polymorphism

```dart
// Sebelum: switch tersebar di banyak tempat
int shippingCost(String courier, int weight) {
  switch (courier) {
    case 'reguler': return 9000 + weight * 2;
    case 'express': return 15000 + weight * 3;
    default: throw ArgumentError(courier);
  }
}

// Sesudah
abstract interface class Courier { int cost(int weightGram); }
class Reguler implements Courier { @override int cost(int w) => 9000 + w * 2; }
class Express implements Courier { @override int cost(int w) => 15000 + w * 3; }
```

### Extract widget (Flutter)

```dart
// Sebelum: build() 300 baris. Sesudah: komposisi widget kecil bernama jelas.
@override
Widget build(BuildContext context) => Scaffold(
  appBar: const CheckoutAppBar(),
  body: Column(children: const [CartItemList(), PromoSection(), TotalSummary()]),
  bottomNavigationBar: const PayButton(),
);
```

### Strangler pattern (modul besar)

```text
Kode lama ──► buat interface di depan modul ──► implementasi baru di balik interface (feature flag)
──► alihkan trafik/penggunaan sedikit demi sedikit ──► hapus implementasi lama
```

## Best Practices

- **Test dulu**, refactor kemudian.
- **Langkah kecil, commit sering**, pesan commit `refactor:` terpisah dari `feat:`/`fix:`.
- **Gunakan fitur IDE** (rename, extract, move) — lebih aman daripada edit manual.
- **Refactor saat menyentuh kode** untuk fitur (preparatory refactoring): "buat perubahan mudah, lalu buat perubahan mudah itu".
- **PR refactor terpisah** atau jelas ditandai agar review fokus.

## Anti-Patterns

- "Big bang" refactor berminggu-minggu di branch panjang.
- Refactor tanpa test pada kode kritis (pembayaran, stok).
- Mengubah perilaku diam-diam sambil "merapikan".
- Refactor demi selera pribadi yang bertentangan dengan konvensi tim.

## Performance Considerations

Refactor biasanya netral terhadap performa, tetapi waspadai: memecah query menjadi banyak panggilan (N+1), membuat
objek di dalam loop panas, atau menghilangkan `const` widget. Ukur bila menyentuh jalur kritis.

## Security Considerations

Refactor di area autentikasi/otorisasi berisiko membuka celah (mis. middleware terlewat). Pastikan ada test untuk
aturan akses dan minta review dari engineer yang memahami area tersebut.

## Real-World Use Cases

- Memecah God widget checkout menjadi widget + Bloc + use case.
- Mengganti `double` uang menjadi value object `Money` berbasis integer.
- Migrasi bertahap dari state management lama ke yang baru.

## Interview Questions

1. Apa itu refactoring dan apa bedanya dengan rewrite?
2. Sebutkan beberapa code smell dan cara memperbaikinya.
3. Bagaimana refactor kode lama yang tidak punya test?
4. Kapan waktu yang tepat untuk refactor?
5. Bagaimana memastikan refactor tidak merusak sesuatu?

## Sample Answers

1. Mengubah struktur tanpa mengubah perilaku, bertahap dan terverifikasi; rewrite membangun ulang dari awal dengan risiko dan biaya jauh lebih besar.
2. Long function → extract function; duplicated code → extract; long parameter list → parameter object; switch pada tipe → polymorphism; primitive obsession → value object.
3. Tulis characterization test yang mengunci perilaku saat ini (termasuk keanehannya), lalu refactor sedikit demi sedikit di bawah perlindungan test; untuk modul besar gunakan strangler pattern.
4. Saat akan menambah fitur di area tersebut, saat memperbaiki bug yang disebabkan struktur buruk, atau alokasi rutin untuk debt berprioritas tinggi — bukan sebagai proyek tanpa tujuan.
5. Test otomatis sebelum dan sesudah, langkah kecil, refactoring otomatis IDE, review, feature flag untuk perubahan besar, dan pemantauan setelah rilis.

## Practical Exercises

1. Pilih fungsi > 50 baris, tulis characterization test, lalu refactor dalam ≥ 5 commit kecil.
2. Temukan 3 smell di proyek Anda dan tentukan teknik perbaikannya.
3. Latih "Replace Conditional with Polymorphism" pada aturan ongkir/diskon.

## Quick Reference

```text
Perilaku tetap · langkah kecil · test hijau setiap langkah · commit refactor terpisah
Smell → teknik: long fn → extract · params → object · switch tipe → polymorphism · primitive → value object
Tanpa test → characterization test · modul besar → strangler · refactor saat menyentuh kode
```

## Related Topics

- [Clean Code](/fundamentals/clean-code/)
- [Handling Technical Debt](/interview/behavioral/technical-debt/)
- [Flutter Testing](/flutter/testing/)
