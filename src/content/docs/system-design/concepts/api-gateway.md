---
title: "API Gateway"
description: "API Gateway dan Backend-for-Frontend: fungsi gateway (routing, autentikasi, rate limiting, TLS, transformasi, observability), perbedaan dengan load balancer dan service mesh, pola BFF untuk mobile, agregasi, versi & kompatibilitas aplikasi lama, risiko gateway gemuk, serta pilihan implementasi (terkelola, Kong/Envoy, atau layer Node.js sendiri)."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, api-gateway, bff, rate-limiting, microservices]
---

## Overview

**API Gateway** adalah pintu masuk tunggal untuk klien ke kumpulan layanan backend. Gateway menangani hal lintas
layanan (*cross-cutting concerns*) seperti routing, autentikasi, rate limiting, dan logging, sehingga setiap layanan tidak
perlu mengulanginya.

**Backend-for-Frontend (BFF)** adalah variasi gateway yang dibuat khusus untuk satu jenis klien (mis. aplikasi mobile),
sehingga respons dibentuk sesuai kebutuhan layar.

## Why It Matters

Aplikasi mobile sulit di-update serentak dan berjalan di jaringan lambat. Gateway/BFF memungkinkan backend berubah tanpa
merusak aplikasi lama, serta mengurangi jumlah request per layar. Ini sering muncul dalam soal system design aplikasi
mobile skala besar.

## Core Concepts

| Fungsi gateway | Contoh |
| --- | --- |
| Routing | `/v1/orders/*` → order-service, `/v1/catalog/*` → catalog-service |
| Autentikasi | Verifikasi JWT sekali, teruskan identitas ke layanan |
| Rate limiting & kuota | Per pengguna, per API key, per IP |
| TLS termination | Sertifikat publik di satu tempat |
| Transformasi | Header, versi, format respons |
| Observability | Request ID, log akses, metrik latensi per route |
| Caching | Respons publik yang aman di-cache |

| Komponen | Fokus |
| --- | --- |
| Load balancer | Membagi trafik ke instance sehat |
| API gateway | Kebijakan API untuk trafik masuk dari klien (north-south) |
| BFF | Bentuk respons spesifik klien, agregasi |
| Service mesh | Komunikasi antar layanan internal (east-west): mTLS, retry, observability |

## How It Works

```text
Aplikasi mobile → API Gateway (TLS, auth, rate limit, request ID)
               → BFF mobile (agregasi: profil + order aktif + promo untuk layar beranda)
               → order-service / catalog-service / promo-service
```

## Implementation

### BFF untuk layar beranda (Node.js)

```ts
app.get('/mobile/v1/home', { preHandler: [authenticate] }, async (req) => {
  const [profile, activeOrders, promos] = await Promise.allSettled([
    userService.profile(req.user.id),
    orderService.active(req.user.id, { limit: 3 }),
    promoService.forUser(req.user.id),                        // non-kritis
  ]);

  if (profile.status === 'rejected') throw profile.reason;    // kritis → gagal
  return {
    user: { name: profile.value.name, tier: profile.value.tier },
    activeOrders: activeOrders.status === 'fulfilled' ? activeOrders.value.map(toOrderCard) : [],
    promos: promos.status === 'fulfilled' ? promos.value.slice(0, 5) : [],    // degradasi bertahap
  };
});
```

Satu request dari aplikasi menggantikan tiga, dan kegagalan layanan promo tidak menggagalkan layar beranda.

### Kompatibilitas aplikasi versi lama

```text
- Aplikasi mengirim header X-App-Version dan X-Platform
- BFF memetakan respons baru ke format lama selama versi lama masih dipakai
- Gateway mengembalikan 426 / kode khusus untuk versi di bawah min_supported_version → aplikasi menampilkan force update
- Pantau distribusi versi aplikasi sebelum menghapus dukungan
```

### Rate limiting di gateway

```text
Batas berbeda per kelas endpoint: login/OTP ketat, baca katalog longgar, tulis order sedang
Respons 429 + Retry-After. Aplikasi mobile menghormati Retry-After dan tidak retry agresif
```

### Pilihan implementasi

