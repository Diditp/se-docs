---
title: "Monolithic vs Microservices"
description: "Membandingkan monolith, modular monolith, dan microservices secara jujur: kelebihan dan biaya masing-masing, kapan memecah layanan, batas layanan berdasarkan domain, kepemilikan data per layanan, komunikasi sinkron vs asinkron, transaksi lintas layanan (saga), migrasi bertahap dengan strangler fig, serta dampaknya bagi tim dan aplikasi mobile."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, monolith, microservices, modular-monolith, architecture]
---

## Overview

- **Monolith**: satu aplikasi yang di-deploy sebagai satu unit, biasanya dengan satu database.
- **Modular monolith**: satu unit deploy, tetapi dibagi menjadi modul dengan batas yang tegas (API internal, data milik modul).
- **Microservices**: banyak layanan kecil yang di-deploy terpisah, masing-masing memiliki datanya sendiri dan berkomunikasi lewat jaringan.

## Why It Matters

"Monolith atau microservices?" adalah pertanyaan interview yang menguji kedewasaan teknis. Jawaban terbaik hampir selalu:
**mulai dari modular monolith**, pecah layanan hanya ketika ada alasan terukur, karena microservices menukar kompleksitas
kode dengan kompleksitas sistem terdistribusi.

## Core Concepts

| Aspek | Monolith / Modular monolith | Microservices |
| --- | --- | --- |
| Deploy | Satu unit | Independen per layanan |
| Transaksi | ACID dalam satu DB | Lintas layanan → eventual consistency, saga |
| Komunikasi | Pemanggilan fungsi | Jaringan (latensi, kegagalan parsial) |
| Debugging | Satu proses, satu log | Distributed tracing wajib |
| Skala | Seluruh aplikasi | Per layanan sesuai beban |
| Tim | Cocok untuk tim kecil–sedang | Cocok untuk banyak tim otonom |
| Operasional | Sederhana | CI/CD, observability, platform yang matang |
| Kegagalan | Bug bisa menjatuhkan semua | Terisolasi bila desain benar, tetapi lebih banyak titik gagal |

### Alasan yang sah untuk memecah layanan

```text
- Beban atau kebutuhan skala sangat berbeda (mis. pemrosesan gambar vs CRUD)
- Tim berbeda yang sering saling menghambat deploy
- Kebutuhan isolasi (keamanan/kepatuhan, misalnya pembayaran)
- Teknologi berbeda yang benar-benar dibutuhkan
- Siklus rilis berbeda
Bukan alasan: "lebih modern", "agar bisa pakai Kubernetes", resume-driven development
```

## How It Works

### Modular monolith yang siap dipecah

```text
src/
  modules/
    catalog/   (api.ts publik, domain/, data/)  ← modul lain hanya boleh memakai api.ts
    orders/
    payments/
    inventory/
  shared/      (kernel kecil: types, errors, logging)
Aturan: tidak ada import ke folder internal modul lain · tabel dimiliki satu modul · komunikasi via API internal atau event
```

Batas yang tegas ini membuat pemecahan menjadi layanan terpisah kelak relatif mudah, karena hanya memindahkan modul dan
mengganti pemanggilan fungsi dengan HTTP/event.

## Implementation

### Kepemilikan data per layanan

```text
❌ Shared database: order-service men-JOIN tabel milik catalog-service → perubahan skema saling merusak
✅ Setiap layanan memiliki tabelnya. Butuh data lain → API, atau salinan read-only yang diperbarui lewat event
```

### Sinkron vs asinkron

| Gaya | Contoh | Risiko |
| --- | --- | --- |
| Sinkron (HTTP/gRPC) | Order memanggil inventory untuk reservasi stok | Kegagalan berantai, latensi bertambah |
| Asinkron (event) | `order.paid` → loyalty, notifikasi, akuntansi | Konsistensi eventual, debugging lebih sulit |

### Saga untuk proses lintas layanan

```text
Checkout (orchestration):
1. order-service: buat order PENDING
2. inventory-service: reservasi stok        → gagal? batalkan order
3. payment-service: tagih                    → gagal? lepaskan reservasi (kompensasi) + batalkan order
4. order-service: tandai PAID → event order.paid
Setiap langkah idempoten. Setiap langkah punya aksi kompensasi.
```

### Migrasi bertahap: strangler fig

```text
1. Letakkan gateway di depan monolith
2. Bangun fitur/layanan baru di luar monolith
3. Arahkan route tertentu ke layanan baru (mis. /v1/notifications)
4. Pindahkan data & logika secara bertahap, verifikasi dengan metrik
5. Hapus kode lama di monolith
Tidak ada "big bang rewrite"
```

