---
title: "Networking & Internet Fundamentals"
description: "Model OSI & TCP/IP, IP addressing & subnetting, TCP vs UDP, DNS, HTTP/HTTPS, NAT, dan apa yang terjadi saat membuka URL — dari sudut pandang software engineer."
level: beginner
status: complete
updated: 2026-11-13
tags: [networking, tcp-ip, osi, dns, http, interview]
---

## Overview

Networking adalah fondasi semua aplikasi client-server. Sebagai software engineer Anda tidak perlu mengonfigurasi router
inti, tetapi harus memahami **bagaimana data bergerak** dari aplikasi mobile ke server: alamat, protokol, nama domain,
keamanan transport, dan di mana masalah bisa terjadi.

## Why It Matters

- Untuk perusahaan yang bisnisnya mencakup jaringan & konektivitas, pertanyaan networking dasar sangat mungkin muncul.
- Debugging masalah produksi ("API timeout di sebagian user", "SSL error di Android lama") butuh pemahaman layer jaringan.
- Desain aplikasi mobile yang baik memperhitungkan latency, jaringan tidak stabil, dan NAT/firewall.

## Core Concepts

### Model OSI vs TCP/IP

| OSI (7 layer) | TCP/IP | Contoh protokol/perangkat | Unit data |
| --- | --- | --- | --- |
| 7 Application | Application | HTTP, DNS, SMTP, MQTT | Data |
| 6 Presentation | Application | TLS (enkripsi), encoding | Data |
| 5 Session | Application | Session management | Data |
| 4 Transport | Transport | TCP, UDP | Segment / Datagram |
| 3 Network | Internet | IP, ICMP, router | Packet |
| 2 Data Link | Link | Ethernet, Wi-Fi, MAC, switch | Frame |
| 1 Physical | Link | Kabel, fiber optik, radio | Bit |

Jembatan keledai OSI (bawah ke atas): **P**lease **D**o **N**ot **T**hrow **S**ausage **P**izza **A**way.

### IP addressing

- **IPv4** 32-bit (`192.168.1.10`), **IPv6** 128-bit (`2001:db8::1`).
- **CIDR**: `/24` → 24 bit network, 8 bit host → 256 alamat (254 host usable).
- **Private range** (RFC 1918): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` — tidak dirutekan di internet.
- **NAT** — banyak perangkat privat berbagi satu IP publik (router rumah, CGNAT ISP).
- **Port** — mengidentifikasi aplikasi pada host: 80 HTTP, 443 HTTPS, 22 SSH, 53 DNS, 5432 PostgreSQL, 3306 MySQL, 6379 Redis.

### TCP vs UDP

| | TCP | UDP |
| --- | --- | --- |
| Koneksi | Connection-oriented (3-way handshake) | Connectionless |
| Keandalan | ACK, retransmisi, urutan terjamin | Tidak ada jaminan |
| Kontrol | Flow & congestion control | Tidak ada |
| Overhead/latency | Lebih tinggi | Rendah |
| Contoh | HTTP/1.1 & HTTP/2, SSH, database | DNS query, VoIP, video real-time, game, QUIC (HTTP/3) |

## How It Works

### Apa yang terjadi saat membuka `https://api.example.com/orders`

```text
1. URL parsing      → skema https, host api.example.com, port 443, path /orders
2. DNS resolution   → cache browser/OS → resolver (ISP/8.8.8.8) → root → .com TLD → authoritative NS → A/AAAA record (IP)
3. TCP handshake    → SYN → SYN-ACK → ACK
4. TLS handshake    → ClientHello (versi, cipher, SNI) → ServerHello + sertifikat → verifikasi chain ke CA tepercaya
                      → key exchange (ECDHE) → kunci sesi simetris (TLS 1.3: 1 round-trip)
5. HTTP request     → GET /orders, header Host, Authorization, Accept
6. Server side      → load balancer → web server/reverse proxy → aplikasi → cache/database → response
7. HTTP response    → status 200, header (Cache-Control, Content-Type), body JSON
8. Client           → parse & render; koneksi di-reuse (keep-alive) untuk request berikutnya
```

