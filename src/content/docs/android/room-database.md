---
title: "Room Database"
description: "Room untuk penyimpanan lokal Android: entity, DAO, database, relasi (@Relation, junction), Flow reaktif, transaksi, TypeConverter, migrasi (auto & manual) beserta test-nya, upsert, paging, serta pola offline-first dan perbandingan dengan Drift di Flutter."
level: intermediate
status: complete
version: "Room 2.6+ (KSP) — Room 2.7 menambah dukungan KMP"
updated: 2026-11-13
tags: [android, room, sqlite, database, offline-first]
---

## Overview

**Room** adalah library Jetpack di atas SQLite yang menyediakan pemetaan objek, verifikasi query SQL saat compile,
dukungan coroutines & Flow, serta migrasi terstruktur. Room adalah pilihan standar untuk database lokal Android, setara
dengan **Drift** di Flutter.

## Why It Matters

Aplikasi offline-first, cache data, antrian sinkronisasi (outbox), dan draft form semuanya butuh database lokal yang
andal. Pertanyaan tentang Room, migrasi, dan relasi sering muncul di interview Android.

## Core Concepts

| Komponen | Peran |
| --- | --- |
| `@Entity` | Tabel |
| `@Dao` | Interface berisi query (`@Query`, `@Insert`, `@Upsert`, `@Update`, `@Delete`, `@Transaction`) |
| `@Database` | Titik akses, daftar entity, versi skema, migrasi |
| `@TypeConverter` | Mengubah tipe non-primitif (Instant, enum) ke kolom |
| `@Relation` / `@Embedded` | Memuat relasi 1:N / N:M |
| `Flow<T>` dari DAO | Memancarkan ulang saat tabel terkait berubah |
| Migration | `AutoMigration` atau `Migration(from, to)` manual |

| Room (Android) | Drift (Flutter) |
| --- | --- |
| Anotasi + KSP | Tabel Dart + build_runner (atau file `.drift`) |
| `Flow` | `Stream` (`watch()`) |
| `@Transaction` / `withTransaction` | `transaction(() async {...})` |
| `Migration`/`AutoMigration` | `MigrationStrategy` / `onUpgrade` |

## How It Works

```text
DAO interface → KSP menghasilkan implementasi → SQL diverifikasi terhadap skema saat compile
Query Flow → Room mendaftarkan InvalidationTracker pada tabel → ada perubahan tabel → query dijalankan ulang → emit
Upgrade versi → Room menjalankan migrasi berurutan → validasi skema hasil dengan skema yang diharapkan
```

## Implementation

### Entity, DAO, Database

```kotlin
@Entity(tableName = "products", indices = [Index(value = ["sku"], unique = true)])
data class ProductEntity(
    @PrimaryKey val id: String,
    val sku: String,
    val name: String,
    val price: Long,                       // rupiah, integer
    @ColumnInfo(name = "updated_at") val updatedAt: Instant,
)

@Entity(tableName = "sales")
data class SaleEntity(@PrimaryKey val id: String, val total: Long, val status: SaleStatus, val createdAt: Instant)

@Entity(
    tableName = "sale_items",
    primaryKeys = ["saleId", "productId"],
    foreignKeys = [ForeignKey(entity = SaleEntity::class, parentColumns = ["id"], childColumns = ["saleId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("productId")],
)
data class SaleItemEntity(val saleId: String, val productId: String, val qty: Int, val unitPrice: Long)

data class SaleWithItems(
    @Embedded val sale: SaleEntity,
    @Relation(parentColumn = "id", entityColumn = "saleId") val items: List<SaleItemEntity>,
)

@Dao
interface SaleDao {
    @Transaction
    @Query("SELECT * FROM sales WHERE createdAt >= :from ORDER BY createdAt DESC")
    fun observeSince(from: Instant): Flow<List<SaleWithItems>>

    @Upsert suspend fun upsertProducts(items: List<ProductEntity>)
    @Insert suspend fun insertSale(sale: SaleEntity)
    @Insert suspend fun insertItems(items: List<SaleItemEntity>)

    @Query("SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'PAID' AND createdAt >= :from")
    fun observeRevenue(from: Instant): Flow<Long>

    @Transaction
    suspend fun createSale(sale: SaleEntity, items: List<SaleItemEntity>) {   // atomik
        insertSale(sale)
        insertItems(items)
    }
}

class Converters {
    @TypeConverter fun fromInstant(v: Instant?): Long? = v?.toEpochMilli()
    @TypeConverter fun toInstant(v: Long?): Instant? = v?.let(Instant::ofEpochMilli)
}

@Database(
    entities = [ProductEntity::class, SaleEntity::class, SaleItemEntity::class],
    version = 3,
    autoMigrations = [AutoMigration(from = 1, to = 2)],
    exportSchema = true,                   // simpan skema JSON di repo untuk migrasi & test
)
@TypeConverters(Converters::class)
abstract class PosDatabase : RoomDatabase() {
    abstract fun saleDao(): SaleDao
}
```

### Migrasi manual & test

