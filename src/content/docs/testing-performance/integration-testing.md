---
title: "Integration Testing"
description: "Integration test untuk mobile dan backend: menguji beberapa komponen nyata bersama — repository + database in-memory, API client + mock server, Room/Drift migration, integration_test Flutter di emulator, API Node.js dengan Supertest & Testcontainers — beserta kontrak API, data test, dan penempatan di CI."
level: intermediate
status: complete
version: "Flutter integration_test · Drift/Room in-memory · MockWebServer · Supertest · Testcontainers"
updated: 2026-11-13
tags: [testing, integration-test, database, api, ci]
---

## Overview

**Integration test** memverifikasi bahwa beberapa komponen bekerja **benar bersama-sama**: repository dengan database
sungguhan (in-memory), API client dengan server HTTP tiruan, migrasi skema dari versi lama, atau seluruh alur aplikasi
di emulator. Unit test membuktikan logika; integration test membuktikan **sambungannya**.

## Why It Matters

Banyak bug nyata ada di sambungan: query SQL salah, nama field JSON berbeda, migrasi yang lupa kolom, header autentikasi
tidak terkirim, plugin tidak terdaftar. Unit test dengan mock tidak menangkap ini.

## Core Concepts

| Integrasi | Komponen nyata | Yang dipalsukan |
| --- | --- | --- |
| Repository ↔ DB lokal | Drift/Room in-memory | Jaringan |
| API client ↔ HTTP | Dio/Retrofit + parser | Server (MockWebServer / adapter) |
| Migrasi DB | Skema lama → baru | — |
| App flow (Flutter) | UI + state + repository + DB | Backend (fake server / staging) |
| Backend API | HTTP layer + service + DB (container) | Layanan eksternal (payment, email) |

## How It Works

```text
Siapkan lingkungan terisolasi (DB in-memory/container baru per test suite)
→ seed data minimal → jalankan skenario melalui antarmuka publik (repository/endpoint/UI)
→ assert hasil & efek (baris DB, respons, layar) → bersihkan
```

## Implementation

### Flutter: repository + Drift in-memory

```dart
void main() {
  late AppDatabase db;
  late SaleRepository repo;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());               // SQLite nyata di memori
    repo = SaleRepository(db, FakeSyncApi());
  });
  tearDown(() => db.close());

  test('createSale menulis sale, items, dan outbox dalam satu transaksi', () async {
    await repo.createSale(sampleSale);
    expect(await db.select(db.sales).get(), hasLength(1));
    expect(await db.select(db.saleItems).get(), hasLength(2));
    expect((await db.select(db.outbox).get()).single.entityId, sampleSale.id);
  });
}
```

### Android: Retrofit + MockWebServer

```kotlin
@Test fun `401 memicu refresh lalu request diulang`() = runTest {
    server.enqueue(MockResponse().setResponseCode(401))
    server.enqueue(MockResponse().setBody("""{"access_token":"new","refresh_token":"r2"}"""))   // refresh
    server.enqueue(MockResponse().setBody("""{"data":[]}"""))
    api.getOrders("outlet-1")
    assertEquals("Bearer new", server.takeRequestAfter(2).getHeader("Authorization"))
}
```

*(`takeRequestAfter` adalah helper kecil yang mengambil request ke-N; sesuaikan dengan proyek Anda.)*

### Flutter: integration_test alur checkout

```dart
// integration_test/checkout_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('kasir menambah produk dan membayar tunai', (tester) async {
    await app.main(env: TestEnv(apiBaseUrl: fakeServer.url));     // backend palsu/staging terkontrol
    await tester.pumpAndSettle();

    await tester.tap(find.text('Latte'));
    await tester.tap(find.byKey(const Key('pay-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tunai'));
    await tester.tap(find.text('Konfirmasi'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Transaksi berhasil'), findsOneWidget);
  });
}
// flutter test integration_test   (emulator/perangkat)  · atau Firebase Test Lab
```

### Node.js: endpoint + database container

