---
title: "Navigation"
description: "Navigasi Android dengan Navigation Compose: NavHost, rute type-safe (Kotlin Serialization), argumen, nested graph, back stack (popUpTo, launchSingleTop), bottom navigation dengan state tersimpan, deep link, ViewModel per graph, hasil antar layar, serta perbandingan dengan go_router."
level: intermediate
status: complete
version: "Navigation Compose 2.8+ (type-safe routes) · Kotlin Serialization"
updated: 2026-11-13
tags: [android, navigation, compose, deep-link, back-stack]
---

## Overview

**Navigation Component** mengelola perpindahan layar, back stack, argumen, dan deep link. Untuk Compose, gunakan
**Navigation Compose** dengan `NavHost` dan `NavController`. Sejak versi 2.8, rute dapat didefinisikan secara
**type-safe** dengan objek/kelas Kotlin Serialization, menggantikan string route.

:::caution[Version-dependent]
API navigasi berkembang cepat (mis. type-safe routes di 2.8, dan Navigation 3 yang lebih baru untuk Compose). Cek versi
dan dokumentasi resmi sebelum menyalin contoh.
:::

## Why It Matters

Navigasi yang salah menyebabkan back stack membengkak, layar ganda, state tab hilang, deep link tidak bekerja, atau
crash karena argumen hilang setelah process death.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| `NavController` | Mengelola back stack & navigasi |
| `NavHost` | Container yang menampilkan destination sesuai rute |
| Destination / route | Satu layar; route type-safe = `@Serializable object/data class` |
| Arguments | Data kecil (ID), bukan objek besar |
| Nested graph | Kelompok destination (mis. alur checkout) dengan scope ViewModel sendiri |
| Back stack options | `popUpTo`, `inclusive`, `launchSingleTop`, `saveState`, `restoreState` |
| Deep link | URI/App Link yang membuka destination tertentu |

| Android Navigation Compose | Flutter go_router |
| --- | --- |
| `NavHost` + `composable<Route>` | `GoRouter(routes: [...])` |
| `navController.navigate(Detail(id))` | `context.go('/detail/$id')` / `push` |
| Nested graph | `ShellRoute` / sub-routes |
| `deepLinks = listOf(navDeepLink<...>{})` | Path dicocokkan otomatis |
| `popUpTo` | `go` mengganti stack, `pop` |

## How It Works

```text
navigate(OrderDetail("A1")) → push entry ke back stack → NavBackStackEntry punya Lifecycle, ViewModelStore, SavedStateHandle
Back → pop entry → ViewModel entry dibersihkan
Argumen route disimpan di SavedStateHandle entry → bertahan process death
```

## Implementation

### Rute type-safe & NavHost

```kotlin
@Serializable object Home
@Serializable object Orders
@Serializable data class OrderDetail(val orderId: String)
@Serializable object CheckoutGraph
@Serializable object Cart
@Serializable object Payment

@Composable
fun PosNavHost(navController: NavHostController = rememberNavController()) {
    NavHost(navController, startDestination = Home) {
        composable<Home> { HomeRoute(onOpenOrders = { navController.navigate(Orders) }) }
        composable<Orders> {
            OrdersRoute(onOrderClick = { id -> navController.navigate(OrderDetail(id)) })
        }
        composable<OrderDetail>(
            deepLinks = listOf(navDeepLink<OrderDetail>(basePath = "https://pos.example.com/orders")),
        ) { OrderDetailRoute() }

        navigation<CheckoutGraph>(startDestination = Cart) {               // nested graph
            composable<Cart> { entry ->
                val parent = remember(entry) { navController.getBackStackEntry(CheckoutGraph) }
                val checkoutVm: CheckoutViewModel = hiltViewModel(parent)  // ViewModel dibagi seluruh graph
                CartRoute(checkoutVm, onNext = { navController.navigate(Payment) })
            }
            composable<Payment> { /* ... */ }
        }
    }
}
```

### Membaca argumen di ViewModel

```kotlin
@HiltViewModel
class OrderDetailViewModel @Inject constructor(savedStateHandle: SavedStateHandle, repo: OrderRepository) : ViewModel() {
    private val route = savedStateHandle.toRoute<OrderDetail>()
    val order = repo.observe(route.orderId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}
```

### Back stack yang benar

```kotlin
// Setelah pembayaran sukses: kembali ke Home dan buang seluruh alur checkout
navController.navigate(Home) {
    popUpTo(CheckoutGraph) { inclusive = true }
    launchSingleTop = true
}

// Bottom navigation: simpan & pulihkan state tiap tab
fun NavController.navigateToTab(route: Any) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}
```

