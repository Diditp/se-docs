---
title: "Jetpack Compose Fundamentals"
description: "Dasar Jetpack Compose untuk developer Flutter: composable & recomposition, state (remember, rememberSaveable, mutableStateOf), state hoisting, modifier, layout, LazyColumn, side effects (LaunchedEffect, DisposableEffect), stability, theming Material 3, preview, dan testing."
level: intermediate
status: complete
version: "Compose BOM 2024.x+ · Material 3 · Kotlin 2.x (Compose compiler plugin)"
updated: 2026-11-13
tags: [android, jetpack-compose, ui, declarative, recomposition]
---

## Overview

**Jetpack Compose** adalah toolkit UI deklaratif modern Android: UI ditulis sebagai fungsi `@Composable` yang
menggambarkan tampilan berdasarkan state, dan diperbarui ulang (**recomposition**) ketika state berubah. Konsepnya sangat
mirip Flutter: Composable ≈ Widget, recomposition ≈ rebuild, state hoisting ≈ lifting state up.

## Why It Matters

Compose adalah rekomendasi Google untuk UI Android baru, dan semakin banyak lowongan Android yang memintanya. Bagi
Flutter developer, transisi ke Compose relatif cepat — yang perlu dipelajari adalah perbedaan detail (state, side effects,
stability).

## Core Concepts

| Compose | Flutter | Catatan |
| --- | --- | --- |
| `@Composable fun Greeting()` | `class Greeting extends StatelessWidget` | Composable adalah fungsi |
| Recomposition | Rebuild | Compose hanya menjalankan ulang composable yang membaca state yang berubah |
| `remember { mutableStateOf(x) }` | `State` + `setState` | State lokal |
| `rememberSaveable` | RestorationMixin | Bertahan rotasi & process death |
| State hoisting | Lifting state up | Composable stateless menerima `value` + `onValueChange` |
| `Modifier` | Widget pembungkus (Padding, GestureDetector) | Urutan modifier berpengaruh |
| `Column`/`Row`/`Box` | `Column`/`Row`/`Stack` | |
| `LazyColumn` | `ListView.builder` | |
| `LaunchedEffect` | `initState` + async / `didUpdateWidget` | Side effect berbasis key |
| `CompositionLocal` | `InheritedWidget` | Nilai implisit di tree (theme) |
| `MaterialTheme` | `ThemeData` | |

### Side-effect API

| API | Kegunaan |
| --- | --- |
| `LaunchedEffect(key)` | Menjalankan coroutine saat masuk composition/key berubah |
| `rememberCoroutineScope()` | Scope untuk meluncurkan coroutine dari callback (onClick) |
| `DisposableEffect(key)` | Mendaftar/melepas listener (`onDispose`) |
| `SideEffect` | Sinkronisasi state Compose ke objek non-Compose setiap recomposition sukses |
| `derivedStateOf` | Menghitung state turunan agar recomposition tidak berlebihan |
| `snapshotFlow` | Mengubah state Compose menjadi Flow |

## How It Works

```text
Composition: jalankan composable → bangun tree UI
State berubah (mutableStateOf) → snapshot system menandai pembaca state → recomposition hanya pada scope itu
Fase per frame: Composition → Layout (measure & place) → Drawing
Parameter stabil & tidak berubah → composable dapat dilewati (skippable)
```

## Implementation

### State hoisting

```kotlin
@Composable
fun QuantityStepper(qty: Int, onQtyChange: (Int) -> Unit, modifier: Modifier = Modifier) {   // stateless
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onQtyChange(qty - 1) }, enabled = qty > 1) { Icon(Icons.Default.Remove, "Kurangi") }
        Text("$qty", style = MaterialTheme.typography.titleMedium)
        IconButton(onClick = { onQtyChange(qty + 1) }) { Icon(Icons.Default.Add, "Tambah") }
    }
}

@Composable
fun CartItemRow(item: CartItemUi, onQtyChange: (String, Int) -> Unit) {
    ListItem(
        headlineContent = { Text(item.name) },
        supportingContent = { Text(item.priceLabel) },
        trailingContent = { QuantityStepper(item.qty, { onQtyChange(item.id, it) }) },
    )
}
```

