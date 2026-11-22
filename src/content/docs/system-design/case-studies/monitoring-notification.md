---
title: "Monitoring & Notification System"
description: "Studi kasus sistem notifikasi multi-kanal (push, SMS, email, WhatsApp, in-app) beserta pemantauan perangkat/IoT: requirement, arsitektur event → aturan → antrean per kanal, template & lokalisasi, preferensi pengguna & quiet hours, deduplikasi, prioritas, rate limit penyedia, retry & fallback kanal, status pengiriman, manajemen token FCM/APNs, inbox in-app, serta monitoring telemetri dengan alert."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, case-study, notifications, push, fcm, iot, alerting]
---

## Overview

Banyak produk membutuhkan **sistem notifikasi** terpusat: status pesanan, OTP, pengingat, promosi, dan peringatan
operasional. Varian umum dari soal ini adalah **sistem monitoring**: perangkat atau layanan mengirim telemetri, aturan
mendeteksi kondisi abnormal (mis. suhu freezer naik, printer outlet offline), lalu sistem mengirim alert ke orang yang
tepat lewat kanal yang tepat.

## Why It Matters

Notifikasi yang salah desain menyebabkan OTP terlambat, pesan ganda, spam yang membuat pengguna mematikan notifikasi,
atau biaya SMS membengkak. Mobile developer perlu memahami sisi server push (token, prioritas, payload) dan sisi aplikasi
(izin, channel Android, deep link).

## Core Concepts

| Fungsional | Non-fungsional |
| --- | --- |
| Kirim via push, SMS, email, WhatsApp, in-app inbox | OTP < 10 detik end-to-end, transaksional < 1 menit |
| Template & lokalisasi | Tidak ada duplikat untuk event yang sama |
| Preferensi pengguna, opt-out, quiet hours | Skala: jutaan notifikasi promosi per kampanye |
| Prioritas (OTP > transaksi > promosi) | Kanal gagal tidak menghambat kanal lain |
| Status pengiriman & riwayat | Biaya terkendali, kepatuhan consent |
| Aturan alert dari telemetri/event | Auditable |

| Konsep | Penjelasan |
| --- | --- |
| Notification request | "Kirim jenis X ke pengguna Y dengan data Z" dari layanan lain |
| Channel worker | Worker per kanal dengan rate limit sesuai penyedia |
| Fallback | Bila push gagal/tidak dibaca dalam N menit, kirim SMS/WhatsApp (untuk jenis tertentu) |
| Dedup key | Kunci unik per kejadian agar tidak terkirim ganda |
| Alert rule | Kondisi atas telemetri (ambang, durasi, tidak ada data) yang memicu notifikasi |

## How It Works

```text
Layanan (orders, payments, monitoring) → event / POST /notifications (dedupKey, type, userId, data, priority)
→ Notification service: cek dedup → ambil preferensi & consent → pilih kanal → render template (bahasa pengguna)
→ antrean per kanal & prioritas (otp-high, transactional, marketing)
→ worker kanal (FCM/APNs, SMS gateway, email, WhatsApp API) dengan rate limit & retry
→ status (sent, delivered, failed, opened) → notification_log · inbox in-app
Monitoring: telemetri → time-series store → rule engine (setiap 30–60 s) → incident (open/ack/resolved) → notifikasi + eskalasi
```

### Data model

```text
notification_types(code, default_channels, priority, template_keys, requires_consent)
user_preferences(user_id, type_code, channel, enabled) · quiet_hours(user_id, start, end, tz)
devices(id, user_id, platform, push_token, app_version, last_seen_at, status)
notifications(id, dedup_key UNIQUE, user_id, type_code, data_json, priority, created_at)
deliveries(id, notification_id, channel, provider_ref, status, attempts, error, sent_at, delivered_at)
inbox_items(id, user_id, notification_id, title, body, deep_link, read_at)
-- monitoring
metrics(device_id, metric, value, ts)  -- di time-series DB
alert_rules(id, scope, metric, condition, duration, severity, recipients)
incidents(id, rule_id, device_id, status: open|acknowledged|resolved, opened_at, resolved_at)
```

