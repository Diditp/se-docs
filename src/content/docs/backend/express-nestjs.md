---
title: "Express.js vs NestJS"
description: "Memilih framework backend Node.js: Express (minimalis), Fastify (cepat, schema-first), dan NestJS (opinionated, modular, dependency injection). Perbandingan struktur, validasi, DI, testing, performa, kurva belajar, contoh endpoint yang sama di ketiganya, dan rekomendasi berdasarkan ukuran tim serta jenis proyek."
level: intermediate
status: complete
version: "Express 5 · Fastify 5 · NestJS 11. Cek rilis terbaru"
updated: 2026-11-13
tags: [backend, express, nestjs, fastify, framework, nodejs]
---

## Overview

Ada tiga pilihan framework Node.js yang paling sering ditemui:

- **Express**: minimalis, sangat populer, ekosistem middleware besar. Struktur diserahkan ke tim.
- **Fastify**: cepat, berbasis plugin & skema (JSON Schema), logging pino bawaan, dukungan TypeScript baik.
- **NestJS**: framework *opinionated* dengan modul, controller, provider, dan dependency injection (mirip Angular/Spring). Berjalan di atas Express atau Fastify.

## Why It Matters

Pilihan framework memengaruhi struktur kode, kecepatan onboarding, dan kemudahan menjaga konsistensi (termasuk bagi AI
agent). Pertanyaan "Express atau NestJS?" juga umum di interview untuk posisi yang menyentuh backend.

## Core Concepts

| Aspek | Express | Fastify | NestJS |
| --- | --- | --- | --- |
| Filosofi | Minimal, bebas | Minimal + performa + skema | Struktur lengkap, konvensi kuat |
| Struktur | Ditentukan tim | Plugin & encapsulation | Module / Controller / Provider |
| DI | Manual | Manual/decorate | Bawaan (decorator) |
| Validasi | Library pilihan (zod) | JSON Schema bawaan / zod | Pipes + class-validator/zod |
| Logging | Pilihan (pino-http) | pino bawaan | Logger bawaan / pino |
| Performa | Baik | Sangat baik | Mengikuti adapter (Express/Fastify) + overhead kecil |
| Kurva belajar | Rendah | Rendah–sedang | Sedang–tinggi (decorator, DI, konsep framework) |
| Cocok untuk | API kecil, prototipe, tim yang sudah punya konvensi | API performa tinggi, tim yang suka eksplisit | Tim besar, domain kompleks, banyak modul |

## How It Works

```text
Express: app.use(middleware) → router → handler(req, res)
Fastify: register(plugin) → hooks → schema validation → handler(req, reply) → serialization
NestJS: Module mengimpor Controller & Provider → Guard (authZ) → Pipe (validasi) → Controller → Service (DI) → Interceptor/Filter
```

## Implementation

### Endpoint yang sama di tiga framework

```ts
// Express
const router = express.Router();
router.post('/orders', authenticate, async (req, res) => {
  const input = CreateOrder.parse(req.body);
  const order = await orderService.create(req.user, input);
  res.status(201).json(order);
});
app.use('/v1', router);
```

```ts
// Fastify
app.post('/v1/orders', { preHandler: [app.authenticate] }, async (req, reply) => {
  const input = CreateOrder.parse(req.body);
  const order = await orderService.create(req.user, input);
  return reply.code(201).send(order);
});
```

```ts
// NestJS
@Controller('v1/orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}           // DI

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateOrder)) body: CreateOrderDto) {
    return this.orders.create(user, body);
  }
}

@Module({ controllers: [OrdersController], providers: [OrdersService, OrdersRepository] })
export class OrdersModule {}
```

Perhatikan bahwa **logika bisnis (`orderService.create`) sama di ketiganya**. Framework hanya lapisan HTTP. Menjaga
service bebas framework membuat migrasi dan testing jauh lebih mudah.

### Struktur NestJS tipikal

```text
src/
  main.ts
  app.module.ts
  orders/
    orders.module.ts
    orders.controller.ts
    orders.service.ts
    orders.repository.ts
    dto/
  common/ guards/ pipes/ filters/ interceptors/
```

