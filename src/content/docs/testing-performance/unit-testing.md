---
title: "Unit Testing"
description: "Menulis unit test yang efektif di Dart/Flutter, Kotlin/Android, dan TypeScript/Node.js: struktur & penamaan, parameterized test, testing kode async (Future/Stream, coroutines, Promise), waktu & clock, Bloc/ViewModel test, error case, dan kebiasaan TDD ringan."
level: beginner
status: complete
version: "Dart test/mocktail/bloc_test · JUnit5/MockK/kotlinx-coroutines-test/Turbine · Vitest/Jest"
updated: 2026-11-13
tags: [testing, unit-test, dart, kotlin, typescript, tdd]
---

## Overview

**Unit test** menguji satu unit perilaku (fungsi, class, use case, ViewModel) secara terisolasi dari I/O nyata
(jaringan, database, file, waktu). Unit test adalah fondasi piramida: paling cepat, paling banyak, dan paling murah
dirawat.

## Why It Matters

Unit test yang baik menjadi dokumentasi perilaku, menangkap bug lebih awal, dan membuat refactor aman. Interviewer
sering meminta Anda menulis atau membaca unit test saat live coding.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| System under test (SUT) | Objek yang sedang dites |
| Isolasi | Dependensi I/O diganti fake/mock |
| Deterministik | Hasil sama setiap dijalankan (clock, random, UUID disuntik) |
| Penamaan | `perilaku_kondisi_hasil` atau kalimat deskriptif |
| Parameterized test | Satu test, banyak kasus input/output |
| Async testing | Menunggu Future/Promise, mengontrol waktu virtual |

## How It Works

```text
Test runner menemukan test → setUp → test (Arrange, Act, Assert) → tearDown
Async: runner menunggu Future/Promise; waktu virtual (fakeAsync, runTest) mempercepat delay/timeout
```

## Implementation

### Dart: use case dengan fake & error case

```dart
class FakeOrderRepository implements OrderRepository {
  final saved = <Order>[];
  bool failNext = false;
  @override
  Future<Result<Order, Failure>> save(Order o) async {
    if (failNext) return Err(const NetworkFailure());
    saved.add(o);
    return Ok(o);
  }
}

void main() {
  late FakeOrderRepository repo;
  late CreateOrder createOrder;

  setUp(() {
    repo = FakeOrderRepository();
    createOrder = CreateOrder(repo, clock: () => DateTime.utc(2026, 11, 13, 8), idGen: () => 'order-1');
  });

  test('menyimpan order dengan id & waktu dari dependensi yang disuntik', () async {
    final r = await createOrder(items: [CartItem(price: 18000, qty: 1)]);
    expect(r, isA<Ok<Order, Failure>>());
    expect(repo.saved.single.id, 'order-1');
    expect(repo.saved.single.createdAt, DateTime.utc(2026, 11, 13, 8));
  });

  test('menolak keranjang kosong tanpa memanggil repository', () async {
    final r = await createOrder(items: []);
    expect(r, isA<Err<Order, Failure>>());
    expect(repo.saved, isEmpty);
  });

  // Parameterized sederhana
  for (final (subtotal, expected) in [(0, 0), (10000, 11100), (99999, 110999)]) {
    test('pajak 11% untuk $subtotal = $expected', () {
      expect(Tax.apply(subtotal, rate: 0.11), expected);
    });
  }
}
```

### Dart: Cubit dengan bloc_test & waktu virtual

```dart
blocTest<SearchCubit, SearchState>(
  'debounce 300ms lalu menampilkan hasil',
  build: () => SearchCubit(FakeProductRepository([latte])),
  act: (c) => c.onQueryChanged('lat'),
  wait: const Duration(milliseconds: 350),
  expect: () => [const SearchState.loading(), SearchState.data([latte])],
);

test('timer sesi habis setelah 5 menit', () {
  fakeAsync((async) {
    final session = SessionTimer(timeout: const Duration(minutes: 5));
    session.start();
    async.elapse(const Duration(minutes: 5));
    expect(session.isExpired, isTrue);
  });
});
```

### Kotlin: ViewModel dengan coroutines-test & Turbine

```kotlin
class CheckoutViewModelTest {
    @get:Rule val mainRule = MainDispatcherRule()

    @Test fun `bayar sukses menampilkan nomor struk`() = runTest {
        val repo = FakeOrderRepository(result = Result.success(Receipt("R-001")))
        val vm = CheckoutViewModel(repo)
        vm.state.test {
            assertEquals(CheckoutUiState.Idle, awaitItem())
            vm.pay()
            assertEquals(CheckoutUiState.Processing, awaitItem())
            assertEquals(CheckoutUiState.Success("R-001"), awaitItem())
        }
    }

    @Test fun `pajak 11 persen`() {
        listOf(0L to 0L, 10_000L to 11_100L).forEach { (subtotal, expected) ->
            assertEquals("subtotal=$subtotal", expected, Tax.apply(subtotal))
        }
    }   // dengan JUnit 5 dapat memakai @ParameterizedTest + @CsvSource
}
```

