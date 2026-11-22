---
title: "API Design Conventions"
description: "Konvensi desain API yang dituliskan agar konsisten dipatuhi tim dan AI coding agent: kontrak OpenAPI sebagai sumber kebenaran, penamaan resource & URL, metode & status HTTP, format JSON (camelCase, waktu UTC ISO 8601, uang integer), error Problem Details, pagination cursor, idempotensi, versi & deprecation, serta alur contract-first antara mobile dan backend."
level: intermediate
status: complete
updated: 2026-11-13
tags: [ai, agents, api, openapi, conventions, rest]
---

## Overview

**API conventions** adalah aturan seragam untuk semua endpoint: bentuk URL, format data, error, pagination, versi.
Ketika konvensi tertulis dan kontrak API didokumentasikan (OpenAPI), agent dapat membuat endpoint baru di backend
**dan** kode klien di Flutter yang cocok satu sama lain tanpa menebak.

## Why It Matters

Inkonsistensi API (sebagian `snake_case`, sebagian `camelCase`, tanggal dalam berbagai format, error berbeda per
endpoint) memaksa aplikasi mobile menulis kode khusus untuk setiap endpoint dan menjadi sumber bug yang sulit ditemukan.
Konvensi juga menjaga kompatibilitas aplikasi versi lama yang masih terpasang di perangkat pengguna.

## Core Concepts

| Area | Konvensi (contoh yang direkomendasikan) |
| --- | --- |
| Kontrak | `docs/api/openapi.yaml` adalah sumber kebenaran |
| URL | `/v1/<resource-jamak>/{id}/<sub-resource>`, kebab-case, kata benda |
| Field JSON | `camelCase`, konsisten di semua endpoint |
| Waktu | UTC ISO 8601 (`2026-11-13T05:12:04Z`) |
| Uang | Integer minor unit + kode mata uang (`{ "amount": 54000, "currency": "IDR" }`) |
| ID | UUID (string) |
| Error | RFC 9457 Problem Details + `code` stabil + `requestId` |
| List | Cursor pagination: `{ data, page: { nextCursor, hasMore } }` |
| Tulis yang bisa diulang | Header `Idempotency-Key` |
| Versi | Prefix `/v1`. Perubahan breaking → versi baru + periode deprecation |

### Metode & status

| Operasi | Metode | Sukses |
| --- | --- | --- |
| Ambil list/detail | GET | 200 |
| Buat | POST | 201 + body resource |
| Ganti penuh / ubah sebagian | PUT / PATCH | 200 |
| Hapus | DELETE | 204 |
| Aksi domain | POST `/orders/{id}/void` | 200/202 |
| Proses panjang | POST → 202 + `Location` status | 202 |

## How It Works

```text
Contract-first:
1. Ubah openapi.yaml (endpoint, skema, error) → review bersama mobile & backend
2. Generate/validasi: tipe TS server, model Dart klien (atau tulis dengan acuan skema)
3. Implementasi backend + test kontrak (respons divalidasi terhadap skema)
4. Implementasi klien dengan fixture JSON dari contoh skema
5. CI memeriksa breaking change pada openapi.yaml
```

## Implementation

### Potongan OpenAPI

```yaml
paths:
  /v1/outlets/{outletId}/orders:
    get:
      operationId: listOrders
      parameters:
        - { name: outletId, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
        - { name: cursor, in: query, schema: { type: string } }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/OrderPage' }
        '403': { $ref: '#/components/responses/Problem' }
components:
  schemas:
    Money:
      type: object
      required: [amount, currency]
      properties:
        amount: { type: integer, description: 'Minor unit (rupiah)' }
        currency: { type: string, example: IDR }
```

### Aturan untuk agent (contoh di AGENTS.md)

```markdown
## API Conventions
- Update `docs/api/openapi.yaml` in the same change as any endpoint change; responses must validate against it in tests.
- JSON fields camelCase; timestamps UTC ISO 8601 strings; money as integer minor units with currency.
- Errors use Problem Details with a stable `code` (UPPER_SNAKE) and `requestId`.
- Lists use cursor pagination with a server max `limit` of 100.
- **MUST NOT** remove or rename response fields or change their type in `/v1`; add new optional fields instead.
  *Why:* installed mobile versions cannot be updated instantly.
```

