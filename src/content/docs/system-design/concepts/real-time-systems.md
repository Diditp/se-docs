---
title: "Real-Time Systems"
description: "Mendesain sistem real-time untuk aplikasi mobile: kebutuhan (latensi, fan-out, jaminan pengiriman, urutan, presence), arsitektur connection gateway + pub/sub + penyimpanan + push fallback, fan-out on write vs on read, estimasi koneksi & bandwidth, presence dengan heartbeat & TTL, urutan & ack, backpressure, kendala mobile, serta studi kasus order tracking, kitchen display, dan lokasi kurir."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, real-time, websocket, pubsub, presence, mobile]
---

## Overview

Di konteks aplikasi, **real-time** biasanya berarti *soft real-time*: pembaruan sampai ke pengguna dalam hitungan
ratusan milidetik sampai beberapa detik, bukan sistem kendali dengan tenggat keras. Contohnya status pesanan, chat,
kitchen display, lokasi kurir, dan dashboard penjualan langsung.

Halaman ini membahas **arsitektur**. Implementasi protokol (WebSocket, SSE, reconnect) ada di
[WebSocket & Real-Time Communication](/backend/websocket-realtime/).

## Why It Matters

"Rancang fitur tracking pesanan" atau "rancang aplikasi chat" adalah soal interview mobile yang sangat umum. Jawaban yang
baik tidak berhenti di "pakai WebSocket", tetapi menjelaskan penyimpanan, fan-out, penanganan putus koneksi, push
notification, dan skala.

## Core Concepts

| Kebutuhan | Pertanyaan klarifikasi |
| --- | --- |
| Latensi | Berapa cepat? (< 1 s untuk chat, 2–5 s untuk lokasi kurir, 10 s untuk dashboard) |
| Fan-out | Satu event untuk berapa penerima? (1:1, grup 50, broadcast 100.000) |
| Jaminan | Boleh hilang? (lokasi: boleh, ambil yang terbaru) atau wajib sampai? (pesan chat, order baru) |
| Urutan | Per percakapan/order cukup? Global jarang diperlukan |
| Presence | Perlu status online/mengetik? |
| Riwayat | Perlu membuka riwayat saat kembali online? |

### Komponen arsitektur

```text
[Klien mobile] ⇄ (WSS) ⇄ [Connection gateway]  ← stateful, memegang koneksi
                                ↑ subscribe/publish
                         [Pub/Sub backbone]  (Redis Pub/Sub, NATS, Kafka)
                                ↑ event
[API stateless] → [DB/penyimpanan] → outbox → event
                                ↓
                        [Push service] → FCM/APNs  (penerima yang tidak terhubung)
```

| Komponen | Tugas |
| --- | --- |
| Connection gateway | Autentikasi, menyimpan koneksi, subscribe channel, heartbeat. Tidak memegang logika bisnis |
| Pub/Sub | Menyalurkan event ke gateway yang memegang penerima |
| Penyimpanan | Sumber kebenaran (pesan, status order). Real-time hanya distribusi |
| Push service | Menjangkau perangkat yang sedang tidak terhubung |
| Presence store | Status online dengan TTL (Redis) |

### Fan-out

| Pendekatan | Cara | Cocok untuk |
| --- | --- | --- |
| Fan-out on write | Saat event terjadi, kirim/salin ke setiap penerima | Penerima sedikit–sedang (chat grup, order) |
| Fan-out on read | Penerima mengambil saat membuka | Penerima sangat banyak (broadcast ke jutaan) |
| Hybrid | Push sinyal ringan + klien mengambil detail | Pengumuman besar, feed |

## How It Works

```text
Kurir mengirim lokasi (tiap 3–5 s) → API/gateway → simpan posisi terakhir (Redis, TTL) + sampling ke DB
→ publish ke channel order:{id} → gateway yang memegang koneksi pelanggan → kirim ke aplikasi
Pelanggan menutup aplikasi → tidak ada koneksi → event penting (kurir tiba) dikirim lewat push
Pelanggan membuka lagi → REST: ambil status & posisi terakhir → subscribe ulang
```

## Implementation

### Estimasi kapasitas (contoh order tracking)