```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let container; let app;
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start();
  process.env.DATABASE_URL = container.getConnectionUri();
  await runMigrations();
  app = buildApp();
}, 60_000);
afterAll(() => container.stop());

it('POST /v1/orders idempoten berdasarkan Idempotency-Key', async () => {
  const body = { items: [{ productId: 'p1', qty: 1 }] };
  const a = await request(app).post('/v1/orders').set('Idempotency-Key', 'k1').set(auth()).send(body);
  const b = await request(app).post('/v1/orders').set('Idempotency-Key', 'k1').set(auth()).send(body);
  expect(a.status).toBe(201);
  expect(b.body.id).toBe(a.body.id);
  expect(await countOrders()).toBe(1);
});
```

### Contract test ringan antara mobile & backend

```text
- Simpan contoh respons JSON nyata (fixtures) di repo bersama → test parser mobile memakai fixture yang sama
- Backend memvalidasi respons terhadap skema OpenAPI di test
- Perubahan kontrak → fixture berubah → test kedua sisi memberi sinyal
```

## Best Practices

- **Gunakan komponen nyata yang murah** (SQLite in-memory, container) dan palsukan layanan eksternal.
- **Isolasi data per test** (DB baru/transaksi di-rollback).
- **Sedikit tetapi bernilai**: alur kritis & sambungan berisiko.
- **Jalankan di CI** — unit di setiap PR, integration lebih berat di main/nightly bila lambat.
- **Fixture JSON dari API nyata** untuk test parsing.

## Anti-Patterns

- Integration test yang bergantung pada server staging yang tidak stabil.
- Data test yang saling bergantung antar test.
- Mengganti semua komponen dengan mock (itu unit test, bukan integration).
- Tidak menguji migrasi database.

## Performance Considerations

Container dan emulator lambat untuk dinyalakan — berbagi satu container per suite dengan reset data per test, jalankan
paralel bila aman, dan gunakan device farm (Firebase Test Lab) untuk matriks perangkat secara terjadwal.

## Security Considerations

Jangan memakai database production atau kredensial nyata; gunakan data sintetis. Tambahkan integration test untuk
otorisasi endpoint (akses data milik user lain harus ditolak).

## Real-World Use Cases

- Memastikan sale + outbox ditulis atomik.
- Memverifikasi alur refresh token end-to-end di client.
- Menjamin endpoint order idempoten dengan database sungguhan.

## Interview Questions

1. Apa beda unit test dan integration test?
2. Bagaimana menguji repository yang memakai database?
3. Bagaimana menguji API client tanpa server sungguhan?
4. Apa itu Testcontainers?
5. Kapan integration test dijalankan di CI?

## Sample Answers

1. Unit test mengisolasi satu unit dengan double; integration test menjalankan beberapa komponen nyata bersama untuk memverifikasi sambungannya.
2. Gunakan database nyata in-memory (Drift `NativeDatabase.memory()`, Room `inMemoryDatabaseBuilder`) atau container, seed data, jalankan method repository, lalu periksa isi tabel.
3. MockWebServer/http mock adapter/msw yang mengembalikan respons nyata sehingga parsing, header, dan penanganan status diuji.
4. Library yang menjalankan dependensi nyata (PostgreSQL, Redis) dalam container Docker sementara untuk test, lalu menghapusnya.
5. Yang cepat di setiap PR; yang lambat (emulator, container banyak) di merge ke main atau terjadwal, dengan hasil yang wajib diperhatikan.

## Practical Exercises

1. Tulis integration test repository + Drift in-memory untuk alur transaksi.
2. Tulis test MockWebServer untuk respons 200, 401, dan JSON rusak.
3. Tambahkan satu integration_test Flutter untuk alur login.

## Quick Reference

```text
Unit = logika · Integration = sambungan (DB, HTTP, migrasi, plugin, alur app)
Drift/Room in-memory · MockWebServer/http_mock_adapter/msw · integration_test · Supertest + Testcontainers
Isolasi data · fixture JSON nyata · layanan eksternal dipalsukan · CI: cepat di PR, berat di main/nightly
```

## Related Topics

- [Unit Testing](/testing-performance/unit-testing/)
- [End-to-End Testing](/testing-performance/e2e-testing/)
- [Room Database](/android/room-database/)
