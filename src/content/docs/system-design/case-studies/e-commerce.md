---
title: "E-Commerce Application"
description: "Studi kasus desain sistem e-commerce dengan aplikasi mobile: requirement, estimasi kapasitas, arsitektur, katalog & pencarian, keranjang, checkout dengan reservasi stok, pembayaran & webhook, order state machine, flash sale, notifikasi, data model, caching, serta failure mode dan trade-off."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, case-study, e-commerce, checkout, payment, flash-sale]
---

## Overview

Desain aplikasi e-commerce (seperti marketplace atau toko online brand) dengan aplikasi mobile Flutter sebagai kanal
utama: pengguna menjelajah katalog, mencari produk, menambah ke keranjang, checkout, membayar, dan melacak pesanan.

## Why It Matters

E-commerce adalah soal system design klasik karena menggabungkan banyak masalah sekaligus: read-heavy katalog,
konsistensi stok, pembayaran asinkron, lonjakan trafik (flash sale), dan pengalaman mobile di jaringan lambat.

## Core Concepts

### Requirement

| Fungsional | Non-fungsional |
| --- | --- |
| Katalog, kategori, detail produk & varian | Katalog p95 < 300 ms, tersedia 99,9% |
| Pencarian dengan filter & urutan | Checkout tidak boleh overselling stok |
| Keranjang (sinkron antar perangkat) | Pembayaran tidak boleh tertagih ganda |
| Checkout, alamat, ongkir, voucher | Tahan lonjakan 10–20× saat flash sale |
| Pembayaran (VA, e-wallet, kartu, QRIS) | Data pribadi dilindungi (UU PDP) |
| Status & tracking pesanan, notifikasi | Aplikasi tetap berguna di jaringan lemah |

### Estimasi (asumsi)

```text
DAU 500 ribu · rata-rata 20 view produk/hari → 10 juta view/hari ≈ 115 rps, puncak ×5 ≈ 600 rps (baca)
Order 20 ribu/hari ≈ 0,25/detik, flash sale: 2.000 order/menit ≈ 35/detik
Rasio baca:tulis sangat tinggi → katalog harus di-cache agresif
Gambar: 1 juta produk × 5 gambar × 3 ukuran → object storage + CDN
```

## How It Works

```text
Flutter app ── CDN (gambar, aset) 
            └─ API Gateway/BFF mobile
                 ├─ Catalog service (read-heavy) ── cache Redis ── PostgreSQL · Search engine (OpenSearch/Meilisearch)
                 ├─ Cart service ── Redis/DB
                 ├─ Order service ── PostgreSQL (order, payment, outbox)
                 ├─ Inventory (reservasi stok)
                 ├─ Payment adapter ── payment gateway ── webhook
                 └─ Notification worker ── FCM/APNs, email
Event bus/queue: order.created, payment.succeeded, order.shipped
Awal: modular monolith dengan modul-modul di atas. Pecah layanan hanya bila perlu
```

### Data model inti

```text
products(id, name, description, category_id, status) · variants(id, product_id, sku, price, attributes)
inventory(variant_id, warehouse_id, on_hand, reserved)
carts(user_id, updated_at) · cart_items(user_id, variant_id, qty)
orders(id, user_id, status, subtotal, shipping_fee, discount, total, address_snapshot, idempotency_key, created_at)
order_items(order_id, variant_id, qty, unit_price_snapshot)
payments(id, order_id, provider, provider_ref, status, amount, expires_at)
outbox(id, type, payload, published_at)
```

Harga dan alamat **di-snapshot** ke order agar perubahan katalog tidak mengubah pesanan lama.

## Implementation

### 1. Katalog & pencarian

```text
- Detail produk: cache-aside Redis (TTL menit) + ETag untuk aplikasi. Gambar via CDN dengan ukuran sesuai layar
- Daftar & filter: cursor pagination
- Pencarian teks & faset: search engine yang disinkron dari DB via event/CDC (eventual, beberapa detik)
- Stok yang ditampilkan di katalog boleh perkiraan ("tersisa sedikit"). Kepastian stok di checkout
```

### 2. Keranjang

```text
Disimpan di server per pengguna (sinkron antar perangkat) + salinan lokal di aplikasi untuk UX cepat
Item keranjang tidak mengunci stok. Harga di keranjang ditampilkan ulang dari katalog saat dibuka
```

### 3. Checkout dengan reservasi stok

```sql
-- Reservasi atomik per varian dalam satu transaksi bersama pembuatan order
UPDATE inventory SET reserved = reserved + $2
WHERE variant_id = $1 AND on_hand - reserved >= $2
RETURNING on_hand - reserved AS available;      -- 0 baris → stok tidak cukup → batalkan transaksi
```

```text
POST /v1/checkout (Idempotency-Key)
→ validasi harga & voucher di server → transaksi: buat order PENDING_PAYMENT + reservasi stok + outbox
→ buat payment di gateway (di luar transaksi) → kembalikan instruksi bayar (VA, deeplink e-wallet, QR)
Reservasi kedaluwarsa (mis. 30 menit) bila tidak dibayar → job melepas reserved & order EXPIRED
```

### 4. Pembayaran & webhook