```text
Pesanan aktif bersamaan saat jam makan siang: 20.000
Koneksi: pelanggan 20.000 + kurir 20.000 = 40.000 koneksi WebSocket
Satu node gateway (asumsi konservatif 20.000–50.000 koneksi idle per node, tergantung memori & runtime) → 2–4 node + cadangan
Lokasi kurir tiap 4 s: 20.000 / 4 = 5.000 pesan/detik masuk, masing-masing ke 1 pelanggan → 5.000 pesan/detik keluar
Ukuran pesan ~150 byte → ~0,75 MB/s keluar, kecil. Bottleneck lebih mungkin di jumlah koneksi & CPU
```

Selalu nyatakan asumsi, lalu validasi dengan load test.

### Desain channel & pesan

```json
{ "channel": "order:a9f", "type": "courier.location", "seq": 812, "lat": -6.2, "lng": 106.8, "at": "2026-11-13T05:12:04Z" }
```

```text
- Channel per entitas (order:{id}, outlet:{id}:kitchen, chat:{conversationId}) → otorisasi per channel
- seq per channel → urutan & deteksi celah
- Event "terbaru menang" (lokasi): klien abaikan seq lama
- Event "wajib sampai" (pesan chat, order baru di KDS): disimpan dulu di DB, klien ack, catch-up setelah reconnect
```

### Presence

```text
Gateway: saat koneksi aktif & tiap heartbeat → SET presence:user:{id} gatewayId EX 60
Putus/timeout → kunci kedaluwarsa sendiri → offline
"Sedang mengetik": event sementara, tidak disimpan, kedaluwarsa beberapa detik
Untuk ribuan anggota grup, jangan broadcast setiap perubahan presence. Ambil saat dibutuhkan (fan-out on read)
```

### Jaminan pengiriman & ack

```text
Chat: klien kirim pesan dengan clientMsgId → server simpan (idempoten) → ack {clientMsgId, serverId, seq}
Penerima menerima via socket atau push → aplikasi sinkron dari seq terakhir → status delivered/read dikirim balik
Tanpa penyimpanan + catch-up, pesan saat koneksi putus akan hilang
```

### Backpressure & proteksi

| Masalah | Solusi |
| --- | --- |
| Klien lambat (jaringan buruk) menumpuk buffer di server | Batas buffer per koneksi, buang event "terbaru menang" yang usang, putuskan bila melewati batas |
| Lonjakan reconnect setelah gangguan | Backoff + jitter di klien, rate limit koneksi baru di gateway |
| Event terlalu sering | Throttle/coalesce di server (mis. lokasi maksimal 1/s per channel) |
| Gateway restart (deploy) | Drain bertahap, klien reconnect ke node lain, catch-up via seq |

### Kendala mobile

```text
- Aplikasi di background: socket ditutup OS → andalkan push untuk event penting
- Jaringan berganti (Wi-Fi ↔ seluler): koneksi lama mati diam-diam → heartbeat & reconnect
- Baterai: hindari heartbeat terlalu sering, kirim lokasi sesuai kebutuhan
- Selalu ada jalur REST untuk memuat state terbaru saat layar dibuka
```

### Studi kasus singkat

| Kasus | Pilihan desain |
| --- | --- |
| Kitchen display (KDS) | WebSocket per `outlet:{id}:kitchen`, order wajib sampai (simpan + catch-up), bunyi saat order baru, fallback polling bila WebSocket diblokir jaringan toko |
| Status pesanan pelanggan | WebSocket saat layar tracking terbuka, push untuk perubahan status utama, REST saat dibuka |
| Dashboard penjualan owner | SSE atau polling 10–30 s sudah cukup. Agregasi di server, bukan setiap transaksi dikirim |
| Lokasi kurir | Terbaru menang, throttle, posisi terakhir di Redis, riwayat di-sampling ke DB |

## Best Practices

- **Klarifikasi latensi, fan-out, dan jaminan** sebelum memilih teknologi.
- **Penyimpanan adalah sumber kebenaran**, real-time hanya distribusi.
- **Gateway stateful tipis**, logika bisnis di layanan stateless.
- **Sequence per channel + catch-up** untuk event yang wajib sampai.
- **Push sebagai fallback** untuk pengguna yang tidak terhubung.
- **Throttle/coalesce** event frekuensi tinggi.

## Anti-Patterns

