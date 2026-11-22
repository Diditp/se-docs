---
title: "Flutter vs React Native vs Native vs KMP"
description: "Perbandingan pendekatan pengembangan mobile untuk Flutter developer: arsitektur rendering Flutter, React Native (New Architecture, Hermes, Expo), native Kotlin/Swift, dan Kotlin Multiplatform/Compose Multiplatform. Berisi trade-off, kapan memilih masing-masing, pemetaan konsep Flutter ke React Native, dan cara menjawab pertanyaan interview 'mengapa Flutter?'."
level: intermediate
status: complete
version: "Status per akhir 2026. Ekosistem lintas platform berubah cepat, jadi cek rilis terbaru tiap framework"
updated: 2026-11-13
tags: [flutter, react-native, kotlin-multiplatform, cross-platform, architecture]
---

## Overview

Lowongan "Mobile Developer" sering menyebut beberapa teknologi sekaligus: Flutter, React Native, Kotlin, Swift. Sebagai
Flutter developer, Anda tidak harus menguasai semuanya. Tetapi Anda perlu **memahami cara kerja dan trade-off** tiap
pendekatan, mampu **membaca kode React Native**, dan bisa menjelaskan **kapan Flutter tepat dan kapan tidak**.

## Why It Matters

- Interviewer sering bertanya "mengapa Flutter dan bukan React Native/native?".
- Banyak perusahaan punya campuran: aplikasi utama native, modul baru Flutter, atau tim web yang memilih React Native.
- Pemahaman lintas pendekatan menunjukkan Anda **mobile engineer**, bukan sekadar pengguna satu framework.

## Core Concepts

| Aspek | Flutter | React Native | Native (Kotlin / Swift) | KMP / Compose Multiplatform |
| --- | --- | --- | --- | --- |
| Bahasa | Dart | JavaScript/TypeScript | Kotlin / Swift | Kotlin (logika bersama), UI native atau Compose |
| Rendering UI | Engine sendiri (Impeller) menggambar setiap piksel | Komponen UI native platform | Toolkit platform (Compose/Views, SwiftUI/UIKit) | Native UI per platform, atau Compose Multiplatform |
| Kode bersama | UI + logika | UI + logika | Tidak ada (dua codebase) | Logika (opsional UI) |
| Konsistensi tampilan | Identik di semua platform | Mengikuti tampilan native | Sepenuhnya native | Tergantung pilihan UI |
| Akses API native | Platform channel / Pigeon / FFI | Native modules (TurboModules) / JSI | Langsung | Langsung via `expect/actual` |
| Ekosistem | pub.dev | npm (berbagi dengan web) | Paling lengkap & paling cepat dapat API baru | Tumbuh, berbasis Kotlin |
| Kekuatan tim | Satu tim mobile | Tim dengan latar web/React | Tim spesialis platform | Tim Android yang ingin berbagi logika ke iOS |

### Cara kerja singkat

```text
Flutter:      Dart (AOT) → widget tree → render tree → Impeller menggambar ke kanvas → piksel
React Native: JS/TS (Hermes) → React reconciler → Fabric (renderer) → view native (UIView / android.view)
              JSI: JS memanggil C++/native secara langsung (New Architecture), menggantikan bridge async lama
Native:       Kotlin/Swift → toolkit UI platform
KMP:          Kotlin common → dikompilasi ke JVM (Android) dan native binary/framework (iOS); UI native atau Compose MP
```

## How It Works

Memilih pendekatan adalah keputusan arsitektur dengan beberapa faktor:

```text
1. Kebutuhan produk: UI kustom/branding kuat? Fitur platform terbaru (widget, watch, AR)? Performa grafis?
2. Tim: keahlian yang ada (Dart/React/Kotlin/Swift), jumlah engineer, rencana rekrutmen
3. Codebase yang ada: aplikasi native lama? Web React yang ingin berbagi logika?
4. Time-to-market dan biaya pemeliharaan jangka panjang
5. Risiko: ketergantungan plugin pihak ketiga, dukungan jangka panjang framework
```

## Implementation

### Kapan memilih apa (heuristik)

