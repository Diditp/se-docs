---
title: "WebSocket & Real-Time Communication"
description: "Komunikasi real-time untuk aplikasi mobile: polling, long polling, Server-Sent Events, WebSocket, dan push notification. Membahas kapan memakai masing-masing, autentikasi socket, heartbeat, reconnect dengan backoff, lifecycle mobile (background, jaringan berganti), menyusul event yang terlewat, scaling dengan Redis pub/sub, serta implementasi Node.js (ws/Socket.IO) dan klien Flutter."
level: advanced
status: complete
version: "Node.js 22 LTS · ws / Socket.IO 4.x · web_socket_channel (Flutter)"
updated: 2026-11-13
tags: [backend, websocket, realtime, sse, push-notification, mobile]
---

## Overview

Fitur real-time (status pesanan, chat, dashboard dapur/KDS, lokasi kurir) membutuhkan server yang bisa **mengirim data ke
klien tanpa diminta**. Ada beberapa teknik, dan di mobile pilihannya dipengaruhi oleh baterai, jaringan seluler yang
berganti-ganti, dan pembatasan aplikasi di background.

## Why It Matters

WebSocket sering dianggap solusi untuk semua kebutuhan real-time, padahal di mobile koneksi akan putus saat aplikasi di
background. Desain yang baik menggabungkan WebSocket (saat aplikasi aktif), push notification (saat tidak aktif), dan
mekanisme menyusul data yang terlewat.

## Core Concepts

| Teknik | Arah | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| Short polling | Klien → server berkala | Paling sederhana | Boros, latensi = interval |
| Long polling | Klien menunggu respons sampai ada data | Kompatibel luas | Overhead request berulang |
| Server-Sent Events (SSE) | Server → klien (satu arah, HTTP) | Sederhana, auto-reconnect di browser | Satu arah. Dukungan klien mobile perlu library |
| WebSocket | Dua arah, koneksi persisten | Latensi rendah, efisien untuk pesan sering | Stateful, scaling & reconnect lebih rumit |
| Push notification (FCM/APNs) | Server → perangkat via OS | Bekerja saat app di background/mati | Tidak dijamin instan/terkirim. Payload terbatas |

### Pilihan untuk mobile

```text
App aktif & butuh update cepat (chat, KDS, tracking)     → WebSocket
Update jarang (status order tiap beberapa menit)          → polling saat layar terbuka / SSE
App di background/tertutup                                → push notification (lalu fetch data saat dibuka)
Selalu                                                    → sumber kebenaran tetap REST/DB. Real-time hanya sinyal
```

## How It Works

```text
Klien: connect wss://.../ws?token → server verifikasi token → join room (outlet:123, order:abc)
Server event (order paid) → publish ke Redis channel → semua instance → kirim ke socket di room terkait
Klien putus → reconnect dengan backoff + jitter → kirim lastEventId/since → server/REST mengirim event yang terlewat
```

## Implementation

### Server Node.js (ws) dengan autentikasi & heartbeat

```ts
import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  try {
    const user = await verifyAccessToken(extractToken(req));        // token pendek dari header/subprotocol/query
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, user));
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy();
  }
});

wss.on('connection', (ws: WebSocket & { alive?: boolean }, user: User) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', async (raw) => {
    const msg = ClientMessage.safeParse(JSON.parse(raw.toString()));   // validasi setiap pesan
    if (!msg.success) return ws.send(JSON.stringify({ type: 'error', code: 'BAD_MESSAGE' }));
    if (msg.data.type === 'subscribe') {
      await authz.requireOutletMember(user.id, msg.data.outletId);       // otorisasi per room
      rooms.join(`outlet:${msg.data.outletId}`, ws);
    }
  });
  ws.on('close', () => rooms.leaveAll(ws));
});

// Heartbeat: putuskan koneksi mati (NAT/seluler sering memutus diam-diam)
setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 30_000);
```

