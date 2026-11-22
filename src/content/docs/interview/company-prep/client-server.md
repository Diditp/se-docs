---
title: "Client-Server Architecture"
description: "Model client-server, 2-tier vs 3-tier vs n-tier, stateless vs stateful, request-response vs real-time, peran load balancer & reverse proxy, dan bagaimana aplikasi mobile berkomunikasi dengan server."
level: beginner
status: complete
updated: 2026-11-13
tags: [interview, company-prep, client-server, architecture, networking]
---

## Overview

**Client-server** adalah model arsitektur di mana **client** (aplikasi mobile, browser, aplikasi desktop, perangkat IoT)
mengirim **request** ke **server** yang menyediakan layanan atau data, lalu server mengirim **response**. Server
terpusat menyimpan data dan menjalankan aturan bisnis; client fokus pada tampilan dan interaksi user.

Lawannya adalah **peer-to-peer (P2P)**: setiap node bisa menjadi client sekaligus server (mis. BitTorrent), tanpa pusat.

## Why It Matters

Hampir semua sistem perusahaan — aplikasi pelanggan, portal internal, sistem billing, monitoring jaringan — dibangun di
atas model ini. Pertanyaan "jelaskan client-server" atau "apa itu 3-tier architecture" adalah pertanyaan dasar yang
sering dipakai untuk menguji fondasi kandidat sebelum masuk ke topik yang lebih dalam.

## Core Concepts

| Istilah | Arti |
| --- | --- |
| Client | Pihak yang meminta layanan (app Flutter, browser) |
| Server | Pihak yang menyediakan layanan (API, database server, file server) |
| Protocol | Aturan komunikasi: HTTP/HTTPS, WebSocket, gRPC, MQTT, SQL wire protocol |
| 2-tier | Client langsung ke database server |
| 3-tier | Presentation (client) → Application (API/business logic) → Data (database) |
| n-tier | 3-tier + lapisan tambahan: cache, queue, gateway, layanan terpisah |
| Stateless server | Server tidak menyimpan state sesi antar request (setiap request membawa token) |
| Stateful server | Server menyimpan state sesi (session di memori, koneksi persisten) |
| Thin vs thick client | Logika di server (thin, mis. web) vs banyak logika di client (thick, mis. app offline-first) |

## How It Works

```text
3-tier tipikal
┌──────────────┐  HTTPS/JSON   ┌──────────────────┐   SQL    ┌──────────────┐
│ Presentation │ ────────────► │ Application tier │ ───────► │  Data tier   │
│ Flutter app  │ ◄──────────── │ REST API (Node)  │ ◄─────── │ PostgreSQL   │
│ Web browser  │               │ auth, validasi,  │          │ (+ backup)   │
└──────────────┘               │ aturan bisnis    │          └──────────────┘
                               └──────────────────┘
Di skala lebih besar: Client → DNS → CDN → Load Balancer/Reverse Proxy → beberapa instance API → cache/queue → DB primary/replica
```

Siklus request-response:

1. Client membuat koneksi (DNS → TCP → TLS) ke server.
2. Client mengirim request (method, path, header, body).
3. Server memvalidasi, mengotorisasi, menjalankan logika, mengakses database.
4. Server mengirim response (status code, header, body).
5. Client menampilkan hasil atau menangani error.

Pola komunikasi selain request-response:

| Pola | Contoh | Kapan |
| --- | --- | --- |
| Request–response | REST API | Mayoritas operasi CRUD |
| Polling | Cek status pembayaran tiap 3 detik | Sederhana, toleran delay |
| Long polling / SSE | Notifikasi web | Server push satu arah |
| WebSocket | Chat, status real-time | Dua arah, latency rendah |
| Push notification | FCM/APNs | App di background |
| Pub/Sub (MQTT) | Sensor IoT, meter | Perangkat banyak, bandwidth kecil |

## Implementation

### Client mobile memanggil server (Flutter)

```dart
final res = await dio.get('/v1/customers/${customerId}/bills',
    options: Options(headers: {'Authorization': 'Bearer $token'}));
final bills = (res.data['data'] as List).map((e) => Bill.fromJson(e)).toList();
```

### Server stateless (Node.js) — siap di-scale horizontal

```ts
app.get('/v1/customers/:id/bills', requireAuth, async (req, res) => {
  // Identitas dari token (stateless), bukan dari session di memori server
  if (req.params.id !== req.user.customerId) return res.status(404).end();
  const bills = await billRepo.listByCustomer(req.user.customerId, { limit: 12 });
  res.json({ data: bills });
});
```

Karena tidak ada state di memori instance, load balancer bebas mengarahkan request ke instance mana pun.

### Reverse proxy di depan aplikasi (Nginx)