### Subnetting singkat

```text
192.168.10.0/26  → mask 255.255.255.192 → blok 64 alamat
  Network   : 192.168.10.0
  Host      : 192.168.10.1 – 192.168.10.62   (62 host)
  Broadcast : 192.168.10.63
Rumus host usable = 2^(32 − prefix) − 2
```

## Implementation

Perintah diagnosis jaringan yang berguna:

```bash
ping api.example.com                 # reachability & latency (ICMP; bisa diblokir firewall)
traceroute api.example.com           # jalur hop (Windows: tracert)
nslookup api.example.com             # / dig api.example.com A +short  → cek DNS
curl -v https://api.example.com/health      # detail TLS handshake, header, status
curl -w "dns:%{time_namelookup} tcp:%{time_connect} tls:%{time_appconnect} total:%{time_total}\n" -o /dev/null -s https://api.example.com
ss -tulpn                            # port yang listen di server (dulu: netstat)
openssl s_client -connect api.example.com:443 -servername api.example.com   # periksa sertifikat
```

Di aplikasi Flutter, set timeout yang jelas dan bedakan jenis kegagalan:

```dart
final dio = Dio(BaseOptions(
  connectTimeout: const Duration(seconds: 10),   // gagal membuat koneksi (DNS/TCP/TLS)
  receiveTimeout: const Duration(seconds: 20),   // server lambat merespons
));
// DioExceptionType.connectionTimeout  → kemungkinan jaringan user / server tidak terjangkau
// DioExceptionType.badCertificate     → masalah TLS / pinning / jam device salah
// DioExceptionType.badResponse        → server menjawab dengan 4xx/5xx
```

## Best Practices

- **HTTPS di mana-mana**; TLS 1.2+ (idealnya 1.3).
- **Reuse koneksi** (HTTP keep-alive / HTTP/2) — handshake TCP+TLS mahal di jaringan seluler.
- **Timeout + retry dengan backoff** untuk error jaringan sementara; jangan retry operasi non-idempotent tanpa idempotency key.
- **Kurangi round-trip** dari mobile (endpoint agregat, kompresi, cache).
- **Jangan expose port database/cache ke internet** — gunakan network privat/VPC & firewall/security group.
- **TTL DNS yang wajar** untuk memungkinkan failover.

## Anti-Patterns

- Menganggap jaringan selalu cepat dan stabil (*fallacies of distributed computing*).
- Hardcode IP server di aplikasi mobile.
- Menonaktifkan validasi sertifikat ("trust all certificates") untuk mengatasi error SSL.
- Membuka port 22/5432 ke `0.0.0.0/0`.

## Performance Considerations

- Latency = propagasi + handshake + antrian + pemrosesan. Di seluler, handshake bisa mendominasi → reuse koneksi, HTTP/2, kurangi request.
- Ukuran payload: kompresi gzip/br, gambar terkompresi & ukuran sesuai layar.
- CDN mendekatkan konten statis ke user; DNS geo-routing untuk multi-region.

## Security Considerations

- **TLS** menjamin kerahasiaan, integritas, dan autentikasi server; **certificate pinning** untuk aplikasi berisiko tinggi (dengan rencana rotasi).
- **Firewall & segmentasi jaringan**: hanya LB yang publik; app & DB di subnet privat.
- **DDoS**: rate limiting, CDN/WAF.
- **DNS**: DNSSEC, proteksi terhadap DNS spoofing; jangan percaya Wi-Fi publik tanpa TLS.
- **VPN** untuk akses administrasi internal.

## Real-World Use Cases

