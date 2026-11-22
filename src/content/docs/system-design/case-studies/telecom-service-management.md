---
title: "Telecom Service Management"
description: "Studi kasus sistem manajemen layanan telekomunikasi/ISP: katalog produk, pemesanan & aktivasi layanan (order-to-activate), provisioning ke perangkat jaringan, inventori aset & alamat, gangguan & tiket (trouble ticket), work order teknisi lapangan dengan aplikasi mobile offline, SLA, billing & usage, integrasi sistem legacy (OSS/BSS), serta pemantauan jaringan."
level: advanced
status: complete
version: "Konsep umum OSS/BSS. Istilah dan standar (mis. TM Forum) disederhanakan"
updated: 2026-11-13
tags: [system-design, case-study, telecom, oss-bss, field-service, workflow]
---

## Overview

Penyedia layanan telekomunikasi atau internet (ISP, penyedia jaringan korporat) mengelola siklus hidup layanan:
pelanggan memesan paket, layanan dipasang dan diaktifkan, dipantau, ditagih, dan diperbaiki saat terjadi gangguan.
Sistemnya biasanya dibagi menjadi:

- **BSS (Business Support Systems)**: produk, pesanan, pelanggan, billing.
- **OSS (Operations Support Systems)**: inventori jaringan, provisioning, monitoring, gangguan, work order lapangan.

Aplikasi mobile dipakai oleh **teknisi lapangan** (instalasi & perbaikan) dan **pelanggan** (status layanan, lapor gangguan).

## Why It Matters

Perusahaan telekomunikasi dan penyedia layanan TI (termasuk anak usaha BUMN) banyak merekrut engineer untuk sistem
seperti ini. Soal ini menguji workflow panjang dan asinkron, integrasi dengan sistem legacy, SLA, dan aplikasi
lapangan offline-first.

## Core Concepts

| Fungsional | Non-fungsional |
| --- | --- |
| Katalog produk & paket (bandwidth, harga, SLA) | Workflow panjang yang tahan gagal & dapat dilanjutkan |
| Order-to-activate: survei, instalasi, aktivasi | Integrasi dengan sistem legacy & perangkat jaringan |
| Inventori aset (ONT, router, port, kabel) & alamat | Teknisi bekerja offline di lokasi |
| Trouble ticket & work order teknisi | SLA terukur (waktu respons & pemulihan) |
| Monitoring layanan & gangguan massal | Audit setiap perubahan konfigurasi |
| Billing berdasarkan langganan/pemakaian | Ketersediaan tinggi untuk portal & API pelanggan |

| Konsep | Penjelasan |
| --- | --- |
| Service order | Permintaan aktivasi/ubah/putus layanan, terdiri dari banyak langkah |
| Provisioning | Mengonfigurasi perangkat jaringan (VLAN, profil bandwidth, aktivasi ONT) |
| Resource inventory | Aset fisik & logis serta keterkaitannya (port mana untuk pelanggan mana) |
| Trouble ticket | Laporan gangguan dengan prioritas & SLA |
| Work order | Tugas lapangan untuk teknisi (instalasi, perbaikan, survei) |
| Mass outage | Gangguan yang memengaruhi banyak pelanggan (mis. kabel feeder putus) |

## How It Works

```text
Pelanggan/sales → Order (BSS) → Workflow orchestrator:
  1. Cek coverage & alokasi resource (inventori: port ODP tersedia?)
  2. Jadwalkan survei/instalasi → Work order → aplikasi teknisi
  3. Teknisi instal, scan serial ONT, foto, tanda tangan pelanggan (offline → sinkron)
  4. Provisioning ke perangkat jaringan (adapter ke NMS/EMS vendor) → verifikasi
  5. Aktivasi billing → notifikasi pelanggan
Gangguan: monitoring/pelanggan → trouble ticket → korelasi dengan gangguan massal → work order → resolve → SLA
```

### Data model ringkas

