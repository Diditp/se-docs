---
title: "JavaScript & TypeScript Fundamentals"
description: "Dasar JavaScript dan TypeScript untuk mobile developer yang menulis backend Node.js: perbandingan dengan Dart, tipe & inferensi, union & narrowing, generics, null/undefined, async/await & Promise, module ESM, konfigurasi strict, tipe dari skema (zod), pitfalls umum (this, ==, mutasi, floating promise), dan struktur proyek TypeScript minimal."
level: beginner
status: complete
version: "TypeScript 5.x · Node.js 22 LTS (ESM)"
updated: 2026-11-13
tags: [backend, javascript, typescript, nodejs, dart]
---

## Overview

**JavaScript** adalah bahasa runtime Node.js. **TypeScript** menambahkan sistem tipe statis yang dihapus saat kompilasi,
sehingga kode lebih aman dan mudah dirawat. Bagi Flutter developer, banyak konsep terasa familiar (async/await, null
safety, generics), tetapi ada perbedaan penting: tipe TypeScript **tidak ada saat runtime**, dan JavaScript memiliki
`undefined` di samping `null`.

## Why It Matters

Backend ringan, Cloud Functions, BFF, skrip tooling, dan dashboard web banyak memakai TypeScript. Kemampuan membaca dan
menulis TypeScript yang benar memperluas peran Anda dari mobile developer menjadi mobile software engineer yang dapat
menyentuh sisi server.

## Core Concepts

### Dart vs TypeScript

| Konsep | Dart | TypeScript |
| --- | --- | --- |
| Null safety | `String?`, sound | `string \| null \| undefined`, aktif dengan `strict` |
| Tipe saat runtime | Ada (reified generics) | **Tidak ada**: validasi runtime butuh skema (zod) |
| Class data | `class` + `freezed` | `type`/`interface` (struktural) |
| Union | sealed class | Union type + discriminant (`type: 'ok' \| 'err'`) |
| Async | `Future<T>`, `async/await` | `Promise<T>`, `async/await` |
| Stream | `Stream<T>` | AsyncIterable, Node streams, RxJS |
| Konkurensi | Isolate | Event loop + worker_threads |
| Equality | `==` (operator dapat di-override) | `===` (gunakan selalu), objek dibandingkan referensi |
| Modul | `import 'package:...'` | ESM `import { x } from './x.js'` |

### Sistem tipe struktural

```ts
interface Point { x: number; y: number }
const p = { x: 1, y: 2, label: 'A' };
const q: Point = p;            // ✅ cocok secara struktur (bukan berdasarkan nama tipe)
```

## How It Works

```text
.ts → tsc (cek tipe) / tsx atau esbuild (transpile cepat) → .js → Node.js menjalankan JavaScript
Tipe hilang setelah kompilasi → data dari luar (HTTP, DB, env) harus divalidasi saat runtime
```

## Implementation

### Konfigurasi strict

```json
// tsconfig.json (inti)
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src"]
}
```

```json
// package.json
{ "type": "module", "scripts": { "dev": "tsx watch src/main.ts", "build": "tsc", "start": "node dist/main.js",
  "typecheck": "tsc --noEmit", "test": "vitest run" } }
```

### Union & narrowing (mirip sealed class)

```ts
type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

function describe(r: Result<Order>) {
  if (r.ok) return `Order ${r.value.id}`;        // TypeScript tahu r.value ada
  return `Gagal: ${r.error.code}`;
}

type PaymentMethod = 'cash' | 'qris' | 'card';
function fee(m: PaymentMethod): number {
  switch (m) {
    case 'cash': return 0;
    case 'qris': return 0.007;
    case 'card': return 0.02;
    default: { const never: never = m; return never; }   // error kompilasi bila ada nilai baru yang lupa ditangani
  }
}
```

### Tipe dari skema runtime

```ts
import { z } from 'zod';
export const CreateOrder = z.object({
  outletId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), qty: z.number().int().positive() })).min(1),
});
export type CreateOrder = z.infer<typeof CreateOrder>;   // satu sumber: validasi + tipe
const input = CreateOrder.parse(req.body);               // body: unknown → CreateOrder
```

### Generics

```ts
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new TimeoutError()), ms))]);
}
```

### null & undefined

```ts
const name = user.nickname ?? user.name;     // ?? hanya untuk null/undefined (bukan '' atau 0)
const city = user.address?.city;             // optional chaining
// Hindari non-null assertion (user!.id). Narrowing dengan if atau validasi
```

### Async/await & Promise

```ts
// Paralel
const [orders, stats] = await Promise.all([repo.orders(id), repo.stats(id)]);
// Paralel dengan kegagalan parsial
const results = await Promise.allSettled(tasks);

// ❌ floating promise: error tidak tertangkap, urutan tidak terjamin
sendEmail(order);
// ✅ await, atau serahkan ke job queue
await emailQueue.add('receipt', { orderId: order.id });
```

