---
title: "OWASP API Security Top 10"
description: "OWASP API Security Top 10 (edisi 2023) dengan contoh nyata pada API yang melayani aplikasi mobile: BOLA, broken authentication, BOPLA (mass assignment & excessive data exposure), unrestricted resource consumption, BFLA, akses tak terbatas ke alur bisnis sensitif, SSRF, security misconfiguration, inventaris API, dan konsumsi API pihak ketiga yang tidak aman."
level: intermediate
status: complete
version: "OWASP API Security Top 10 — 2023. Cek owasp.org untuk edisi terbaru"
updated: 2026-11-13
tags: [security, owasp, api, bola, mass-assignment, ssrf]
---

## Overview

**OWASP API Security Top 10** adalah daftar risiko keamanan paling kritis khusus untuk API. Aplikasi mobile sepenuhnya
bergantung pada API, dan penyerang dapat memanggil API tersebut langsung tanpa aplikasi. Karena itu daftar ini sangat
relevan bagi mobile developer.

## Why It Matters

Banyak kebocoran data besar berasal dari API yang tidak memeriksa kepemilikan objek atau mengembalikan terlalu banyak
data, bukan dari teknik peretasan canggih. Mengenal daftar ini membantu Anda mendesain API yang aman dan menjawab
pertanyaan interview keamanan dengan contoh konkret.

## Core Concepts

| # | Risiko | Inti masalah | Contoh |
| --- | --- | --- | --- |
| API1 | Broken Object Level Authorization (BOLA) | Tidak cek kepemilikan objek | `GET /orders/124` milik orang lain |
| API2 | Broken Authentication | Mekanisme login/token lemah | OTP tanpa rate limit, JWT tidak diverifikasi |
| API3 | Broken Object Property Level Authorization (BOPLA) | Properti dibaca/ditulis tanpa izin | Respons berisi `passwordHash`, body mengubah `role` |
| API4 | Unrestricted Resource Consumption | Tanpa batas sumber daya | `limit=100000`, upload 2 GB, SMS OTP tanpa batas (biaya) |
| API5 | Broken Function Level Authorization (BFLA) | Fungsi admin bisa dipanggil pengguna biasa | `DELETE /admin/users/5` |
| API6 | Unrestricted Access to Sensitive Business Flows | Alur bisnis disalahgunakan otomatis | Bot memborong voucher promo |
| API7 | Server-Side Request Forgery (SSRF) | Server mengambil URL dari input | `imageUrl=http://169.254.169.254/...` |
| API8 | Security Misconfiguration | Konfigurasi tidak aman | Stack trace, CORS `*`, debug aktif |
| API9 | Improper Inventory Management | API lama/tersembunyi tidak terkelola | `/v1` lama tanpa patch, endpoint staging terbuka |
| API10 | Unsafe Consumption of APIs | Mempercayai respons pihak ketiga | Data dari API mitra tidak divalidasi |

## How It Works

Penyerang memakai aplikasi sekali sambil merekam trafik (proxy), lalu memodifikasi request: mengganti ID, menambah field,
menaikkan limit, memanggil endpoint admin, dan mengulang alur bisnis secara otomatis. Semua kontrol di aplikasi mobile
dilewati.

## Implementation

### API1 — BOLA

```ts
// ❌
app.get('/v1/orders/:id', auth, async (req) => db.orders.findById(req.params.id));
// ✅ filter kepemilikan di query
app.get('/v1/orders/:id', auth, async (req) => {
  const order = await db.orders.findOne({ id: req.params.id, tenantId: req.user.tenantId });
  if (!order) throw new NotFoundError();
  return toOrderDto(order);
});
```

### API3 — BOPLA: mass assignment & excessive data exposure

```ts
// ❌ body langsung ke update → pengguna bisa mengirim { "role": "owner", "balance": 999999 }
await db.users.update(req.user.id, req.body);

// ✅ skema strict dengan field yang diizinkan, DTO keluaran eksplisit
const UpdateProfile = z.object({ name: z.string().max(100), phone: z.string().max(20) }).strict();
await db.users.update(req.user.id, UpdateProfile.parse(req.body));
const toUserDto = (u: User) => ({ id: u.id, name: u.name, phone: maskPhone(u.phone) });   // tanpa hash, flag internal
```

Jangan mengandalkan aplikasi untuk "menyembunyikan" field: respons API bisa dilihat dengan proxy.

### API4 — konsumsi sumber daya

```text
- limit maksimum (100), ukuran body, ukuran & jumlah file, timeout query
- Rate limit per user/IP/endpoint. Sangat ketat untuk OTP/SMS/email (biaya nyata)
- Batas kompleksitas (GraphQL), batas batch (sinkron offline: maks 500 operasi)
```

### API5 — BFLA

```ts
app.delete('/v1/admin/users/:id', { preHandler: [authenticate, requirePermission('users:delete')] }, handler);
// Otorisasi fungsi di setiap route admin (deny by default), bukan hanya menyembunyikan menu di aplikasi
```

### API6 — alur bisnis sensitif

```text
Klaim voucher, pembelian stok terbatas, pendaftaran akun, referral:
- Batas per akun/perangkat/nomor telepon
- Deteksi otomasi: Play Integrity / App Attest, pola waktu, device fingerprint (dengan memperhatikan privasi)
- Verifikasi tambahan untuk aksi bernilai tinggi
```

