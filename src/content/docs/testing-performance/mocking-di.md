---
title: "Mocking & Dependency Injection"
description: "Membuat kode testable dengan dependency injection dan test double: constructor injection, interface di batas I/O, mocktail (Dart), MockK (Kotlin), vi.fn/vi.mock (TypeScript), fake vs mock, mocking HTTP (MockWebServer, http_mock_adapter, msw/nock), platform channel, serta jebakan over-mocking."
level: intermediate
status: complete
version: "mocktail 1.x · MockK 1.13+ · Vitest 2+/Jest 29+"
updated: 2026-11-13
tags: [testing, mocking, dependency-injection, mocktail, mockk, vitest]
---

## Overview

Kode hanya mudah dites bila dependensinya bisa diganti. **Dependency injection** memungkinkan test memberikan **test
double** (fake, stub, mock) menggantikan jaringan, database, waktu, atau SDK. Library mocking membuat double dengan
cepat, tetapi pemakaian berlebihan membuat test rapuh.

## Why It Matters

"Bagaimana Anda men-test kode yang memanggil API?" adalah pertanyaan interview standar. Jawabannya bergantung pada
desain: kode yang membuat dependensinya sendiri (`final dio = Dio()` di dalam class) hampir mustahil dites dengan baik.

## Core Concepts

| Teknik | Contoh |
| --- | --- |
| Constructor injection | `OrderRepository(this._api, this._dao)` |
| Interface di batas I/O | `abstract interface class OrderApi` |
| Provider/factory | `typedef Clock = DateTime Function();` |
| DI container | get_it/Riverpod (Flutter), Hilt/Koin (Android), tsyringe/manual (Node) |
| Seam | Titik di mana perilaku dapat diganti tanpa mengubah kode (parameter, interface, override di container) |

| Kapan | Pilih |
| --- | --- |
| Butuh perilaku realistis (simpan lalu baca) | Fake |
| Butuh jawaban tertentu (sukses/gagal) | Stub (`when(...).thenAnswer`) |
| Harus memastikan interaksi terjadi/tidak | Mock + `verify` |
| Menguji integrasi HTTP nyata (parsing, header) | Mock server (MockWebServer, msw) |

## How It Works

```text
Produksi: DI container merakit OrderRepository(RealApi(dio), RoomDao)
Test:     new OrderRepository(FakeApi(), InMemoryDao())  ← tidak perlu container
Mock library membuat objek yang merekam panggilan & mengembalikan jawaban yang diatur
```

## Implementation

### Dart: mocktail

```dart
class MockOrderApi extends Mock implements OrderApi {}
class FakeOrderDto extends Fake implements OrderDto {}

void main() {
  setUpAll(() => registerFallbackValue(FakeOrderDto()));     // untuk any() bertipe non-primitif

  test('repository memetakan DioException timeout ke NetworkFailure', () async {
    final api = MockOrderApi();
    when(() => api.create(any())).thenThrow(
      DioException(requestOptions: RequestOptions(path: '/orders'), type: DioExceptionType.connectionTimeout),
    );
    final repo = OrderRepositoryImpl(api);

    final result = await repo.create(sampleOrder);

    expect(result, isA<Err<Order, Failure>>());
    verify(() => api.create(any())).called(1);
  });
}
```

### Dart: mock HTTP di level Dio

```dart
final dio = Dio(BaseOptions(baseUrl: 'https://api.test'));
final adapter = DioAdapter(dio: dio);                       // paket http_mock_adapter
adapter.onGet('/v1/products', (s) => s.reply(200, {'data': [{'id': 'p1', 'name': 'Latte', 'price': 25000}]}));
final products = await ProductApi(dio).list();
```

### Kotlin: MockK

```kotlin
@Test fun `refresh gagal jaringan tidak menghapus cache`() = runTest {
    val api = mockk<OrderApi>()
    val dao = FakeOrderDao(initial = listOf(cachedOrder))
    coEvery { api.getOrders(any(), any()) } throws IOException("offline")

    val repo = OfflineFirstOrderRepository(dao, api, StandardTestDispatcher(testScheduler))
    runCatching { repo.refresh("outlet-1") }

    assertEquals(listOf(cachedOrder), dao.all())
    coVerify(exactly = 1) { api.getOrders("outlet-1", null) }
}
```

### TypeScript: Vitest

