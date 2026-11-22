---
title: "State Management: Provider, Riverpod & Bloc"
description: "Konsep state di Flutter, perbandingan Provider, Riverpod, dan Bloc/Cubit, serta cara memilih dan mengimplementasikannya dengan benar."
level: intermediate
status: complete
version: "flutter_bloc 9.x · flutter_riverpod 2.x/3.x · provider 6.x"
updated: 2026-11-07
tags: [flutter, state-management, bloc, riverpod, provider]
---

## Overview

**State** adalah data yang bisa berubah dan memengaruhi UI. Di Flutter, UI adalah fungsi dari state: `UI = f(state)`.
State management adalah cara **menyimpan, mengubah, dan menyebarkan** state ke widget yang membutuhkannya — sambil
menjaga logika bisnis terpisah dari widget.

| Solusi | Model | Ciri |
| --- | --- | --- |
| `setState` | Lokal di `State` | Untuk ephemeral state satu widget |
| **Provider** | Wrapper `InheritedWidget` + `ChangeNotifier` | Sederhana, bergantung pada `BuildContext` |
| **Riverpod** | Provider graph di luar widget tree | Compile-safe, tanpa context, async state & auto-dispose bawaan |
| **Bloc / Cubit** | Event → State (Bloc) / method → State (Cubit) | Eksplisit, mudah di-trace & di-test, konvensi ketat |

## Why It Matters

Tanpa pola yang jelas, logika bisnis tersebar di `build()`, state diduplikasi di beberapa widget, dan bug sinkronisasi UI
muncul (badge keranjang tidak update, loading tidak berhenti). State management yang baik memberi:

- **Single source of truth** untuk setiap data.
- **Testability** — logika bisa diuji tanpa merender UI.
- **Rebuild terkontrol** — hanya widget yang butuh data yang di-rebuild.
- **Predictability** — setiap perubahan state punya penyebab yang jelas.

## Core Concepts

- **Ephemeral (UI) state vs App state.** Tab aktif, animasi, input sementara → `setState`. User login, cart, data yang dibagi → state management.
- **Immutable state.** State baru dibuat dengan `copyWith`, tidak dimutasi. Memudahkan perbandingan dan mencegah bug.
- **Unidirectional data flow.** UI → event/aksi → logika → state baru → UI.
- **Status eksplisit.** Model `initial | loading | success | failure` (atau `AsyncValue` di Riverpod) alih-alih beberapa boolean.
- **Scope & lifetime.** Kapan state dibuat dan dibuang (per halaman, per sesi, global).
- **Selective rebuild.** `context.select`, `BlocSelector`, `ref.watch(provider.select(...))`.

## How It Works

- **Provider** memakai `InheritedWidget`: widget yang memanggil `context.watch<T>()` didaftarkan sebagai dependent dan di-rebuild saat `notifyListeners()` dipanggil.
- **Bloc** memakai `Stream`: event masuk ke `on<Event>` handler, handler memanggil `emit(newState)`, `BlocBuilder` mendengarkan stream state. State yang sama (`==`) tidak di-emit ulang — karena itu state perlu `Equatable` atau sealed class dengan equality.
- **Riverpod** menyimpan state di `ProviderContainer` (di `ProviderScope`). `ref.watch` membentuk dependency graph: jika provider A berubah, provider/widget yang me-*watch* A dihitung ulang. `autoDispose` membuang state saat tidak ada listener.

```text
Bloc:      UI --add(Event)--> Bloc --emit(State)--> BlocBuilder/BlocListener
Cubit:     UI --method()----> Cubit --emit(State)-> BlocBuilder
Riverpod:  UI --ref.read(p.notifier).method()--> Notifier --state = ...--> ref.watch(p)
```

## Implementation

### Model state dengan sealed class (Dart 3)

```dart
sealed class ProductsState { const ProductsState(); }
final class ProductsInitial extends ProductsState { const ProductsInitial(); }
final class ProductsLoading extends ProductsState { const ProductsLoading(); }
final class ProductsLoaded extends ProductsState {
  const ProductsLoaded(this.items);
  final List<Product> items;
}
final class ProductsFailure extends ProductsState {
  const ProductsFailure(this.message);
  final String message;
}
```

### Bloc

```dart
sealed class ProductsEvent {}
final class ProductsRequested extends ProductsEvent {}
final class ProductSearched extends ProductsEvent { ProductSearched(this.query); final String query; }

class ProductsBloc extends Bloc<ProductsEvent, ProductsState> {
  ProductsBloc(this._getProducts) : super(const ProductsInitial()) {
    on<ProductsRequested>(_onRequested);
    // restartable(): event baru membatalkan pemrosesan event lama (package bloc_concurrency)
    on<ProductSearched>(_onSearched, transformer: restartable());
  }
  final GetProducts _getProducts; // use case dari domain layer

  Future<void> _onRequested(ProductsRequested e, Emitter<ProductsState> emit) async {
    emit(const ProductsLoading());
    final result = await _getProducts();
    result.fold(
      (failure) => emit(ProductsFailure(failure.message)),
      (items) => emit(ProductsLoaded(items)),
    );
  }

  Future<void> _onSearched(ProductSearched e, Emitter<ProductsState> emit) async {
    final result = await _getProducts(query: e.query);
    result.fold((f) => emit(ProductsFailure(f.message)), (items) => emit(ProductsLoaded(items)));
  }
}
```

