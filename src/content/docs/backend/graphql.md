---
title: "GraphQL untuk Mobile"
description: "GraphQL dari sudut pandang mobile engineer: schema, query/mutation/subscription, over- dan under-fetching, kapan GraphQL lebih baik dari REST, klien Flutter (graphql_flutter/ferry) dengan normalized cache dan codegen, pagination cursor (connection), penanganan error, N+1 dan DataLoader di server Node, serta keamanan (depth/complexity limit, persisted queries, otorisasi per resolver)."
level: intermediate
status: complete
version: "GraphQL spec · Apollo Server/GraphQL Yoga · graphql_flutter / ferry · Apollo Kotlin. Cek dokumentasi library"
updated: 2026-11-13
tags: [graphql, api, mobile, flutter, nodejs, caching]
---

## Overview

**GraphQL** adalah bahasa query untuk API. Klien menentukan **bentuk data yang dibutuhkan**, dan server mengembalikan
persis bentuk itu dari satu endpoint (biasanya `POST /graphql`). Semua tipe didefinisikan dalam **schema** yang menjadi
kontrak antara klien dan server.

## Why It Matters

GraphQL muncul di sebagian lowongan mobile (terutama e-commerce, media sosial, dan perusahaan dengan banyak klien).
Bahkan bila tim memakai REST, interviewer sering bertanya "REST vs GraphQL?". Jawaban yang baik menjelaskan trade-off,
bukan sekadar "GraphQL lebih modern".

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Schema (SDL) | Definisi tipe, field, dan operasi. Menjadi kontrak bertipe |
| Query | Membaca data |
| Mutation | Mengubah data |
| Subscription | Data real-time (biasanya via WebSocket) |
| Resolver | Fungsi server yang mengisi nilai sebuah field |
| Fragment | Potongan field yang dapat dipakai ulang (mis. per widget) |
| Over-fetching | REST mengembalikan field yang tidak dibutuhkan |
| Under-fetching | Layar butuh beberapa request REST |
| Normalized cache | Klien menyimpan objek per `__typename:id` sehingga update satu objek memperbarui semua layar |

### REST vs GraphQL

| Aspek | REST | GraphQL |
| --- | --- | --- |
| Endpoint | Banyak resource URL | Satu endpoint, banyak bentuk query |
| Bentuk respons | Ditentukan server | Ditentukan klien |
| Caching HTTP/CDN | Mudah (GET + Cache-Control/ETag) | Lebih sulit (POST). Butuh persisted queries/GET atau cache klien |
| Versi | `/v1`, `/v2` | Evolusi schema: tambah field, `@deprecated` field lama |
| Error | Status HTTP | Umumnya `200` dengan array `errors` (bisa parsial) |
| Upload file | Sederhana (multipart) | Butuh spesifikasi tambahan, sering memakai signed URL REST |
| Kompleksitas server | Lebih sederhana | Resolver, N+1, batas query, otorisasi per field |
| Cocok untuk | API publik, CRUD sederhana, caching CDN | Banyak klien dengan kebutuhan data berbeda, UI kompleks |

## How It Works

```text
Klien kirim { query, variables, operationName } → server parse & validasi terhadap schema
→ eksekusi resolver per field (paralel bila bisa) → gabungkan hasil → { data, errors? }
Klien: simpan hasil ke normalized cache → widget yang memakai objek tersebut ikut diperbarui
```

## Implementation

### Schema (server)

```graphql
type Product {
  id: ID!
  name: String!
  price: Int!            # rupiah, integer minor unit
  stock: Int!
  category: Category!
}

type Category { id: ID! name: String! }

type ProductEdge { node: Product!  cursor: String! }
type PageInfo { hasNextPage: Boolean!  endCursor: String }
type ProductConnection { edges: [ProductEdge!]!  pageInfo: PageInfo! }

type Query {
  products(outletId: ID!, first: Int = 20, after: String): ProductConnection!
  product(id: ID!): Product
}

input CreateOrderInput { outletId: ID!  items: [OrderItemInput!]!  idempotencyKey: String! }
input OrderItemInput { productId: ID!  qty: Int! }

type Mutation { createOrder(input: CreateOrderInput!): Order! }
```

