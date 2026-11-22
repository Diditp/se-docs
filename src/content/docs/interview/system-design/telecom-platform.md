---
title: "Design a Telecom Service Management Platform"
description: "Latihan system design interview: platform manajemen layanan telekomunikasi/internet — pelanggan, katalog layanan, order & provisioning, inventaris jaringan, monitoring & tiket gangguan, billing, aplikasi pelanggan & teknisi, integrasi, dan trade-off."
level: advanced
status: complete
updated: 2026-11-12
tags: [interview, system-design, telecom, provisioning, integration, event-driven]
---

## Overview

Soal: **"Rancang platform untuk mengelola layanan internet/telekomunikasi pelanggan korporat dan ritel: dari
pemesanan, aktivasi, monitoring, sampai penanganan gangguan."** Soal ini luas, jadi kuncinya adalah **membatasi scope**,
membagi sistem menjadi **domain yang jelas**, dan menunjukkan **alur end-to-end** satu skenario secara mendalam.

:::caution
Halaman ini adalah latihan desain generik untuk domain telekomunikasi, bukan deskripsi sistem perusahaan tertentu.
Gunakan sebagai kerangka berpikir dan sesuaikan dengan informasi resmi tentang perusahaan yang Anda lamar.
:::

## Why It Matters

Perusahaan penyedia layanan jaringan dan solusi TI menjalankan proses seperti ini setiap hari. Soal ini menguji
kemampuan memecah sistem besar, merancang integrasi antar-sistem (termasuk sistem lama), menangani proses jangka
panjang (provisioning berhari-hari), dan memastikan observability.

## Core Concepts

### Domain (bounded context)

| Domain | Tanggung jawab |
| --- | --- |
| Customer | Data pelanggan, kontak, lokasi layanan |
| Product Catalog | Paket layanan (bandwidth, SLA, harga) |
| Order Management | Pemesanan, perubahan paket, pemutusan |
| Provisioning / Fulfillment | Survei, instalasi, konfigurasi perangkat, aktivasi |
| Network Inventory | Perangkat, port, kapasitas, lokasi |
| Service Assurance | Monitoring, alarm, tiket gangguan, SLA |
| Billing | Tagihan, pembayaran, rating |
| Field Service | Penugasan & aplikasi teknisi |
| Channels | Aplikasi pelanggan, portal korporat, CS |

### Proses jangka panjang: order-to-activation

```text
Order dibuat → cek kelayakan (coverage & kapasitas) → survei lokasi → reservasi port/kapasitas
→ instalasi oleh teknisi → konfigurasi perangkat → uji layanan → aktivasi → mulai billing → notifikasi pelanggan
```

Setiap langkah bisa gagal/tertunda berhari-hari → dimodelkan sebagai **workflow/saga** dengan state yang tersimpan,
bukan satu transaksi besar.

## How It Works

```text
Channels: Aplikasi pelanggan (Flutter) · Portal korporat · CS web · Aplikasi teknisi (Flutter)
                              │
                     API Gateway (auth, rate limit, routing)
                              │
 ┌──────────┬──────────┬──────┴─────┬──────────────┬──────────────┬──────────┐
 Customer  Catalog   Order Mgmt   Provisioning   Assurance       Billing   Field Service
 service   service   service      orchestrator   (alarm→tiket)   service   service
   │          │          │             │               │             │          │
   └──────────┴──────────┴──── Event bus / message broker ─────────┴──────────┘
                                       │
                 Adapter ke sistem eksternal/legacy: NMS/EMS jaringan, ERP, payment gateway
Observability: log terpusat, metrik, tracing, dashboard SLA
```

## Implementation

### Saga provisioning (orchestration)

```ts
type Step = 'CHECK_FEASIBILITY' | 'RESERVE_RESOURCE' | 'SCHEDULE_INSTALL' | 'CONFIGURE' | 'TEST' | 'ACTIVATE';

async function onStepCompleted(orderId: string, step: Step, result: StepResult) {
  const wf = await workflows.get(orderId);
  if (!result.ok) return compensate(wf, step, result.error);   // mis. lepas reservasi port
  const next = nextStep(step);
  if (!next) {
    await bus.publish({ type: 'ServiceActivated', orderId, serviceId: wf.serviceId });   // billing & notifikasi bereaksi
    return workflows.complete(orderId);
  }
  await workflows.advance(orderId, next);
  await commands.send(next, { orderId, correlationId: wf.correlationId });              // idempoten per (orderId, step)
}
```

| Langkah gagal | Kompensasi |
| --- | --- |
| Kapasitas tidak tersedia | Tandai order "menunggu kapasitas", notifikasi sales |
| Instalasi gagal (akses lokasi) | Jadwal ulang, hubungi pelanggan |
| Konfigurasi gagal | Retry, eskalasi ke tim jaringan, reservasi tetap ditahan dengan batas waktu |
| Order dibatalkan | Lepas reservasi port, batalkan jadwal teknisi |

### Service assurance: dari alarm ke tiket

```text
Perangkat jaringan → NMS → alarm (link down site X)
→ Assurance service: korelasi (ratusan alarm turunan → 1 insiden induk)
→ Identifikasi layanan & pelanggan terdampak (dari network inventory)
→ Buat tiket induk + tiket anak / notifikasi proaktif ke pelanggan korporat
→ Penugasan teknisi → resolusi → hitung SLA per pelanggan
```

