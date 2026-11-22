---
title: "System Design untuk Mobile Engineer"
description: "Persiapan system design dari sudut pandang mobile engineer: kerangka menjawab, komponen dasar, dan dua latihan lengkap yang umum di banyak industri (telko, utilitas, logistik, ritel) — aplikasi pelaporan gangguan pelanggan dan aplikasi petugas lapangan offline-first."
level: intermediate
status: complete
updated: 2026-11-13
tags: [interview, company-prep, system-design, architecture]
---

## Overview

Untuk kandidat dengan pengalaman 2–4 tahun, system design interview biasanya berbentuk diskusi 30–45 menit:
"rancang sistem X". Yang dinilai: kemampuan **mengklarifikasi kebutuhan, membuat estimasi, memilih komponen dengan
alasan, menjelaskan alur data, dan memikirkan kegagalan serta keamanan**. Halaman ini memberikan dua latihan dengan
porsi mobile yang besar — pola yang muncul di banyak industri (telekomunikasi, utilitas, logistik, ritel, layanan
lapangan).

:::note
Kasus di halaman ini adalah **latihan hipotetis** untuk mengasah cara berpikir, bukan gambaran sistem internal perusahaan mana pun.
:::

## Why It Matters

System design membedakan "pengembang fitur" dan "software engineer". Pengalaman Anda membangun aplikasi transaksi dan
offline-first adalah modal kuat — latihan di sini membantu Anda mengekspresikannya dalam skala sistem.

## Core Concepts

Kerangka 6 langkah (detail: [Framework Menjawab System Design](/interview/system-design/framework/)):

1. Klarifikasi requirement (fungsional & non-fungsional).
2. Estimasi skala.
3. API & data model.
4. Diagram high-level.
5. Deep dive 1–2 komponen kritis.
6. Trade-off, failure mode, keamanan, monitoring.

Komponen dasar: client, load balancer/API gateway, service stateless, database relasional (+ replica), cache, message
queue + worker, object storage, push notification, observability.

## How It Works

### Latihan 1 — Sistem pelaporan gangguan layanan internet pelanggan

**Requirement**

- Pelanggan melapor gangguan lewat app/web, melihat status tiket, menerima notifikasi.
- Sistem mengecek status jaringan area: jika ada gangguan massal, tiket ditautkan ke *incident* induk dan pelanggan diberi info proaktif.
- Dispatcher menugaskan teknisi; teknisi memperbarui status dari lapangan.
- NFR: tetap menerima laporan saat lonjakan (gangguan massal = lonjakan 10–50×), status terlihat dalam detik, data pelanggan terlindungi, audit lengkap.

**Estimasi (asumsi)**: 3 juta pelanggan; normal 20 ribu tiket/hari (≈0,25/detik), puncak gangguan massal 50 ribu laporan dalam 1 jam (≈14/detik, burst lebih tinggi). Baca status jauh lebih banyak dari tulis.

**Data model inti**

```text
customers(id, customer_no, ...) · services(id, customer_id, area_id, package, status)
incidents(id, area_id, type, status, started_at, resolved_at)              -- gangguan massal
tickets(id, service_id, incident_id NULL, category, status, created_at, ...)
work_orders(id, ticket_id, technician_id, status, scheduled_at, ...)
ticket_events(id, ticket_id, status, actor, created_at)                    -- audit & timeline
```

**Arsitektur**

```text
App/Web → CDN (status gangguan area, cache singkat) → API Gateway (auth, rate limit per pelanggan)
  → Ticket API (stateless, autoscale) → PostgreSQL (tickets, incidents) + Redis (status area, dedup)
  → Queue: TicketCreated / StatusChanged
       ├── Correlation worker: kelompokkan laporan per area → buat/tautkan incident
       ├── Dispatch service: buat work order, assign teknisi
       └── Notification worker: push/SMS/WA dengan dedup & rate limit
  Monitoring jaringan (NMS) → event "area X down" → incident otomatis → banner di app
```

**Deep dive: lonjakan saat gangguan massal**

- API menerima laporan cepat (validasi + insert + publish) lalu `201`; korelasi berjalan async di worker.
- Dedup: satu pelanggan + satu layanan + satu incident aktif = satu tiket (unique constraint parsial).
- Info proaktif: status area dibaca dari cache/CDN → banyak pelanggan tidak perlu membuat tiket.
- Rate limit per pelanggan dan autoscaling API berdasarkan latency/queue depth.

### Latihan 2 — Aplikasi teknisi lapangan (work order) offline-first

**Requirement**: teknisi menerima work order (instalasi/perbaikan), bekerja di lokasi dengan sinyal buruk, mengisi
checklist, mengambil foto, tanda tangan pelanggan, dan menutup pekerjaan; dispatcher memantau progres.

```text
App teknisi (Flutter + Drift): work orders lokal, checklist, foto (file) + outbox
  ── sync (push outbox idempotent, pull by cursor) ──► Field API → PostgreSQL
  ── upload foto (resumable/multipart, retry) ──────► Object storage (URL bertanda tangan)
Status work order = state machine di server: ASSIGNED → ON_THE_WAY → ON_SITE → DONE / FAILED
Dispatcher dashboard ← WebSocket/SSE untuk perubahan status
```

