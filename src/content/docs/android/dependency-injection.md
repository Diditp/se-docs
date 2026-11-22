---
title: "Dependency Injection (Hilt/Koin)"
description: "Dependency injection di Android: konsep DI & constructor injection, Hilt (@HiltAndroidApp, @AndroidEntryPoint, @Inject, @Module, @Binds/@Provides, scope & component, qualifier, @HiltViewModel, assisted injection, testing), Koin sebagai alternatif, dan perbandingan dengan get_it/Riverpod di Flutter."
level: intermediate
status: complete
version: "Hilt (Dagger) 2.5x+ dengan KSP · Koin 3.5+/4.x"
updated: 2026-11-13
tags: [android, dependency-injection, hilt, dagger, koin]
---

## Overview

**Dependency Injection (DI)** berarti sebuah class **menerima** dependensinya dari luar (biasanya lewat constructor)
alih-alih membuatnya sendiri. Di Android, **Hilt** (dibangun di atas Dagger, rekomendasi Google) menyediakan DI
compile-time yang terintegrasi dengan komponen Android; **Koin** adalah alternatif berbasis DSL runtime yang lebih
sederhana.

## Why It Matters

DI membuat kode mudah diuji (ganti implementasi dengan fake), mengurangi coupling, dan mengatur umur objek (singleton,
per ViewModel, per Activity). Hilt hampir selalu ditanyakan untuk posisi Android.

## Core Concepts

| Konsep Hilt | Arti |
| --- | --- |
| `@HiltAndroidApp` | Application menjadi akar graph DI |
| `@AndroidEntryPoint` | Activity/Fragment/Service yang menerima injeksi |
| `@Inject constructor` | Hilt tahu cara membuat class ini |
| `@Module` + `@InstallIn(Component)` | Tempat definisi binding yang tidak bisa `@Inject` |
| `@Binds` | Mengikat interface ke implementasi (abstract, efisien) |
| `@Provides` | Membuat objek dari library pihak ketiga (Retrofit, Room) |
| Scope | `@Singleton`, `@ActivityRetainedScoped`, `@ViewModelScoped`, `@ActivityScoped` |
| Qualifier | Membedakan dua binding bertipe sama (`@IoDispatcher`) |
| `@HiltViewModel` | ViewModel dengan constructor injection |
| `@AssistedInject` | Campuran parameter runtime + dependensi (Worker, factory) |

| Komponen Hilt | Umur |
| --- | --- |
| `SingletonComponent` | Seluruh aplikasi |
| `ActivityRetainedComponent` | Bertahan rotasi (sejajar ViewModel) |
| `ViewModelComponent` | Satu ViewModel |
| `ActivityComponent` / `FragmentComponent` | Satu Activity/Fragment |

| Android | Flutter |
| --- | --- |
| Hilt (compile-time, codegen) | injectable + get_it (codegen) |
| Koin (runtime DSL) | get_it / Riverpod providers |

## How It Works

```text
KSP memproses anotasi saat build → membangun graph dependensi → error compile bila binding hilang/siklus
Runtime: Application dibuat → SingletonComponent → Activity @AndroidEntryPoint → field/ViewModel disuntik
Scope menentukan apakah instance dibagi (mis. @Singleton = satu per aplikasi)
```

## Implementation

### Setup dasar

```kotlin
@HiltAndroidApp class PosApp : Application()

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { PosNavHost() }                  // hiltViewModel() di dalam composable
    }
}
```

### Modul: network, database, binding interface

```kotlin
@Qualifier @Retention(AnnotationRetention.BINARY) annotation class IoDispatcher

@Module
@InstallIn(SingletonComponent::class)
object CoreModule {
    @Provides @Singleton
    fun okHttp(auth: AuthInterceptor): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(auth)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    @Provides @Singleton
    fun retrofit(client: OkHttpClient, json: Json): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    @Provides fun orderApi(retrofit: Retrofit): OrderApi = retrofit.create(OrderApi::class.java)

    @Provides @Singleton
    fun database(@ApplicationContext ctx: Context): PosDatabase =
        Room.databaseBuilder(ctx, PosDatabase::class.java, "pos.db").addMigrations(MIGRATION_2_3).build()

    @Provides fun saleDao(db: PosDatabase): SaleDao = db.saleDao()

    @Provides @IoDispatcher fun io(): CoroutineDispatcher = Dispatchers.IO
}

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds @Singleton abstract fun orderRepository(impl: OfflineFirstOrderRepository): OrderRepository
}
```

### ViewModel & Worker

```kotlin
@HiltViewModel
class OrdersViewModel @Inject constructor(private val repo: OrderRepository) : ViewModel()

// Worker butuh @HiltWorker + HiltWorkerFactory di Application (Configuration.Provider)
@HiltAndroidApp
class PosApp : Application(), Configuration.Provider {
    @Inject lateinit var workerFactory: HiltWorkerFactory
    override val workManagerConfiguration get() = Configuration.Builder().setWorkerFactory(workerFactory).build()
}
```

### Testing dengan Hilt

```kotlin
@HiltAndroidTest
@UninstallModules(RepositoryModule::class)
class OrdersScreenTest {
    @get:Rule(order = 0) val hilt = HiltAndroidRule(this)
    @BindValue @JvmField val repo: OrderRepository = FakeOrderRepository(sampleOrders)
    // ...
}
// Unit test ViewModel tidak perlu Hilt sama sekali: OrdersViewModel(FakeOrderRepository(...))
```

