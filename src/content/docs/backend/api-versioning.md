---
title: "API Versioning"
description: "Strategi versioning API yang melayani aplikasi mobile: kapan perubahan breaking, URL vs header vs media type versioning, evolusi tanpa versi baru, menjalankan v1 & v2 bersamaan, header Deprecation & Sunset, minimum supported app version dan force update, memantau versi klien, serta checklist migrasi."
level: intermediate
status: complete
updated: 2026-11-13
tags: [backend, api, versioning, deprecation, mobile, force-update]
---

## Overview

**API versioning** adalah cara mengubah API tanpa merusak klien yang sudah ada. Untuk web, klien biasanya selalu versi
terbaru. Untuk mobile, **versi aplikasi lama tetap terpasang berbulan-bulan**, sehingga API harus tetap kompatibel dengan
banyak versi aplikasi sekaligus.

## Why It Matters

Perubahan kecil seperti mengganti nama field `total` menjadi `grandTotal` dapat membuat aplikasi versi lama crash saat
parsing, padahal Anda tidak bisa memaksa semua pengguna update seketika. Strategi versioning dan deprecation yang jelas
mencegah insiden ini.

## Core Concepts

| Perubahan | Breaking? |
| --- | --- |
| Menambah endpoint | Tidak |
| Menambah field opsional di respons | Tidak (jika parser klien toleran) |
| Menambah parameter input opsional | Tidak |
| Menghapus/mengganti nama field respons | **Ya** |
| Mengubah tipe atau format field | **Ya** |
| Mengubah makna field/status | **Ya** (sering tidak terdeteksi) |
| Menjadikan input opsional menjadi wajib | **Ya** |
| Menambah nilai enum baru | **Bisa**: klien lama mungkin tidak mengenali nilainya |
| Mengubah kode status/format error | **Ya** |

| Strategi | Contoh | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| URL path | `/v1/orders`, `/v2/orders` | Jelas, mudah di-routing & di-cache | URL berubah |
| Header | `Api-Version: 2026-11-01` | URL stabil, versi berbasis tanggal | Kurang terlihat, perlu dokumentasi |
| Media type | `Accept: application/vnd.pos.v2+json` | Sesuai prinsip HTTP | Lebih rumit untuk klien |

Untuk sebagian besar aplikasi mobile, **URL path versioning mayor** + evolusi aditif di dalam versi adalah pilihan yang
sederhana dan efektif.

## How It Works

```text
Evolusi normal: tambah field/endpoint di /v1 (aditif) → klien baru memakai field baru, klien lama mengabaikannya
Breaking change: buat /v2 (atau endpoint/field baru) → klien baru memakai v2 → v1 ditandai deprecated
→ pantau penggunaan v1 per versi aplikasi → naikkan min_supported_version → matikan v1 setelah sunset
```

## Implementation

### Struktur kode untuk dua versi

```text
modules/orders/
  orders.service.ts          logika bisnis bersama (satu sumber kebenaran)
  http/v1/orders.routes.ts   mapping DTO v1
  http/v2/orders.routes.ts   mapping DTO v2
```

```ts
// v1 mempertahankan bentuk lama, v2 bentuk baru, service yang sama
const toOrderV1 = (o: Order) => ({ id: o.id, total: o.total.amount, status: o.status });
const toOrderV2 = (o: Order) => ({ id: o.id, total: { amount: o.total.amount, currency: o.total.currency }, status: o.status });
```

Hindari menyalin seluruh service untuk setiap versi. Perbedaan versi sebaiknya hanya di lapisan mapping HTTP.

### Klien toleran

```dart
// json_serializable: field tak dikenal diabaikan secara default. Enum baru dipetakan ke `unknown`
enum OrderStatus { pending, paid, voided, unknown }

@JsonSerializable()
class OrderDto {
  OrderDto(this.id, this.status);
  final String id;
  @JsonKey(unknownEnumValue: OrderStatus.unknown)
  final OrderStatus status;
  factory OrderDto.fromJson(Map<String, dynamic> json) => _$OrderDtoFromJson(json);
}
```

UI menampilkan nilai `unknown` secara aman ("Status lain") daripada crash.

### Header deprecation

```ts
app.addHook('onSend', async (req, reply) => {
  if (req.url.startsWith('/v1/')) {
    reply.header('Deprecation', 'true');                                 // draf IETF (format dapat berupa tanggal)
    reply.header('Sunset', 'Wed, 30 Jun 2027 00:00:00 GMT');            // RFC 8594
    reply.header('Link', '</docs/migrate-v2>; rel="deprecation"');
  }
});
```

### Versi aplikasi & force update

```ts
// Klien mengirim X-App-Version & X-Platform. Server mencatatnya dan menolak versi yang tidak didukung
const MIN = { android: '2.4.0', ios: '2.4.0' } as const;
app.addHook('onRequest', async (req, reply) => {
  const v = req.headers['x-app-version'] as string | undefined;
  const p = req.headers['x-platform'] as keyof typeof MIN | undefined;
  if (v && p && MIN[p] && semverLt(v, MIN[p])) {
    return reply.code(426).send({ code: 'APP_UPDATE_REQUIRED', minVersion: MIN[p] });
  }
});
```

