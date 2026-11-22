---
title: "API Documentation (OpenAPI)"
description: "Mendokumentasikan API dengan OpenAPI 3.1: struktur dokumen, komponen & skema yang dapat dipakai ulang, contoh, keamanan, error bersama, code-first (zod-to-openapi, Fastify swagger) vs design-first, menyajikan dokumentasi (Swagger UI, Redoc), validasi & lint di CI, mock server, serta menghasilkan klien Dart/Kotlin/TypeScript."
level: beginner
status: complete
version: "OpenAPI 3.1 · @fastify/swagger · zod-to-openapi · Redocly CLI · openapi-generator"
updated: 2026-11-13
tags: [backend, openapi, swagger, documentation, codegen]
---

## Overview

**OpenAPI** adalah standar untuk mendeskripsikan API HTTP dalam YAML/JSON: endpoint, parameter, skema request/response,
error, dan keamanan. Satu dokumen OpenAPI dapat menjadi dokumentasi interaktif, kontrak antara tim mobile dan backend,
sumber mock server, dasar validasi, dan generator klien.

## Why It Matters

Tanpa dokumentasi yang akurat, developer mobile menebak bentuk respons dari kode backend atau dari mencoba-coba. Dokumen
OpenAPI yang selalu sinkron mempercepat integrasi, memungkinkan aplikasi dibangun paralel dengan mock, dan menjadi
konteks yang sangat berguna bagi AI coding agent.

## Core Concepts

| Bagian | Isi |
| --- | --- |
| `info` | Judul, versi API, deskripsi |
| `servers` | URL per environment |
| `paths` | Endpoint & operasi (GET/POST/...) |
| `components.schemas` | Model data yang dipakai ulang |
| `components.responses` | Respons bersama (mis. Problem) |
| `components.securitySchemes` | Bearer JWT, API key |
| `examples` | Contoh nyata request/response |

| Pendekatan | Cara | Cocok untuk |
| --- | --- | --- |
| Design-first | Tulis OpenAPI dulu, implementasi mengikuti | Kontrak lintas tim, API publik |
| Code-first | Dokumen dihasilkan dari kode/skema validasi | Tim kecil, mengurangi duplikasi |

Keduanya sah. Yang penting: dokumen **tidak boleh menyimpang** dari perilaku nyata, dan ini dijamin oleh validasi
otomatis.

## How It Works

```text
Code-first: skema zod/JSON Schema di route → plugin menghasilkan openapi.json → disajikan di /docs → diekspor ke repo
Design-first: openapi.yaml di repo → lint → mock server untuk mobile → implementasi → test kontrak memvalidasi respons
CI: lint dokumen + deteksi breaking change + test kontrak
```

## Implementation

### Potongan dokumen

```yaml
openapi: 3.1.0
info: { title: POS API, version: 1.8.0 }
servers:
  - { url: https://api.example.com, description: production }
  - { url: https://staging-api.example.com, description: staging }
security: [{ bearerAuth: [] }]
paths:
  /v1/orders/{id}:
    get:
      operationId: getOrder
      tags: [Orders]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200':
          description: Order
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Order' }
              examples:
                paid: { $ref: '#/components/examples/PaidOrder' }
        '404': { $ref: '#/components/responses/Problem' }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
  schemas:
    Order:
      type: object
      required: [id, status, total, createdAt]
      properties:
        id: { type: string, format: uuid }
        status: { type: string, enum: [pending, paid, voided] }
        total: { $ref: '#/components/schemas/Money' }
        createdAt: { type: string, format: date-time }
    Problem:
      type: object
      required: [type, title, status, code]
      properties:
        type: { type: string }
        title: { type: string }
        status: { type: integer }
        code: { type: string, example: OUT_OF_STOCK }
        requestId: { type: string }
  responses:
    Problem:
      description: Error (RFC 9457)
      content: { application/problem+json: { schema: { $ref: '#/components/schemas/Problem' } } }
```

### Code-first dengan Fastify

```ts
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

await app.register(swagger, {
  openapi: { info: { title: 'POS API', version: env.APP_VERSION },
             components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } },
});
if (env.NODE_ENV !== 'production') await app.register(swaggerUi, { routePrefix: '/docs' });

app.get('/v1/orders/:id', {
  schema: {
    tags: ['Orders'], operationId: 'getOrder',
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    response: { 200: OrderJsonSchema, 404: ProblemJsonSchema },
  },
}, getOrderHandler);

// Ekspor ke repo di CI: await app.ready(); writeFileSync('docs/api/openapi.json', JSON.stringify(app.swagger()))
```

Bila memakai zod, library seperti `zod-to-openapi` atau `fastify-type-provider-zod` dapat menghasilkan skema OpenAPI
dari definisi zod yang sama dengan validasi.

### Lint, breaking change, dan mock

