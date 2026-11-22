---
title: "Unit, Integration & API Testing"
description: "Strategi testing backend Node.js/TypeScript: unit test service dengan fake, integration test repository dengan PostgreSQL nyata (Testcontainers), API test dengan Fastify inject/Supertest, test otorisasi & tenant isolation, test kontrak OpenAPI, factory data, isolasi antar test, mocking layanan eksternal (msw/nock), dan susunan di CI."
level: intermediate
status: complete
version: "Vitest 2.x/3.x · Testcontainers · Supertest · Fastify inject · msw"
updated: 2026-11-13
tags: [backend, testing, vitest, testcontainers, api-testing, nodejs]
---

## Overview

Testing backend membuktikan bahwa aturan bisnis benar, query bekerja di database sungguhan, dan endpoint berperilaku
sesuai kontrak, termasuk menolak akses yang tidak sah. Halaman ini menerapkan prinsip umum dari domain
[Testing & Performance](/testing-performance/testing-fundamentals/) khusus untuk API Node.js.

## Why It Matters

API adalah penegak aturan untuk aplikasi mobile. Bug di sini berdampak ke semua klien sekaligus: harga salah, data tenant
bocor, pembayaran ganda. Test otomatis yang baik membuat perubahan backend aman dan cepat dirilis.

## Core Concepts

| Lapisan | Yang dites | Alat | Kecepatan |
| --- | --- | --- | --- |
| Unit | Service/domain dengan fake repository | Vitest | ms |
| Integration (repository) | Query & transaksi di PostgreSQL nyata | Vitest + Testcontainers | detik |
| API | Route + middleware + validasi + error + DB | Fastify `inject` / Supertest | detik |
| Kontrak | Respons sesuai OpenAPI | jest-openapi/Ajv | detik |
| E2E/smoke | Sistem ter-deploy di staging | k6/Postman/skrip | menit |

| Konsep | Penjelasan |
| --- | --- |
| Factory | Fungsi pembuat data test dengan default masuk akal (`makeOrder({ status: 'paid' })`) |
| Isolasi | Setiap test tidak bergantung pada data test lain |
| Fake vs mock | Fake: implementasi ringan. Mock: verifikasi interaksi |
| Test negatif | Input salah, tanpa token, peran salah, tenant lain |

## How It Works

```text
Unit (banyak) → integration repository (secukupnya) → API test per endpoint (sukses + negatif) → kontrak
Satu container PostgreSQL per suite, migrasi sekali, data dibersihkan per test (TRUNCATE atau transaksi)
Layanan eksternal (payment, SMS, push) dipalsukan dengan msw/nock atau fake adapter
```

## Implementation

### Unit test service dengan fake

```ts
describe('OrderService.create', () => {
  it('menghitung total dari harga server, bukan dari input klien', async () => {
    const products = new FakeProductRepo([{ id: 'p1', price: 18_000, stock: 10 }]);
    const orders = new FakeOrderRepo();
    const svc = new OrderService(products, orders, { now: () => new Date('2026-11-13T05:00:00Z') });

    const order = await svc.create(cashier, { items: [{ productId: 'p1', qty: 2, price: 1 }] });   // price klien diabaikan

    expect(order.total).toBe(36_000);
  });

  it('menolak bila stok tidak cukup', async () => {
    const svc = new OrderService(new FakeProductRepo([{ id: 'p1', price: 18_000, stock: 1 }]), new FakeOrderRepo(), clock);
    await expect(svc.create(cashier, { items: [{ productId: 'p1', qty: 2 }] })).rejects.toBeInstanceOf(OutOfStockError);
  });
});
```

### Setup PostgreSQL nyata sekali per suite

```ts
// test/setup/db.ts (globalSetup Vitest)
import { PostgreSqlContainer } from '@testcontainers/postgresql';

export default async function setup() {
  const pg = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = pg.getConnectionUri();
  await runMigrations(process.env.DATABASE_URL);
  return async () => { await pg.stop(); };
}
```

```ts
// test/helpers/db.ts — bersihkan data antar test
export async function resetDb() {
  await db.query(`TRUNCATE orders, order_items, products, outlet_members, outlets RESTART IDENTITY CASCADE`);
}
```

Jalankan file test integration secara serial (atau satu database/schema per worker) agar TRUNCATE tidak saling mengganggu.

### API test dengan Fastify inject

```ts
describe('POST /v1/orders', () => {
  beforeEach(resetDb);

  it('201 untuk kasir di outletnya sendiri', async () => {
    const { outlet, cashier } = await seedOutletWithCashier();
    const product = await makeProduct({ outletId: outlet.id, price: 18_000, stock: 5 });
    const res = await app.inject({
      method: 'POST', url: '/v1/orders',
      headers: { authorization: `Bearer ${await tokenFor(cashier)}`, 'idempotency-key': 'k1' },
      payload: { outletId: outlet.id, items: [{ productId: product.id, qty: 1 }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().total).toEqual({ amount: 18_000, currency: 'IDR' });
  });

  it('401 tanpa token', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/orders', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('404 untuk outlet milik tenant lain (tidak membocorkan keberadaan)', async () => {
    const { cashier } = await seedOutletWithCashier();
    const other = await seedOutletWithCashier();                        // tenant berbeda
    const res = await app.inject({
      method: 'POST', url: '/v1/orders',
      headers: { authorization: `Bearer ${await tokenFor(cashier)}` },
      payload: { outletId: other.outlet.id, items: [{ productId: randomUUID(), qty: 1 }] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('422 dengan detail field untuk qty 0', async () => {
    const { outlet, cashier } = await seedOutletWithCashier();
    const res = await app.inject({
      method: 'POST', url: '/v1/orders', headers: { authorization: `Bearer ${await tokenFor(cashier)}` },
      payload: { outletId: outlet.id, items: [{ productId: randomUUID(), qty: 0 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().errors[0].field).toBe('items.0.qty');
  });
});
```