```text
customers · sites(address, lat, lng) · products(code, bandwidth, sla_tier, price)
service_orders(id, customer_id, product_code, type: new|modify|terminate, status, current_step, version)
order_steps(order_id, step, status, attempts, started_at, completed_at, error)
services(id, customer_id, site_id, product_code, status: pending|active|suspended|terminated, activated_at)
resources(id, type: olt|odp_port|ont|router, serial, status, parent_id, location)
service_resources(service_id, resource_id)
tickets(id, service_id, category, priority, status, sla_due_at, parent_incident_id)
work_orders(id, type: install|repair|survey, ticket_id/order_id, technician_id, scheduled_at, status, version)
work_order_events(id, work_order_id, client_op_id UNIQUE, type, data_json, lat, lng, occurred_at)
```

## Implementation

### 1. Workflow order-to-activate (orchestration)

```text
Workflow durable: setiap langkah tercatat (order_steps), idempoten, dan dapat dilanjutkan setelah restart
Pilihan: tabel state + worker (BullMQ) untuk alur sederhana, atau mesin workflow (Temporal, Camunda) untuk alur panjang/bercabang
Setiap langkah punya timeout, retry, dan kompensasi:
  alokasi port gagal → batalkan order / tawarkan jadwal ulang
  provisioning gagal → retry → eskalasi ke NOC dengan konteks lengkap
  pelanggan batal setelah alokasi → lepaskan resource
```

```ts
// Langkah provisioning yang idempoten (adapter ke sistem jaringan)
async function provisionStep(orderId: string) {
  const order = await orders.get(orderId);
  const svc = await services.forOrder(orderId);
  const existing = await networkAdapter.getServiceConfig(svc.id);         // cek dulu: sudah terkonfigurasi?
  if (existing?.profile === order.productCode) return;                      // aman di-retry
  await networkAdapter.configure({ serviceId: svc.id, ontSerial: svc.ontSerial, profile: order.productCode },
    { timeoutMs: 30_000 });
}
```

### 2. Integrasi legacy dengan anti-corruption layer

```text
Sistem jaringan vendor (NMS/EMS) sering memakai SOAP/CLI/SNMP/TL1 atau API khusus dengan model sendiri
→ adapter per vendor yang menerjemahkan ke model internal (port, profil, status)
→ antrean + rate limit (perangkat jaringan tidak tahan beban tinggi) · circuit breaker · audit perintah
```

### 3. Aplikasi teknisi (Flutter, offline-first)

```text
Pagi: unduh work order hari ini + detail pelanggan + peta lokasi + checklist
Di lokasi (sering tanpa sinyal): check-in lokasi, scan barcode/QR serial ONT & kabel, foto sebelum/sesudah,
  hasil ukur (redaman optik), tanda tangan pelanggan → semua ke DB lokal + outbox (client_op_id)
Sinkron saat ada sinyal → server memvalidasi serial (resource tersedia & sesuai), memperbarui inventori, melanjutkan workflow
Update status (berangkat, tiba, selesai) memberi ETA ke pelanggan
```

### 4. Trouble ticket & SLA

```text
Ticket dari: aplikasi pelanggan, call center, atau alarm monitoring
Prioritas berdasarkan produk/SLA tier (korporat vs residensial) · sla_due_at dihitung saat dibuat (jam kerja/24x7)
Korelasi gangguan massal: banyak ticket dari ODP/OLT yang sama dalam waktu singkat → incident induk
  → notifikasi proaktif ke pelanggan terdampak, satu work order untuk akar masalah
Timer SLA → peringatan sebelum terlewat → eskalasi
```

### 5. Monitoring jaringan

```text
Telemetri perangkat (status ONT, redaman, trafik) → time-series → alarm
Alarm → dedup & korelasi topologi (bila OLT down, abaikan alarm ratusan ONT di bawahnya) → incident/ticket
Portal & aplikasi pelanggan menampilkan status layanan & gangguan di area
```

### 6. Billing

```text
Langganan bulanan + prorata saat aktivasi/ubah paket · usage (bila berbasis kuota) dari CDR/usage records
Event services.activated/terminated → billing (outbox, idempoten)
Suspend otomatis untuk tunggakan → provisioning profil "suspended" → aktif kembali setelah bayar
```

## Best Practices