```dart
BlocProvider(
  create: (_) => sl<ProductsBloc>()..add(ProductsRequested()),
  child: BlocConsumer<ProductsBloc, ProductsState>(
    listenWhen: (_, s) => s is ProductsFailure,
    listener: (context, s) => ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text((s as ProductsFailure).message))),   // side effect
    builder: (context, s) => switch (s) {                                       // exhaustive
      ProductsInitial() || ProductsLoading() => const Center(child: CircularProgressIndicator()),
      ProductsLoaded(:final items) => ProductList(items: items),
      ProductsFailure(:final message) => ErrorView(message: message,
          onRetry: () => context.read<ProductsBloc>().add(ProductsRequested())),
    },
  ),
);
```

### Riverpod (Notifier + AsyncValue)

```dart
final productRepositoryProvider = Provider<ProductRepository>((ref) => ProductRepositoryImpl(ref.watch(dioProvider)));

class ProductsNotifier extends AsyncNotifier<List<Product>> {
  @override
  Future<List<Product>> build() => ref.watch(productRepositoryProvider).getProducts();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => ref.read(productRepositoryProvider).getProducts());
  }
}
final productsProvider = AsyncNotifierProvider<ProductsNotifier, List<Product>>(ProductsNotifier.new);

class ProductsPage extends ConsumerWidget {
  const ProductsPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(productsProvider);
    return products.when(
      data: (items) => ProductList(items: items),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.read(productsProvider.notifier).refresh()),
    );
  }
}
```

### Provider (ChangeNotifier) — untuk kasus sederhana

```dart
class CartModel extends ChangeNotifier {
  final _items = <CartItem>[];
  List<CartItem> get items => List.unmodifiable(_items);
  int get total => _items.fold(0, (s, i) => s + i.subtotal);
  void add(CartItem item) { _items.add(item); notifyListeners(); }
}
// rebuild hanya saat total berubah:
final total = context.select<CartModel, int>((c) => c.total);
```

:::caution[Version-dependent]
Riverpod 3 mengubah beberapa API (mis. penyatuan `AutoDispose*` dan perilaku retry/pause). Bloc 8+ memakai `on<Event>` (bukan `mapEventToState`).
Selalu cek changelog paket saat upgrade.
:::

## Best Practices

- **Satu solusi utama per project.** Konsistensi lebih berharga dari "solusi terbaik"; campuran Provider+Bloc+GetX menyulitkan onboarding.
- **State immutable + equality** (`Equatable`, `freezed`, atau sealed class dengan `==`) — Bloc tidak emit state yang sama; rebuild jadi efisien.
- **Status eksplisit dengan sealed class / `AsyncValue`** — `switch` exhaustive memaksa Anda menangani loading & error.
- **Side effect di `BlocListener` / `ref.listen`**, bukan di `builder` — builder bisa dipanggil berkali-kali.
- **Bloc/Notifier tidak mengenal `BuildContext`, `Navigator`, atau widget** — agar bisa di-unit-test murni.
- **Bloc memanggil use case/repository**, bukan `Dio` langsung — menjaga batas Clean Architecture.
- **Gunakan `select`/`BlocSelector`** pada widget besar untuk mencegah rebuild yang tidak perlu.
- **Scope sesempit mungkin** — `BlocProvider` di level halaman, bukan semuanya di `main()`.

## Anti-Patterns

- **Semua state di global store** — termasuk state form sementara; membuat state "bocor" antar halaman.
- **Banyak boolean** (`isLoading`, `isError`, `hasData`) → kombinasi mustahil seperti loading **dan** error sekaligus.
- **Memutasi list di state** (`state.items.add(x); emit(state)`) → equality sama, UI tidak update.
- **`context.read` di dalam `build`** untuk nilai yang perlu reaktif (harusnya `watch`).
- **Bloc memanggil Bloc lain secara langsung** → coupling erat. Gunakan repository bersama (stream) atau koordinasi di layer presentation.
- **Logika bisnis di widget** (hitung diskon, validasi stok di `onPressed`).

## Performance Considerations

- Rebuild Flutter murah, tetapi rebuild **subtree besar** dengan layout mahal tetap terasa. Gunakan `select`, pecah widget, dan `const`.
- `ChangeNotifier` memberi tahu **semua** listener; untuk state besar, pecah menjadi beberapa notifier atau gunakan `select`.
- Riverpod `autoDispose` membebaskan memory halaman yang ditutup; `keepAlive` untuk cache yang sengaja dipertahankan.
- Hindari `emit` beruntun dalam loop (mis. per item) — kumpulkan lalu emit sekali.

## Security Considerations