Socket.IO menyediakan room, reconnect, acknowledgement, dan adapter Redis bawaan dengan protokol sendiri (klien juga harus
Socket.IO). `ws` lebih ringan dan memakai protokol WebSocket standar.

### Scaling banyak instance

```ts
// Event bisnis dipublikasikan ke Redis. Setiap instance meneruskan ke socket lokalnya
await redisPub.publish('outlet-events', JSON.stringify({ outletId, type: 'order.paid', orderId, seq }));

redisSub.subscribe('outlet-events');
redisSub.on('message', (_ch, payload) => {
  const e = JSON.parse(payload);
  rooms.broadcast(`outlet:${e.outletId}`, e);
});
```

Load balancer harus mendukung upgrade WebSocket dan timeout idle yang cukup panjang.

### Format event yang dapat disusul

```json
{ "type": "order.paid", "seq": 10423, "outletId": "o1", "orderId": "a9…", "occurredAt": "2026-11-13T07:15:02Z" }
```

`seq` meningkat per outlet. Setelah reconnect, klien memanggil `GET /v1/outlets/o1/events?after=10420` (atau me-refresh
data via REST) agar event selama terputus tidak hilang.

### Klien Flutter: reconnect, backoff, dan lifecycle

```dart
class RealtimeClient with WidgetsBindingObserver {
  RealtimeClient(this._url, this._tokens);
  final Uri _url;
  final TokenStore _tokens;
  WebSocketChannel? _ch;
  int _attempt = 0;
  int _lastSeq = 0;
  final _events = StreamController<RealtimeEvent>.broadcast();
  Stream<RealtimeEvent> get events => _events.stream;

  Future<void> connect() async {
    final token = await _tokens.accessToken();                  // token segar setiap koneksi
    final ch = IOWebSocketChannel.connect(_url, headers: {'Authorization': 'Bearer $token'},
        pingInterval: const Duration(seconds: 25));
    _ch = ch;
    try {
      await ch.ready;
      _attempt = 0;
      await _catchUp();                                         // ambil event yang terlewat via REST
      ch.stream.listen(_onMessage, onDone: _scheduleReconnect, onError: (_) => _scheduleReconnect());
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic raw) {
    final e = RealtimeEvent.fromJson(jsonDecode(raw as String) as Map<String, dynamic>);
    if (e.seq <= _lastSeq) return;                             // dedup
    _lastSeq = e.seq;
    _events.add(e);
  }

  void _scheduleReconnect() {
    final base = min(30, pow(2, _attempt++).toInt());            // 1, 2, 4 ... maks 30 detik
    final delay = Duration(milliseconds: base * 1000 + Random().nextInt(1000));   // jitter
    Future.delayed(delay, connect);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.paused) _ch?.sink.close();        // hemat baterai. Push menangani background
    if (s == AppLifecycleState.resumed) connect();
  }

  Future<void> _catchUp() async { /* GET /events?after=_lastSeq, lalu tambahkan ke _events */ }
}
```

Untuk produksi, tambahkan: tidak reconnect saat offline (dengarkan connectivity), batalkan timer saat `dispose`, dan
refresh token bila server menolak dengan kode 4401/close code khusus.

## Best Practices

- **Real-time sebagai sinyal, REST/DB sebagai sumber kebenaran**.
- **Autentikasi saat handshake & otorisasi per room/topik**.
- **Heartbeat** di server dan klien.
- **Reconnect dengan exponential backoff + jitter**, dan **catch-up** dengan sequence/`since`.
- **Tutup koneksi saat app di background**, gunakan push untuk notifikasi.
- **Validasi setiap pesan masuk** dan batasi ukuran/laju pesan.

## Anti-Patterns

- Mengandalkan WebSocket untuk notifikasi saat app di background.
- Reconnect langsung tanpa jeda (ribuan klien membanjiri server setelah gangguan).
- Token panjang umur di query string yang tercatat di log.
- Menyimpan state penting hanya di memori koneksi.
- Broadcast ke semua klien tanpa filter tenant.

