---
title: "Framework Menjawab System Design"
description: "Langkah dan manajemen waktu untuk menjawab soal system design interview selama 45–60 menit, dengan checklist pertanyaan klarifikasi, contoh percakapan, dan rubrik penilaian."
level: intermediate
status: complete
updated: 2026-11-07
tags: [interview, system-design, communication]
---

## Overview

Soal system design sengaja **ambigu** ("Desain aplikasi ticketing gangguan pelanggan"). Interviewer menilai bagaimana Anda
**menyusun masalah, membuat asumsi yang masuk akal, merancang, dan menimbang trade-off** sambil berkomunikasi — bukan
apakah Anda menyebut teknologi tertentu.

## Why It Matters

Untuk engineer dengan pengalaman 2–4 tahun, interviewer tidak mengharapkan desain sekelas sistem global, tetapi
mengharapkan Anda: tidak langsung menggambar, tahu komponen dasar dan alasannya, memahami data & API, serta menyadari
failure mode. Struktur yang jelas membuat Anda terlihat senior walau topiknya baru.

## Core Concepts

**Rubrik umum yang dinilai:**

| Dimensi | Sinyal positif |
| --- | --- |
| Problem scoping | Bertanya requirement & batasan, menyatakan asumsi |
| Technical design | Komponen tepat, data model & API masuk akal |
| Trade-off | Menyebut alternatif dan alasan memilih |
| Depth | Bisa menggali satu area kritis secara detail |
| Reliability & ops | Failure mode, monitoring, scaling plan |
| Communication | Terstruktur, mengajak interviewer berdiskusi, menerima masukan |

## How It Works

**Alokasi waktu (sesi 45 menit):**

| Menit | Langkah | Output |
| --- | --- | --- |
| 0–5 | Klarifikasi requirement | Daftar fitur inti + NFR terukur |
| 5–10 | Estimasi skala | QPS, storage, rasio baca/tulis |
| 10–17 | API & data model | 4–6 endpoint, entitas & relasi |
| 17–27 | High-level design | Diagram komponen + alur utama |
| 27–40 | Deep dive 1–2 area | Mis. sync, konsistensi, notifikasi |
| 40–45 | Trade-off, failure, evolusi | Ringkasan & next steps |

## Implementation

### Checklist pertanyaan klarifikasi

- **User & skala:** siapa user-nya? berapa user aktif harian? sebaran geografis?
- **Fitur inti:** 3 fitur yang wajib ada di versi pertama? apa yang di luar scope?
- **Platform:** mobile, web, atau keduanya? perlu offline?
- **Data:** volume, retensi, sensitivitas (PII/finansial), regulasi?
- **NFR:** latency target, availability, konsistensi (boleh stale?), real-time?
- **Integrasi:** sistem eksisting (billing, CRM, SSO), pihak ketiga (payment, SMS)?

### Contoh pembukaan (percakapan)

> **Interviewer:** "Desain sistem pelaporan gangguan untuk pelanggan layanan internet."
>
> **Anda:** "Baik, saya ingin memastikan scope dulu. Apakah fokusnya pelanggan melaporkan gangguan lewat aplikasi mobile,
> lalu tiket diteruskan ke teknisi lapangan sampai selesai? Kira-kira berapa jumlah pelanggan dan tiket per hari? Apakah
> teknisi perlu bekerja offline di lokasi? Untuk NFR, saya asumsikan status tiket harus terlihat pelanggan dalam hitungan
> detik, dan sistem harus tetap menerima laporan saat terjadi gangguan massal — itu justru saat lonjakan terbesar. Apakah
> asumsi ini sesuai?"

Perhatikan: asumsi dinyatakan, NFR yang **menarik** ditemukan (lonjakan saat gangguan massal), dan interviewer diajak
mengonfirmasi.

### Pola komponen yang bisa dipakai ulang

```text
Client (mobile/web) → CDN → LB/API Gateway (auth, rate limit) → Service stateless
  → PostgreSQL (transaksional) + read replica
  → Redis (cache, rate limit, session, dedup)
  → Queue (async: notifikasi, integrasi, laporan) → Worker
  → Object storage (foto/lampiran) · Search (opsional) · Observability
```

### Area deep dive yang sering muncul

| Area | Hal yang dibahas |
| --- | --- |
| Konsistensi data | Transaksi, idempotency, outbox, saga |
| Lonjakan beban | Queue sebagai buffer, autoscaling, rate limit, degradasi bertahap |
| Offline & sync | Outbox, UUID client, cursor, konflik |
| Notifikasi | Fan-out, preferensi, retry, dedup, provider rate limit |
| Pencarian | Index DB vs search engine |
| Hot partition | Key yang terlalu populer, sharding, cache |

