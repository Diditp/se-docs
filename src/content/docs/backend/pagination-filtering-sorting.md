---
title: "Pagination, Filtering & Sorting"
description: "Mendesain endpoint list yang efisien untuk mobile: offset vs cursor (keyset) pagination, cursor opaque, urutan stabil dengan tie-breaker, filter & sort yang di-whitelist, pencarian, index yang mendukung, format respons, serta implementasi infinite scroll di Flutter dan Paging 3 di Android."
level: intermediate
status: complete
updated: 2026-11-13
tags: [backend, pagination, api, sql, infinite-scroll]
---

## Overview

Endpoint list adalah endpoint paling sering dipanggil aplikasi mobile: riwayat transaksi, katalog, notifikasi, feed.
Desainnya menentukan performa server, konsumsi data pengguna, dan kelancaran infinite scroll.

## Why It Matters

Mengembalikan seluruh data tanpa batas akan lambat dan boros. Pagination offset yang naif menyebabkan item dobel atau
hilang saat data bertambah, yang sering terlihat sebagai bug "produk muncul dua kali" di infinite scroll.

## Core Concepts

| Aspek | Offset (`?page=3&limit=20`) | Cursor / keyset (`?limit=20&cursor=...`) |
| --- | --- | --- |
| Implementasi | Sederhana (`LIMIT/OFFSET`) | Perlu urutan stabil & cursor |
| Performa halaman dalam | Memburuk (DB membaca & membuang baris) | Konstan dengan index |
| Konsistensi saat data berubah | Item bisa dobel/hilang | Stabil |
| Lompat ke halaman N | Bisa | Tidak (hanya next/prev) |
| Cocok untuk | Tabel admin dengan nomor halaman, data kecil | Infinite scroll mobile, feed, data besar |

| Konsep | Penjelasan |
| --- | --- |
| Tie-breaker | Kolom unik tambahan (`id`) agar urutan deterministik |
| Opaque cursor | Cursor di-encode (base64) agar klien tidak bergantung pada strukturnya |
| Whitelist | Hanya field tertentu yang boleh difilter/diurutkan |

## How It Works

```text
Halaman 1: ORDER BY created_at DESC, id DESC LIMIT 21 (ambil 1 ekstra untuk tahu ada halaman berikutnya)
→ kembalikan 20 + next_cursor = encode(created_at, id) dari item ke-20
Halaman 2: WHERE (created_at, id) < (cursor.created_at, cursor.id) ORDER BY ... LIMIT 21
```

## Implementation

### Kontrak API

```http
GET /v1/outlets/{outletId}/orders?limit=20&status=paid&sort=-created_at&cursor=eyJjIjoiMjAyNi0xMS0xM1Q...
```

```json
{
  "data": [{ "id": "…", "total": 54000, "status": "paid", "createdAt": "2026-11-13T07:12:00Z" }],
  "page": { "nextCursor": "eyJjIjoi...", "hasMore": true, "limit": 20 }
}
```

### Implementasi keyset di Node.js

```ts
const ListOrdersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'paid', 'void']).optional(),
  cursor: z.string().optional(),
});

type Cursor = { c: string; id: string };
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
const decode = (s: string): Cursor => CursorSchema.parse(JSON.parse(Buffer.from(s, 'base64url').toString()));

async function listOrders(outletId: string, q: z.infer<typeof ListOrdersQuery>) {
  const params: unknown[] = [outletId];
  let where = 'outlet_id = $1';
  if (q.status) { params.push(q.status); where += ` AND status = $${params.length}`; }
  if (q.cursor) {
    const cur = decode(q.cursor);
    params.push(cur.c, cur.id);
    where += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  params.push(q.limit + 1);
  const rows = await db.query(
    `SELECT id, total, status, created_at FROM orders WHERE ${where}
     ORDER BY created_at DESC, id DESC LIMIT $${params.length}`, params);

  const hasMore = rows.length > q.limit;
  const data = rows.slice(0, q.limit);
  const last = data.at(-1);
  return { data, page: { hasMore, limit: q.limit, nextCursor: hasMore && last ? encode({ c: last.created_at.toISOString(), id: last.id }) : null } };
}
```

```sql
-- Index pendukung (kesetaraan dulu, lalu urutan)
CREATE INDEX idx_orders_outlet_status_created_id ON orders (outlet_id, status, created_at DESC, id DESC);
```

Catatan presisi: PostgreSQL `timestamptz` menyimpan mikrodetik, sedangkan `Date` JavaScript hanya milidetik. Agar cursor
tidak melewatkan atau menggandakan baris, simpan `created_at` dengan presisi milidetik (`timestamptz(3)`), atau ambil nilai
cursor sebagai teks dari SQL (`created_at::text`).

### Filter & sort yang aman

```ts
const SORTABLE = { created_at: 'created_at', total: 'total' } as const;   // whitelist → nama kolom
function parseSort(s = '-created_at') {
  const desc = s.startsWith('-');
  const col = SORTABLE[s.replace(/^-/, '') as keyof typeof SORTABLE];
  if (!col) throw new ValidationError('sort tidak didukung');
  return `${col} ${desc ? 'DESC' : 'ASC'}, id ${desc ? 'DESC' : 'ASC'}`;  // selalu tambah tie-breaker
}
```

