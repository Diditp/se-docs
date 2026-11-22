---
title: "Unit, Widget & Integration Testing"
description: "Strategi testing Flutter: unit test untuk logika, bloc_test untuk state, widget test untuk UI, golden test, integration test di device, mocking dengan mocktail, dan menjalankannya di CI."
level: intermediate
status: complete
version: "Flutter 3.x · flutter_test · bloc_test · mocktail · integration_test"
updated: 2026-11-12
tags: [flutter, testing, bloc_test, mocktail, integration_test]
---

## Overview

| Jenis | Menguji | Kecepatan | Butuh device |
| --- | --- | --- | --- |
| **Unit** | Fungsi, use case, repository, Bloc/Cubit | Milidetik | Tidak |
| **Widget** | Satu widget/halaman di lingkungan test (render, tap, teks) | Cepat | Tidak |
| **Golden** | Tampilan piksel dibandingkan dengan gambar referensi | Sedang | Tidak (tapi sensitif platform/font) |
| **Integration** | App nyata end-to-end (navigasi, plugin, DB) | Lambat | Ya (emulator/device/Firebase Test Lab) |

## Why It Matters

Test adalah jaring pengaman untuk refactor, upgrade Flutter, dan perubahan oleh AI agent. Untuk aplikasi transaksi,
bug perhitungan total/diskon atau sync yang menggandakan data lebih murah ditangkap test daripada oleh kasir di outlet.

## Core Concepts

- **Test pyramid**: banyak unit, cukup widget, sedikit integration.
- **`testWidgets` + `WidgetTester`**: `pumpWidget`, `pump`, `pumpAndSettle`, `tap`, `enterText`, `find.*`, `expect(..., findsOneWidget)`.
- **Fake vs mock**: fake = implementasi ringan yang berfungsi (in-memory repository); mock (`mocktail`) = stub & verifikasi interaksi.
- **`bloc_test`**: deklaratif — `build`, `act`, `expect` daftar state.
- **Determinisme**: waktu (`clock`/inject `DateTime Function()`), UUID, random di-inject; `fakeAsync` untuk timer.
- **Golden test**: `matchesGoldenFile`; perbarui dengan `--update-goldens`.

## How It Works

`flutter test` menjalankan test di Dart VM dengan binding test (`TestWidgetsFlutterBinding`): tidak ada layar fisik;
waktu & frame dikontrol test (`pump` memajukan frame). Integration test (`integration_test`) menjalankan app sungguhan di
device dengan `IntegrationTestWidgetsFlutterBinding`, sehingga plugin native, database file, dan rendering nyata ikut diuji.

## Implementation

### Unit test use case

```dart
void main() {
  late FakeOrderRepository repo;
  late CreateOrder createOrder;

  setUp(() {
    repo = FakeOrderRepository();
    createOrder = CreateOrder(repo, () => DateTime.utc(2026, 11, 12), () => 'order-1');
  });

  test('should save order with computed total when cart is valid', () async {
    final result = await createOrder([const OrderItem(productId: 'p1', qty: 2, price: 18000)]);
    expect(result, isA<Ok<Order>>());
    expect(repo.saved.single.total, 36000);
  });

  test('should return ValidationFailure when cart is empty', () async {
    final result = await createOrder([]);
    expect(result, isA<Err<Order>>());
    expect(repo.saved, isEmpty);
  });
}
```

### Bloc/Cubit dengan bloc_test & mocktail

```dart
class MockGetProducts extends Mock implements GetProducts {}

void main() {
  late MockGetProducts getProducts;
  setUp(() => getProducts = MockGetProducts());

  blocTest<CatalogCubit, CatalogState>(
    'emits [Loading, Loaded] when products load successfully',
    setUp: () => when(() => getProducts()).thenAnswer((_) async => const Ok([kopi])),
    build: () => CatalogCubit(getProducts),
    act: (c) => c.load(),
    expect: () => [const CatalogLoading(), const CatalogLoaded([kopi])],
    verify: (_) => verify(() => getProducts()).called(1),
  );

  blocTest<CatalogCubit, CatalogState>(
    'emits [Loading, Failure] when network fails',
    setUp: () => when(() => getProducts()).thenAnswer((_) async => const Err(NetworkFailure())),
    build: () => CatalogCubit(getProducts),
    act: (c) => c.load(),
    expect: () => [const CatalogLoading(), isA<CatalogFailure>()],
  );
}
```