### Menutup jawaban

> "Ringkasnya: … Trade-off utama yang saya ambil adalah … karena … Jika skala naik 10×, langkah berikutnya adalah …
> Risiko terbesar yang akan saya pantau adalah … dengan metrik …"

## Best Practices

- **Jangan menggambar sebelum requirement jelas.**
- **Nyatakan asumsi dengan angka** — angka kasar lebih baik daripada tidak ada.
- **Mulai sederhana, lalu skalakan** — tunjukkan evolusi (v1 → 10×).
- **Selalu sebut alasan & alternatif** ("Saya pilih PostgreSQL karena transaksi & relasi; NoSQL dipertimbangkan jika …").
- **Libatkan interviewer**: "Apakah Anda ingin saya mendalami bagian sync atau notifikasi?"
- **Hubungkan dengan pengalaman nyata** — offline-first, transaksi POS, integrasi API.

## Anti-Patterns

- Langsung menyebut microservices, Kafka, Kubernetes tanpa justifikasi.
- Menghabiskan 20 menit di satu detail kecil sebelum gambaran besar selesai.
- Diam menggambar tanpa narasi.
- Mengabaikan data model dan API.
- Tidak menyebut satu pun failure mode.

## Performance Considerations

Bawa angka orde besaran: Redis ~sub-ms, query ber-index ~ms, round-trip seluler ~ratusan ms, satu PostgreSQL yang
di-tune dengan baik dapat melayani ribuan transaksi sederhana per detik (tergantung hardware & query). Gunakan angka ini
untuk memutuskan kapan perlu cache, replica, atau sharding — dan katakan bahwa Anda akan **mengukur** sebelum menambah kompleksitas.

## Security Considerations

Sisihkan 1–2 menit untuk keamanan: autentikasi & otorisasi (termasuk object-level), enkripsi in transit & at rest,
data sensitif (PII), rate limiting, audit log, dan akses jaringan internal. Ini sering menjadi pembeda kandidat.

## Real-World Use Cases

Latih framework ini pada:

- [Design a Scalable REST API](/interview/system-design/scalable-rest-api/)
- [Design an Offline-First POS Application](/interview/system-design/offline-first-pos/)
- [Design a Notification System](/interview/system-design/notification-system/)
- [Design a Telecom Service Management Platform](/interview/system-design/telecom-platform/)

## Interview Questions

1. Desain aplikasi pelaporan gangguan pelanggan dengan teknisi lapangan.
2. Desain sistem notifikasi untuk 10 juta pelanggan.
3. Desain POS offline-first untuk 2.000 outlet.
4. Desain URL shortener (soal klasik untuk latihan dasar).
5. Bagaimana sistem Anda menangani lonjakan 20× saat gangguan massal?

## Sample Answers

5. "Saya memisahkan jalur penerimaan dari pemrosesan: API hanya memvalidasi, menyimpan laporan secara ringan, dan mengembalikan 202, sementara pemrosesan lanjut berjalan lewat queue. Laporan yang mengacu pada gangguan area yang sama di-deduplikasi dan dikaitkan ke satu *incident* induk sehingga teknisi tidak menerima ratusan tiket identik. Status gangguan massal ditampilkan proaktif di aplikasi (cache/CDN) untuk mengurangi laporan baru. API di-autoscale, ada rate limit per pelanggan, dan fitur non-esensial bisa didegradasi. Saya pantau kedalaman queue, latency p95, dan error rate."

Untuk soal 1–4, gunakan kerangka di halaman ini dan bandingkan dengan halaman studi kasus terkait.

## Practical Exercises

1. Pilih satu soal, setel timer 45 menit, kerjakan di kertas/whiteboard digital, rekam suara Anda.
2. Evaluasi rekaman dengan rubrik di atas (skor 1–4 tiap dimensi).
3. Ulangi soal yang sama seminggu kemudian dan bandingkan skor.

## Quick Reference

```text
1. Klarifikasi (5')  2. Estimasi (5')  3. API & data (7')
4. High-level (10')  5. Deep dive (13')  6. Trade-off & failure (5')
Selalu: asumsi berangka · alasan + alternatif · failure mode · security · libatkan interviewer
```

## Related Topics

- [System Design Fundamentals](/system-design/concepts/fundamentals/)
- [POS / ERP Application](/system-design/case-studies/pos-erp/)
- [Telecom Service Management](/system-design/case-studies/telecom-service-management/)
- [STAR Method](/interview/behavioral/star-method/)
