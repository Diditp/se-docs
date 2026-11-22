---
title: "Backend Ringan untuk Mobile Developer (BaaS, Serverless, BFF)"
description: "Pilihan backend yang realistis untuk mobile developer: BaaS (Firebase, Supabase), serverless functions, API Node.js kecil, dan Backend-for-Frontend. Berisi kriteria memilih, keamanan (security rules, Row Level Security, validasi server), kebutuhan backend khas mobile (push, upload file, webhook pembayaran, force update, idempotensi), contoh kode, dan jalur migrasi saat aplikasi tumbuh."
level: intermediate
status: complete
version: "Firebase (Cloud Functions 2nd gen) · Supabase · Node.js 22 LTS. Fitur & harga layanan berubah, cek dokumentasi resmi"
updated: 2026-11-13
tags: [backend, firebase, supabase, serverless, bff, mobile]
---

## Overview

Banyak lowongan mobile meminta "pengalaman backend" atau "mampu membuat API sederhana". Mobile developer tidak harus
menjadi backend engineer penuh, tetapi perlu bisa:

1. **Memilih** backend yang tepat untuk skala produk (BaaS, serverless, atau API sendiri).
2. **Membangun** backend kecil yang aman untuk kebutuhan khas mobile.
3. **Berkolaborasi** dengan tim backend: membaca kontrak API, mengusulkan endpoint ramah mobile, dan memahami trade-off.

## Why It Matters

Mobile developer yang paham backend dapat membangun MVP sendiri, mendesain sinkronisasi offline dengan benar, dan
menghindari kesalahan fatal seperti logika harga/otorisasi di klien. Ini sering menjadi pembeda di interview.

## Core Concepts

| Pendekatan | Contoh | Kelebihan | Kekurangan |
| --- | --- | --- | --- |
| BaaS (Backend-as-a-Service) | Firebase (Firestore, Auth, Storage), Supabase (Postgres, Auth, Storage, Realtime) | Cepat, SDK mobile matang, auth & realtime siap pakai | Vendor lock-in, aturan akses harus benar, biaya per penggunaan, query terbatas (Firestore) |
| Serverless functions | Cloud Functions, Cloud Run, AWS Lambda, Supabase Edge Functions | Logika server tanpa mengelola server, skala otomatis | Cold start, batas waktu eksekusi, debugging & observabilitas lebih sulit |
| API sendiri (monolith kecil) | Node.js (Fastify/NestJS) + PostgreSQL di container | Kontrol penuh, query SQL bebas, portabel | Harus mengelola deploy, keamanan, scaling |
| BFF (Backend-for-Frontend) | Layer API khusus aplikasi mobile di depan service lain | Respons sesuai layar, agregasi, kontrol versi aplikasi | Satu komponen lagi untuk dirawat |

### Aturan emas

```text
Klien (mobile) TIDAK PERNAH dipercaya.
Harga, diskon, stok, saldo, otorisasi, dan validasi akhir ada di server
(atau di security rules / RLS yang diuji). Aplikasi dapat dimodifikasi, di-replay, atau diganti dengan skrip.
```

## How It Works

```text
Pertanyaan memilih backend:
1. Data relasional & laporan kompleks?            → Postgres (Supabase atau API sendiri)
2. Butuh realtime/offline sync cepat untuk MVP?    → Firestore / Supabase Realtime
3. Ada logika sensitif (pembayaran, stok, harga)?  → Functions / API server, bukan klien
4. Integrasi pihak ketiga (payment, SMS, ERP)?     → Server (secret tidak boleh di app)
5. Tim & anggaran operasional?                     → BaaS/serverless bila tim kecil; API sendiri bila butuh kontrol
```

## Implementation

### 1. Supabase: Row Level Security sebagai garis pertahanan

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Pengguna hanya bisa membaca order milik outlet tempat ia menjadi anggota
CREATE POLICY "members read outlet orders" ON orders
FOR SELECT USING (
  outlet_id IN (SELECT outlet_id FROM outlet_members WHERE user_id = auth.uid())
);

-- Tidak ada policy INSERT langsung: pembuatan order lewat function server yang menghitung harga
```

```dart
final rows = await Supabase.instance.client
    .from('orders')
    .select('id, total, created_at')
    .eq('outlet_id', outletId)
    .order('created_at', ascending: false)
    .limit(20);