```text
Gateway → POST /webhooks/payments (verifikasi signature, idempoten by provider_ref)
→ payment SUCCEEDED → order PAID → reserved dikonversi menjadi pengurangan on_hand → event order.paid
Aplikasi: tidak mempercayai "sukses" dari redirect/SDK klien. Tampilkan status dari server (polling singkat + push)
Rekonsiliasi terjadwal: cocokkan status dengan API gateway untuk webhook yang hilang
```

### 5. Order state machine

```text
PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED → COMPLETED
       │             └→ CANCELLED (refund)          └→ RETURN_REQUESTED → RETURNED (refund)
       └→ EXPIRED (stok dilepas)
Transisi hanya lewat method domain yang memeriksa status asal. Setiap transisi menerbitkan event
```

### 6. Flash sale

```text
- Pre-warm cache & skala instance sebelum jam mulai. Halaman produk flash sale statis/CDN
- Stok flash sale di Redis (DECR atomik) sebagai gerbang cepat, lalu order dibuat via antrean dengan batas laju
- Batas per pengguna/perangkat, App Check/Play Integrity, rate limit, dan CAPTCHA/antrean virtual oleh platform
- Aplikasi: countdown dari waktu server, tombol beli dinonaktifkan sampai mulai, retry dengan jitter
```

### 7. Aplikasi mobile

```text
BFF untuk layar beranda (banner, kategori, rekomendasi) dalam satu request
Image optimization (WebP, ukuran per layar) · infinite scroll dengan cursor · cache katalog lokal
Deep link produk/promo (App Links/Universal Links) · push untuk status pesanan
```

## Best Practices

- **Pisahkan jalur baca (cache, CDN, search) dan jalur tulis (transaksi DB)**.
- **Reservasi stok atomik** dengan batas waktu.
- **Snapshot harga & alamat** di order.
- **Webhook terverifikasi + idempoten + rekonsiliasi**.
- **State machine eksplisit** untuk order.
- **Siapkan flash sale secara khusus** (pre-warm, gerbang Redis, antrean, batas per pengguna).

## Anti-Patterns

- Mengurangi stok saat item dimasukkan keranjang.
- Mempercayai harga dari aplikasi.
- Menandai order PAID berdasarkan callback di aplikasi.
- Query `LIKE '%kata%'` di DB transaksi untuk pencarian.
- Menangani flash sale dengan arsitektur hari biasa.

## Performance Considerations

Katalog dilayani dari cache/CDN dengan hit rate tinggi. Search engine terpisah menangani pencarian. Checkout memakai
transaksi singkat dengan index pada `inventory(variant_id)`. Pemanggilan payment gateway di luar transaksi DB agar lock
tidak tertahan oleh latensi eksternal.

## Security Considerations

Validasi harga/voucher di server, idempotency key untuk checkout, otorisasi objek (order milik pengguna), verifikasi
signature webhook, tokenisasi kartu oleh gateway (tidak menyimpan data kartu), rate limit & deteksi bot untuk voucher dan
flash sale, serta perlindungan data alamat/telepon.

## Real-World Use Cases

- Toko online brand dengan aplikasi Flutter: modular monolith + PostgreSQL + Redis + Meilisearch + payment gateway lokal.
- Marketplace besar: layanan terpisah per domain, event streaming, dan search cluster khusus.

## Interview Questions

1. Bagaimana mencegah overselling saat banyak pengguna checkout bersamaan?
2. Bagaimana menangani pembayaran yang statusnya tidak pasti?
3. Bagaimana mendesain sistem untuk flash sale?
4. Mengapa harga perlu di-snapshot di order?

## Sample Answers

1. Reservasi stok dengan update atomik bersyarat (`on_hand - reserved >= qty`) dalam transaksi pembuatan order, batas waktu reservasi, dan pelepasan otomatis bila tidak dibayar. Untuk flash sale ditambah gerbang Redis atomik dan antrean.
2. Status dari server yang diperbarui webhook terverifikasi dan idempoten, aplikasi menampilkan status dari server (polling + push), rekonsiliasi terjadwal dengan API gateway, dan idempotency key agar retry tidak membuat pembayaran ganda.
3. Pre-warm cache dan skala, halaman statis via CDN, gerbang stok Redis, pemrosesan order lewat antrean dengan rate limit, batas per pengguna, deteksi bot/integritas aplikasi, dan klien yang memakai waktu server serta retry dengan jitter.
4. Agar perubahan harga atau alamat setelah pemesanan tidak mengubah total dan data pesanan yang sudah dibuat, dan untuk keperluan audit serta laporan.

## Practical Exercises

1. Gambar arsitektur dan data model untuk e-commerce Anda sendiri.
2. Implementasikan checkout dengan reservasi stok + job kedaluwarsa.
3. Rancang rencana kapasitas flash sale 50 ribu pengguna dalam 5 menit.

## Quick Reference

```text
Baca: CDN + Redis + search engine · tulis: transaksi DB singkat
Checkout: Idempotency-Key → harga server → order PENDING + reservasi atomik + outbox → payment → webhook → PAID
Reservasi TTL + job expire · snapshot harga/alamat · state machine order
Flash sale: pre-warm, gerbang Redis DECR, antrean, batas per user, integrity, waktu server
```

## Related Topics

- [Caching Strategy](/system-design/concepts/caching-strategy/)
- [Message Queue](/system-design/concepts/message-queue/)
- [Feed & Infinite Scroll](/system-design/mobile/feed-infinite-scroll/)