| Situasi | Pilihan yang masuk akal |
| --- | --- |
| Startup/tim kecil, satu produk iOS + Android, UI kustom | Flutter (atau React Native bila tim berlatar React) |
| Perusahaan dengan tim web React besar | React Native (+ Expo) untuk berbagi talenta & sebagian logika |
| Aplikasi sangat bergantung fitur OS terbaru, kamera/AR berat, aksesibilitas platform penuh | Native |
| Aplikasi Android native besar yang ingin berbagi logika bisnis ke iOS | KMP (UI tetap native) |
| Aplikasi native lama + fitur baru lintas platform | Add-to-app Flutter atau KMP modul, bertahap |
| Aplikasi internal/enterprise (POS, field service) dengan banyak form | Flutter sangat cocok |

### Pemetaan konsep Flutter → React Native

| Flutter | React Native |
| --- | --- |
| `StatelessWidget` / `StatefulWidget` | Function component |
| `setState` | `useState` |
| `initState` / `dispose` | `useEffect(() => { ...; return cleanup }, [])` |
| `Provider` / `Riverpod` / `Bloc` | Context, Zustand, Redux Toolkit, TanStack Query (server state) |
| `ListView.builder` | `FlatList` / `FlashList` |
| `Column` / `Row` | `View` dengan `flexDirection: 'column' / 'row'` (Flexbox) |
| `Navigator` / `go_router` | React Navigation / Expo Router |
| `pubspec.yaml` | `package.json` |
| Platform channel / Pigeon | Native module (TurboModule) / Expo Modules API |
| Hot reload | Fast Refresh |

### Contoh: layar daftar produk yang sama

```dart
// Flutter
class ProductList extends StatelessWidget {
  const ProductList({super.key, required this.products});
  final List<Product> products;

  @override
  Widget build(BuildContext context) => ListView.builder(
        itemCount: products.length,
        itemBuilder: (_, i) => ListTile(title: Text(products[i].name), trailing: Text(rupiah(products[i].price))),
      );
}
```

```tsx
// React Native (TypeScript)
type Props = { products: Product[] };

export function ProductList({ products }: Props) {
  return (
    <FlatList
      data={products}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
          <Text>{item.name}</Text>
          <Text>{rupiah(item.price)}</Text>
        </View>
      )}
    />
  );
}
```

### Contoh: berbagi logika dengan KMP

```kotlin
// shared/src/commonMain — dipakai Android & iOS
class PriceCalculator {
    fun total(items: List<CartItem>, taxRate: Double): Long =
        items.sumOf { it.price * it.qty }.let { it + (it * taxRate).roundToLong() }
}

expect fun platformName(): String          // implementasi actual di androidMain / iosMain
```

### Fakta yang sering disalahpahami

- "Flutter tidak native". Kode Dart dikompilasi AOT ke kode mesin. Yang berbeda adalah UI-nya digambar sendiri, bukan memakai komponen platform.
- "React Native lambat karena bridge". New Architecture (JSI, Fabric, TurboModules) menghapus bridge async lama. Performa tergantung implementasi.
- "Native selalu lebih baik". Lebih lengkap dan langsung, tetapi butuh dua codebase dan dua tim.
- "KMP sama dengan Flutter". KMP utamanya berbagi **logika**. UI bersama lewat Compose Multiplatform adalah pilihan tambahan.

## Best Practices

- **Putuskan berdasarkan produk, tim, dan codebase**, bukan tren.
- **Pisahkan logika bisnis dari UI** di framework apa pun agar migrasi atau berbagi kode lebih mudah.
- **Kuasai satu framework secara mendalam**, lalu pahami yang lain di level konsep + mampu membaca kode.
- **Kenali batas framework Anda**: fitur apa yang memerlukan kode native, dan bagaimana menulisnya (platform channel/Pigeon).

## Anti-Patterns

- Fanatisme framework di interview ("RN jelek", "native ketinggalan zaman").
- Menulis ulang aplikasi besar ke framework lain tanpa alasan bisnis yang terukur.
- Memilih lintas platform lalu menulis sebagian besar fitur di kode native, sehingga mendapat kompleksitas tiga codebase.
- Bergantung pada plugin pihak ketiga yang tidak terawat untuk fitur inti.