- Jangan menyimpan data sensitif (PIN, token) di state yang di-log oleh `BlocObserver` atau `ProviderObserver`; filter/redact di observer.
- Bersihkan state sesi (cart, profil, cache) saat logout — reset provider/bloc, jangan hanya pindah halaman.
- Otorisasi (role) di UI hanya untuk UX; validasi tetap di server.

## Real-World Use Cases

- **POS:** `CartBloc` (event: ItemAdded, QtyChanged, DiscountApplied, CheckoutRequested) — alur eksplisit memudahkan audit dan debugging transaksi.
- **Katalog/feed:** Riverpod `AsyncNotifier` dengan pagination dan pull-to-refresh.
- **Session/auth:** `AuthBloc` atau `authProvider` sebagai sumber kebenaran status login; router me-redirect berdasarkan state ini.
- **Form kompleks:** Cubit per halaman form dengan state validasi per field.

## Interview Questions

1. **(Fundamental)** Apa itu state, dan apa beda ephemeral state dan app state?
2. **(Fundamental)** Mengapa tidak memakai `setState` untuk semuanya?
3. **(Intermediate)** Apa beda Bloc dan Cubit? Kapan memakai masing-masing?
4. **(Intermediate)** Mengapa state harus immutable dan memiliki equality?
5. **(Intermediate)** Di mana side effect seperti navigasi sebaiknya dilakukan?
6. **(Advanced)** Bagaimana Anda menangani pencarian yang di-trigger tiap ketikan agar hasil lama tidak menimpa hasil baru?
7. **(Advanced)** Bandingkan Riverpod dan Bloc untuk aplikasi POS skala menengah.

## Sample Answers

1. State adalah data yang berubah dan memengaruhi UI. Ephemeral state hanya relevan untuk satu widget (tab aktif, animasi) → `setState`. App state dipakai lintas halaman atau perlu dipertahankan (auth, cart) → state management.
2. `setState` mengikat logika ke widget, sulit di-test, dan membuat state sulit dibagi; hasilnya prop drilling dan duplikasi. Untuk state lokal tetap tepat.
3. Cubit: method publik langsung `emit` state — ringkas. Bloc: menerima **event** sehingga ada jejak "apa yang terjadi", mendukung transformer (debounce, restartable, droppable) dan lebih mudah ditrace. Cubit untuk state sederhana; Bloc untuk alur kompleks/konkuren.
4. Agar perubahan terdeteksi dengan perbandingan (`==`), mencegah mutasi tak sengaja dari tempat lain, dan memungkinkan Bloc/selector menghindari rebuild ketika nilai tidak berubah.
5. Di `BlocListener`/`BlocConsumer.listener` atau `ref.listen`, karena dipanggil sekali per perubahan state; `builder` bisa dipanggil berulang.
6. Debounce input dan gunakan transformer `restartable()` (bloc_concurrency) sehingga event pencarian baru membatalkan handler lama; di Riverpod, provider family per query + `ref.onDispose` untuk cancel token.
7. Bloc unggul dalam keterlacakan alur transaksi, konvensi ketat untuk tim, dan testing via `bloc_test`. Riverpod unggul dalam dependency graph compile-safe, caching async, dan boilerplate lebih sedikit. Untuk POS dengan banyak alur transaksi dan audit, saya condong ke Bloc untuk fitur transaksi; keduanya valid — yang penting konsisten.

## Practical Exercises

1. Refactor halaman produk yang memakai `setState` + `FutureBuilder` menjadi Cubit dengan sealed state; tulis `blocTest` untuk loading→loaded dan loading→failure.
2. Implementasikan fitur yang sama dengan Riverpod `AsyncNotifier`; bandingkan jumlah kode dan cara testing.
3. Buat `CartBloc` dengan event tambah/ubah qty/hapus dan pastikan `total` hanya me-rebuild widget total (`BlocSelector`).
4. Tambahkan pencarian dengan debounce + `restartable()` dan buktikan hasil lama tidak menimpa hasil baru.

## Quick Reference

- `UI = f(state)` · state **immutable** · status **eksplisit**.
- Lokal → `setState`. Dibagi → Bloc/Riverpod/Provider.
- Bloc: `add(Event)` → `on<Event>` → `emit(State)`. Cubit: `method()` → `emit`.
- Riverpod: `ref.watch` (reaktif, di build) · `ref.read` (sekali, di callback) · `ref.listen` (side effect).
- Side effect → Listener. Rebuild selektif → `select`/`BlocSelector`.
- Bloc/Notifier tidak boleh kenal `BuildContext`.

## Related Topics

- [Clean Architecture di Flutter](/flutter/clean-architecture/)
- [Async Programming](/flutter/async-programming/)
- [Widget Lifecycle](/flutter/widget-lifecycle/)
- [Unit, Widget & Integration Testing](/flutter/testing/)
- Referensi resmi: [Flutter state management](https://docs.flutter.dev/data-and-backend/state-mgmt/intro), [bloclibrary.dev](https://bloclibrary.dev), [riverpod.dev](https://riverpod.dev).