## Implementation

### 1. API notifikasi idempoten

```ts
app.post('/internal/notifications', async (req) => {
  const n = NotifyRequest.parse(req.body);            // { dedupKey, type, userId, data, priority }
  const inserted = await db.query(
    `INSERT INTO notifications (id, dedup_key, user_id, type_code, data_json, priority)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (dedup_key) DO NOTHING RETURNING id`,
    [randomUUID(), n.dedupKey, n.userId, n.type, n.data, n.priority]);
  if (inserted.rowCount === 0) return { status: 'duplicate' };
  await routeQueue.add('route', { notificationId: inserted.rows[0].id }, { priority: n.priority === 'otp' ? 1 : 5 });
  return { status: 'accepted' };
});
```

### 2. Routing & preferensi

```text
OTP & keamanan: abaikan quiet hours & preferensi promosi, kanal: SMS/WhatsApp (push tidak andal untuk OTP)
Transaksional (pesanan, pembayaran): push + inbox. Fallback SMS untuk jenis kritis bila push gagal
Promosi: hanya dengan consent, hormati quiet hours (tunda), batas frekuensi per pengguna (mis. maks 2/hari)
```

### 3. Push: token & payload

```ts
// Kirim ke semua perangkat aktif pengguna, bersihkan token tidak valid
const devices = await db.devices.activeByUser(userId);
const res = await getMessaging().sendEach(devices.map((d) => ({
  token: d.pushToken,
  notification: { title, body },
  data: { type: 'order_ready', orderId, deepLink: `myapp://orders/${orderId}` },
  android: { priority: 'high', notification: { channelId: 'orders' } },
  apns: { payload: { aps: { sound: 'default' } } },
})));
res.responses.forEach((r, i) => {
  if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
    void db.devices.markInvalid(devices[i].id);
  }
});
```

```text
Aplikasi: register/refresh token saat login & onTokenRefresh → kirim ke server dengan device id
Logout: hapus token di server · channel Android per kategori (orders, promo) agar pengguna bisa memilih
Payload tanpa data sensitif (tampil di layar kunci). Detail diambil via API saat dibuka
```

### 4. Retry, rate limit, fallback

```text
Worker per kanal: concurrency & limiter sesuai kuota penyedia (mis. SMS 50/detik)
Retry dengan backoff untuk error sementara (5xx, timeout) · error permanen (nomor invalid) → gagal tanpa retry
Fallback: job tertunda "cek setelah 2 menit": bila push untuk jenis kritis tidak terkirim → kirim SMS
OTP: kirim lewat penyedia utama, failover ke penyedia kedua bila error/terlambat
```

### 5. Inbox in-app

```text
Setiap notifikasi transaksional juga disimpan di inbox (sumber kebenaran untuk riwayat)
Aplikasi menampilkan badge dari count unread (API) dan menandai read · pagination cursor
Push hanyalah sinyal. Inbox memastikan informasi tidak hilang walau push tidak sampai
```

### 6. Monitoring & alert (contoh perangkat outlet)

```text
Perangkat (printer, freezer sensor, aplikasi kasir) mengirim heartbeat/telemetri tiap 60 s
Rule: "freezer_temp > -15°C selama 10 menit" · "tidak ada heartbeat printer 5 menit di jam buka"
Incident dibuka sekali (dedup per rule + device), notifikasi ke manajer outlet
Belum di-ack dalam 15 menit → eskalasi ke area manager · resolve otomatis bila kondisi normal (dengan hysteresis)
```

## Best Practices

- **Satu layanan notifikasi terpusat** dengan API idempoten (dedup key).
- **Antrean per kanal & prioritas**, OTP terpisah dari promosi.
- **Preferensi, consent, quiet hours, batas frekuensi**.
- **Inbox in-app sebagai sumber kebenaran**, push sebagai sinyal.
- **Kelola token perangkat** (refresh, invalid, logout).
- **Alert dengan dedup, ack, eskalasi, auto-resolve**.

## Anti-Patterns

- Setiap layanan memanggil FCM/SMS sendiri-sendiri.
- OTP satu antrean dengan blast promosi (OTP terlambat).
- Mengandalkan push untuk informasi penting tanpa inbox/fallback.
- Payload push berisi data sensitif.
- Alert berulang setiap menit untuk kondisi yang sama (alert storm).

## Performance Considerations

Kampanye besar dipecah menjadi batch dengan limiter. Render template sekali per bahasa/segmen bila memungkinkan.
`sendEach` per batch (batas jumlah per panggilan sesuai SDK). Time-series DB untuk telemetri dengan retensi dan
downsampling. Rule engine mengevaluasi data teragregasi, bukan setiap titik mentah.

## Security Considerations

Endpoint notifikasi internal hanya untuk layanan internal (auth antar layanan). Lindungi dari SMS pumping (limit per
nomor/IP, kuota global), verifikasi kepemilikan nomor, jangan kirim OTP lewat push, dan simpan log pengiriman tanpa isi
sensitif. Token perangkat diperlakukan sebagai data pribadi.

## Real-World Use Cases

- Aplikasi POS: notifikasi "printer outlet offline" ke manajer dengan eskalasi, dan push "pesanan online masuk" ke tablet kasir.
- E-commerce: status pesanan via push + inbox, OTP via SMS dengan failover penyedia, promosi dengan quiet hours.

## Interview Questions

1. Rancang sistem notifikasi multi-kanal untuk aplikasi Anda.
2. Bagaimana mencegah notifikasi terkirim ganda?
3. Bagaimana memastikan OTP tetap cepat saat ada kampanye promosi besar?
4. Bagaimana mencegah alert storm dalam sistem monitoring?

## Sample Answers

1. Layanan notifikasi terpusat dengan API idempoten, routing berdasarkan jenis, preferensi, dan consent, render template sesuai bahasa, antrean per kanal dan prioritas, worker dengan rate limit dan retry, status pengiriman, inbox in-app, serta fallback kanal untuk jenis kritis.
2. Dedup key unik per kejadian (mis. `order:123:ready`) dengan unique constraint, job ID deterministik di antrean, dan consumer yang idempoten.
3. Antrean dan worker terpisah dengan prioritas tertinggi untuk OTP, kuota penyedia yang dicadangkan, failover penyedia, dan rate limit untuk kampanye agar tidak menghabiskan kapasitas.
4. Dedup incident per rule dan perangkat, kondisi dengan durasi dan hysteresis, notifikasi hanya saat status berubah (open, eskalasi, resolved), pengelompokan alert serupa, dan ack untuk menghentikan pengulangan.

## Practical Exercises

1. Implementasikan API notifikasi dengan dedup key dan antrean prioritas.
2. Tambahkan inbox in-app di aplikasi Flutter dengan deep link dari push.
3. Rancang aturan alert heartbeat perangkat dengan eskalasi.

## Quick Reference

```text
API idempoten (dedup_key) → routing (jenis, preferensi, consent, quiet hours) → template → antrean per kanal & prioritas
Worker: limiter penyedia · retry sementara · gagal permanen · fallback kanal · failover penyedia OTP
Push: token per device, refresh, hapus invalid, channel Android, payload tanpa data sensitif · inbox = sumber kebenaran
Monitoring: telemetri → rule (ambang + durasi) → incident (dedup) → notifikasi → ack/eskalasi → auto-resolve
```

## Related Topics

- [Push Notifications (Flutter)](/flutter/push-notifications/)
- [Background Jobs & Queue](/backend/background-jobs-queue/)
- [Monitoring, Logging & Observability](/devops/monitoring-observability/)