## Performance Considerations

Untuk sebagian besar aplikasi bisnis, ketiga pendekatan mampu mencapai 60/120 fps bila ditulis dengan benar. Perbedaan
lebih terasa pada: ukuran aplikasi (Flutter membawa engine), startup time, memori, dan biaya integrasi platform view
(peta, web view, kamera). Ukur di perangkat target, jangan bergantung pada benchmark umum.

## Security Considerations

Semua pendekatan menghasilkan aplikasi yang dapat di-reverse engineer. Kode JS di React Native (bundle Hermes bytecode)
dan Dart AOT sama-sama bukan tempat menyimpan secret. Aturan keamanan mobile (Keychain/Keystore, TLS, validasi server,
OWASP MASVS) berlaku sama di semua framework.

## Real-World Use Cases

- Aplikasi POS & field service: Flutter untuk satu codebase dengan banyak form dan dukungan printer via platform channel.
- Super-app dengan aplikasi native lama: modul baru ditambahkan dengan add-to-app Flutter.
- Perusahaan e-commerce dengan tim web React: React Native + Expo, berbagi validasi dan tipe TypeScript.
- Bank dengan tim Android kuat: KMP untuk logika transaksi bersama, UI SwiftUI & Compose.

## Interview Questions

1. Mengapa Anda memilih Flutter dibanding React Native atau native?
2. Bagaimana Flutter merender UI dibanding React Native?
3. Kapan Anda menyarankan native, bukan Flutter?
4. Apa itu Kotlin Multiplatform dan bedanya dengan Flutter?
5. Bagaimana Anda akan belajar React Native bila tim membutuhkannya?

## Sample Answers

1. Untuk produk dengan UI kustom yang harus konsisten di Android & iOS dan tim kecil, Flutter memberi satu codebase UI + logika, performa AOT, hot reload, dan tooling yang matang. Bila tim berlatar React atau ingin berbagi talenta dengan web, React Native bisa lebih tepat. Pilihannya kontekstual.
2. Flutter menggambar sendiri seluruh UI dengan engine-nya (Impeller) dari widget tree, sedangkan React Native memetakan komponen React ke view native platform melalui renderer Fabric dan JSI.
3. Saat aplikasi sangat bergantung pada fitur platform terbaru (widget, watchOS, AR, kamera tingkat lanjut), membutuhkan integrasi OS yang dalam, atau organisasi sudah punya tim native besar dan codebase matang.
4. KMP berbagi kode Kotlin (umumnya logika bisnis, data, networking) ke Android dan iOS, sementara UI tetap native atau memakai Compose Multiplatform. Flutter berbagi UI dan logika dengan engine rendering sendiri.
5. Memetakan konsep yang sudah saya pahami (komponen, state, efek, navigasi, list virtualisasi) ke padanannya, mempelajari TypeScript dan hooks, membangun satu fitur kecil dengan Expo, lalu mempelajari arsitektur proyek tim.

## Practical Exercises

1. Tulis ulang satu layar Flutter Anda di React Native (Expo) dan catat perbedaannya.
2. Buat tabel keputusan Flutter/RN/native/KMP untuk tiga contoh produk.
3. Latih jawaban 2 menit "mengapa Flutter?" yang menyebut trade-off, bukan hanya kelebihan.

## Quick Reference

```text
Flutter: Dart AOT · render sendiri (Impeller) · UI + logika bersama · platform channel/Pigeon
React Native: TS/JS (Hermes) · view native via Fabric · JSI/TurboModules · Expo · cocok untuk tim React
Native: Kotlin/Swift · akses API terlengkap · dua codebase
KMP: logika Kotlin bersama · UI native atau Compose Multiplatform
Pilih berdasarkan produk + tim + codebase · jawab dengan trade-off
```

## Related Topics

- [Dart Fundamentals hingga Advanced](/flutter/dart-fundamentals/)
- [Rendering & Performance Optimization](/flutter/rendering-performance/)
- [Mobile Engineering (Company Prep)](/interview/company-prep/mobile-engineering/)