```kotlin
val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE sales ADD COLUMN note TEXT")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_sales_createdAt ON sales(createdAt)")
    }
}

Room.databaseBuilder(context, PosDatabase::class.java, "pos.db")
    .addMigrations(MIGRATION_2_3)
    .build()                                // JANGAN fallbackToDestructiveMigration() untuk data yang belum tersinkron

@get:Rule val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), PosDatabase::class.java)
@Test fun migrate2To3() {
    helper.createDatabase("test.db", 2).close()
    helper.runMigrationsAndValidate("test.db", 3, true, MIGRATION_2_3)
}
```

### Repository offline-first

```kotlin
class SaleRepository @Inject constructor(
    private val database: PosDatabase,
    private val dao: SaleDao,
    private val outbox: OutboxDao,
) {
    fun todaySales(zone: ZoneId): Flow<List<Sale>> =
        dao.observeSince(LocalDate.now(zone).atStartOfDay(zone).toInstant()).map { it.map(SaleWithItems::toDomain) }

    suspend fun create(sale: Sale) = database.withTransaction {       // satu transaksi: data + outbox
        dao.createSale(sale.toEntity(), sale.items.map { it.toEntity(sale.id) })
        outbox.enqueue(OutboxEntity(type = "sale.created", entityId = sale.id, payload = sale.toJson()))
    }
}
```

## Best Practices

- **Entity terpisah dari model domain/UI**; mapper di data layer.
- **`exportSchema = true`** dan commit file skema; uji setiap migrasi.
- **Transaksi untuk operasi multi-tabel** (`@Transaction`, `withTransaction`).
- **Index** untuk kolom filter/JOIN/foreign key.
- **Expose `Flow`** untuk data yang diamati, `suspend` untuk operasi sekali.
- **Uang integer**, waktu sebagai epoch/Instant UTC.

## Anti-Patterns

- `allowMainThreadQueries()` di production.
- `fallbackToDestructiveMigration()` pada data pengguna yang belum tersinkron.
- Menyimpan list sebagai JSON string di satu kolom bila perlu di-query.
- Query `SELECT *` besar yang dipetakan berulang tanpa pagination.
- Menyimpan token/PIN di tabel tanpa enkripsi.

## Performance Considerations

Gunakan index yang tepat, batch insert dalam transaksi (jauh lebih cepat), Paging 3 (`PagingSource` dari DAO) untuk
list panjang, dan proyeksi kolom yang dibutuhkan saja. Room menjalankan query `suspend`/`Flow` di dispatcher
background secara otomatis. Mode WAL (default) memungkinkan baca saat tulis.

## Security Considerations

Database Room tidak terenkripsi secara default. Untuk data sensitif gunakan SQLCipher (via `SupportFactory`) dengan
kunci dari Android Keystore, kecualikan database dari backup bila perlu, dan simpan hanya data yang dibutuhkan offline.

## Real-World Use Cases

- Transaksi kasir offline + outbox untuk sinkronisasi.
- Cache katalog produk dengan upsert dari server.
- Draft laporan petugas lapangan.

## Interview Questions

1. Apa keuntungan Room dibanding SQLite langsung?
2. Bagaimana Room membuat Flow reaktif?
3. Bagaimana menangani migrasi skema?
4. Bagaimana memuat relasi one-to-many?
5. Bagaimana memastikan beberapa insert bersifat atomik?

## Sample Answers

1. Verifikasi SQL saat compile, pemetaan objek otomatis, dukungan coroutines/Flow, migrasi terstruktur dengan validasi, dan integrasi Jetpack (Paging, LiveData).
2. Room melacak tabel yang dibaca query; ketika ada perubahan pada tabel tersebut (insert/update/delete melalui Room), InvalidationTracker memicu query dijalankan ulang dan Flow memancarkan hasil baru.
3. Naikkan versi, tulis `AutoMigration` untuk perubahan sederhana atau `Migration` manual untuk perubahan kompleks, ekspor skema ke repo, dan uji dengan `MigrationTestHelper`; hindari destructive migration untuk data pengguna.
4. Kelas hasil dengan `@Embedded` untuk induk dan `@Relation(parentColumn, entityColumn)` untuk anak, pada query yang ditandai `@Transaction`.
5. Bungkus dalam method DAO `@Transaction` atau `database.withTransaction { }` sehingga semua berhasil atau semua dibatalkan.

## Practical Exercises

1. Buat skema sales/sale_items/products dengan relasi dan query omzet hari ini sebagai Flow.
2. Tambahkan kolom baru lewat migrasi manual dan tulis test migrasinya.
3. Implementasikan outbox dan pastikan sale + outbox ditulis dalam satu transaksi.

## Quick Reference

```text
@Entity · @Dao (@Query/@Upsert/@Transaction) · @Database(version, exportSchema) · @TypeConverter
Flow dari DAO = reaktif · withTransaction untuk multi-tabel · @Embedded + @Relation untuk 1:N
Migrasi: AutoMigration / Migration + MigrationTestHelper · hindari destructive & main-thread queries
Index · batch dalam transaksi · Paging 3 · enkripsi (SQLCipher) untuk data sensitif
```

## Related Topics

- [Local Database (Flutter)](/flutter/local-database/)
- [Database Migration](/database/migration/)
- [WorkManager](/android/workmanager/)