### Widget test untuk setiap state

```dart
class MockCatalogCubit extends MockCubit<CatalogState> implements CatalogCubit {}

Widget wrap(Widget child, CatalogCubit cubit) => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: BlocProvider<CatalogCubit>.value(value: cubit, child: child),
    );

void main() {
  testWidgets('shows retry button on failure and calls load when tapped', (tester) async {
    final cubit = MockCatalogCubit();
    when(() => cubit.state).thenReturn(const CatalogFailure('Koneksi bermasalah'));
    when(() => cubit.load()).thenAnswer((_) async {});

    await tester.pumpWidget(wrap(const CatalogView(), cubit));

    expect(find.text('Koneksi bermasalah'), findsOneWidget);
    await tester.tap(find.byKey(const Key('retry-button')));
    verify(() => cubit.load()).called(1);
  });
}
```

### Timer & debounce dengan fakeAsync

```dart
test('search waits 300ms before querying', () {
  fakeAsync((async) {
    final repo = FakeProductRepository();
    final c = SearchController(repo)..onChanged('ko')..onChanged('kop')..onChanged('kopi');
    async.elapse(const Duration(milliseconds: 299));
    expect(repo.queries, isEmpty);
    async.elapse(const Duration(milliseconds: 1));
    expect(repo.queries, ['kopi']);
    c.dispose();
  });
});
```

### Integration test alur checkout

```dart
// integration_test/checkout_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('cashier can sell a product offline', (tester) async {
    await app.main(flavor: Flavor.test);                 // DB test, API fake/offline
    await tester.pumpAndSettle();

    await tester.tap(find.text('Kopi Susu'));
    await tester.tap(find.byKey(const Key('checkout-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tunai'));
    await tester.tap(find.byKey(const Key('pay-button')));
    await tester.pumpAndSettle();

    expect(find.text('Transaksi berhasil'), findsOneWidget);
  });
}
// Jalankan: flutter test integration_test/checkout_test.dart -d <device-id>
```

### Golden test (komponen stabil)

```dart
testWidgets('receipt summary golden', (tester) async {
  await tester.binding.setSurfaceSize(const Size(400, 600));
  await tester.pumpWidget(MaterialApp(theme: appTheme, home: ReceiptSummary(order: sampleOrder)));
  await expectLater(find.byType(ReceiptSummary), matchesGoldenFile('goldens/receipt_summary.png'));
});
```

## Best Practices

- **Uji perilaku, bukan implementasi** — assert state/teks/hasil, bukan private method.
- **Satu skenario per test**, nama `should <hasil> when <kondisi>`.
- **Fake untuk repository**, mock untuk memverifikasi interaksi penting.
- **Injeksi waktu/UUID** agar hasil deterministik.
- **Gunakan `Key` stabil** untuk elemen yang di-tap di test (`Key('pay-button')`).
- **Widget test membungkus `MaterialApp` + localization + theme** yang sama dengan app.
- **Integration test hanya untuk alur kritis** dan jalankan di CI (emulator) atau Firebase Test Lab saat rilis.
- **Golden test hanya untuk komponen stabil** dan jalankan di satu platform CI yang konsisten (font/rendering berbeda per OS).

## Anti-Patterns

