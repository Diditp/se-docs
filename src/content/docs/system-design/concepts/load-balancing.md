---
title: "Load Balancing"
description: "Load balancing dalam desain sistem: L4 vs L7, algoritma (round robin, least connections, weighted, consistent hashing), health check, sticky session dan alasannya dihindari, TLS termination, connection draining saat deploy, load balancing untuk WebSocket, global load balancing/DNS, serta load balancer sebagai titik kegagalan."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, load-balancer, high-availability, nginx, scalability]
---

## Overview

**Load balancer (LB)** mendistribusikan request ke beberapa server sehingga beban terbagi dan server yang bermasalah
dapat dikeluarkan dari rotasi tanpa downtime. LB adalah komponen yang memungkinkan horizontal scaling.

## Why It Matters

Hampir setiap diagram system design memiliki LB. Interviewer ingin tahu Anda memahami health check, sticky session,
koneksi panjang (WebSocket), dan bagaimana LB sendiri tidak menjadi satu titik kegagalan.

## Core Concepts

| Jenis | Bekerja di | Bisa melihat | Contoh |
| --- | --- | --- | --- |
| L4 (transport) | TCP/UDP | IP & port | AWS NLB, HAProxy mode TCP |
| L7 (aplikasi) | HTTP | Path, header, cookie, host | Nginx, Envoy, AWS ALB, Google HTTPS LB |

| Algoritma | Cara | Cocok untuk |
| --- | --- | --- |
| Round robin | Bergiliran | Server seragam, request seragam |
| Weighted round robin | Sesuai bobot kapasitas | Server berbeda ukuran, canary |
| Least connections | Ke server dengan koneksi aktif paling sedikit | Durasi request bervariasi, WebSocket |
| IP hash / consistent hashing | Kunci yang sama ke server yang sama | Cache lokal per server, sharding |

## How It Works

```text
Klien → DNS → LB (TLS termination) → health check memilih instance sehat → teruskan request (+ X-Forwarded-For, X-Request-Id)
Instance gagal health check N kali → dikeluarkan dari pool → lulus lagi → dimasukkan kembali
```

## Implementation

### Health check yang benar

```ts
// Liveness: proses hidup (jangan cek dependensi, agar tidak restart berantai)
app.get('/health/live', async () => ({ status: 'ok' }));

// Readiness: siap menerima trafik (DB terhubung, migrasi selesai)
app.get('/health/ready', async (_req, reply) => {
  const dbOk = await db.query('SELECT 1').then(() => true, () => false);
  return dbOk ? { status: 'ready' } : reply.code(503).send({ status: 'not_ready' });
});
```

### Konfigurasi Nginx sederhana

```nginx
upstream api {
  least_conn;
  server 10.0.1.10:3000 max_fails=3 fail_timeout=10s;
  server 10.0.1.11:3000 max_fails=3 fail_timeout=10s;
}

server {
  listen 443 ssl http2;
  server_name api.example.com;
  # ssl_certificate ... (TLS termination)

  location / {
    proxy_pass http://api;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
  }

  location /ws {                          # WebSocket butuh header upgrade & timeout lebih panjang
    proxy_pass http://api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
}
```

### Sticky session: mengapa dihindari

```text
Sticky session = klien selalu dikirim ke server yang sama (cookie/IP)
Masalah: beban tidak rata, server mati → sesi hilang, sulit autoscaling
Solusi: aplikasi stateless (token/Redis). Sticky hanya bila protokol membutuhkan (mis. fallback polling Socket.IO)
```

### Deploy tanpa downtime: connection draining

```text
1. Instance baru lulus readiness → masuk pool
2. Instance lama ditandai draining → tidak menerima request baru
3. Request berjalan diselesaikan (timeout drain, mis. 30 s). WebSocket diminta reconnect
4. Instance lama dimatikan (tangani SIGTERM dengan graceful shutdown)
```

```ts
process.on('SIGTERM', async () => {
  await app.close();          // berhenti menerima koneksi baru, tunggu request berjalan
  await db.end();
  process.exit(0);
});
```

### LB bukan satu titik kegagalan

```text
- LB terkelola cloud sudah redundant lintas zona
- Self-hosted: pasangan aktif-pasif dengan virtual IP (keepalived) atau beberapa LB di belakang DNS
- Global: DNS/anycast load balancing ke beberapa region, dengan health check per region
```