Nilai filter memakai parameter (`$n`). Hanya nama kolom dari whitelist yang boleh disisipkan ke SQL. Bila sort bisa
diubah, cursor harus menyimpan nilai kolom sort tersebut, dan setiap kombinasi sort butuh index yang mendukung.

### Pencarian

| Kebutuhan | Pendekatan |
| --- | --- |
| Prefix nama/SKU | `lower(name) LIKE 'lat%'` dengan index `(lower(name) text_pattern_ops)` |
| Substring/typo | `pg_trgm` + index GIN |
| Teks panjang & relevansi | Full-text search Postgres atau search engine terpisah |

### Klien: infinite scroll Flutter

```dart
class OrderListCubit extends Cubit<OrderListState> {
  OrderListCubit(this._repo) : super(const OrderListState());
  final OrderRepository _repo;
  bool _loading = false;

  Future<void> loadMore() async {
    if (_loading || !state.hasMore) return;                 // cegah request ganda saat scroll cepat
    _loading = true;
    final r = await _repo.list(cursor: state.nextCursor, limit: 20);
    _loading = false;
    switch (r) {
      case Ok(:final value):
        emit(state.copyWith(items: [...state.items, ...value.data], nextCursor: value.nextCursor, hasMore: value.hasMore));
      case Err(:final error):
        emit(state.copyWith(error: error));                 // tampilkan tombol "coba lagi" di akhir list
    }
  }

  Future<void> refresh() async { emit(const OrderListState()); await loadMore(); }
}
// UI: ListView.builder + muat lagi saat mendekati akhir (mis. 5 item terakhir)
```

Android native: Paging 3 (`PagingSource` dengan key = cursor), dan `RemoteMediator` untuk kombinasi cache Room + jaringan.

## Best Practices

- **Cursor pagination untuk mobile**, offset hanya untuk tabel admin kecil.
- **Batas `limit` maksimum** di server.
- **Urutan stabil dengan tie-breaker unik**.
- **Cursor opaque** dan divalidasi saat di-decode.
- **Whitelist filter & sort**, didukung index.
- **Klien mencegah request ganda** dan menangani error di tengah list.

## Anti-Patterns

- Endpoint list tanpa limit.
- `ORDER BY created_at` tanpa tie-breaker (item dengan waktu sama bisa dobel/hilang).
- Menyisipkan nilai `sort` dari query string langsung ke SQL (SQL injection).
- `COUNT(*)` total di setiap request halaman pada tabel besar bila tidak dibutuhkan UI.
- Klien memanggil halaman berikutnya berkali-kali saat scroll cepat.

## Performance Considerations

Keyset pagination dengan index yang cocok membuat setiap halaman sama cepat. Total count mahal di tabel besar, jadi
gunakan `hasMore` atau estimasi bila UI tidak benar-benar membutuhkan jumlah pasti. Kembalikan field secukupnya untuk
list (DTO ringkas) dan detail lewat endpoint terpisah.

## Security Considerations

Selalu filter berdasarkan tenant/pemilik (`outlet_id` dari otorisasi, bukan dari input mentah). Cursor yang di-decode
harus divalidasi dan tidak boleh memberi akses ke data di luar filter otorisasi. Batasi limit untuk mencegah scraping
dan beban berlebih.

## Real-World Use Cases

- Riwayat transaksi kasir: cursor `(created_at, id)`, 20 per halaman, filter status.
- Katalog produk dengan pencarian prefix nama dan filter kategori.
- Feed notifikasi dengan `hasMore` tanpa total count.

## Interview Questions

1. Apa beda offset dan cursor pagination?
2. Mengapa perlu tie-breaker pada urutan?
3. Bagaimana mengamankan parameter sort dan filter?
4. Bagaimana mengimplementasikan infinite scroll di mobile dengan benar?

## Sample Answers

1. Offset melompati N baris (sederhana, bisa lompat halaman, tetapi lambat di halaman dalam dan tidak stabil saat data berubah). Cursor memakai nilai item terakhir sebagai batas (cepat dengan index dan stabil, tetapi hanya next/prev).
2. Agar urutan deterministik ketika nilai kolom sort sama. Tanpa itu, item bisa muncul di dua halaman atau terlewat.
3. Whitelist field yang boleh difilter/diurutkan, petakan ke nama kolom tetap, nilai filter melalui parameterized query, dan validasi tipe nilainya.
4. Simpan cursor & `hasMore` di state, muat halaman berikutnya saat mendekati akhir, cegah request ganda, tampilkan indikator loading & retry error di akhir list, dan refresh dengan mereset state.

## Practical Exercises

1. Ubah endpoint offset menjadi cursor dan bandingkan performa halaman ke-500.
2. Tambahkan filter status & sort `total` yang di-whitelist.
3. Implementasikan infinite scroll dengan retry error di Flutter.

## Quick Reference

```text
Mobile → cursor (keyset): WHERE (created_at, id) < cursor ORDER BY created_at DESC, id DESC LIMIT n+1
Cursor opaque base64url · hasMore · limit maks · tie-breaker unik · index (filter..., sort..., id)
Filter/sort whitelist · nilai via parameter · tanpa COUNT(*) bila tidak perlu
Klien: cegah double load · retry di akhir list · Paging 3 / Cubit
```

## Related Topics

- [RESTful API Design](/backend/restful-api-design/)
- [Database Performance](/testing-performance/database-performance/)
- [Feed & Infinite Scroll (System Design)](/system-design/mobile/feed-infinite-scroll/)