```bash
npx @redocly/cli lint docs/api/openapi.yaml                # aturan gaya & kelengkapan
oasdiff breaking main.yaml docs/api/openapi.yaml --fail-on ERR
npx @stoplight/prism-cli mock docs/api/openapi.yaml        # mock server dari contoh untuk tim mobile
```

### Test kontrak: respons sesuai dokumen

```ts
import { matchers } from 'jest-openapi'; // atau validasi manual dengan Ajv terhadap skema operasi
it('GET /v1/orders/:id sesuai OpenAPI', async () => {
  const res = await request(app.server).get(`/v1/orders/${orderId}`).set(auth());
  expect(res.status).toBe(200);
  expect(res).toSatisfyApiSpec();
});
```

### Generate klien

```bash
# Dart (Dio) untuk Flutter
openapi-generator-cli generate -i docs/api/openapi.yaml -g dart-dio -o packages/pos_api_client
# Kotlin (Retrofit) dan TypeScript juga tersedia: -g kotlin (library jvm-retrofit2), -g typescript-fetch
```

Klien hasil generate menghemat waktu tetapi kadang kaku. Banyak tim memakai hasil generate untuk model, lalu membungkusnya
di repository sendiri agar lapisan domain tidak bergantung langsung pada kode hasil generate.

### Menyajikan dokumentasi

```text
- Internal: Swagger UI/Redoc di staging atau portal internal (dilindungi login)
- Produksi: matikan /docs publik untuk API privat
- Tambahkan deskripsi: alur autentikasi, pagination, idempotensi, kode error, rate limit, contoh
```

## Best Practices

- **Satu dokumen OpenAPI di repo** sebagai sumber kebenaran, ikut direview di PR.
- **Skema & respons bersama** (`Money`, `Problem`, `Page`) di `components`.
- **Contoh nyata** untuk setiap operasi penting.
- **`operationId` stabil** (dipakai generator klien).
- **Lint, breaking change check, dan test kontrak di CI**.
- **Mock server** agar mobile dapat mulai sebelum backend selesai.

## Anti-Patterns

- Dokumentasi di wiki terpisah yang tidak pernah diperbarui.
- Skema `type: object` tanpa properti (tidak informatif).
- Swagger UI publik untuk API internal di produksi.
- Mengubah respons tanpa memperbarui dokumen.
- Menyalin skema yang sama di banyak tempat.

## Performance Considerations

Validasi skema respons di runtime menambah overhead, jadi lakukan di test, bukan di setiap request produksi. Fastify
dapat memakai skema respons untuk serialisasi yang lebih cepat dan sekaligus mencegah field yang tidak didokumentasikan
ikut terkirim.

## Security Considerations

Dokumentasikan skema keamanan per operasi dan batas input (`maxLength`, `maximum`). Untuk API privat, batasi akses ke
dokumentasi. Dokumen tidak boleh berisi secret atau contoh data pribadi asli.

## Real-World Use Cases

- Tim Flutter membangun layar order dengan Prism mock sementara backend masih dikerjakan.
- CI menolak PR yang menghapus field `status` dari skema `Order`.
- AI agent menambah endpoint baru dan memperbarui `openapi.yaml` karena aturan AGENTS.md mewajibkannya.

## Interview Questions

1. Apa itu OpenAPI dan apa manfaatnya?
2. Apa beda design-first dan code-first?
3. Bagaimana memastikan dokumentasi API tetap akurat?

## Sample Answers

1. Standar untuk mendeskripsikan API HTTP (endpoint, skema, error, keamanan) yang dapat dipakai untuk dokumentasi interaktif, kontrak antar tim, mock server, validasi, dan generate klien.
2. Design-first menulis kontrak lebih dulu lalu implementasi mengikutinya, cocok untuk kolaborasi lintas tim. Code-first menghasilkan dokumen dari kode/skema validasi sehingga mengurangi duplikasi, cocok untuk tim kecil.
3. Simpan dokumen di repo dan wajibkan pembaruan dalam PR yang sama, hasilkan dari skema validasi bila code-first, jalankan test kontrak yang memvalidasi respons, serta lint dan deteksi breaking change di CI.

## Practical Exercises

1. Tambahkan @fastify/swagger dan ekspor openapi.json ke repo melalui CI.
2. Tulis skema `Problem` dan `Page` bersama lalu pakai di semua endpoint.
3. Jalankan Prism mock dan sambungkan aplikasi Flutter ke mock tersebut.

## Quick Reference

```text
OpenAPI 3.1: info · servers · paths · components (schemas, responses, securitySchemes, examples)
Design-first vs code-first (@fastify/swagger, zod-to-openapi) · operationId stabil
CI: redocly lint · oasdiff breaking · test kontrak (respons cocok skema)
Prism mock · openapi-generator (dart-dio, kotlin, typescript) · /docs tidak publik untuk API privat
```

## Related Topics

- [API Design Conventions](/ai-engineering/guides/api-conventions/)
- [API Versioning](/backend/api-versioning/)
- [Integration Testing](/testing-performance/integration-testing/)