```nginx
upstream api_backend {
    server 10.0.1.11:3000;
    server 10.0.1.12:3000;          # dua instance → load balancing round robin
}
server {
    listen 443 ssl http2;
    server_name api.example.com;
    ssl_certificate     /etc/ssl/certs/api.crt;
    ssl_certificate_key /etc/ssl/private/api.key;

    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Best Practices

- **3-tier minimal**: jangan biarkan aplikasi client terhubung langsung ke database — semua akses lewat API yang memvalidasi & mengotorisasi.
- **Server stateless** (token/JWT, session di Redis) agar mudah di-scale dan tahan gagal.
- **HTTPS untuk semua komunikasi**, timeout di client, retry dengan backoff untuk error sementara.
- **Kontrak API yang jelas & berversi** (`/v1`) karena client mobile lama tetap beredar.
- **Pilih pola komunikasi sesuai kebutuhan**: REST untuk CRUD, WebSocket/push untuk real-time, MQTT untuk IoT.
- **Server sebagai sumber kebenaran** untuk aturan bisnis; client boleh memvalidasi untuk UX tetapi server memvalidasi ulang.

## Anti-Patterns

- 2-tier dari aplikasi mobile ke database (kredensial DB di app) — siapa pun bisa membongkar app dan mengakses DB.
- Session disimpan di memori satu server lalu menambah instance → user "logout" acak.
- Polling sangat sering (tiap detik) untuk data yang jarang berubah → beban server & baterai.
- Logika bisnis penting (harga, diskon) hanya di client.

## Performance Considerations

- Latency jaringan mendominasi di mobile: kurangi round-trip (endpoint agregat), kompresi, cache.
- Reverse proxy/CDN untuk konten statis & TLS termination.
- Horizontal scaling instance stateless di belakang load balancer; database bottleneck diatasi dengan index, cache, read replica.
- Connection pooling di server ke database.

## Security Considerations

- Autentikasi & otorisasi di application tier untuk setiap request dan setiap objek.
- Database & cache di jaringan privat — hanya application tier yang bisa mengakses.
- TLS di setiap hop yang melewati jaringan tidak tepercaya; firewall/security group membatasi port.
- Rate limiting di reverse proxy/API gateway.

## Real-World Use Cases

- **Aplikasi pelanggan layanan internet**: app (client) → API (cek tagihan, lapor gangguan) → database pelanggan & sistem tiket.
- **Aplikasi petugas lapangan**: app offline-first (thick client) yang menyinkronkan work order ke server.
- **Dashboard monitoring**: browser terhubung via WebSocket untuk status perangkat real-time.

## Interview Questions

1. Jelaskan arsitektur client-server dan bedanya dengan peer-to-peer.
2. Apa itu 3-tier architecture? Mengapa client tidak boleh langsung ke database?
3. Apa beda server stateless dan stateful?
4. Kapan memakai polling, WebSocket, atau push notification?
5. Apa fungsi reverse proxy dan load balancer?

## Sample Answers

1. Client mengirim request ke server terpusat yang menyediakan data/layanan dan mengembalikan response. Kelebihannya kontrol, keamanan, dan konsistensi data terpusat; kekurangannya server bisa menjadi bottleneck/SPOF (diatasi dengan replikasi & load balancing). P2P tidak punya pusat — setiap node bisa memberi dan meminta layanan.
2. Tiga lapisan: presentation (UI), application (logika bisnis & API), data (database). Client tidak langsung ke database karena kredensial DB akan terekspos, tidak ada validasi/otorisasi terpusat, dan perubahan schema langsung merusak semua client.
3. Stateless tidak menyimpan state sesi di server — setiap request membawa konteks (token), sehingga mudah di-scale. Stateful menyimpan sesi/koneksi di server; lebih sederhana untuk beberapa kasus tetapi butuh sticky session atau store bersama saat scaling.
4. Polling untuk kebutuhan sederhana dengan toleransi delay; WebSocket untuk komunikasi dua arah real-time saat app terbuka; push notification untuk memberi tahu user saat app di background/tertutup.
5. Reverse proxy menerima request atas nama server di belakangnya (TLS termination, caching, kompresi, routing). Load balancer mendistribusikan request ke beberapa instance dan mengeluarkan instance yang tidak sehat (health check). Nginx/HAProxy bisa melakukan keduanya.

## Practical Exercises

1. Gambar arsitektur 3-tier dari aplikasi yang pernah Anda kerjakan, termasuk protokol di setiap panah.
2. Jalankan dua instance API di Docker Compose di belakang Nginx dan buktikan request terdistribusi.
3. Ubah satu fitur polling menjadi push notification atau WebSocket dan bandingkan beban request.

## Quick Reference

```text
Client → request → Server → response · P2P = tanpa pusat
3-tier: Presentation → Application (API, aturan) → Data (DB) · client TIDAK langsung ke DB
Stateless (token) = mudah scale · Reverse proxy: TLS, routing, cache · LB: distribusi + health check
REST (CRUD) · polling (sederhana) · WebSocket (real-time 2 arah) · push (background) · MQTT (IoT)
```

## Related Topics

- [Networking & Internet Fundamentals](/interview/company-prep/networking-internet/)
- [API & Database](/interview/company-prep/api-database/)
- [System Design Fundamentals](/system-design/concepts/fundamentals/)
- [Load Balancing](/system-design/concepts/load-balancing/)