### Pemetaan konsep ke Flutter

| NestJS | Padanan di Flutter (konsep) |
| --- | --- |
| Module | Feature module + registrasi DI |
| Provider/Service + DI | Repository/use case yang di-inject (get_it, Riverpod) |
| Guard | Route guard/redirect auth (go_router) |
| Pipe (validasi) | Validasi form/DTO |
| Interceptor | Dio interceptor |

### Rekomendasi

```text
- Backend ringan untuk aplikasi mobile, tim 1–3 orang: Fastify (atau Express bila tim sudah familiar) + struktur modul sendiri
- Tim besar, banyak modul, butuh konvensi seragam: NestJS
- Serverless/Cloud Functions: handler tipis tanpa framework berat, service murni TypeScript
- Apa pun pilihannya: validasi skema, error handler terpusat, logging terstruktur, test, OpenAPI
```

## Best Practices

- **Pisahkan service dari framework** (tanpa `req`/`res` di service).
- **Satu konvensi struktur** yang ditulis di AGENTS.md.
- **Validasi, error, dan logging terpusat** apa pun frameworknya.
- **Pilih berdasarkan tim & domain**, bukan popularitas.
- **Express 5 / versi terbaru** untuk penanganan async error yang lebih baik.

## Anti-Patterns

- Logika bisnis di controller/route handler.
- NestJS untuk API 5 endpoint yang dikerjakan satu orang (overhead konsep).
- Express tanpa struktur di proyek besar (setiap file berbeda gaya).
- Mencampur beberapa framework dalam satu layanan.
- Memilih framework hanya berdasarkan benchmark mikro.

## Performance Considerations

Perbedaan performa framework jarang menjadi bottleneck dibanding database dan I/O. Fastify unggul di throughput dan
serialisasi berbasis skema. NestJS dapat memakai adapter Fastify bila performa penting. Ukur dengan beban realistis.

## Security Considerations

Ketiganya membutuhkan konfigurasi keamanan yang sama: helmet, CORS allowlist, body limit, rate limit, trust proxy,
autentikasi & otorisasi, dan error yang aman. NestJS menyediakan tempat yang jelas (guards) untuk otorisasi, tetapi
otorisasi objek tetap di service.

## Real-World Use Cases

- Startup POS: Fastify + modul sendiri, 3 developer.
- Perusahaan dengan 20 backend developer: NestJS untuk konsistensi antar tim.

## Interview Questions

1. Apa beda Express dan NestJS?
2. Kapan Anda memilih NestJS?
3. Bagaimana menjaga logika bisnis agar tidak terikat framework?

## Sample Answers

1. Express adalah framework minimal yang menyerahkan struktur ke tim. NestJS adalah framework opinionated dengan modul, controller, provider, dependency injection, guards, dan pipes yang menyeragamkan struktur, berjalan di atas Express atau Fastify.
2. Untuk tim besar atau domain kompleks dengan banyak modul, di mana konvensi seragam, DI, dan struktur bawaan mengurangi variasi gaya dan mempercepat onboarding.
3. Menempatkan aturan bisnis di service/use case yang menerima data bertipe (bukan `req`/`res`), memakai repository interface, dan membuat controller/route hanya sebagai lapisan tipis untuk validasi dan mapping HTTP.

## Practical Exercises

1. Implementasikan endpoint yang sama di Fastify dan NestJS dengan service bersama.
2. Bandingkan jumlah file, waktu setup, dan kemudahan test.
3. Tulis bagian "Architecture" di AGENTS.md backend berdasarkan pilihan Anda.

## Quick Reference

```text
Express: minimal, bebas, middleware · Fastify: cepat, plugin + skema, pino · NestJS: module/controller/provider + DI
Service bebas framework · validasi + error handler + log terpusat · OpenAPI
Kecil/ringan → Fastify/Express · tim besar/kompleks → NestJS · serverless → handler tipis
```

## Related Topics

- [Middleware](/backend/middleware/)
- [Backend Architecture](/backend/backend-architecture/)
- [JavaScript & TypeScript Fundamentals](/backend/js-ts-fundamentals/)