## Performance Considerations

Setiap koneksi memakan memori server dan file descriptor. Ukur jumlah koneksi bersamaan per instance, kirim payload kecil
(ID + tipe, detail diambil bila perlu), gabungkan update yang sangat sering (mis. lokasi tiap 2–5 detik), dan pertimbangkan
kompresi per-message bila payload besar. Di mobile, koneksi persisten dan heartbeat yang terlalu sering menguras baterai.

## Security Considerations

Gunakan `wss://` (TLS). Verifikasi token saat upgrade dan periksa kedaluwarsa (putuskan atau minta re-auth). Periksa header
`Origin` untuk klien web, otorisasi setiap subscribe, validasi skema pesan, rate limit per koneksi, dan jangan kirim data
sensitif ke room yang lebih luas dari kebutuhan.

## Real-World Use Cases

- Kitchen display system: order baru dikirim via WebSocket ke tablet dapur. Setelah reconnect, tablet mengambil order sejak `seq` terakhir.
- Status pesanan pelanggan: WebSocket saat layar tracking terbuka, push notification saat aplikasi ditutup.
- Lokasi kurir: update tiap beberapa detik ke room `order:{id}`, hanya untuk pelanggan dan admin terkait.

## Interview Questions

1. Apa beda polling, long polling, SSE, dan WebSocket?
2. Bagaimana menangani WebSocket di aplikasi mobile saat masuk background atau berganti jaringan?
3. Bagaimana memastikan klien tidak kehilangan event saat terputus?
4. Bagaimana menskalakan WebSocket ke beberapa instance server?
5. Bagaimana mengamankan koneksi WebSocket?

## Sample Answers

1. Polling meminta berkala. Long polling menahan request sampai ada data. SSE adalah aliran satu arah server→klien melalui HTTP. WebSocket adalah koneksi persisten dua arah dengan latensi rendah.
2. Tutup koneksi saat background dan andalkan push notification. Saat kembali aktif, reconnect dengan backoff, ambil token segar, lalu sinkronkan data yang terlewat. Pantau perubahan konektivitas dan gunakan heartbeat untuk mendeteksi koneksi mati.
3. Beri setiap event nomor urut atau timestamp. Setelah reconnect, klien meminta event setelah nilai terakhir (atau me-refresh state via REST), dan klien melakukan dedup berdasarkan nomor urut.
4. Gunakan pub/sub (Redis, message broker) agar event diteruskan ke semua instance yang memegang socket terkait, dengan load balancer yang mendukung upgrade dan timeout idle yang sesuai. Sticky session diperlukan untuk beberapa transport (mis. fallback polling Socket.IO).
5. TLS (`wss`), autentikasi token saat handshake dengan masa berlaku pendek, otorisasi per room, validasi & batas ukuran pesan, rate limit, pemeriksaan Origin, dan tidak mencatat token di log.

## Practical Exercises

1. Bangun server `ws` dengan autentikasi, room per outlet, dan heartbeat.
2. Buat klien Flutter dengan reconnect backoff + jitter dan catch-up berbasis `seq`.
3. Jalankan dua instance server dengan Redis pub/sub dan uji broadcast lintas instance.

## Quick Reference

```text
Polling · long polling · SSE (1 arah) · WebSocket (2 arah) · Push (background)
Handshake auth · otorisasi per room · validasi pesan · wss
Heartbeat ping/pong · backoff + jitter · catch-up via seq/since · dedup
Background → tutup socket, pakai push · Scaling: Redis pub/sub, LB dengan upgrade
Real-time = sinyal · REST/DB = sumber kebenaran
```

## Related Topics

- [Push Notifications (Flutter)](/flutter/push-notifications/)
- [Chat App (Mobile System Design)](/system-design/mobile/chat-app/)
- [Caching (Redis)](/backend/caching/)
