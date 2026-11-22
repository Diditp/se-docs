---
title: "Framework Mobile System Design"
description: "Cara menjawab mobile system design interview: klarifikasi requirement & batasan perangkat, arsitektur klien (layer, state, data flow), kontrak API, penyimpanan lokal & offline, sinkronisasi, real-time, performa, keamanan, observability, rilis — dengan alokasi waktu dan rubrik."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, mobile, interview, architecture, framework]
---

## Overview

**Mobile system design** berbeda dari system design backend: fokusnya pada **aplikasi klien** — arsitektur kode,
alur data, penyimpanan lokal, jaringan tidak andal, baterai, memori, rilis, serta **kontrak dengan backend**. Banyak
perusahaan (terutama tech/e-commerce) memberikan soal seperti "Rancang aplikasi feed", "Rancang aplikasi chat", atau
"Rancang image loader" khusus untuk mobile engineer.

## Why It Matters

Ini menguji kemampuan Anda sebagai **software engineer mobile**, bukan sekadar pembuat UI. Framework yang terstruktur
memastikan Anda membahas hal yang dinilai: trade-off, kasus gagal, dan kualitas produksi.

## Core Concepts

### Perbedaan fokus

| Backend system design | Mobile system design |
| --- | --- |
| Skala server, database, sharding | Arsitektur klien, state, cache lokal |
| Throughput & latency server | Jaringan lambat/putus, latency yang terasa pengguna |
| Ketersediaan layanan | Offline, sinkronisasi, konflik |
| Biaya infrastruktur | Baterai, memori, data seluler, ukuran app |
| Deploy kapan saja | Rilis lewat store, versi lama hidup lama |

### Langkah (sesi ±45 menit)

| Menit | Langkah | Output |
| --- | --- | --- |
| 0–7 | Klarifikasi requirement | Fitur inti, pengguna, platform, offline?, real-time?, skala data per pengguna |
| 7–12 | Batasan & NFR | Perangkat kelas bawah, jaringan, baterai, keamanan, aksesibilitas |
| 12–25 | Arsitektur klien | Layer (UI, state, domain, data), modul, alur data, navigasi |
| 25–32 | Kontrak API & data | Endpoint, pagination, payload, model lokal, sinkronisasi |
| 32–40 | Deep dive 1–2 area | Cache gambar, offline sync, real-time, performa list |
| 40–45 | Kualitas produksi | Error handling, testing, monitoring, rilis/feature flag, keamanan |

## How It Works

```text
Pertanyaan klarifikasi → gambar arsitektur klien:
  UI (screens/widgets) → State (Bloc/ViewModel) → Domain (use case) → Repository
     → Remote (API client, WebSocket)   → Local (DB, cache file, secure storage)
     → Sync engine (outbox, retry, conflict) → Platform services (push, background, permissions)
Lalu kontrak API → deep dive → trade-off & failure mode
```

## Implementation

### Checklist pertanyaan klarifikasi

```text
- Siapa pengguna? Perangkat & jaringan seperti apa?
- Fitur inti untuk sesi ini? (batasi scope)
- Perlu offline? Seberapa lama? Data apa yang dibutuhkan offline?
- Real-time? (chat, status) atau cukup pull-to-refresh?
- Volume data per pengguna (ratusan item vs jutaan)?
- Platform: Android, iOS, keduanya? Flutter atau native?
- Kebutuhan keamanan/regulasi (pembayaran, data pribadi)?
```

### Template jawaban arsitektur klien

```text
Presentation: layar X, Y · state per layar (UiState immutable)
Domain: use case A, B
Data: Repository (SSOT = DB lokal) · RemoteDataSource (REST/GraphQL/WebSocket) · LocalDataSource (SQLite/Drift/Room)
Sync: outbox + idempotency key · delta sync (cursor/updated_at) · conflict policy
Infra klien: DI, logging, crash reporting, feature flag, analytics
```

### Rubrik penilaian (umum)

| Dimensi | Sinyal kuat |
| --- | --- |
| Scoping | Bertanya, membatasi scope, menyebut asumsi |
| Arsitektur | Layer jelas, SSOT, testable, modular |
| Data & API | Pagination, caching, offline, kontrak versi |
| Kualitas | Error handling, performa (list, gambar, startup), keamanan |
| Trade-off | Alternatif & alasan (WebSocket vs polling, SQL vs key-value) |
| Komunikasi | Terstruktur, mengajak diskusi |

## Best Practices

- **Batasi scope** dan sepakati dengan interviewer.
- **Mulai dari pengalaman pengguna**, lalu turun ke arsitektur.
- **Sebutkan SSOT dan alur data** secara eksplisit.
- **Pikirkan kondisi buruk**: offline, lambat, app dihentikan, versi lama.
- **Akhiri dengan observability & rilis** (monitoring, feature flag, staged rollout).

## Anti-Patterns

- Langsung membahas library ("pakai Bloc dan Dio") tanpa requirement.
- Mendesain backend panjang lebar padahal soal untuk klien.
- Mengabaikan offline, error, dan performa list/gambar.
- Tidak menyebut trade-off.

## Performance Considerations

Selalu sebut: pagination & virtualized list, cache gambar ukuran tampilan, kerja berat di background (isolate/coroutine),
startup ringan, payload kecil, batching request — dan bagaimana Anda mengukurnya.

## Security Considerations

Sebut penyimpanan token aman, TLS, validasi deep link, data sensitif minimal di perangkat, dan otorisasi di server.

## Real-World Use Cases

- Interview mobile di perusahaan e-commerce/tech: feed, chat, image loader.
- Diskusi arsitektur fitur baru di tim sendiri.

## Interview Questions

1. Apa beda mobile system design dan backend system design?
2. Apa langkah Anda menjawab soal mobile system design?
3. Bagaimana menentukan sumber kebenaran data di klien?
4. Apa yang Anda bahas untuk kualitas produksi?

## Sample Answers

1. Mobile berfokus pada arsitektur klien, state, penyimpanan lokal, jaringan tidak andal, sumber daya perangkat, dan rilis lewat store; backend berfokus pada skala server, database, dan ketersediaan layanan.
2. Klarifikasi requirement & batasan → arsitektur klien berlapis & alur data → kontrak API & model lokal → deep dive area kritis → kualitas produksi (error, testing, monitoring, rilis, keamanan) dengan trade-off.
3. Umumnya database/cache lokal yang diisi dari API dan dibaca UI melalui repository (offline-first), atau memori untuk data sementara; yang penting satu pemilik per data.
4. Penanganan error & retry, testing, crash reporting & metrik, feature flag & staged rollout, kompatibilitas versi lama, dan keamanan.

## Practical Exercises

1. Latih soal "Rancang aplikasi to-do offline" dalam 30 menit dengan langkah di atas.
2. Rekam penjelasan arsitektur aplikasi Anda sendiri menggunakan template.

## Quick Reference

```text
Klarifikasi → NFR perangkat → arsitektur klien (UI/State/Domain/Data/Sync) → API & data lokal → deep dive → kualitas
SSOT lokal · pagination · offline & sync · real-time vs polling · gambar & list · baterai/data
Error · testing · monitoring · flag & staged rollout · versi lama · keamanan
```

## Related Topics

- [Framework Menjawab System Design](/interview/system-design/framework/)
- [Design an Offline-First POS Application](/interview/system-design/offline-first-pos/)
- [Design: Feed & Infinite Scroll](/system-design/mobile/feed-infinite-scroll/)