```

Kunci `anon` Supabase memang berada di aplikasi. Keamanan sepenuhnya bergantung pada RLS. Kunci `service_role` hanya
untuk server.

### 2. Firebase: callable function untuk logika sensitif

```ts
// functions/src/index.ts (Cloud Functions 2nd gen)
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const createOrder = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login diperlukan');
  const input = parseCreateOrder(request.data);                    // validasi skema (mis. zod)
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(db.doc(`idempotency/${input.idempotencyKey}`));
    if (existing.exists) return existing.data()!.result;            // retry aman

    const total = await priceFromServer(tx, input.items);           // harga dihitung server, bukan dari klien
    const orderRef = db.collection('orders').doc();
    tx.set(orderRef, { ...input, total, userId: request.auth!.uid, createdAt: new Date() });
    const result = { orderId: orderRef.id, total };
    tx.set(db.doc(`idempotency/${input.idempotencyKey}`), { result });
    return result;
  });
});
```

```dart
final res = await FirebaseFunctions.instance.httpsCallable('createOrder').call({
  'outletId': outletId,
  'items': items.map((i) => {'productId': i.id, 'qty': i.qty}).toList(),
  'idempotencyKey': idempotencyKey,
});
```

Firestore security rules tetap wajib, misalnya menolak penulisan langsung ke koleksi `orders` dari klien.

### 3. API Node.js kecil (bila butuh SQL & kontrol penuh)

```ts
const app = Fastify({ logger: true });

app.post('/v1/orders', { preHandler: [authenticate] }, async (req, reply) => {
  const input = CreateOrderSchema.parse(req.body);                  // validasi
  await authz.requireOutletMember(req.user.id, input.outletId);     // otorisasi objek
  const order = await orderService.create(req.user.id, input, req.headers['idempotency-key']);
  return reply.code(201).send(order);
});
```

Struktur, autentikasi, dan deploy dibahas di domain Backend & DevOps.

### 4. Kebutuhan backend khas aplikasi mobile

| Kebutuhan | Solusi di server |
| --- | --- |
| Push notification | Simpan token FCM per perangkat, kirim dari server (`firebase-admin` messaging), hapus token invalid |
| Upload foto/dokumen | Server memberi **signed URL** berumur pendek, app upload langsung ke storage |
| Pembayaran | Payment gateway dipanggil server. **Webhook** diverifikasi signature-nya dan diproses idempoten |
| Retry dari jaringan buruk | `Idempotency-Key` per operasi tulis |
| Sinkronisasi offline | Endpoint batch + `updated_since` (delta), konflik ditangani di server |
| Force/soft update | Endpoint/Remote Config `min_supported_version`, dicek saat startup |
| Versi aplikasi lama | Kontrak API kompatibel mundur, deprecate bertahap |
| Rate limiting & abuse | Rate limit per user/IP, App Check / Play Integrity / App Attest |

```ts
// Mengirim push dari server
import { getMessaging } from 'firebase-admin/messaging';