### Dampak bagi aplikasi mobile

```text
- Gunakan gateway/BFF agar aplikasi tidak memanggil banyak layanan langsung
- Kontrak API stabil walau backend dipecah
- Kegagalan parsial lebih sering terjadi → UI harus menangani sebagian data kosong
- Request ID lintas layanan memudahkan menelusuri keluhan pengguna
```

## Best Practices

- **Mulai dari modular monolith** dengan batas modul yang ditegakkan (lint/arsitektur test).
- **Pecah berdasarkan domain bisnis** (bounded context), bukan lapisan teknis.
- **Satu pemilik data per layanan**.
- **Utamakan komunikasi asinkron** untuk efek samping. Sinkron hanya bila respons dibutuhkan.
- **Siapkan platform dulu**: CI/CD per layanan, tracing, logging terpusat, alert.
- **Catat keputusan di ADR**.

## Anti-Patterns

- *Distributed monolith*: banyak layanan yang harus di-deploy bersamaan dan berbagi database.
- Layanan terlalu kecil (*nanoservices*) sehingga satu fitur memerlukan banyak panggilan jaringan.
- Rantai panggilan sinkron panjang (A → B → C → D).
- Rewrite total dari monolith ke microservices sekaligus.
- Memecah layanan sebelum batas domain dipahami.

## Performance Considerations

Panggilan fungsi dalam proses berlangsung dalam nanodetik, sedangkan panggilan jaringan dalam milidetik dan bisa gagal.
Microservices dapat diskalakan per bagian, tetapi menambah latensi dan biaya serialisasi. Batching, caching, dan
event-driven read model mengurangi panggilan lintas layanan.

## Security Considerations

Lebih banyak layanan berarti lebih banyak permukaan serangan: autentikasi antar layanan (mTLS/token), prinsip least
privilege per layanan dan database, serta manajemen secret terpusat. Pemisahan layanan pembayaran dapat mempersempit
cakupan audit kepatuhan.

## Real-World Use Cases

- Startup POS: modular monolith Node.js + PostgreSQL. Satu-satunya layanan terpisah adalah worker pemrosesan laporan & notifikasi.
- Perusahaan besar dengan puluhan tim: microservices per domain dengan gateway, event bus, dan platform internal.

## Interview Questions

1. Apa kelebihan dan kekurangan microservices dibanding monolith?
2. Kapan Anda memecah monolith menjadi microservices?
3. Apa itu modular monolith?
4. Bagaimana menangani transaksi yang melibatkan beberapa layanan?
5. Apa itu distributed monolith?

## Sample Answers

1. Microservices memberi deploy dan skala independen, isolasi kegagalan, dan otonomi tim. Biayanya: kompleksitas jaringan, konsistensi eventual, debugging terdistribusi, dan kebutuhan platform operasional yang matang.
2. Ketika ada alasan terukur: kebutuhan skala yang sangat berbeda, banyak tim yang saling menghambat deploy, kebutuhan isolasi keamanan, atau siklus rilis berbeda. Batas domain juga harus sudah dipahami.
3. Satu aplikasi yang di-deploy sebagai satu unit, tetapi dibagi ke modul dengan batas tegas: API publik per modul, data dimiliki modul, dan tidak ada akses langsung ke internal modul lain.
4. Hindari transaksi terdistribusi (2PC). Gunakan saga, yaitu urutan transaksi lokal dengan aksi kompensasi bila langkah gagal, ditambah outbox dan consumer idempoten untuk event.
5. Sistem yang terlihat seperti microservices tetapi saling terikat erat: berbagi database, harus di-deploy bersama, dan memiliki rantai panggilan sinkron. Ini mendapat biaya microservices tanpa manfaatnya.

## Practical Exercises

1. Petakan modul aplikasi Anda dan aturan dependensi antar modul.
2. Tulis ADR: alasan (atau tidak) memisahkan satu modul menjadi layanan.
3. Rancang saga checkout dengan aksi kompensasi.

## Quick Reference

```text
Default: modular monolith (batas modul tegas, data per modul)
Pecah bila: skala berbeda · tim saling menghambat · isolasi · siklus rilis berbeda
Data per layanan · async untuk efek samping · saga + kompensasi, bukan 2PC
Strangler fig untuk migrasi · hindari distributed monolith & nanoservices
Mobile: gateway/BFF, kontrak stabil, tangani kegagalan parsial
```

## Related Topics

- [Modular & Layered Architecture](/system-design/concepts/modular-layered-architecture/)
- [Event-Driven Architecture](/system-design/concepts/event-driven-architecture/)
- [API Gateway](/system-design/concepts/api-gateway/)