- WebSocket untuk semua hal, termasuk data yang cukup di-polling tiap menit.
- Mengirim event penting hanya lewat socket tanpa penyimpanan.
- Broadcast presence ke seluruh anggota grup besar.
- Logika bisnis di dalam handler koneksi gateway.
- Tidak memperhitungkan badai reconnect setelah deploy atau gangguan.

## Performance Considerations

Jumlah koneksi bersamaan, memori per koneksi, dan pesan per detik adalah metrik utama. Skalakan gateway horizontal,
bagi channel di pub/sub, kompres atau ringkas payload, dan pantau latensi end-to-end (waktu event terjadi → diterima
klien) pada p95/p99.

## Security Considerations

Autentikasi saat handshake dengan token berumur pendek, otorisasi setiap subscribe channel (pelanggan hanya ke order
miliknya), validasi pesan masuk, rate limit per koneksi, dan batasi data lokasi hanya selama order aktif (privasi kurir).

## Real-World Use Cases

- Aplikasi pesan antar makanan: tracking kurir, status order, chat pelanggan–kurir.
- POS restoran: order dari kasir dan aplikasi pelanggan muncul di layar dapur dalam < 1 detik.
- Aplikasi live event: fan-out on read untuk penonton sangat banyak, update skor diambil per interval.

## Interview Questions

1. Rancang fitur tracking pesanan real-time untuk aplikasi pesan antar.
2. Bagaimana memastikan pesan chat tidak hilang saat pengguna terputus?
3. Bagaimana menskalakan sistem dengan ratusan ribu koneksi WebSocket?
4. Apa beda fan-out on write dan fan-out on read?
5. Bagaimana mengimplementasikan status online (presence)?

## Sample Answers

1. Kurir mengirim lokasi berkala ke API yang menyimpan posisi terakhir di Redis dan mem-publish ke channel order. Gateway WebSocket meneruskan ke pelanggan yang berlangganan setelah otorisasi. Status penting dikirim juga via push. Saat aplikasi dibuka, REST memuat state terakhir. Lokasi bersifat terbaru-menang dengan throttle, dan kapasitas diestimasi dari jumlah order aktif.
2. Simpan pesan di database sebelum didistribusikan, beri sequence per percakapan, minta ack dari klien, dan setelah reconnect klien meminta pesan setelah sequence terakhir. Push notification untuk penerima yang offline.
3. Gateway stateful yang tipis dan diskalakan horizontal di belakang load balancer yang mendukung WebSocket, pub/sub sebagai backbone untuk menyalurkan event ke gateway yang tepat, heartbeat, batas buffer per koneksi, reconnect dengan jitter, dan drain saat deploy.
4. Fan-out on write mendistribusikan event ke setiap penerima saat terjadi (baca cepat, tulis mahal untuk penerima banyak). Fan-out on read membiarkan penerima mengambil saat dibutuhkan (tulis murah, baca lebih mahal). Cocok untuk audiens sangat besar.
5. Gateway menulis key presence dengan TTL saat koneksi aktif dan memperbaruinya setiap heartbeat. Bila koneksi hilang, key kedaluwarsa sehingga pengguna dianggap offline. Untuk grup besar, presence diambil saat dibutuhkan, bukan dibroadcast setiap perubahan.

## Practical Exercises

1. Gambar arsitektur kitchen display untuk 1.000 outlet beserta estimasi koneksi.
2. Tentukan event mana yang "wajib sampai" dan mana yang "terbaru menang" pada aplikasi Anda.
3. Latih jawaban 10 menit "design order tracking" dengan kerangka: kebutuhan → estimasi → arsitektur → detail → trade-off.

## Quick Reference

```text
Klarifikasi: latensi · fan-out · jaminan (hilang boleh vs wajib sampai) · urutan · presence · riwayat
Arsitektur: klien ⇄ gateway (stateful tipis) ⇄ pub/sub ⇄ API stateless + DB · push untuk yang tidak terhubung
Channel per entitas + otorisasi · seq per channel · catch-up via REST · throttle/coalesce
Presence = key TTL + heartbeat · fan-out on write vs on read
Mobile: background → push · jaringan berganti → heartbeat & reconnect jitter
```

## Related Topics

- [WebSocket & Real-Time Communication](/backend/websocket-realtime/)
- [Chat App (Mobile System Design)](/system-design/mobile/chat-app/)
- [Message Queue](/system-design/concepts/message-queue/)