### Server Node.js: resolver + DataLoader untuk N+1

```ts
import DataLoader from 'dataloader';

// Satu DataLoader per request (jangan global, karena cache akan bocor antar pengguna)
function createLoaders(db: Db) {
  return {
    categoryById: new DataLoader<string, Category>(async (ids) => {
      const rows = await db.categories.findMany({ where: { id: { in: [...ids] } } });
      const map = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => map.get(id) ?? new Error(`Category ${id} not found`));
    }),
  };
}

const resolvers = {
  Query: {
    products: async (_: unknown, args, ctx) => {
      await ctx.authz.requireOutletMember(args.outletId);          // otorisasi di resolver
      return ctx.productService.page(args.outletId, args.first, args.after);
    },
  },
  Product: {
    category: (p, _args, ctx) => ctx.loaders.categoryById.load(p.categoryId),   // 20 produk → 1 query kategori
  },
};
```

### Klien Flutter (package `graphql`/`graphql_flutter`)

```dart
final client = GraphQLClient(
  link: AuthLink(getToken: () async => 'Bearer ${await tokenStore.accessToken()}')
      .concat(HttpLink('https://api.example.com/graphql')),
  cache: GraphQLCache(store: HiveStore()),               // normalized cache, persisten
);

const productsQuery = r'''
  query Products($outletId: ID!, $after: String) {
    products(outletId: $outletId, first: 20, after: $after) {
      edges { node { id name price stock } }
      pageInfo { hasNextPage endCursor }
    }
  }
''';

Future<ProductPage> fetchProducts(String outletId, {String? after}) async {
  final result = await client.query(QueryOptions(
    document: gql(productsQuery),
    variables: {'outletId': outletId, 'after': after},
    fetchPolicy: FetchPolicy.cacheAndNetwork,
  ));
  if (result.hasException) throw mapGraphQLException(result.exception!);   // jaringan vs error GraphQL
  return ProductPage.fromJson(result.data!['products'] as Map<String, dynamic>);
}
```

Untuk proyek besar, gunakan **codegen** (mis. `ferry` + `ferry_generator`, atau `graphql_codegen`) agar query dan model
bertipe aman dihasilkan dari schema. Di Android native, Apollo Kotlin menyediakan hal serupa.

### Menangani error dengan benar

```json
{
  "data": { "createOrder": null },
  "errors": [{ "message": "Stok tidak cukup", "path": ["createOrder"],
               "extensions": { "code": "OUT_OF_STOCK", "productId": "p1" } }]
}
```

```text
- Status HTTP 200 tidak berarti sukses. Selalu periksa `errors`
- Petakan extensions.code ke Failure domain (OUT_OF_STOCK, UNAUTHENTICATED, FORBIDDEN)
- Respons bisa parsial: sebagian field berisi data, sebagian error
```

### Keamanan & performa server

| Risiko | Mitigasi |
| --- | --- |
| Query bersarang sangat dalam/mahal (DoS) | Batas depth & complexity, timeout, batas `first` maksimum |
| Klien bebas membuat query apa pun | Persisted queries / allowlist operasi untuk aplikasi mobile |
| Introspection membuka seluruh schema | Matikan di production bila API privat |
| Otorisasi hanya di gateway | Cek otorisasi per resolver/objek (ownership/tenant) |
| N+1 query | DataLoader per request, query batch |

## Best Practices

- **Desain schema berdasarkan kebutuhan klien**, bukan cerminan tabel database.
- **Gunakan fragment per komponen UI** dan codegen untuk type safety.
- **Pagination cursor (connection)** untuk list.
- **Evolusi schema tanpa breaking change**: tambah field, tandai `@deprecated`, hapus setelah versi aplikasi lama tidak dipakai.
- **Mutation idempoten** (idempotency key) untuk retry dari mobile.
- **DataLoader per request** dan batas kompleksitas query.