```text
Aplikasi: cek min_supported_version saat startup (Remote Config/endpoint config) + tangani 426 di interceptor
→ tampilkan layar update dengan tautan ke store
Soft update: rekomendasi update tanpa memblokir
```

### Memantau penggunaan versi

```text
Metrik: request per (route versi, app_version, platform)
Keputusan mematikan v1: penggunaan < ambang (mis. < 1% pengguna aktif) + sudah melewati tanggal sunset + force update aktif
```

### Checklist breaking change

```text
□ Bisakah dibuat aditif (field/endpoint baru) tanpa versi baru?
□ OpenAPI v2 + panduan migrasi
□ Backend menjalankan v1 & v2 bersamaan, test untuk keduanya
□ Aplikasi baru memakai v2 dan dirilis
□ Header Deprecation/Sunset di v1, komunikasi ke klien lain (partner, web)
□ Pantau penggunaan v1, naikkan min_supported_version
□ Matikan v1 setelah sunset, hapus kode mapping v1
```

## Best Practices

- **Evolusi aditif** sebagai default. Versi mayor baru hanya untuk breaking change yang tidak terhindarkan.
- **Satu service, beberapa mapper versi**.
- **Parser klien toleran** terhadap field & enum baru.
- **Kirim versi aplikasi** di setiap request dan pantau.
- **Deprecation terjadwal** dengan Sunset dan force update.
- **Deteksi breaking change otomatis** pada OpenAPI di CI.

## Anti-Patterns

- Mengubah respons `/v1` "karena aplikasi baru sudah siap".
- Versi baru untuk setiap perubahan kecil (v7, v8, v9 bersamaan).
- Menduplikasi seluruh logika bisnis per versi.
- Mematikan versi lama tanpa data penggunaan.
- Enum ketat di klien yang crash pada nilai baru.

## Performance Considerations

Menjalankan beberapa versi menambah beban pemeliharaan, bukan beban runtime yang berarti. Lapisan mapping per versi
murah. Pastikan cache (CDN/HTTP) membedakan versi, yang otomatis terjadi bila versi ada di path URL.

## Security Considerations

Versi lama tetap harus menerima patch keamanan selama masih hidup. Versi yang tidak lagi dipelihara harus dimatikan
(OWASP API9: improper inventory management). Force update juga alat untuk menghentikan versi aplikasi yang memiliki
celah keamanan.

## Real-World Use Cases

- Mengubah `total` (integer) menjadi objek `Money` dengan `/v2/orders`, sementara `/v1` tetap mengembalikan integer selama 6 bulan.
- Celah keamanan di aplikasi 2.1.x → `min_supported_version` dinaikkan ke 2.2.0 dengan 426.

## Interview Questions

1. Strategi versioning API apa yang Anda pilih untuk aplikasi mobile?
2. Perubahan apa saja yang termasuk breaking change?
3. Bagaimana mematikan versi API lama dengan aman?
4. Bagaimana aplikasi mobile menangani nilai enum baru dari API?

## Sample Answers

1. URL path versioning mayor (`/v1`) dengan evolusi aditif di dalamnya, karena sederhana, jelas, dan mudah di-routing serta di-cache. Breaking change dibuat sebagai versi atau field baru dengan masa deprecation.
2. Menghapus atau mengganti nama field, mengubah tipe/format/makna, menjadikan input wajib, mengubah kode status/format error, dan berpotensi menambah nilai enum yang tidak dikenali klien lama.
3. Rilis versi baru dan aplikasi yang memakainya, tandai versi lama deprecated dengan Sunset, pantau penggunaan per versi aplikasi, naikkan minimum versi aplikasi (force update), lalu matikan setelah penggunaan sangat rendah dan tanggal sunset terlewati.
4. Parser toleran dengan nilai fallback `unknown` dan UI yang menampilkannya secara aman, sehingga aplikasi tidak crash saat server menambah nilai baru.

## Practical Exercises

1. Klasifikasikan 10 perubahan API terakhir Anda: aditif atau breaking.
2. Tambahkan header `X-App-Version` dari Flutter dan metrik penggunaan per versi.
3. Implementasikan alur force update (426 + layar update).

## Quick Reference

```text
Default: /v1 + evolusi aditif · breaking → /v2 atau field/endpoint baru
Breaking: hapus/rename · ubah tipe/makna · input jadi wajib · ubah error · (enum baru)
Satu service + mapper per versi · klien toleran (unknown enum)
Deprecation + Sunset + Link · X-App-Version · 426 APP_UPDATE_REQUIRED · min_supported_version
Matikan versi lama berdasarkan data penggunaan
```

## Related Topics

- [API Design Conventions](/ai-engineering/guides/api-conventions/)
- [RESTful API Design](/backend/restful-api-design/)
- [API Gateway](/system-design/concepts/api-gateway/)