`app.inject` menjalankan request tanpa membuka port jaringan sehingga cepat. Supertest dapat dipakai untuk Express.

### Test idempotensi & konkurensi

```ts
it('request bersamaan dengan Idempotency-Key sama hanya membuat satu order', async () => {
  const send = () => app.inject({ method: 'POST', url: '/v1/orders', headers: { ...auth, 'idempotency-key': 'same' }, payload });
  const [a, b] = await Promise.all([send(), send()]);
  expect(new Set([a.json().id, b.json().id]).size).toBe(1);
  expect(await countOrders()).toBe(1);
});
```

### Memalsukan layanan eksternal

```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.post('https://api.payment.example/charges', () => HttpResponse.json({ id: 'ch_1', status: 'succeeded' })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));   // request ke luar yang tidak dipalsukan → gagal
afterAll(() => server.close());

it('503 bila payment gateway down', async () => {
  server.use(http.post('https://api.payment.example/charges', () => new HttpResponse(null, { status: 503 })));
  // ... harapkan respons PAYMENT_UNAVAILABLE dan order tetap pending
});
```

### Susunan di CI

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint && npm run typecheck
      - run: npm run test:unit
      - run: npm run test:integration          # Docker tersedia di runner ubuntu untuk Testcontainers
      - run: npm run test:contract
```

## Best Practices

- **Logika bisnis diuji di unit test** dengan fake dan clock yang disuntik.
- **Query diuji di PostgreSQL nyata**, bukan SQLite pengganti.
- **Setiap endpoint**: sukses, validasi (422), 401, 403, tenant lain (404), idempoten bila relevan.
- **Factory data** dan reset DB per test.
- **`onUnhandledRequest: 'error'`** agar tidak ada panggilan jaringan nyata.
- **Test kontrak** terhadap OpenAPI.

## Anti-Patterns

- Mock ORM/DB untuk menguji query.
- Test yang bergantung pada urutan atau data test lain.
- Hanya jalur sukses yang dites.
- Memanggil sandbox pihak ketiga sungguhan di setiap test.
- Snapshot seluruh respons JSON yang selalu "di-update" saat berubah.

## Performance Considerations

Mulai container sekali per suite, jalankan migrasi sekali, dan bersihkan data dengan TRUNCATE (cepat). Paralelkan unit
test, sedangkan integration test dibatasi atau diberi database per worker. Target: unit dalam detik, seluruh suite dalam
beberapa menit.

## Security Considerations

Test otorisasi adalah test keamanan paling bernilai: buat helper yang menguji semua endpoint terhadap token tidak ada,
peran salah, dan tenant lain. Gunakan secret test (JWT key khusus test), bukan secret produksi.

## Real-World Use Cases

- Test tenant isolation otomatis menemukan endpoint ekspor yang lupa memfilter `tenant_id`.
- Test konkurensi idempotency key mencegah order ganda saat aplikasi me-retry.

## Interview Questions

1. Bagaimana Anda menguji API backend?
2. Mengapa memakai database nyata untuk integration test?
3. Bagaimana menguji integrasi dengan layanan pihak ketiga?
4. Test negatif apa yang wajib untuk endpoint?

## Sample Answers

1. Unit test untuk logika bisnis dengan fake, integration test repository di PostgreSQL nyata (Testcontainers), API test per endpoint dengan inject/Supertest termasuk kasus negatif, test kontrak terhadap OpenAPI, dan smoke test di staging.
2. Perilaku query, constraint, transaksi, dan dialek SQL hanya dapat dipastikan di engine yang sama dengan produksi. Mock atau database pengganti menyembunyikan bug nyata.
3. Palsukan di batas HTTP dengan msw/nock atau fake adapter untuk skenario sukses, gagal, dan timeout. Tambahkan test kontrak/sandbox terjadwal secara terpisah untuk memastikan integrasi nyata masih sesuai.
4. Input tidak valid (422 dengan detail field), tanpa token (401), peran tidak cukup (403), objek milik tenant lain (404), retry dengan idempotency key, dan batas (limit maksimum, ukuran body).

## Practical Exercises

1. Siapkan Testcontainers + migrasi + reset DB untuk proyek Anda.
2. Tulis helper yang menguji 401/403/404-tenant-lain untuk semua endpoint.
3. Palsukan payment gateway dengan msw dan uji skenario timeout.

## Quick Reference

```text
Unit (fake + clock) → integration (Testcontainers PostgreSQL) → API (inject/Supertest) → kontrak (OpenAPI)
Per endpoint: 2xx · 422 · 401 · 403 · tenant lain 404 · idempotensi · batas
Factory + TRUNCATE per test · container sekali per suite · integration serial/DB per worker
msw onUnhandledRequest: 'error' · CI: lint → typecheck → unit → integration → contract
```

## Related Topics

- [Integration Testing](/testing-performance/integration-testing/)
- [Unit Testing](/testing-performance/unit-testing/)
- [API Documentation (OpenAPI)](/backend/api-documentation/)