## Anti-Patterns

- Memakai GraphQL hanya karena tren untuk API CRUD sederhana dengan satu klien.
- Menganggap status 200 berarti sukses.
- Resolver yang melakukan query DB per item tanpa batching.
- Menghapus field yang masih dipakai aplikasi versi lama di store.
- DataLoader global yang membagi cache antar pengguna.

## Performance Considerations

GraphQL mengurangi round-trip dan payload untuk layar kompleks, tetapi memindahkan biaya ke server (parsing, resolver)
dan mempersulit caching HTTP. Pantau durasi per resolver/operasi, gunakan persisted queries (payload request lebih kecil
dan bisa di-cache via GET), dan manfaatkan normalized cache di klien untuk mengurangi request ulang.

## Security Considerations

Satu endpoint bukan berarti satu pemeriksaan keamanan. Otorisasi harus dilakukan per objek di resolver/service. Batasi
kompleksitas query, nonaktifkan introspection untuk API privat, validasi input, dan jangan bocorkan detail internal
(stack trace) di `errors`.

## Real-World Use Cases

- Halaman detail produk e-commerce yang butuh produk, varian, ulasan, dan rekomendasi: satu query alih-alih empat request REST.
- Aplikasi mobile & web dengan kebutuhan field berbeda dari backend yang sama.
- Subscription untuk status pesanan real-time.

## Interview Questions

1. Apa beda REST dan GraphQL, dan kapan memilih masing-masing?
2. Apa itu over-fetching dan under-fetching?
3. Apa masalah N+1 di GraphQL dan cara mengatasinya?
4. Bagaimana caching bekerja di klien GraphQL?
5. Bagaimana mengamankan API GraphQL?

## Sample Answers

1. REST berbasis resource dengan caching HTTP yang mudah dan cocok untuk API publik/CRUD. GraphQL membiarkan klien menentukan bentuk data dari satu endpoint, cocok untuk banyak klien dan layar kompleks, dengan biaya kompleksitas server dan caching yang lebih sulit.
2. Over-fetching: respons berisi lebih banyak field dari yang dibutuhkan. Under-fetching: satu layar butuh beberapa request. GraphQL mengatasi keduanya karena klien memilih field dalam satu query.
3. Resolver field dipanggil per item sehingga list 20 item memicu 20 query tambahan. Atasi dengan DataLoader yang mengumpulkan ID dalam satu tick lalu mengambilnya dengan satu query batch, dibuat per request.
4. Klien seperti Apollo/graphql_flutter/ferry menormalisasi hasil berdasarkan `__typename` dan `id`, sehingga objek yang sama dibagi antar query dan update dari mutation langsung terlihat di semua layar. Fetch policy mengatur kapan memakai cache atau jaringan.
5. Otorisasi per resolver/objek, batas depth/complexity dan ukuran halaman, timeout, persisted queries/allowlist, introspection dimatikan untuk API privat, validasi input, dan error yang tidak membocorkan detail internal.

## Practical Exercises

1. Buat server GraphQL kecil (Apollo Server/Yoga) dengan `products` + `category` dan ukur jumlah query sebelum/sesudah DataLoader.
2. Panggil dari Flutter dengan normalized cache, lalu tunjukkan update stok dari mutation memperbarui list.
3. Tambahkan batas depth/complexity dan uji dengan query bersarang dalam.

## Quick Reference

```text
Schema = kontrak · query / mutation / subscription · resolver · fragment
Klien pilih field → hilangkan over/under-fetching · satu endpoint · error di `errors` (HTTP 200)
Connection pagination (edges, pageInfo, cursor) · normalized cache (__typename:id) · codegen
Server: DataLoader per request · depth/complexity limit · persisted queries · otorisasi per resolver
Evolusi schema dengan @deprecated, bukan /v2
```

## Related Topics

- [RESTful API Design](/backend/restful-api-design/)
- [REST API Integration (Flutter)](/flutter/rest-api-integration/)
- [API Performance](/testing-performance/api-performance/)