- Aplikasi petugas lapangan di area sinyal lemah → offline-first + retry dengan backoff.
- Pelanggan internet rumah di belakang CGNAT → tidak bisa menerima koneksi masuk langsung; gunakan push notification/WebSocket keluar.
- Debugging "API lambat hanya di jaringan tertentu" → `curl -w` timing per fase untuk melihat apakah DNS, TCP, TLS, atau server yang lambat.

## Interview Questions

1. Jelaskan model OSI dan contoh protokol di setiap layer.
2. Apa beda TCP dan UDP?
3. Apa yang terjadi saat Anda mengetik URL di browser?
4. Apa itu DNS dan bagaimana resolusinya bekerja?
5. Apa beda HTTP dan HTTPS? Bagaimana TLS handshake bekerja secara garis besar?
6. Berapa jumlah host usable pada subnet /27?
7. Apa itu NAT dan mengapa dibutuhkan?

## Sample Answers

1. Physical (kabel/fiber), Data Link (Ethernet, MAC, switch), Network (IP, router), Transport (TCP/UDP), Session, Presentation (enkripsi/encoding, TLS), Application (HTTP, DNS). Model TCP/IP meringkas menjadi 4 layer.
2. TCP connection-oriented dan reliable dengan urutan terjamin, flow & congestion control — untuk web dan database. UDP connectionless tanpa jaminan pengiriman tetapi latency rendah — untuk DNS, VoIP, streaming, dan menjadi dasar QUIC/HTTP3.
3. Lihat urutan 8 langkah di bagian How It Works: parsing URL → DNS → TCP → TLS → HTTP request → pemrosesan server → response → render.
4. Sistem penamaan terdistribusi yang menerjemahkan nama domain ke alamat IP. Resolver memeriksa cache, lalu bertanya ke root server, TLD server (.com/.id), dan authoritative name server domain tersebut; hasil di-cache sesuai TTL.
5. HTTPS = HTTP di atas TLS. TLS: client mengirim versi & cipher yang didukung, server mengirim sertifikat, client memverifikasi rantai sertifikat ke CA tepercaya dan nama domain, kedua pihak melakukan key exchange (ECDHE) untuk menghasilkan kunci simetris sesi yang dipakai mengenkripsi data.
6. /27 → 32 − 27 = 5 bit host → 2⁵ = 32 alamat − 2 (network & broadcast) = **30 host**.
7. Network Address Translation memetakan alamat privat ke alamat publik (dan port) di router, sehingga banyak perangkat berbagi satu IPv4 publik — solusi keterbatasan IPv4 dan sekaligus menyembunyikan topologi internal.

## Practical Exercises

1. Hitung network, range host, dan broadcast untuk `10.20.30.77/28`.
2. Gunakan `curl -w` untuk mengukur waktu DNS/TCP/TLS ke 3 domain berbeda dan jelaskan perbedaannya.
3. Jalankan `dig +trace example.com` dan jelaskan setiap langkah resolusi.
4. Buka Wireshark, tangkap TCP handshake & TLS ClientHello saat membuka situs HTTPS.

<details>
<summary>Jawaban latihan 1</summary>

`/28` → blok 16 alamat. 77 berada di blok 64–79. Network `10.20.30.64`, host `10.20.30.65 – 10.20.30.78` (14 host), broadcast `10.20.30.79`.
</details>

## Quick Reference

- OSI: Physical · Data Link · Network · Transport · Session · Presentation · Application.
- TCP = reliable & berurutan · UDP = cepat tanpa jaminan.
- URL → DNS → TCP → TLS → HTTP → server → response.
- Host usable = 2^(32−prefix) − 2. Private: 10/8, 172.16/12, 192.168/16.
- Port: 22 SSH · 53 DNS · 80 HTTP · 443 HTTPS · 3306 MySQL · 5432 PostgreSQL · 6379 Redis.

## Related Topics

- [Client-Server Architecture](/interview/company-prep/client-server/)
- [HTTPS & TLS](/security/https-tls/)
- [Linux & Server Fundamentals](/interview/company-prep/linux-server/)
- [RESTful API Design](/backend/restful-api-design/)