### TypeScript (Vitest): service dengan fake timer

```ts
describe('OtpService', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-11-13T08:00:00Z')));
  afterEach(() => vi.useRealTimers());

  it('OTP kedaluwarsa setelah 5 menit', () => {
    const svc = new OtpService(new InMemoryOtpStore());
    const otp = svc.issue('user-1');
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(svc.verify('user-1', otp)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it.each([[0, 0], [10000, 11100]])('pajak %i → %i', (subtotal, expected) => {
    expect(applyTax(subtotal)).toBe(expected);
  });
});
```

### TDD ringan (red–green–refactor)

```text
1. Tulis test yang gagal untuk perilaku kecil (red)
2. Tulis kode minimum agar lulus (green)
3. Rapikan kode & test (refactor), test tetap hijau
Cocok untuk logika murni: kalkulasi, validasi, state machine, parser
```

## Best Practices

- **Satu konsep per test**, nama menjelaskan perilaku.
- **Suntikkan waktu, ID, random** — jangan `DateTime.now()` langsung di logika.
- **Uji kasus gagal & tepi**, bukan hanya jalur sukses.
- **Fake > mock** untuk repository; mock untuk memverifikasi interaksi penting (mis. analytics dipanggil sekali).
- **Hindari logika di test** (if/loop rumit) selain parameterisasi data.

## Anti-Patterns

- Test yang memanggil jaringan/DB nyata (lambat & flaky).
- Assertion pada detail internal (field privat, urutan pemanggilan yang tidak penting).
- Satu test raksasa memeriksa sepuluh hal.
- Test yang bergantung urutan eksekusi atau state global.

## Performance Considerations

Unit test idealnya berjalan dalam milidetik. Gunakan waktu virtual (`fakeAsync`, `runTest`, fake timers) alih-alih
menunggu delay nyata, dan hindari inisialisasi berat di `setUp` yang tidak dibutuhkan semua test.

## Security Considerations

Tulis unit test untuk validasi input, sanitasi, dan aturan otorisasi di service; pastikan test tidak membocorkan secret
(gunakan nilai dummy) dan tidak menulis data ke lokasi bersama.

## Real-World Use Cases

- Kalkulasi harga, diskon, pajak, kembalian.
- State machine status tiket/order.
- Parser respons API & mapper DTO → domain.

## Interview Questions

1. Apa itu unit test dan apa yang membuatnya "unit"?
2. Bagaimana menguji kode yang bergantung pada waktu sekarang?
3. Bagaimana menguji kode async/coroutine?
4. Fake atau mock — kapan memilih masing-masing?
5. Apa itu TDD?

## Sample Answers

1. Test yang memverifikasi satu unit perilaku secara terisolasi dari I/O nyata, cepat dan deterministik; "unit" adalah perilaku, bukan harus satu class.
2. Suntikkan clock/time provider sebagai dependensi dan berikan waktu tetap di test, atau gunakan waktu virtual (fakeAsync, fake timers, runTest).
3. Dart: `async` test, `fakeAsync`, `bloc_test`; Kotlin: `runTest` dengan `TestDispatcher` dan Turbine untuk Flow; TS: `async`/`await` dan fake timers.
4. Fake untuk dependensi dengan perilaku (repository in-memory) agar test fokus pada hasil; mock ketika interaksi itu sendiri yang harus diverifikasi.
5. Test-Driven Development: menulis test yang gagal terlebih dahulu, membuat kode minimum agar lulus, lalu refactor — siklus red–green–refactor.

## Practical Exercises

1. Refactor satu use case agar menerima clock & ID generator, lalu tulis test-nya.
2. Tulis bloc_test/Turbine test untuk semua state satu layar.
3. Coba TDD untuk fungsi pembulatan uang kembalian.

## Quick Reference

```text
AAA · nama = perilaku · satu konsep per test · kasus gagal & tepi · parameterized
Inject clock/ID/random · fakeAsync / runTest / fake timers · bloc_test · Turbine
Fake untuk I/O · mock untuk interaksi · TDD: red → green → refactor
```

## Related Topics

- [Testing Fundamentals](/testing-performance/testing-fundamentals/)
- [Test-Driven Development (TDD)](/testing-performance/tdd/)
- [Mocking & Dependency Injection](/testing-performance/mocking-di/)
- [ViewModel & Lifecycle-Aware Components](/android/viewmodel-lifecycle-aware/)
