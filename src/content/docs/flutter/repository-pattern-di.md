---
title: "Repository Pattern & Dependency Injection"
description: "Memisahkan logika bisnis dari sumber data dengan Repository Pattern, menyusun strategi cache/offline di satu tempat, dan merakit dependency dengan get_it/injectable atau Riverpod."
level: intermediate
status: complete
version: "Flutter 3.x · get_it 7/8 · injectable 2.x"
updated: 2026-11-12
tags: [flutter, repository, dependency-injection, get_it, architecture]
---

## Overview

- **Repository** adalah abstraksi koleksi data domain: `getProducts()`, `save(order)`. Pemanggil tidak tahu apakah
  data datang dari API, cache, atau database lokal.
- **Dependency Injection (DI)** adalah teknik memberikan dependency suatu objek **dari luar** (biasanya lewat
  constructor), bukan dibuat sendiri di dalam objek. **Service locator** (`get_it`) dan **provider graph** (Riverpod)
  adalah cara merakit dependency di satu *composition root*.

## Why It Matters

- **Testability**: Bloc/use case bisa diuji dengan fake repository — tanpa jaringan, tanpa database.
- **Strategi data terpusat**: cache-first, network-first, offline + sync diatur di satu tempat.
- **Fleksibilitas**: ganti REST → GraphQL atau Hive → Drift tanpa menyentuh UI.
- **Lifetime terkontrol**: satu instance `Dio`/database untuk seluruh app, Bloc baru per halaman.

## Core Concepts

| Istilah | Arti |
| --- | --- |
| Repository interface | Kontrak di domain (`abstract interface class ProductRepository`) |
| Repository implementation | Kelas di data layer yang mengorkestrasi data source |
| Data source | Akses mentah ke satu sumber: `RemoteDataSource` (HTTP), `LocalDataSource` (DB/cache) |
| Constructor injection | Dependency dioper lewat constructor — eksplisit & mudah di-test |
| Composition root | Satu tempat semua dependency dirakit (`core/di/`) |
| Lifetime | singleton, lazy singleton, factory (instance baru setiap diminta), scoped |

## How It Works

```text
CatalogCubit ──► GetProducts (use case) ──► ProductRepository (interface, domain)
                                                    ▲ implements
                                     ProductRepositoryImpl (data)
                                       ├── ProductRemoteDataSource (Dio)
                                       └── ProductLocalDataSource (Drift)
Composition root (get_it): Dio, AppDatabase → data sources → repository → use case → cubit
```

Strategi data yang umum di repository:

| Strategi | Alur | Cocok untuk |
| --- | --- | --- |
| Network-only | API → return | Data sangat dinamis, wajib online (pembayaran) |
| Cache-first (stale-while-revalidate) | Return cache → fetch API → update cache → emit lagi | Katalog, profil |
| Network-first fallback cache | API → gagal → cache | Data penting yang boleh stale saat offline |
| Local-first (offline-first) | UI baca DB lokal; sync terpisah | POS, field app |

## Implementation

### Interface & implementasi

```dart
// domain/repositories/product_repository.dart
abstract interface class ProductRepository {
  Stream<List<Product>> watchProducts();                // local-first untuk UI
  Future<Result<void>> refresh();                       // tarik dari server
  Future<Result<Product>> getById(String id);
}

// data/repositories/product_repository_impl.dart
class ProductRepositoryImpl implements ProductRepository {
  ProductRepositoryImpl(this._remote, this._local);
  final ProductRemoteDataSource _remote;
  final ProductLocalDataSource _local;

  @override
  Stream<List<Product>> watchProducts() =>
      _local.watchAll().map((rows) => rows.map((r) => r.toEntity()).toList());

  @override
  Future<Result<void>> refresh() async {
    try {
      final dtos = await _remote.fetchAll();
      await _local.upsertAll(dtos.map((d) => d.toCompanion()).toList());
      return const Ok(null);
    } on DioException catch (e) {
      return Err(NetworkFailure.fromDio(e));
    }
  }

  @override
  Future<Result<Product>> getById(String id) async {
    final row = await _local.findById(id);
    if (row != null) return Ok(row.toEntity());
    try {
      final dto = await _remote.fetchById(id);
      await _local.upsertAll([dto.toCompanion()]);
      return Ok(dto.toEntity());
    } on DioException catch (e) {
      return Err(NetworkFailure.fromDio(e));
    }
  }
}
```

### Composition root dengan get_it

```dart
final sl = GetIt.instance;

Future<void> configureDependencies(AppConfig config) async {
  // Infrastruktur — satu instance untuk seluruh app
  sl.registerLazySingleton<Dio>(() => buildDio(config));
  sl.registerSingletonAsync<AppDatabase>(() async => AppDatabase.open());
  await sl.isReady<AppDatabase>();

  // Data
  sl.registerLazySingleton<ProductRemoteDataSource>(() => ProductRemoteDataSource(sl()));
  sl.registerLazySingleton<ProductLocalDataSource>(() => ProductLocalDataSource(sl()));
  sl.registerLazySingleton<ProductRepository>(() => ProductRepositoryImpl(sl(), sl()));

  // Domain & presentation — instance baru setiap diminta
  sl.registerFactory(() => GetProducts(sl()));
  sl.registerFactory(() => CatalogCubit(sl()));
}

// Pemakaian di UI: satu-satunya tempat memanggil sl<>() di presentation
BlocProvider(create: (_) => sl<CatalogCubit>()..load(), child: const CatalogView());
```

> Dengan `injectable`, anotasi `@LazySingleton(as: ProductRepository)` dan `@injectable` menghasilkan kode registrasi di atas
> secara otomatis (`dart run build_runner build`).

### Alternatif: Riverpod sebagai DI

