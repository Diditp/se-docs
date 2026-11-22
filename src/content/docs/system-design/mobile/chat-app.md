---
title: "Design: Aplikasi Chat Real-Time"
description: "Mobile system design aplikasi chat: requirement, WebSocket vs polling vs push, model pesan & status (sending, sent, delivered, read), urutan & deduplikasi, outbox offline, sinkronisasi riwayat, notifikasi saat app tertutup, lampiran media, typing indicator, reconnect & backoff, serta keamanan dan skala backend singkat."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, mobile, chat, websocket, real-time, offline]
---

## Overview

Soal: **"Rancang aplikasi chat (1:1 dan grup) untuk mobile."** Ini soal klasik real-time: pesan harus terkirim cepat,
tidak hilang/ganda saat jaringan putus, berurutan, punya status terkirim/dibaca, dan tetap memberi notifikasi saat app
ditutup — dengan memperhatikan baterai dan batasan background iOS/Android.

## Why It Matters

Pola chat juga dipakai untuk fitur "chat dengan CS", komunikasi teknisi–dispatcher, dan notifikasi real-time. Soal ini
menguji pemahaman koneksi persisten, offline-first, dan konsistensi data.

## Core Concepts

| Requirement | Detail |
| --- | --- |
| Fungsional | Kirim/terima teks, riwayat, grup, status pesan, lampiran gambar, notifikasi |
| Non-fungsional | Latency rendah (detik), pesan tidak hilang/ganda, urutan konsisten, offline, hemat baterai |

| Transport | Kapan | Trade-off |
| --- | --- | --- |
| WebSocket | App di foreground | Real-time dua arah; harus dikelola reconnect; tidak hidup di background |
| Push (FCM/APNs) | App background/tertutup | Membangunkan/notifikasi; tidak dijamin urutan/terkirim |
| Polling/long polling | Fallback | Sederhana; boros & kurang real-time |
| REST | Kirim pesan (opsional), ambil riwayat | Mudah di-cache & di-retry |

### Status pesan

```text
local (dibuat di perangkat) → sending → sent (server menerima, punya server_id & seq) → delivered (sampai di perangkat penerima) → read
                         ↘ failed (retry otomatis/ manual)
```

## How It Works

```text
Kirim: simpan pesan lokal (client_msg_id UUID, status=sending) → tampil instan → kirim via WebSocket/REST
       server: dedup by client_msg_id → simpan → beri seq per percakapan → ack {client_msg_id, server_id, seq}
       klien: update status=sent, urutkan berdasarkan seq
Terima (foreground): event WebSocket → simpan DB → UI
Terima (background): push notification → tap/bangun → sync riwayat sejak last_seq
Reconnect: backoff + jitter → kirim ulang outbox → minta pesan sejak last_seq per percakapan
```

## Implementation

### Model lokal

```sql
CREATE TABLE messages (
  client_msg_id TEXT PRIMARY KEY,        -- UUID dibuat klien (idempotensi)
  server_id     TEXT UNIQUE,             -- terisi setelah ack
  conversation_id TEXT NOT NULL,
  sender_id     TEXT NOT NULL,
  body          TEXT,
  attachment_url TEXT,
  seq           INTEGER,                 -- urutan dari server per percakapan
  status        TEXT NOT NULL,           -- sending | sent | delivered | read | failed
  created_at    INTEGER NOT NULL         -- waktu klien (tampilan sementara)
);
CREATE INDEX ix_messages_conv_seq ON messages (conversation_id, seq);
CREATE TABLE conversations (id TEXT PRIMARY KEY, last_seq INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0);
```

### Protokol event (contoh)

```json
// Klien → server
{ "type": "message.send", "clientMsgId": "6f1c…", "conversationId": "c1", "body": "Halo" }
{ "type": "message.read", "conversationId": "c1", "upToSeq": 42 }
// Server → klien
{ "type": "message.ack", "clientMsgId": "6f1c…", "serverId": "m_981", "seq": 43 }
{ "type": "message.new", "message": { "serverId": "m_982", "seq": 44, "conversationId": "c1", "body": "Hai" } }
{ "type": "receipt", "conversationId": "c1", "userId": "u2", "readUpToSeq": 43 }
```

### Klien WebSocket dengan reconnect (Dart, garis besar)

```dart
class ChatSocket {
  ChatSocket(this._url, this._tokenProvider);
  final Uri _url;
  final Future<String> Function() _tokenProvider;
  WebSocketChannel? _ch;
  int _attempt = 0;

  Future<void> connect() async {
    final token = await _tokenProvider();
    _ch = WebSocketChannel.connect(_url.replace(queryParameters: {'token': token}));  // atau header bila didukung
    _ch!.stream.listen(_onEvent, onDone: _scheduleReconnect, onError: (_) => _scheduleReconnect());
    _attempt = 0;
    await _resendOutbox();        // pesan status sending/failed
    await _syncSinceLastSeq();    // ambil yang terlewat saat putus
  }

  void _scheduleReconnect() {
    final delay = Duration(milliseconds: min(30000, 500 * pow(2, _attempt++).toInt()) + Random().nextInt(500));
    Future.delayed(delay, connect);   // hentikan saat app ke background; sambungkan lagi saat resumed
  }
}
```