### Layar dengan state dari ViewModel

```kotlin
@Composable
fun ProductListScreen(
    query: String,
    state: ProductListUiState,
    onQueryChange: (String) -> Unit,
    onProductClick: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(
            value = query, onValueChange = onQueryChange,
            label = { Text("Cari produk") }, modifier = Modifier.fillMaxWidth(),
        )
        when (state) {
            is ProductListUiState.Loading -> CircularProgressIndicator(Modifier.padding(24.dp))
            is ProductListUiState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
            is ProductListUiState.Data -> LazyColumn {
                items(state.products, key = { it.id }) { p ->            // key stabil
                    ProductRow(p, onClick = { onProductClick(p.id) })
                }
            }
        }
    }
}
```

### Side effects

```kotlin
@Composable
fun OrderDetailRoute(orderId: String, viewModel: OrderDetailViewModel = hiltViewModel()) {
    LaunchedEffect(orderId) { viewModel.load(orderId) }              // jalan ulang hanya bila orderId berubah

    val snackbar = remember { SnackbarHostState() }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    state.userMessage?.let { msg ->
        LaunchedEffect(msg) { snackbar.showSnackbar(msg); viewModel.messageShown() }
    }
}

@Composable
fun ScannerEffect(scanner: BarcodeScanner, onScan: (String) -> Unit) {
    val currentOnScan by rememberUpdatedState(onScan)
    DisposableEffect(scanner) {
        val listener = BarcodeListener { code -> currentOnScan(code) }
        scanner.register(listener)
        onDispose { scanner.unregister(listener) }                     // lepas saat keluar composition
    }
}
```

### derivedStateOf

```kotlin
val listState = rememberLazyListState()
val showScrollToTop by remember { derivedStateOf { listState.firstVisibleItemIndex > 5 } }
```

### Preview & test

```kotlin
@Preview(showBackground = true)
@Composable
private fun QuantityStepperPreview() { AppTheme { QuantityStepper(qty = 2, onQtyChange = {}) } }

@get:Rule val compose = createComposeRule()
@Test fun tambahMenaikkanQty() {
    var qty by mutableIntStateOf(1)
    compose.setContent { QuantityStepper(qty, { qty = it }) }
    compose.onNodeWithContentDescription("Tambah").performClick()
    assertEquals(2, qty)
}
```

### Interop

```kotlin
// Compose di dalam View/Fragment lama
binding.composeView.setContent { AppTheme { CartSummary(state) } }
// View lama di dalam Compose
AndroidView(factory = { ctx -> MapView(ctx) })
```

## Best Practices

- **Composable stateless + state hoisting**; satu Route terhubung ke ViewModel.
- **Parameter `modifier: Modifier = Modifier`** di setiap composable yang dapat ditata ulang.
- **Key stabil di `LazyColumn`**.
- **Model UI immutable** (`val`, list immutable/`@Immutable`) agar stabil dan dapat di-skip.
- **Side effect hanya lewat effect API** — jangan meluncurkan coroutine/IO langsung di body composable.
- **Teks di `stringResource`** dan desain lewat `MaterialTheme`.

## Anti-Patterns

- Memanggil API/DB atau `viewModel.load()` langsung di body composable (terpanggil setiap recomposition).
- `remember` untuk data yang seharusnya di ViewModel.
- Membaca state yang sering berubah (scroll offset) di level tinggi sehingga seluruh layar recompose.
- `mutableStateListOf` yang diekspos dan diubah dari luar.
- Composable raksasa ratusan baris.

## Performance Considerations