### IP klien asli

Di belakang LB, alamat IP yang terlihat aplikasi adalah IP LB. Gunakan `X-Forwarded-For` hanya dari proxy tepercaya
(konfigurasi `trustProxy` di framework), karena header ini bisa dipalsukan klien. Ini penting untuk rate limiting dan audit.

## Best Practices

- **Health check terpisah liveness & readiness**.
- **Least connections** untuk beban dengan durasi bervariasi atau koneksi panjang.
- **Aplikasi stateless**, hindari sticky session.
- **Graceful shutdown + draining** di setiap deploy.
- **Timeout di LB selaras** dengan timeout aplikasi dan klien.
- **TLS termination di LB** dengan sertifikat dikelola otomatis.

## Anti-Patterns

- Health check yang memeriksa semua dependensi untuk liveness, sehingga gangguan DB membuat semua instance di-restart.
- Mengandalkan sticky session untuk menyimpan keranjang belanja di memori.
- Mempercayai `X-Forwarded-For` dari mana saja.
- Mematikan instance tanpa draining (request terputus saat deploy).

## Performance Considerations

LB L7 menambah sedikit latensi (parsing HTTP, TLS) tetapi memungkinkan HTTP/2, kompresi, dan routing cerdas. Pantau
jumlah koneksi aktif, latensi per backend, dan error 502/504 sebagai sinyal backend lambat atau timeout yang tidak selaras.

## Security Considerations

LB adalah titik masuk: terapkan TLS modern, WAF atau rate limiting dasar, batas ukuran body, dan sembunyikan header
internal. Backend hanya menerima trafik dari LB (security group/firewall), bukan langsung dari internet.

## Real-World Use Cases

- API POS di belakang LB cloud dengan dua zona ketersediaan dan health check `/health/ready`.
- Gateway WebSocket memakai least connections dan timeout idle panjang.
- Canary release: 5% trafik ke versi baru dengan weighted routing.

## Interview Questions

1. Apa beda load balancer L4 dan L7?
2. Algoritma load balancing apa yang Anda pilih untuk WebSocket dan mengapa?
3. Mengapa sticky session sebaiknya dihindari?
4. Bagaimana mencegah load balancer menjadi single point of failure?
5. Bagaimana melakukan deploy tanpa memutus request?

## Sample Answers

1. L4 meneruskan koneksi TCP/UDP berdasarkan IP/port tanpa melihat isi. L7 memahami HTTP sehingga bisa routing berdasarkan path/header, TLS termination, dan retry, dengan overhead sedikit lebih besar.
2. Least connections, karena koneksi WebSocket berumur panjang dan jumlahnya per server lebih menentukan beban daripada jumlah request, ditambah dukungan header upgrade dan timeout idle panjang.
3. Beban tidak merata, sesi hilang bila server mati, dan menyulitkan autoscaling serta deploy. Lebih baik aplikasi stateless dengan state di token atau store bersama.
4. Gunakan LB terkelola yang redundant lintas zona, atau pasangan aktif-pasif dengan virtual IP, serta DNS/global load balancing untuk multi-region.
5. Readiness check sebelum instance baru menerima trafik, connection draining untuk instance lama, graceful shutdown pada SIGTERM, dan rolling update bertahap.

## Practical Exercises

1. Tambahkan endpoint liveness/readiness dan graceful shutdown di API Anda.
2. Jalankan dua instance di belakang Nginx (docker compose) dan matikan salah satunya saat load test.
3. Konfigurasikan `trustProxy` dengan benar dan verifikasi IP klien di log.

## Quick Reference

```text
L4 (TCP, cepat) vs L7 (HTTP, routing, TLS)
Round robin · weighted · least connections (WebSocket) · consistent hashing
Liveness ≠ readiness · draining + SIGTERM graceful shutdown · timeout selaras
Stateless > sticky session · X-Forwarded-For hanya dari proxy tepercaya
LB redundant (multi-AZ, aktif-pasif, DNS global)
```

## Related Topics

- [Scalability](/system-design/concepts/scalability/)
- [Availability, Reliability & High Availability](/system-design/concepts/availability-reliability/)
- [Server Deployment](/devops/server-deployment/)