Deep dive: transisi status divalidasi server (tidak bisa DONE tanpa foto & tanda tangan), konflik status diselesaikan
dengan aturan state machine, foto dikompres di device, upload dipisah dari sync data agar data kecil tidak tertahan file besar.

## Implementation

### Endpoint inti latihan 1

```text
POST /v1/tickets                         { service_id, category, description }   → 201 (atau 200 tiket existing)
GET  /v1/tickets?status=active                                                     → tiket milik pelanggan
GET  /v1/areas/{areaId}/status                                                     → status gangguan (cacheable)
POST /v1/work-orders/{id}/transitions    { to: "ON_SITE", at, location }           → 200 / 409 transisi tidak valid
```

### Unique constraint untuk dedup tiket aktif

```sql
CREATE UNIQUE INDEX uq_tickets_active_per_service
  ON tickets (service_id)
  WHERE status IN ('OPEN', 'IN_PROGRESS');
```

## Best Practices

- Mulai dengan klarifikasi; nyatakan asumsi angka.
- Pisahkan **jalur tulis cepat** dari **pemrosesan async** saat ada lonjakan.
- Gunakan **cache/CDN** untuk data baca yang sama bagi banyak user (status area).
- **Idempotency & dedup** untuk laporan dan sync.
- **State machine di server** untuk status pekerjaan.
- Sebutkan **keamanan & privasi** (otorisasi per pelanggan, data pribadi, audit) dan **observability**.

## Anti-Patterns

- Langsung menggambar microservices tanpa requirement.
- Semua pekerjaan (notifikasi, korelasi) dilakukan sinkron di request.
- Mengabaikan skenario offline untuk aplikasi lapangan.
- Tidak membahas apa yang terjadi jika komponen gagal.

## Performance Considerations

- Read-heavy → cache & replica; write burst → queue sebagai buffer.
- Upload foto langsung ke object storage dengan URL bertanda tangan (tidak melewati API).
- Pagination & index `(service_id, created_at)`; partisi tabel event per bulan.

## Security Considerations

- Pelanggan hanya melihat tiket layanannya (object-level authorization).
- Teknisi hanya melihat work order yang ditugaskan; data pelanggan diminimalkan di device dan dihapus setelah selesai.
- Foto & tanda tangan di storage privat; URL berumur pendek.
- Audit log untuk setiap perubahan status.

## Real-World Use Cases

Pola yang sama berlaku untuk: helpdesk TI internal, laporan kerusakan fasilitas, inspeksi aset, dan layanan purna jual —
semuanya kombinasi tiket, penugasan, status, notifikasi, dan (sering) kerja lapangan offline.

## Interview Questions

1. Rancang sistem pelaporan gangguan untuk jutaan pelanggan.
2. Bagaimana sistem Anda bertahan saat gangguan massal memicu lonjakan laporan?
3. Bagaimana aplikasi teknisi tetap bekerja tanpa sinyal?
4. Bagaimana mencegah tiket duplikat?
5. Bagaimana dispatcher melihat status teknisi secara real-time?

## Sample Answers

1. Gunakan kerangka 6 langkah: klarifikasi (pelapor, teknisi, dispatcher, NFR lonjakan & privasi), estimasi, API & data model (tickets, incidents, work_orders, events), arsitektur (gateway, API stateless, PostgreSQL, Redis, queue + worker korelasi/dispatch/notifikasi), deep dive lonjakan, lalu failure & keamanan.
2. Jalur tulis ringan + async worker, dedup per layanan & incident, status area di cache/CDN untuk mencegah laporan baru, rate limit, autoscaling, dan degradasi fitur non-esensial.
3. Offline-first: work order & checklist di DB lokal, outbox sinkron idempotent, foto disimpan lokal lalu diunggah terpisah dengan retry, status divalidasi server saat sync.
4. Unique index parsial pada tiket aktif per layanan, endpoint create bersifat idempotent (mengembalikan tiket yang ada), dan korelasi ke incident induk.
5. Teknisi mengirim transisi status (saat online) ke API; event dipublikasikan ke queue; dashboard berlangganan via WebSocket/SSE; status terakhir juga tersedia lewat query untuk reconnect.

## Practical Exercises

1. Kerjakan latihan 1 dengan timer 40 menit, lalu bandingkan dengan uraian di atas.
2. Gambar sequence diagram transisi `ON_SITE → DONE` termasuk upload foto offline.
3. Tulis estimasi kapasitas versi Anda sendiri dengan asumsi berbeda dan jelaskan dampaknya pada desain.

## Quick Reference

```text
Klarifikasi → Estimasi → API & Data → Diagram → Deep dive → Trade-off/Failure/Security
Lonjakan: tulis cepat + queue + dedup + cache status + rate limit + autoscale
Lapangan: offline-first + outbox + upload terpisah + state machine server
Selalu: idempotency · otorisasi per objek · audit · observability
```

## Related Topics

- [System Design Fundamentals](/system-design/concepts/fundamentals/)
- [Framework Menjawab System Design](/interview/system-design/framework/)
- [Design a Telecom Service Management Platform](/interview/system-design/telecom-platform/)
- [Offline-First Application](/flutter/offline-first/)
