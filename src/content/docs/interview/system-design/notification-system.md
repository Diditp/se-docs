---
title: "Design a Notification System"
description: "Latihan system design interview: sistem notifikasi multi-channel (push FCM/APNs, email, SMS, in-app) — requirement, arsitektur berbasis queue, preferensi user, template, rate limit, retry & DLQ, deduplikasi, tracking, dan trade-off."
level: advanced
status: complete
updated: 2026-11-12
tags: [interview, system-design, notification, fcm, queue, retry]
---

## Overview

Soal: **"Rancang sistem notifikasi yang mengirim push, email, SMS, dan in-app untuk jutaan pengguna."** Fokusnya:
pengiriman **asinkron** lewat queue, **keandalan** (retry, dead-letter queue, deduplikasi), **preferensi pengguna**,
dan **batas penyedia** (rate limit FCM/SMS gateway).

## Why It Matters

Hampir semua aplikasi butuh notifikasi (status order, tagihan, gangguan layanan, OTP). Soal ini menguji pola
event-driven, integrasi pihak ketiga yang tidak andal, dan pemahaman sisi mobile (token FCM, izin notifikasi).

## Core Concepts

### Requirement

| Fungsional | Non-fungsional |
| --- | --- |
| Kirim notifikasi transaksional (order, tagihan, OTP) | OTP/transaksional cepat (detik) |
| Kirim kampanye/broadcast ke segmen | Broadcast boleh bertahap (menit) |
| Channel: push, email, SMS, in-app | Tidak ada pengiriman ganda yang mengganggu |
| Preferensi & opt-out per kategori | Tahan terhadap kegagalan provider |
| Riwayat & status (sent, delivered, opened) | Skala jutaan notifikasi/hari |

### Komponen

| Komponen | Tugas |
| --- | --- |
| Notification API | Menerima permintaan dari service lain (event/HTTP) |
| Preference service | Cek opt-in/opt-out, quiet hours, channel pilihan |
| Template service | Render konten per bahasa/channel |
| Queue per channel & prioritas | Memisahkan OTP dari broadcast |
| Channel workers | Push (FCM/APNs), email, SMS — retry & rate limit per provider |
| Device token registry | Token FCM per user/perangkat |
| Tracking store | Status pengiriman, untuk in-app inbox & analitik |

## How It Works

```text
Order service ─ event "OrderShipped" ─┐
Billing service ─ event "InvoiceDue" ─┤
Admin (kampanye) ─────────────────────┤
                                      ▼
                         Notification API / consumer
                     (validasi, idempotency, preference, template)
                                      │
             ┌────────────┬───────────┼────────────┬─────────────┐
             ▼            ▼           ▼            ▼             ▼
        q.push.high  q.push.low   q.email      q.sms        in-app (DB + websocket)
             │            │           │            │
        Push worker   Push worker  Email worker  SMS worker  → retry (backoff) → DLQ
             │                         │            │
           FCM/APNs                 Email provider  SMS gateway
                                      │
                         Status → tracking DB (sent/failed/opened)
```

## Implementation

### Data model inti

```sql
CREATE TABLE device_tokens (
  token text PRIMARY KEY, user_id bigint NOT NULL, platform text NOT NULL,
  app_version text, last_seen_at timestamptz NOT NULL
);
CREATE TABLE notification_prefs (
  user_id bigint, category text, channel text, enabled boolean NOT NULL,
  PRIMARY KEY (user_id, category, channel)
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY, user_id bigint NOT NULL, category text NOT NULL,
  title text, body text, data jsonb,
  dedup_key text UNIQUE,                       -- mis. "order:123:shipped"
  status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
```

### Worker push dengan retry & pembersihan token

```ts
async function handlePush(job: PushJob) {
  const tokens = await repo.tokensForUser(job.userId);
  const res = await fcm.sendEachForMulticast({ tokens, notification: job.notification, data: job.data });
  for (const [i, r] of res.responses.entries()) {
    if (r.success) continue;
    const code = r.error?.code;
    if (code === 'messaging/registration-token-not-registered') await repo.deleteToken(tokens[i]); // token mati
    else if (isRetryable(code)) throw new RetryableError(code);   // queue retry dengan backoff
  }
}
```

### Sisi aplikasi Flutter

```dart
// Daftarkan token saat login & ketika token diperbarui
final token = await FirebaseMessaging.instance.getToken();
await api.registerDevice(token: token!, platform: 'android', appVersion: appVersion);
FirebaseMessaging.instance.onTokenRefresh.listen((t) => api.registerDevice(token: t, platform: 'android', appVersion: appVersion));
// Hapus token saat logout agar user lain di perangkat yang sama tidak menerima notifikasi
```

### Keputusan desain