- **Workflow durable & idempoten** dengan langkah tercatat.
- **Inventori sebagai sumber kebenaran** keterkaitan layanan–resource.
- **Adapter/ACL untuk sistem vendor** dengan antrean & audit.
- **Aplikasi teknisi offline-first** dengan scan serial & bukti foto.
- **SLA dihitung & dipantau otomatis**, eskalasi sebelum terlewat.
- **Korelasi gangguan massal** untuk efisiensi dan komunikasi proaktif.

## Anti-Patterns

- Alur aktivasi sebagai satu request sinkron panjang.
- Memanggil perangkat jaringan langsung dari aplikasi web/mobile.
- Data inventori di spreadsheet terpisah dari sistem order.
- Ratusan ticket individual untuk satu kabel putus tanpa korelasi.
- Aplikasi teknisi yang tidak bisa dipakai tanpa sinyal.

## Performance Considerations

Workflow berjalan asinkron dengan antrean. Provisioning dibatasi laju per perangkat/vendor. Laporan SLA & operasional
dari read model/warehouse. Sinkron aplikasi teknisi dengan delta per wilayah dan foto diunggah di background.

## Security Considerations

Perintah ke perangkat jaringan adalah operasi berisiko tinggi: otorisasi ketat, audit setiap perubahan, akses jaringan
manajemen terisolasi, dan kredensial perangkat di secret manager. Data pelanggan (alamat, lokasi) dilindungi. Aplikasi
teknisi memakai device binding, dan data lokal dihapus saat penugasan selesai/akses dicabut.

## Real-World Use Cases

- ISP fiber residensial: order online → survei → instalasi oleh teknisi dengan aplikasi Flutter → aktivasi otomatis dalam hitungan menit setelah sinkron.
- Penyedia jaringan korporat: ticket dengan SLA 4 jam, korelasi gangguan per POP, laporan SLA bulanan untuk pelanggan.

## Interview Questions

1. Bagaimana mendesain alur aktivasi layanan yang melibatkan banyak sistem dan orang?
2. Bagaimana mengintegrasikan sistem legacy vendor jaringan?
3. Bagaimana aplikasi teknisi lapangan bekerja di lokasi tanpa sinyal?
4. Bagaimana menangani gangguan massal yang memicu banyak laporan?

## Sample Answers

1. Workflow durable yang mencatat setiap langkah (alokasi resource, jadwal, instalasi, provisioning, billing), setiap langkah idempoten dengan timeout, retry, dan kompensasi, dijalankan oleh orchestrator/worker, dengan visibilitas status untuk pelanggan dan NOC.
2. Adapter/anti-corruption layer per vendor yang menerjemahkan protokol dan model mereka ke model internal, dipanggil melalui antrean dengan rate limit, circuit breaker, idempotensi (cek konfigurasi sebelum mengubah), dan audit.
3. Mengunduh work order dan data yang dibutuhkan sebelumnya, menyimpan semua aksi (check-in, scan serial, foto, tanda tangan) di DB lokal dengan outbox dan ID operasi unik, lalu sinkron idempoten saat ada sinyal, dan server memvalidasi serta melanjutkan workflow.
4. Korelasi berdasarkan topologi dan waktu menjadi satu incident induk, menautkan ticket pelanggan ke incident tersebut, memberi notifikasi proaktif ke pelanggan terdampak, dan menjalankan satu work order untuk akar masalah.

## Practical Exercises

1. Gambar state machine service order dari new hingga active, termasuk kompensasi.
2. Rancang skema sinkron work order offline beserta scan serial perangkat.
3. Rancang aturan korelasi gangguan massal berdasarkan topologi OLT/ODP.

## Quick Reference

```text
BSS (produk, order, billing) · OSS (inventori, provisioning, monitoring, ticket, work order)
Order-to-activate: workflow durable · langkah idempoten · timeout/retry/kompensasi · Temporal/BullMQ
Legacy/vendor: ACL adapter + antrean + rate limit + audit
Teknisi: offline-first · scan serial · foto · tanda tangan · outbox · validasi server
Ticket: SLA due + eskalasi · korelasi gangguan massal · notifikasi proaktif · billing via event
```

## Related Topics

- [Event-Driven Architecture](/system-design/concepts/event-driven-architecture/)
- [Customer Management (CRM)](/system-design/case-studies/customer-management/)
- [Monitoring & Notification System](/system-design/case-studies/monitoring-notification/)