```dart
final dioProvider = Provider<Dio>((ref) => buildDio(ref.watch(configProvider)));
final productRepositoryProvider = Provider<ProductRepository>(
  (ref) => ProductRepositoryImpl(ProductRemoteDataSource(ref.watch(dioProvider)), ProductLocalDataSource(ref.watch(dbProvider))),
);
// Test: ProviderScope(overrides: [productRepositoryProvider.overrideWithValue(FakeProductRepository())], ...)
```

### Test dengan fake

```dart
class FakeProductRepository implements ProductRepository {
  final _controller = StreamController<List<Product>>.broadcast();
  Result<void> refreshResult = const Ok(null);
  @override Stream<List<Product>> watchProducts() => _controller.stream;
  @override Future<Result<void>> refresh() async => refreshResult;
  @override Future<Result<Product>> getById(String id) async => Err(const NotFoundFailure());
  void emit(List<Product> p) => _controller.add(p);
}
```

## Best Practices

- **Constructor injection di semua class domain/data**; service locator hanya dipanggil di composition root dan titik masuk UI. Alasan: dependency terlihat jelas dan class bisa diuji tanpa container.
- **Repository mengembalikan entity domain & `Result`/Failure**, bukan DTO atau exception library.
- **Satu repository per agregat/konsep bisnis** (Product, Order), bukan per endpoint.
- **Strategi cache/offline di repository**, bukan di Bloc atau widget.
- **Lifetime yang tepat**: Dio/DB singleton; Bloc/Cubit factory (dibuang bersama halaman).
- **Reset dependency per sesi** (mis. `sl.resetLazySingleton` atau scope) saat logout jika menyimpan data user.

## Anti-Patterns

- `GetIt.I<ApiClient>()` di dalam repository/use case → dependency tersembunyi, test harus mengatur container global.
- Repository yang hanya membungkus satu endpoint tanpa nilai tambah sambil membocorkan `Response`.
- Repository memanggil Bloc/UI atau menampilkan dialog.
- Membuat `Dio()` baru di setiap repository → interceptor/timeout tidak konsisten, koneksi tidak di-reuse.
- Singleton untuk Bloc halaman → state lama "bocor" ke kunjungan berikutnya.

## Performance Considerations

- Reuse satu `Dio` & satu koneksi database — menghemat handshake & resource.
- Lazy singleton menunda pembuatan objek berat sampai dibutuhkan → startup lebih cepat.
- Cache-first mengurangi request & mempercepat tampilan awal; atur TTL/invalidasi agar data tidak terlalu basi.
- Hindari `registerSingletonAsync` yang berat di jalur startup kritis; tampilkan splash sambil menunggu.

## Security Considerations

- Token & secure storage diinjeksikan sebagai dependency khusus (`TokenStore`) — mudah di-mock dan satu-satunya akses ke secret.
- Bersihkan cache repository & database lokal yang berisi data user saat logout.
- Data source tidak boleh me-log body request/response sensitif.

## Real-World Use Cases

- **Katalog POS**: `watchProducts()` dari Drift + `refresh()` dari API → UI instan walau offline.
- **Profil pelanggan**: cache-first dengan revalidate.
- **Testing**: semua Cubit diuji dengan `FakeXRepository` tanpa jaringan.

## Interview Questions

1. Apa itu Repository Pattern dan manfaatnya?
2. Apa beda Dependency Injection dan Service Locator?
3. Apa beda singleton, lazy singleton, dan factory di get_it?
4. Di mana logika cache/offline sebaiknya ditempatkan?
5. Bagaimana Anda menguji Cubit yang bergantung pada repository?

## Sample Answers

1. Abstraksi akses data berbentuk koleksi domain yang menyembunyikan sumber data. Manfaat: memisahkan logika bisnis dari detail API/DB, strategi cache terpusat, dan mudah di-mock untuk test.
2. DI memberikan dependency dari luar (biasanya constructor), sehingga class tidak tahu cara membuatnya. Service locator adalah registry global yang dimintai dependency. Praktik baik: gunakan service locator hanya di composition root dan tetap pakai constructor injection di dalam class.
3. Singleton dibuat segera saat registrasi; lazy singleton dibuat saat pertama diminta lalu dipakai ulang; factory membuat instance baru setiap kali diminta.
4. Di repository implementation (data layer), karena repository yang tahu sumber data dan bisa menggabungkan remote & local dengan konsisten.
5. Inject fake/mock repository lewat constructor, atur hasilnya (sukses/gagal), lalu verifikasi urutan state dengan `bloc_test`.

## Practical Exercises

1. Refactor satu fitur yang memanggil Dio dari Bloc menjadi repository + data source.
2. Implementasikan strategi stale-while-revalidate dan tampilkan indikator "memperbarui…".
3. Ganti `GetIt.I` di dalam class domain/data menjadi constructor injection; tulis test dengan fake.

## Quick Reference

```text
UI/Bloc → UseCase → Repository (interface, domain) ← RepositoryImpl (data) → Remote/Local DataSource
Constructor injection everywhere · sl<>() hanya di composition root & entry UI
Dio/DB = lazy singleton · Bloc = factory · Repository return Entity + Result
Strategi: network-only · cache-first/SWR · network-first fallback · local-first + sync
```

## Related Topics

- [Clean Architecture di Flutter](/flutter/clean-architecture/)
- [REST API Integration](/flutter/rest-api-integration/)
- [Local Database](/flutter/local-database/)
- [SOLID Principles (DIP)](/fundamentals/solid-principles/)
- Referensi: [get_it](https://pub.dev/packages/get_it), [injectable](https://pub.dev/packages/injectable), [Flutter app architecture guide](https://docs.flutter.dev/app-architecture).