Aktifkan lint `@typescript-eslint/no-floating-promises` untuk menangkapnya.

### Pitfalls umum

| Pitfall | Solusi |
| --- | --- |
| `==` dengan koersi tipe | Selalu `===` |
| Angka desimal (`0.1 + 0.2`) | Uang sebagai integer minor unit |
| `JSON.parse` menghasilkan `any` | Validasi dengan skema |
| Mutasi objek bersama | Salin (`{...obj}`), `readonly`, `as const` |
| `this` hilang di callback | Arrow function atau fungsi biasa tanpa `this` |
| `Date` dan zona waktu | Simpan UTC ISO, gunakan library (date-fns/Temporal polyfill) untuk zona |
| `any` menyebar | `unknown` + narrowing, lint `no-explicit-any` |
| `forEach` dengan async | `for...of` dengan await, atau `Promise.all(map(...))` |

## Best Practices

- **`strict: true`** dan lint ketat sejak awal.
- **Validasi semua data dari luar** dengan skema, tipe diturunkan dari skema.
- **Union + discriminant** untuk state dan hasil.
- **`unknown` daripada `any`**.
- **Await setiap promise** atau serahkan ke antrean.
- **ESM modern** dan Node LTS.

## Anti-Patterns

- `as SomeType` untuk "memaksa" data dari HTTP tanpa validasi.
- `any` di mana-mana untuk mempercepat.
- Mencampur CommonJS dan ESM sembarangan.
- `async` di dalam `forEach`.
- Menganggap tipe TypeScript melindungi saat runtime.

## Performance Considerations

TypeScript tidak memperlambat runtime (tipe dihapus). Yang memengaruhi performa adalah JavaScript-nya: hindari kerja
CPU berat di event loop, gunakan struktur data yang tepat (`Map`/`Set` untuk lookup), dan hindari `JSON.stringify` objek
besar berulang kali.

## Security Considerations

Karena tipe tidak ada saat runtime, input yang tidak divalidasi bisa berisi apa pun, termasuk properti `__proto__`
(prototype pollution). Validasi dengan skema strict, hindari `eval`/`new Function`, dan gunakan `crypto` bawaan untuk
nilai acak keamanan.

## Real-World Use Cases

- Flutter developer membuat Cloud Function TypeScript untuk membuat order dengan validasi zod.
- Tipe dari skema OpenAPI/zod dibagikan dengan dashboard web admin dalam monorepo.

## Interview Questions

1. Apa beda TypeScript dan JavaScript?
2. Mengapa validasi runtime tetap diperlukan walau memakai TypeScript?
3. Apa beda `null` dan `undefined`, serta `??` dan `||`?
4. Apa itu floating promise dan mengapa berbahaya?

## Sample Answers

1. TypeScript adalah superset JavaScript dengan sistem tipe statis yang diperiksa saat kompilasi lalu dihapus, sehingga yang dijalankan tetap JavaScript.
2. Tipe hilang saat runtime, sehingga data dari HTTP, database, atau environment tidak dijamin sesuai tipe. Skema (mis. zod) memvalidasi data dan menghasilkan tipe yang benar.
3. `undefined` berarti belum diberi nilai/tidak ada properti, `null` berarti sengaja kosong. `??` hanya memakai nilai kanan bila kiri null/undefined, sedangkan `||` juga untuk nilai falsy seperti `0` dan `''`.
4. Promise yang tidak di-await atau ditangani, sehingga error-nya tidak tertangkap, urutan eksekusi tidak terjamin, dan pekerjaan bisa terputus saat proses berhenti.

## Practical Exercises

1. Buat proyek TypeScript strict dengan Fastify + zod + Vitest.
2. Tulis ulang satu model Dart sealed class menjadi union TypeScript dengan exhaustive switch.
3. Aktifkan `no-floating-promises` dan perbaiki temuan.

## Quick Reference

```text
strict + noUncheckedIndexedAccess · ESM (type: module, NodeNext) · tsx untuk dev, tsc untuk build/typecheck
Tipe hilang saat runtime → zod parse + z.infer · unknown > any
Union + discriminant + exhaustive never · ?? dan ?. · === selalu
Promise.all / allSettled · tanpa floating promise · for...of untuk async berurutan
Uang integer · waktu UTC ISO · Map/Set untuk lookup
```

## Related Topics

- [Node.js Runtime & Event Loop](/backend/nodejs-event-loop/)
- [Dart Fundamentals hingga Advanced](/flutter/dart-fundamentals/)
- [Express.js vs NestJS](/backend/express-nestjs/)