```ts
const sendEmail = vi.fn().mockResolvedValue(undefined);
const svc = new OrderService({ repo: new InMemoryOrderRepo(), notifier: { sendEmail } });

await svc.complete('order-1');
expect(sendEmail).toHaveBeenCalledOnce();
expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'order_completed' }));

// Mock modul (gunakan seperlunya)
vi.mock('./payment-gateway', () => ({ charge: vi.fn().mockResolvedValue({ status: 'PAID' }) }));
```

### Platform channel di Flutter

```dart
TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
  const MethodChannel('com.example.pos/printer'),
  (call) async => call.method == 'printReceipt' ? null : throw MissingPluginException(),
);
```

### Mengganti dependensi di level app (widget/integration test)

```dart
// get_it
getIt.allowReassignment = true;
getIt.registerSingleton<OrderRepository>(FakeOrderRepository());
// Riverpod
ProviderScope(overrides: [orderRepositoryProvider.overrideWithValue(FakeOrderRepository())], child: const App());
```

## Best Practices

- **Desain untuk testability**: constructor injection, interface di batas I/O, clock/ID disuntik.
- **Mock hanya yang Anda miliki (own)** — bungkus SDK pihak ketiga dengan interface sendiri, lalu mock interface itu.
- **Fake untuk repository**, mock untuk efek samping yang harus diverifikasi.
- **Verifikasi seperlunya** — terlalu banyak `verify` membuat test rapuh.
- **Uji parsing dengan JSON nyata** (mock server/adapter), bukan hanya objek tiruan.

## Anti-Patterns

- Membuat dependensi di dalam class (`Dio()` di constructor) → tidak bisa diganti.
- Mock semua hal termasuk value object & mapper.
- Test yang hanya mengulang implementasi lewat `verify` berurutan.
- Service locator global yang diakses dari dalam logika bisnis.

## Performance Considerations

Fake in-memory dan mock jauh lebih cepat daripada I/O nyata. Namun simpan sedikit integration test dengan komponen nyata
(DB in-memory, mock server) agar kesalahan pemetaan & konfigurasi tetap tertangkap.

## Security Considerations

Pastikan konfigurasi test (base URL palsu, fake auth) tidak bisa aktif di build production — pisahkan per flavor/entry
point dan jangan biarkan "bypass auth" untuk test tersedia di kode release.

## Real-World Use Cases

- Menguji pemetaan error jaringan di repository.
- Menguji layar dengan repository palsu di widget test.
- Menguji service backend tanpa mengirim email/SMS nyata.

## Interview Questions

1. Bagaimana membuat kode yang memanggil API mudah dites?
2. Apa beda fake dan mock?
3. Mengapa sebaiknya tidak mem-mock library pihak ketiga secara langsung?
4. Bagaimana menguji kode yang memakai platform channel?
5. Apa risiko over-mocking?

## Sample Answers

1. Suntikkan client/API sebagai dependensi lewat interface, lalu di test berikan fake, mock, atau mock server; logika tidak boleh membuat client sendiri.
2. Fake adalah implementasi ringan yang berfungsi; mock adalah objek yang jawabannya diatur dan interaksinya diverifikasi.
3. API library bisa berubah dan perilakunya kompleks; lebih stabil membungkusnya dengan interface milik sendiri (adapter) dan mock interface tersebut, serta menguji adapter dengan integration test.
4. `setMockMethodCallHandler` pada channel di Flutter test, atau abstraksikan channel di balik service yang dapat diganti fake.
5. Test terikat pada detail implementasi sehingga patah saat refactor, memberi rasa aman palsu, dan tidak mendeteksi kesalahan integrasi nyata.

## Practical Exercises

1. Refactor satu class yang membuat `Dio()` sendiri menjadi constructor injection dan tulis test-nya.
2. Tulis test repository dengan mocktail untuk sukses, timeout, dan 500.
3. Bungkus SDK analytics dengan interface dan uji bahwa event checkout dikirim sekali.

## Quick Reference

```text
Constructor injection · interface di batas I/O · clock/ID disuntik · bungkus SDK pihak ketiga
Fake (perilaku) · stub (jawaban) · mock (verify interaksi) · mock server untuk parsing HTTP
Dart: mocktail + registerFallbackValue · Kotlin: MockK coEvery/coVerify · TS: vi.fn / vi.mock
Override: get_it / Riverpod overrides / Hilt @TestInstallIn
```

## Related Topics

- [Unit Testing](/testing-performance/unit-testing/)
- [Repository Pattern & DI (Flutter)](/flutter/repository-pattern-di/)
- [Dependency Injection (Hilt/Koin)](/android/dependency-injection/)