- `await Future.delayed(...)` di test untuk menunggu — gunakan `pump`, `pumpAndSettle`, atau `fakeAsync`.
- `pumpAndSettle` dengan animasi tak berujung (progress indicator) → timeout; gunakan `pump(duration)`.
- Test yang memanggil API/Firebase sungguhan.
- Snapshot/golden untuk seluruh halaman yang sering berubah → noise.
- Mengejar coverage 100% dengan test tanpa assertion bermakna.

## Performance Considerations

- Unit & widget test harus berjalan dalam detik — pisahkan integration test ke job CI terpisah.
- `flutter test --concurrency` (default paralel) — pastikan test tidak berbagi state/file.
- Gunakan database in-memory (`NativeDatabase.memory()`) untuk test repository Drift.

## Security Considerations

- Jangan menaruh kredensial nyata di test/fixture; gunakan flavor `test` dengan backend fake.
- Tambahkan test untuk perilaku keamanan client: token dihapus saat logout, route terlindungi me-redirect ke login, data sensitif tidak di-log.

## Real-World Use Cases

- **Kalkulasi keranjang & diskon** diuji unit test dengan banyak kasus tepi (pembulatan, diskon persen + nominal).
- **Checkout** diuji widget test per state + satu integration test offline.
- **Migrasi Drift** diuji per versi schema.
- **CI**: `flutter analyze` + `flutter test --coverage` di setiap PR.

## Interview Questions

1. Apa beda unit, widget, dan integration test di Flutter?
2. Bagaimana Anda menguji Bloc?
3. Apa beda `pump` dan `pumpAndSettle`?
4. Mock vs fake — kapan memakai masing-masing?
5. Bagaimana menguji kode yang memakai timer/debounce?

## Sample Answers

1. Unit menguji logika murni tanpa UI; widget menguji rendering & interaksi satu widget di lingkungan test tanpa device; integration menjalankan app nyata di device untuk alur end-to-end termasuk plugin native.
2. Dengan `bloc_test`: inject dependency mock/fake, `act` memicu event/method, `expect` daftar state yang di-emit, dan `verify` interaksi penting. Minimal skenario sukses dan gagal.
3. `pump` memajukan satu frame (opsional dengan durasi); `pumpAndSettle` memompa frame berulang sampai tidak ada frame terjadwal (animasi selesai) — akan timeout jika ada animasi tak berujung.
4. Fake (implementasi in-memory yang bekerja) untuk dependency yang perilakunya penting secara keseluruhan seperti repository; mock untuk menstub respons spesifik dan memverifikasi interaksi (dipanggil sekali, dengan argumen tertentu).
5. `fakeAsync` untuk memajukan waktu secara virtual (`elapse`), atau `tester.pump(Duration)` di widget test; injeksi clock untuk logika berbasis waktu.

## Practical Exercises

1. Tulis unit test untuk perhitungan total dengan diskon & pajak (minimal 8 kasus).
2. Tulis `blocTest` untuk Cubit halaman produk (loading/loaded/empty/failure).
3. Tulis widget test untuk empty state & retry.
4. Buat satu integration test alur checkout dan jalankan di emulator via CI.

## Quick Reference

```text
Unit (logika) > Widget (UI tanpa device) > Integration (device) — piramida
bloc_test: build → act → expect [states] → verify · mocktail: when/thenAnswer/verify
testWidgets: pumpWidget → tap/enterText → pump/pumpAndSettle → expect(find..., findsOneWidget)
fakeAsync + elapse untuk timer · Key stabil untuk tap · DB in-memory · flutter test --coverage
```

## Related Topics

- [Testing Fundamentals](/testing-performance/testing-fundamentals/)
- [Mocking & Dependency Injection](/testing-performance/mocking-di/)
- [State Management](/flutter/state-management/)
- [Testing & QA Rules (AGENTS.md)](/agent-instructions/testing/)
- Referensi resmi: [Flutter testing](https://docs.flutter.dev/testing/overview), [bloc_test](https://pub.dev/packages/bloc_test), [mocktail](https://pub.dev/packages/mocktail), [integration_test](https://docs.flutter.dev/testing/integration-tests).