| Opsi | Kapan |
| --- | --- |
| Gateway terkelola (AWS API Gateway, Google API Gateway/Apigee, Azure APIM) | Ingin minim operasional |
| Self-hosted (Kong, Envoy, Traefik, Nginx) | Kontrol penuh, multi-cloud |
| Layer Node.js sendiri (BFF) | Logika agregasi spesifik aplikasi |
| Tanpa gateway (monolith + reverse proxy) | Sistem kecil. Middleware di aplikasi sudah cukup |

## Best Practices

- **Gateway tipis**: kebijakan lintas layanan saja, logika bisnis tetap di layanan.
- **BFF per jenis klien** bila kebutuhannya sangat berbeda (mobile vs web vs partner).
- **Degradasi bertahap** saat agregasi (bagian non-kritis boleh kosong).
- **Header versi aplikasi + kebijakan dukungan versi**.
- **Redundansi gateway** karena menjadi titik masuk tunggal.
- **Request ID dibuat di gateway** dan diteruskan ke semua layanan.

## Anti-Patterns

- Gateway berisi logika bisnis sehingga menjadi monolith tersembunyi.
- Satu BFF untuk semua klien yang penuh kondisi `if (platform == ...)`.
- Layanan internal yang mempercayai header identitas dari internet tanpa memastikan request datang dari gateway.
- Gateway dengan timeout lebih panjang dari klien sehingga request tetap diproses setelah klien menyerah.

## Performance Considerations

Gateway menambah satu hop jaringan, jadi letakkan dekat dengan layanan dan gunakan koneksi keep-alive. Agregasi di BFF
mengurangi round-trip mobile yang mahal (latensi seluler 100+ ms per request). Gunakan `Promise.allSettled` dengan
timeout per dependensi agar satu layanan lambat tidak menahan seluruh respons.

## Security Considerations

Gateway adalah lapisan pertahanan pertama (auth, rate limit, ukuran body, WAF), tetapi **bukan satu-satunya**:
layanan tetap menegakkan otorisasi objek. Jaringan internal dikunci agar layanan hanya bisa diakses melalui gateway,
idealnya dengan mTLS atau token internal.

## Real-World Use Cases

- Super-app: gateway untuk auth & rate limit, BFF mobile untuk beranda, BFF web untuk dashboard merchant.
- Migrasi monolith ke layanan: gateway mengarahkan route tertentu ke layanan baru secara bertahap (strangler fig).

## Interview Questions

1. Apa fungsi API gateway dan bedanya dengan load balancer?
2. Apa itu Backend-for-Frontend dan kapan dipakai?
3. Bagaimana gateway membantu kompatibilitas aplikasi mobile versi lama?
4. Apa risiko API gateway?

## Sample Answers

1. Gateway menangani kebijakan API lintas layanan (routing berdasarkan path, autentikasi, rate limiting, transformasi, observability). Load balancer membagi trafik ke instance sehat dari satu layanan. Keduanya sering dipakai bersama.
2. Lapisan API khusus satu jenis klien yang mengagregasi data dari beberapa layanan dan membentuk respons sesuai layar. Berguna saat kebutuhan mobile berbeda dari web dan ingin mengurangi round-trip.
3. Dengan membaca versi aplikasi dari header, memetakan respons ke format yang dipahami versi lama, dan memberlakukan versi minimum yang didukung untuk memicu force update.
4. Menjadi single point of failure dan bottleneck bila tidak redundant, menambah latensi, dan berubah menjadi monolith tersembunyi bila diisi logika bisnis.

## Practical Exercises

1. Rancang endpoint BFF untuk layar beranda aplikasi Anda dan bandingkan jumlah request sebelum/sesudah.
2. Tentukan kebijakan rate limit untuk lima kelas endpoint.
3. Buat kebijakan dukungan versi aplikasi (berapa lama versi lama didukung).

## Quick Reference

```text
Gateway = pintu masuk: routing · auth · rate limit · TLS · request ID · observability
BFF = API per klien: agregasi · bentuk respons · kompatibilitas versi
LB (bagi trafik) · gateway (north-south) · service mesh (east-west)
Gateway tipis · redundan · allSettled + timeout · layanan tetap cek otorisasi
```

## Related Topics

- [Backend Ringan untuk Mobile Developer](/backend/backend-for-mobile/)
- [Monolithic vs Microservices](/system-design/concepts/monolith-vs-microservices/)
- [Rate Limiting](/backend/rate-limiting/)