### API7 — SSRF

```ts
// Fitur "impor gambar dari URL"
const url = new URL(input);
if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new ValidationError('URL tidak diizinkan');
// Lebih aman: klien upload file langsung (signed URL), bukan server yang mengambil URL arbitrer.
// Bila tetap harus mengambil: resolve DNS & tolak IP privat/link-local (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16),
// nonaktifkan redirect atau validasi ulang setiap redirect, batasi ukuran & timeout.
```

### API8 & API9 — konfigurasi & inventaris

```text
- Error generik di production, tanpa stack trace · CORS allowlist · header keamanan · debug/docs internal tidak publik
- Daftar semua API & versi (OpenAPI) beserta pemilik & status · matikan versi lama terjadwal
- Staging tidak memakai data production dan tidak terbuka bebas
```

### API10 — konsumsi API pihak ketiga

```text
Validasi skema respons mitra, timeout, TLS, jangan meneruskan data mitra mentah ke klien atau query SQL,
verifikasi signature webhook, dan jangan ikuti redirect sembarangan
```

## Best Practices

- **Otorisasi objek, properti, dan fungsi** di setiap endpoint.
- **Skema input strict & DTO output eksplisit**.
- **Batas sumber daya dan rate limit** di semua endpoint, terutama yang memakan biaya.
- **Inventaris API** (OpenAPI) dengan pemilik dan siklus hidup versi.
- **Test keamanan otomatis**: akses lintas tenant, field terlarang, peran salah.

## Anti-Patterns

- Mengandalkan UUID acak sebagai "proteksi" BOLA.
- Mengembalikan entitas database utuh ke klien.
- Endpoint admin yang hanya "tersembunyi" dari menu aplikasi.
- Server mengambil URL apa pun dari input pengguna.
- API versi lama dibiarkan hidup tanpa pembaruan keamanan.

## Performance Considerations

Batas sumber daya (limit, ukuran, rate) juga melindungi performa. Filter kepemilikan sebaiknya digabungkan ke query
utama dengan index `(tenant_id, id)` agar tidak menambah query terpisah.

## Security Considerations

Lengkapi kontrol dengan monitoring: lonjakan 403/404 dari satu pengguna (enumerasi ID), permintaan OTP berlebihan, dan
pola bot pada alur promo. Uji dengan proxy (Burp/mitmproxy) seperti penyerang, termasuk memanggil API tanpa aplikasi.

## Real-World Use Cases

- Test otomatis: pengguna tenant A memanggil semua endpoint dengan ID milik tenant B, harus mendapat 404.
- Endpoint OTP dibatasi 3 per 10 menit per nomor dan 20 per jam per IP untuk menahan SMS pumping.

## Interview Questions

1. Apa itu BOLA dan mengapa menjadi risiko nomor satu?
2. Apa beda BOLA dan BFLA?
3. Apa itu mass assignment dan cara mencegahnya?
4. Apa itu SSRF dan contoh pencegahannya?
5. Bagaimana mencegah penyalahgunaan alur promo oleh bot?

## Sample Answers

1. Endpoint menerima ID objek tanpa memeriksa apakah pengguna berhak atas objek itu, sehingga data orang lain dapat diakses hanya dengan mengganti ID. Ini sangat umum karena setiap endpoint dengan ID berpotensi rentan dan mudah dieksploitasi.
2. BOLA tentang akses ke objek tertentu (order milik orang lain). BFLA tentang akses ke fungsi yang tidak diizinkan (pengguna biasa memanggil endpoint admin).
3. Framework/ORM mengikat semua field dari body ke model sehingga pengguna dapat mengubah field sensitif seperti `role`. Cegah dengan skema strict berisi field yang diizinkan saja.
4. Server diminta mengambil URL yang dikendalikan penyerang sehingga mengakses jaringan internal atau metadata cloud. Cegah dengan allowlist host, memblokir IP privat setelah resolve DNS, membatasi redirect, atau menghindari fitur ambil-URL.
5. Batas per akun/perangkat/nomor, verifikasi integritas aplikasi (Play Integrity/App Attest), deteksi pola otomatis, rate limit, dan langkah verifikasi tambahan untuk aksi bernilai tinggi.

## Practical Exercises

1. Uji API Anda dengan proxy: ganti ID, tambah field `role`, naikkan `limit`.
2. Tulis test otomatis BOLA/BFLA untuk semua endpoint.
3. Buat inventaris API (OpenAPI) dengan status setiap versi.

## Quick Reference

```text
API1 BOLA → filter tenant/owner di query · API2 auth lemah → rate limit, verifikasi token
API3 BOPLA → skema strict + DTO · API4 resource → limit, ukuran, rate (OTP!)
API5 BFLA → permission per route · API6 alur bisnis → batas per akun/perangkat, integrity
API7 SSRF → allowlist, blok IP privat · API8 misconfig · API9 inventaris versi · API10 validasi API pihak ketiga
```

## Related Topics

- [Authentication vs Authorization](/security/authn-vs-authz/)
- [Secure API Design & Rate Limiting](/security/secure-api-design/)
- [OWASP Top 10](/security/owasp-top-10/)