### Integrasi dengan sistem lama

- **Anti-corruption layer / adapter** menerjemahkan model sistem lama ke model domain baru.
- Pola **outbox + CDC** atau polling terjadwal bila sistem lama tidak mendukung event.
- **Idempotency & correlation ID** di setiap pesan untuk tracing lintas sistem.
- Mulai dengan **strangler pattern**: fitur baru di platform baru, sistem lama dipindahkan bertahap.

### Aplikasi mobile

| Aplikasi | Fitur utama |
| --- | --- |
| Pelanggan | Status layanan, lapor gangguan, lacak tiket & teknisi, tagihan, notifikasi gangguan proaktif |
| Teknisi | Daftar tugas, navigasi, checklist instalasi, foto, tanda tangan, offline-first |

## Best Practices

- **Batasi scope di awal interview** (mis. fokus order-to-activation + gangguan).
- **Bagi berdasarkan domain**, tetapi mulai dari **modular monolith** bila tim kecil; pecah menjadi service saat ada alasan (skala, tim, deploy terpisah).
- **Workflow/saga eksplisit** untuk proses panjang, dengan state yang dapat dipantau.
- **Event-driven** untuk mengurangi coupling antar domain.
- **Correlation ID & tracing** untuk proses lintas sistem.
- **Single source of truth per data** (pelanggan di Customer, perangkat di Inventory).

## Anti-Patterns

- Satu database bersama yang diakses semua service tanpa batas kepemilikan.
- Distributed transaction (2PC) lintas banyak sistem untuk proses berhari-hari.
- Integrasi point-to-point tanpa adapter → perubahan sistem lama merusak semua.
- Microservices sejak hari pertama tanpa kemampuan operasional (monitoring, CI/CD, on-call).

## Performance Considerations

- Badai alarm: deduplikasi & korelasi sebelum membuat tiket; queue sebagai buffer.
- Query "pelanggan terdampak" memerlukan model topologi yang efisien (index/graph).
- Dashboard SLA dari read model yang diperbarui oleh event.
- Aplikasi pelanggan: cache status layanan; push notification saat insiden alih-alih polling.

## Security Considerations

- Akses berbasis peran & tenant (pelanggan korporat hanya melihat layanannya).
- Segmentasi jaringan antara platform aplikasi dan jaringan manajemen perangkat.
- Kredensial perangkat jaringan di vault; audit setiap perubahan konfigurasi.
- Perlindungan data pribadi pelanggan sesuai regulasi yang berlaku (mis. UU Pelindungan Data Pribadi di Indonesia).

## Real-World Use Cases

- Penyedia layanan internet/konektivitas untuk korporat dan ritel.
- Operator jaringan yang mengelola aktivasi layanan dan gangguan.
- Penyedia layanan TI terkelola dengan SLA kontrak.

## Interview Questions

1. Bagaimana Anda membagi sistem sebesar ini?
2. Bagaimana menangani proses aktivasi yang memakan waktu berhari-hari?
3. Bagaimana menangani ribuan alarm akibat satu gangguan?
4. Bagaimana mengintegrasikan dengan sistem lama yang tidak bisa diubah?
5. Apa yang dibutuhkan aplikasi teknisi dan pelanggan?

## Sample Answers

1. Berdasarkan domain bisnis (customer, catalog, order, provisioning, inventory, assurance, billing, field service), masing-masing memiliki datanya; komunikasi lewat API dan event; mulai sebagai modular monolith bila tim kecil.
2. Workflow/saga orchestration dengan state tersimpan per order, langkah idempoten, timeout & retry, kompensasi untuk langkah gagal, dan dashboard status order.
3. Korelasi alarm (berdasarkan topologi & waktu) menjadi satu insiden induk, deduplikasi, buffer dengan queue, lalu tiket induk–anak dan notifikasi proaktif ke pelanggan terdampak.
4. Adapter/anti-corruption layer, integrasi via file/DB/API yang tersedia dengan outbox/CDC atau polling, idempotency dan rekonsiliasi berkala, migrasi bertahap dengan strangler pattern.
5. Pelanggan: status layanan, lapor & lacak gangguan, tagihan, notifikasi. Teknisi: tugas, navigasi, checklist, foto, tanda tangan, offline-first dengan sinkronisasi idempoten.

## Practical Exercises

1. Gambar sequence diagram order-to-activation termasuk satu skenario gagal dan kompensasinya.
2. Rancang data model sederhana network inventory (site, perangkat, port, layanan pelanggan).
3. Tentukan metrik dan alert untuk memantau kesehatan proses provisioning.

## Quick Reference

```text
Batasi scope → domain (customer, catalog, order, provisioning, inventory, assurance, billing, field)
Proses panjang = saga + state + kompensasi · event bus · correlation ID · outbox
Alarm storm → korelasi + dedup → tiket induk/anak · legacy → adapter + strangler
Mulai modular monolith · pecah saat ada alasan
```

## Related Topics

- [Telecom Service Management (case study)](/system-design/case-studies/telecom-service-management/)
- [Event-Driven Architecture](/system-design/concepts/event-driven-architecture/)
- [Design a Ticketing Application](/interview/system-design/ticketing-app/)
- [System Design untuk Mobile Engineer](/interview/company-prep/system-design/)