### Alternatif: Koin

```kotlin
val appModule = module {
    single { OkHttpClient.Builder().build() }
    single<OrderRepository> { OfflineFirstOrderRepository(get(), get(), Dispatchers.IO) }
    viewModel { OrdersViewModel(get()) }
}
startKoin { androidContext(this@PosApp); modules(appModule) }
```

| | Hilt | Koin |
| --- | --- | --- |
| Validasi graph | Compile-time | Runtime (ada `verify()` untuk test) |
| Waktu build | Lebih lama (codegen) | Lebih cepat |
| Kurva belajar | Lebih curam | Lebih landai |
| Multiplatform | Android/JVM | Mendukung KMP |

## Best Practices

- **Constructor injection** di mana pun memungkinkan; field injection hanya di entry point Android.
- **`@Binds` untuk interface**, `@Provides` untuk objek library.
- **Scope seminimal mungkin** — tidak semua harus `@Singleton`.
- **Qualifier** untuk dispatcher, base URL, dan binding sejenis.
- **Unit test tanpa framework DI** — cukup buat objek dengan fake secara manual.

## Anti-Patterns

- Service locator (`EntryPoints.get`/`get()` Koin) di dalam logika bisnis.
- Semua binding `@Singleton` (state tak terduga, memori).
- Menyuntikkan `Activity` context ke objek berumur panjang (leak) — gunakan `@ApplicationContext`.
- Modul raksasa tunggal untuk seluruh aplikasi.

## Performance Considerations

Hilt membuat graph saat compile sehingga overhead runtime kecil, tetapi menambah waktu build — gunakan KSP (lebih cepat
dari kapt). Hindari inisialisasi berat di `@Provides @Singleton` yang dipanggil saat startup; gunakan `Lazy<T>` atau
`Provider<T>` bila objek tidak selalu dibutuhkan.

## Security Considerations

DI memudahkan memusatkan konfigurasi keamanan (OkHttp dengan certificate pinning, interceptor autentikasi, penyimpanan
terenkripsi) sehingga tidak ada jalur yang terlewat. Base URL dan konfigurasi per flavor diambil dari `BuildConfig`,
bukan hardcode tersebar.

## Real-World Use Cases

- Mengganti repository asli dengan fake di UI test.
- Dispatcher yang dapat diganti di test lewat qualifier.
- Konfigurasi API berbeda per flavor (staging/production).

## Interview Questions

1. Apa itu dependency injection dan manfaatnya?
2. Apa beda `@Binds` dan `@Provides`?
3. Jelaskan scope/komponen Hilt.
4. Bagaimana menyuntikkan dependensi ke ViewModel dan Worker?
5. Hilt vs Koin?
6. Bagaimana mengganti dependensi saat testing?

## Sample Answers

1. Pola di mana objek menerima dependensinya dari luar, bukan membuatnya sendiri; meningkatkan testability, mengurangi coupling, dan memusatkan pengelolaan umur objek.
2. `@Binds` (abstract) mengikat interface ke implementasi yang sudah bisa dibuat Hilt — lebih efisien; `@Provides` berisi kode untuk membuat objek, dipakai untuk class library atau objek yang butuh konfigurasi (Retrofit, Room).
3. Komponen menentukan umur binding: `SingletonComponent` (aplikasi), `ActivityRetainedComponent` (bertahan rotasi), `ViewModelComponent`, `ActivityComponent`, `FragmentComponent`, dst.; anotasi scope membuat satu instance dibagi dalam komponen tersebut.
4. ViewModel dengan `@HiltViewModel` + `@Inject constructor`; Worker dengan `@HiltWorker` + `@AssistedInject` untuk `Context` dan `WorkerParameters`, plus `HiltWorkerFactory` di konfigurasi WorkManager.
5. Hilt memvalidasi graph saat compile dan terintegrasi Jetpack, tetapi build lebih lama dan lebih rumit; Koin lebih sederhana dan mendukung multiplatform, tetapi error baru terlihat saat runtime.
6. Unit test: buat objek langsung dengan fake. Instrumented test Hilt: `@HiltAndroidTest`, `@UninstallModules` + `@BindValue` atau `@TestInstallIn` untuk mengganti modul.

## Practical Exercises

1. Pasang Hilt di aplikasi sampel: Retrofit, Room, repository, ViewModel.
2. Tambahkan qualifier `@IoDispatcher` dan ganti dengan `StandardTestDispatcher` di test.
3. Tulis UI test yang memakai `FakeOrderRepository` lewat `@TestInstallIn`.

## Quick Reference

```text
@HiltAndroidApp · @AndroidEntryPoint · @Inject constructor · @HiltViewModel · @HiltWorker + @AssistedInject
@Module @InstallIn(SingletonComponent) · @Binds (interface) · @Provides (library) · @Singleton seperlunya · @Qualifier
Test: unit tanpa DI · @HiltAndroidTest + @TestInstallIn/@BindValue · Koin = runtime DSL alternatif
```

## Related Topics

- [Android Architecture](/android/android-architecture/)
- [Repository Pattern & DI (Flutter)](/flutter/repository-pattern-di/)
- [WorkManager](/android/workmanager/)