Gunakan Layout Inspector (recomposition counts) untuk menemukan recomposition berlebihan. Tunda pembacaan state yang
sering berubah ke fase layout/draw (mis. `Modifier.offset { }` versi lambda, `graphicsLayer { }`), gunakan
`derivedStateOf`, key yang stabil, dan Baseline Profiles. Uji performa di build release — build debug Compose jauh lebih
lambat.

## Security Considerations

Layar sensitif (PIN, saldo) memerlukan `FLAG_SECURE` di window; gunakan `KeyboardOptions(keyboardType = KeyboardType.NumberPassword)`
dan `PasswordVisualTransformation` untuk input PIN; hindari menampilkan data sensitif di preview/screenshot test yang di-commit.

## Real-World Use Cases

- UI baru di aplikasi native dengan Compose + ViewModel.
- Migrasi bertahap dari XML dengan `ComposeView`.
- Design system Material 3 bersama untuk beberapa aplikasi.

## Interview Questions

1. Apa itu recomposition?
2. Apa beda `remember` dan `rememberSaveable`?
3. Apa itu state hoisting dan mengapa penting?
4. Kapan memakai `LaunchedEffect`, `DisposableEffect`, dan `rememberCoroutineScope`?
5. Bagaimana mengoptimalkan recomposition?
6. Bandingkan Compose dengan Flutter.

## Sample Answers

1. Proses menjalankan ulang composable yang membaca state yang berubah agar UI sesuai state terbaru; Compose melewati composable yang inputnya tidak berubah.
2. `remember` menyimpan nilai selama composable berada di composition (hilang saat rotasi); `rememberSaveable` juga menyimpan ke saved state sehingga bertahan rotasi dan process death (tipe yang dapat disimpan di Bundle atau dengan Saver).
3. Memindahkan state ke pemanggil sehingga composable menerima nilai dan callback; composable menjadi stateless, dapat dipakai ulang, mudah diuji/preview, dan state memiliki satu sumber kebenaran.
4. `LaunchedEffect` untuk coroutine yang terikat composition/key (memuat data, menampilkan snackbar); `DisposableEffect` untuk mendaftar & melepas listener; `rememberCoroutineScope` untuk meluncurkan coroutine dari event seperti onClick.
5. Model immutable/stabil, key di lazy list, `derivedStateOf`, pindahkan pembacaan state ke fase layout/draw, pecah composable, hindari alokasi di composition, ukur dengan Layout Inspector dan uji di release build.
6. Keduanya deklaratif dengan rebuild/recompose berbasis state dan pola state hoisting. Flutter menggambar sendiri dengan engine-nya dan lintas platform; Compose terintegrasi dengan Android View/Jetpack (Compose Multiplatform memperluas ke platform lain). Compose memakai fungsi + snapshot state; Flutter memakai widget class + setState/state management.

## Practical Exercises

1. Buat layar keranjang dengan `LazyColumn`, stepper qty, dan total yang dihitung dengan `derivedStateOf`.
2. Konversi satu layar Flutter Anda menjadi Compose dan catat padanannya.
3. Gunakan Layout Inspector untuk menemukan dan mengurangi recomposition berlebihan.

## Quick Reference

```text
@Composable = fungsi UI · recomposition hanya pada pembaca state · Modifier berurutan
remember / rememberSaveable / mutableStateOf · state hoisting (value + onChange) · Route vs Screen
LaunchedEffect(key) · DisposableEffect + onDispose · rememberCoroutineScope · derivedStateOf · rememberUpdatedState
LazyColumn(items, key) · model immutable · collectAsStateWithLifecycle · uji performa di release
```

## Related Topics

- [Navigation](/android/navigation/)
- [ViewModel & Lifecycle-Aware Components](/android/viewmodel-lifecycle-aware/)
- [Widget Lifecycle (Flutter)](/flutter/widget-lifecycle/)
- Dokumentasi resmi: developer.android.com/develop/ui/compose