### Lampiran gambar

```text
1. Kompres & resize di klien → 2. minta presigned URL → 3. upload langsung ke object storage (resumable bila besar)
4. kirim pesan dengan attachment_url · tampilkan progress & placeholder lokal selama upload
```

### Backend (singkat)

WebSocket gateway stateless di belakang load balancer, pub/sub (mis. Redis) untuk meneruskan pesan antar instance,
penyimpanan pesan berurutan per percakapan (seq), worker push notification, dan rate limiting. Kedalaman backend
biasanya tidak dituntut untuk peran mobile, tetapi alurnya perlu dipahami.

## Best Practices

- **Client message ID (UUID) + dedup server** untuk idempotensi.
- **Seq dari server** untuk urutan, bukan jam perangkat.
- **Outbox lokal** dan tampilan optimistic.
- **Sync sejak last_seq** setelah reconnect atau dari push.
- **Tutup socket di background**, gunakan push; sambung lagi saat resumed.
- **Batch read receipt** (kirim "dibaca sampai seq N", bukan per pesan).

## Anti-Patterns

- Mengurutkan berdasarkan waktu perangkat.
- Mengandalkan WebSocket tetap hidup di background iOS.
- Retry tanpa ID idempoten → pesan ganda.
- Mengirim gambar besar lewat WebSocket.
- Typing indicator dikirim setiap ketukan (throttle!).

## Performance Considerations

Gunakan list terbalik (`reverse: true`) dengan pagination ke atas, batasi pesan di memori, thumbnail untuk gambar,
throttle typing indicator, dan kompres payload. Heartbeat/ping secukupnya untuk mendeteksi koneksi mati tanpa menguras
baterai.

## Security Considerations

Autentikasi koneksi WebSocket (token berumur pendek), otorisasi per percakapan di server, TLS (`wss://`), validasi &
sanitasi konten (link, ukuran), enkripsi database lokal bila percakapan sensitif, dan pertimbangkan end-to-end encryption
bila menjadi requirement (kompleks: manajemen kunci per perangkat).

## Real-World Use Cases

- Chat pelanggan dengan CS dalam aplikasi layanan.
- Komunikasi teknisi lapangan dengan dispatcher (sering offline).
- Chat penjual–pembeli di marketplace.

## Interview Questions

1. WebSocket, polling, atau push — kapan masing-masing?
2. Bagaimana mencegah pesan ganda dan hilang?
3. Bagaimana menjaga urutan pesan?
4. Bagaimana menerima pesan saat app tertutup?
5. Bagaimana menangani reconnect?

## Sample Answers

1. WebSocket saat app di foreground untuk real-time dua arah; push untuk membangunkan/memberi notifikasi saat background/tertutup; polling sebagai fallback bila WebSocket tidak tersedia.
2. Pesan disimpan dulu di outbox lokal dengan client message ID; dikirim ulang sampai ada ack; server men-dedup berdasarkan ID; setelah reconnect klien meminta pesan sejak seq terakhir.
3. Server memberi nomor urut (seq) per percakapan saat menyimpan; klien mengurutkan berdasarkan seq, dengan pesan lokal yang belum terkirim di bagian bawah.
4. Push notification (FCM/APNs) berisi ringkasan/ID; saat dibuka atau dibangunkan, aplikasi menyinkronkan riwayat sejak seq terakhir.
5. Deteksi putus (onDone/heartbeat), reconnect dengan exponential backoff + jitter, autentikasi ulang, kirim ulang outbox, sinkronkan pesan terlewat; tidak reconnect saat app di background.

## Practical Exercises

1. Buat model lokal & state machine status pesan.
2. Implementasikan outbox + dedup dengan server sederhana (Node.js + ws).
3. Uji skenario: kirim saat offline, reconnect, pesan dari push.

## Quick Reference

```text
Foreground: WebSocket · Background: push → sync since last_seq · fallback: polling
client_msg_id (UUID) + dedup server · seq server untuk urutan · outbox + optimistic UI
Status: sending → sent → delivered → read (receipt batch) · reconnect: backoff + jitter + resend + sync
Lampiran: presigned upload · wss + token pendek + otorisasi per percakapan
```

## Related Topics

- [Framework Mobile System Design](/system-design/mobile/framework/)
- [Design a Notification System](/interview/system-design/notification-system/)
- [Offline-First (Flutter)](/flutter/offline-first/)