| Topik | Pilihan |
| --- | --- |
| Prioritas | Queue terpisah: OTP/transaksional (high) vs kampanye (low) |
| Deduplikasi | `dedup_key` unik per event bisnis; consumer idempoten |
| Retry | Exponential backoff + jitter, batas percobaan, lalu DLQ |
| Rate limit provider | Token bucket per provider; broadcast dipecah batch |
| Fallback | OTP: push gagal/tidak dibaca → SMS (dengan aturan biaya) |
| Quiet hours | Notifikasi non-kritis ditunda sesuai zona waktu user |
| In-app inbox | Simpan di DB; realtime via WebSocket/SSE; badge dari jumlah belum dibaca |

## Best Practices

- **Asinkron & berbasis event** — service bisnis tidak menunggu provider.
- **Pisahkan prioritas** agar broadcast besar tidak menunda OTP.
- **Idempotency & dedup** di setiap tahap.
- **Hormati preferensi & regulasi** (opt-out, jam tenang).
- **Bersihkan token tidak valid**; simpan versi app untuk payload yang kompatibel.
- **Pantau** delivery rate, latency, ukuran DLQ, biaya SMS.

## Anti-Patterns

- Mengirim notifikasi secara sinkron dalam request API order.
- Satu queue untuk semua jenis notifikasi.
- Retry tanpa batas atau tanpa backoff (membanjiri provider).
- Data sensitif (nomor rekening lengkap, OTP di judul push yang tampil di lock screen tanpa pertimbangan).
- Tidak menghapus token saat logout.

## Performance Considerations

- Broadcast jutaan user: segmentasi → fan-out bertahap dalam batch (FCM mendukung multicast/topic).
- Pre-render template per bahasa; cache preferensi user.
- Partisi tabel `notifications` per waktu dan arsipkan data lama.
- Horizontal scaling worker per channel sesuai panjang queue.

## Security Considerations

- Autentikasi antar-service untuk Notification API; jangan izinkan service sembarang mengirim ke semua user.
- Kredensial FCM/SMS di secret manager.
- Minimalkan data pribadi di payload; deep link harus divalidasi di aplikasi.
- OTP: masa berlaku pendek, rate limit per nomor, cegah SMS pumping (fraud biaya SMS).

## Real-World Use Cases

- Notifikasi status order/pengiriman.
- Pemberitahuan gangguan layanan & jadwal pemeliharaan ke pelanggan di area tertentu.
- Pengingat tagihan & konfirmasi pembayaran.
- Penugasan tiket ke teknisi lapangan.

## Interview Questions

1. Bagaimana memastikan notifikasi tidak terkirim dua kali?
2. Bagaimana agar OTP tidak tertunda oleh broadcast besar?
3. Apa yang terjadi bila provider push/SMS down?
4. Bagaimana mengelola token FCM?
5. Bagaimana mengirim notifikasi ke 5 juta user secepat mungkin?

## Sample Answers

1. Dedup key unik per event bisnis yang disimpan dengan unique constraint; consumer idempoten; status per notifikasi dicek sebelum mengirim ulang.
2. Queue & worker terpisah per prioritas dengan kapasitas khusus untuk high priority; rate limit broadcast.
3. Retry dengan backoff, circuit breaker ke provider, fallback ke channel/provider lain untuk notifikasi kritis, pesan gagal permanen masuk DLQ untuk ditinjau/di-replay.
4. Simpan per user–perangkat dengan platform & `last_seen_at`; perbarui saat `onTokenRefresh`; hapus saat logout dan ketika provider melaporkan token tidak terdaftar; bersihkan token tidak aktif berkala.
5. Gunakan topic/segment bila konten sama; jika personal, fan-out bertahap ke banyak worker dengan batch multicast dan rate limit sesuai kuota provider; pantau progres dan kegagalan.

## Practical Exercises

1. Rancang alur notifikasi gangguan layanan berdasarkan wilayah pelanggan.
2. Tentukan kebijakan retry dan DLQ untuk email vs SMS.
3. Desain in-app inbox dengan badge belum dibaca yang sinkron di beberapa perangkat.

## Quick Reference

```text
Event → Notification service (validasi, dedup, preferensi, template) → queue per channel/prioritas → worker → provider
Retry backoff + jitter → DLQ · token registry (refresh, logout, cleanup) · quiet hours · opt-out
OTP high priority + fallback SMS · broadcast batch + rate limit · pantau delivery & DLQ
```

## Related Topics

- [Message Queue](/system-design/concepts/message-queue/)
- [Event-Driven Architecture](/system-design/concepts/event-driven-architecture/)
- [Monitoring & Notification (case study)](/system-design/case-studies/monitoring-notification/)
- [Design a Ticketing Application](/interview/system-design/ticketing-app/)