### Mengembalikan hasil ke layar sebelumnya

```kotlin
// Layar pemilih pelanggan
navController.previousBackStackEntry?.savedStateHandle?.set("customer_id", id)
navController.popBackStack()

// Layar penerima
val customerId = navController.currentBackStackEntry?.savedStateHandle
    ?.getStateFlow<String?>("customer_id", null)?.collectAsStateWithLifecycle()
```

### Deep link di manifest (App Links)

```xml
<activity android:name=".MainActivity" android:exported="true">
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="pos.example.com" android:pathPrefix="/orders" />
  </intent-filter>
</activity>
```

## Best Practices

- **Argumen = ID kecil**; ambil data dari repository di layar tujuan.
- **Composable layar tidak menerima `NavController`**; berikan lambda (`onOrderClick`) agar mudah dites.
- **Nested graph** untuk alur multi-langkah + ViewModel yang di-scope ke graph.
- **`popUpTo` + `launchSingleTop`** untuk mencegah layar ganda.
- **Validasi deep link** (autentikasi, kepemilikan data) sebelum menampilkan konten.

## Anti-Patterns

- Mengirim objek besar/Parcelable kompleks sebagai argumen.
- Menyimpan `NavController` di ViewModel.
- Navigasi dipicu ulang setiap recomposition (panggil navigate dari event, bukan dari body composable).
- Bottom navigation tanpa `saveState/restoreState` (scroll & state tab hilang).

## Performance Considerations

Setiap entri back stack menyimpan ViewModel dan state; back stack yang terus bertambah (navigate tanpa popUpTo pada alur
berulang) membuang memori. Gunakan `launchSingleTop` dan bersihkan alur yang selesai.

## Security Considerations

Deep link adalah input eksternal: validasi parameter, wajibkan login sebelum membuka konten privat, cek otorisasi di
server, dan gunakan App Links terverifikasi (`autoVerify`) agar aplikasi lain tidak membajak URL.

## Real-World Use Cases

- Alur checkout multi-langkah dengan ViewModel bersama.
- Bottom navigation aplikasi kasir (Penjualan, Produk, Laporan, Pengaturan).
- Notifikasi push yang membuka detail order via deep link.

## Interview Questions

1. Bagaimana mengirim argumen antar layar dan mengapa sebaiknya hanya ID?
2. Apa fungsi `popUpTo` dan `launchSingleTop`?
3. Bagaimana menjaga state tiap tab di bottom navigation?
4. Bagaimana berbagi ViewModel antar beberapa layar?
5. Bagaimana menerapkan deep link dengan aman?

## Sample Answers

1. Lewat route (type-safe data class) yang tersimpan di SavedStateHandle entry; hanya ID karena argumen harus kecil, dapat diserialisasi, bertahan process death, dan data terkini sebaiknya diambil dari sumber kebenaran.
2. `popUpTo` membuang entri dari back stack hingga destination tertentu (`inclusive` termasuk destination itu); `launchSingleTop` mencegah instance ganda di puncak back stack.
3. Navigasi tab dengan `popUpTo(startDestination) { saveState = true }`, `launchSingleTop = true`, dan `restoreState = true`.
4. Kelompokkan dalam nested graph dan dapatkan ViewModel dengan owner berupa back stack entry graph tersebut (`hiltViewModel(parentEntry)`).
5. Deklarasikan intent filter/App Links terverifikasi, definisikan `navDeepLink`, validasi parameter, wajibkan autentikasi, dan lakukan pemeriksaan otorisasi di server.

## Practical Exercises

1. Buat NavHost dengan bottom navigation 3 tab yang mempertahankan state.
2. Implementasikan alur checkout nested graph dengan ViewModel bersama dan `popUpTo` setelah selesai.
3. Uji deep link dengan `adb shell am start -a android.intent.action.VIEW -d "https://pos.example.com/orders/A1"`.

## Quick Reference

```text
NavHost + composable<Route> · @Serializable route · savedStateHandle.toRoute<T>() · argumen = ID
popUpTo(inclusive) · launchSingleTop · saveState/restoreState (tab) · nested graph + hiltViewModel(parentEntry)
Hasil: previousBackStackEntry.savedStateHandle · deep link: navDeepLink + App Links autoVerify + validasi
```

## Related Topics

- [Jetpack Compose Fundamentals](/android/jetpack-compose/)
- [Fragment Lifecycle](/android/fragment-lifecycle/)
- [Navigation & Routing (Flutter)](/flutter/navigation-routing/)