await getMessaging().send({
  token: deviceToken,
  notification: { title: 'Pesanan siap', body: `Order ${orderNo} siap diambil` },
  data: { type: 'order_ready', orderId },                         // untuk deep link, tanpa data sensitif
});
```

### 5. Jalur pertumbuhan yang wajar

```text
MVP: BaaS (+ functions untuk logika sensitif)
→ Tumbuh: tambah API/BFF untuk laporan, integrasi, dan logika kompleks; BaaS tetap untuk auth/storage
→ Skala besar: service terpisah sesuai domain, BFF untuk mobile, observabilitas penuh
Rancang lapisan repository di aplikasi agar sumber data bisa diganti tanpa menulis ulang UI.
```

## Best Practices

- **Logika sensitif di server**, bukan di klien.
- **Security rules/RLS diuji** seperti kode (emulator Firebase, test policy Supabase).
- **Secret pihak ketiga hanya di server**: payment, SMS, service account.
- **Kontrak API stabil & kompatibel mundur** karena pengguna tidak langsung update aplikasi.
- **Observabilitas sejak awal**: log terstruktur, error tracking, alert biaya.
- **Abstraksi repository di mobile** agar backend bisa diganti.

## Anti-Patterns

- Menghitung total harga atau diskon di aplikasi lalu mengirimnya ke server sebagai kebenaran.
- Firestore rules `allow read, write: if true;` atau tabel Supabase tanpa RLS.
- Menyimpan `service_role` key/API key payment di aplikasi.
- Query Firestore dari klien yang membaca seluruh koleksi (biaya & kebocoran data).
- Memproses webhook pembayaran tanpa verifikasi signature dan idempotensi.

## Performance Considerations

BaaS menagih per operasi baca/tulis, jadi desain data agar layar membaca sedikit dokumen (denormalisasi terencana,
agregasi di server). Serverless memiliki cold start, sehingga fungsi yang dipanggil di jalur kritis (checkout) perlu
instance minimum atau dipindah ke API yang selalu hidup. Gunakan pagination dan delta sync untuk mobile.

## Security Considerations

Anggap semua yang ada di aplikasi bisa dibaca penyerang: API key publik (Firebase/Supabase anon) aman **hanya** bila rules/RLS
benar. Gunakan App Check/Play Integrity untuk mengurangi penyalahgunaan, otorisasi per objek, validasi input di server,
dan pantau anomali biaya sebagai sinyal serangan.

## Real-World Use Cases

- MVP aplikasi pemesanan: Supabase Auth + Postgres dengan RLS, Edge Function untuk pembayaran & webhook.
- Aplikasi POS: Firestore untuk sinkronisasi menu realtime, Cloud Function untuk pembuatan order dan stok.
- Aplikasi yang tumbuh: BFF Node.js di depan layanan lama (ERP) untuk memberi endpoint ringkas ke mobile.

## Interview Questions

1. Kapan Anda memilih Firebase/Supabase dibanding membangun API sendiri?
2. Mengapa logika harga tidak boleh ada di klien?
3. Apa itu Backend-for-Frontend?
4. Bagaimana mengamankan Firestore/Supabase bila API key ada di aplikasi?
5. Bagaimana menangani webhook pembayaran dengan aman?

## Sample Answers

1. BaaS untuk MVP atau tim kecil yang butuh auth, storage, dan realtime cepat dengan logika server terbatas. API sendiri ketika butuh query relasional kompleks, integrasi banyak sistem, kontrol penuh atas biaya/vendor, atau aturan bisnis yang rumit.
2. Aplikasi dapat dimodifikasi atau request dapat dipalsukan, sehingga nilai dari klien tidak dapat dipercaya. Server harus menghitung ulang harga dari data yang ia kontrol.
3. Layer API yang khusus melayani satu jenis klien (mis. aplikasi mobile), mengagregasi data dari beberapa service dan membentuk respons sesuai kebutuhan layar.
4. API key publik hanya mengidentifikasi proyek. Keamanan berasal dari security rules/RLS yang membatasi akses per pengguna/objek, App Check, dan logika sensitif di functions dengan kredensial server.
5. Terima di endpoint server, verifikasi signature/sumber, proses secara idempoten berdasarkan ID event, perbarui status dalam transaksi, dan kirim notifikasi ke aplikasi. Jangan mempercayai status pembayaran dari klien.

## Practical Exercises

1. Buat tabel `orders` di Supabase dengan RLS dan uji bahwa pengguna lain tidak bisa membaca data.
2. Pindahkan perhitungan total dari aplikasi ke callable function/endpoint server.
3. Implementasikan signed URL upload dan force update `min_supported_version`.

## Quick Reference

```text
BaaS (Firebase/Supabase) · serverless functions · API sendiri · BFF
Klien tidak dipercaya → harga/stok/otorisasi di server · rules/RLS diuji · secret hanya di server
Mobile needs: FCM dari server · signed URL upload · webhook verify + idempoten · Idempotency-Key · delta sync · min_supported_version
Repository abstraction → backend bisa diganti saat tumbuh
```

## Related Topics

- [Firebase Integration](/flutter/firebase-integration/)
- [Backend Architecture](/backend/backend-architecture/)
- [Authentication & Authorization](/backend/authentication-authorization/)