### Deprecation & kompatibilitas mobile

```text
- Tambah field: aman (klien mengabaikan field tak dikenal → pastikan parser klien toleran)
- Hapus/ganti tipe field, ubah makna, wajibkan field input baru: breaking → /v2 atau field baru
- Tandai deprecated di OpenAPI + header Deprecation/Sunset, pantau versi aplikasi yang masih memanggil
- Hapus setelah min_supported_version melewati versi pengguna lama (force update)
```

### Deteksi breaking change di CI

```bash
npx @redocly/cli lint docs/api/openapi.yaml
# Bandingkan dengan main memakai tool diff OpenAPI (mis. oasdiff) dan gagalkan PR bila ada breaking change di /v1
oasdiff breaking origin-main.yaml docs/api/openapi.yaml --fail-on ERR
```

## Best Practices

- **Contract-first** dengan OpenAPI di repo.
- **Satu konvensi format** untuk nama field, waktu, uang, ID, error, dan pagination.
- **Parser klien toleran** terhadap field baru.
- **Breaking change terdeteksi otomatis** di CI.
- **Contoh request/response** di kontrak sebagai fixture test kedua sisi.

## Anti-Patterns

- Endpoint berbentuk kata kerja untuk CRUD (`/getOrders`, `/createOrder`).
- Waktu lokal tanpa zona atau epoch campur ISO.
- Uang sebagai float/string berformat (`"Rp54.000"`).
- `200` dengan `{ success: false }`.
- Mengubah respons `/v1` yang dipakai aplikasi lama.

## Performance Considerations

Konvensi juga memengaruhi performa mobile: pagination wajib, field secukupnya (DTO list vs detail), kompresi, dan
endpoint agregasi (BFF) untuk layar yang butuh banyak data agar round-trip seluler berkurang.

## Security Considerations

Konvensi keamanan masuk kontrak: skema input dengan batas (`maxLength`, `maximum`), `additionalProperties: false` untuk
input, skema keamanan per endpoint (bearer), dan respons yang tidak mengekspos field internal.

## Real-World Use Cases

- Agent menambah endpoint `GET /v1/customers` dan model Dart yang cocok karena kontrak & konvensi tertulis.
- CI menolak PR yang mengganti tipe `total` dari integer ke string di `/v1`.

## Interview Questions

1. Apa itu contract-first API development?
2. Bagaimana mengubah API tanpa merusak aplikasi mobile versi lama?
3. Bagaimana sebaiknya merepresentasikan uang dan waktu di API?

## Sample Answers

1. Kontrak API (OpenAPI) dirancang dan disepakati lebih dulu, lalu backend dan klien diimplementasikan berdasarkan kontrak tersebut, dengan validasi otomatis agar keduanya tetap sesuai.
2. Hanya menambah field opsional di versi yang sama, menjaga tipe dan makna field lama, membuat versi atau field baru untuk perubahan breaking, menandai deprecation, memantau versi aplikasi, dan menghapus setelah versi lama tidak didukung.
3. Uang sebagai integer minor unit dengan kode mata uang untuk menghindari kesalahan pembulatan. Waktu sebagai string UTC ISO 8601 dan dikonversi ke zona lokal hanya untuk tampilan.

## Practical Exercises

1. Tulis OpenAPI untuk 3 endpoint utama proyek Anda dengan skema error bersama.
2. Tambahkan lint + deteksi breaking change OpenAPI di CI.
3. Tulis bagian "API Conventions" di AGENTS.md proyek Anda.

## Quick Reference

```text
OpenAPI di repo = sumber kebenaran · contract-first · fixture bersama
/v1/<resource-jamak>/{id} · camelCase · UTC ISO 8601 · money {amount:int, currency}
Problem Details + code + requestId · cursor pagination (max limit) · Idempotency-Key
Tambah field = aman · hapus/ganti tipe = breaking → v2 · Deprecation/Sunset · oasdiff di CI
```

## Related Topics

- [RESTful API Design](/backend/restful-api-design/)
- [API Documentation (OpenAPI)](/backend/api-documentation/)
- [API Versioning](/backend/api-versioning/)
