---
title: "Authentication vs Authorization"
description: "Perbedaan autentikasi (siapa Anda) dan otorisasi (boleh melakukan apa): faktor autentikasi & MFA, sesi vs token, OAuth 2.0 & OpenID Connect untuk aplikasi mobile (Authorization Code + PKCE), model otorisasi RBAC/ABAC/ReBAC, otorisasi tingkat objek (BOLA/IDOR), multi-tenant, penegakan di server, serta implementasi middleware dan policy di Node.js dan pengaturan UI di Flutter."
level: beginner
status: complete
version: "OAuth 2.0 (RFC 6749) · PKCE (RFC 7636) · OAuth for Native Apps (RFC 8252) · OpenID Connect"
updated: 2026-11-13
tags: [security, authentication, authorization, oauth2, oidc, rbac]
---

## Overview

- **Authentication (AuthN)** menjawab **"Siapa Anda?"**: memverifikasi identitas (password, OTP, biometrik, login Google).
- **Authorization (AuthZ)** menjawab **"Apa yang boleh Anda lakukan?"**: memeriksa izin terhadap aksi dan data tertentu.

Autentikasi selalu terjadi lebih dulu. Otorisasi dilakukan **setiap kali** ada aksi terhadap data, bukan hanya saat login.

## Why It Matters

Broken Object Level Authorization (BOLA) adalah risiko nomor satu di OWASP API Security Top 10. Contoh klasik: pengguna
yang sudah login mengganti `GET /orders/123` menjadi `/orders/124` dan melihat order milik orang lain. Autentikasinya
benar, otorisasinya yang gagal.

## Core Concepts

| Aspek | Authentication | Authorization |
| --- | --- | --- |
| Pertanyaan | Siapa Anda? | Boleh melakukan apa? |
| Kapan | Login, refresh sesi | Setiap request/aksi |
| Contoh | Password + OTP, Sign in with Google | Kasir boleh membuat order, hanya manajer boleh void |
| Gagal → HTTP | 401 Unauthorized | 403 Forbidden (atau 404 untuk menyembunyikan data) |
| Standar | OpenID Connect, WebAuthn/passkey | OAuth 2.0 scopes, RBAC/ABAC policy |

### Faktor autentikasi

| Faktor | Contoh |
| --- | --- |
| Sesuatu yang diketahui | Password, PIN |
| Sesuatu yang dimiliki | Perangkat (OTP app, passkey, SMS sebagai opsi terlemah) |
| Sesuatu pada diri | Biometrik (umumnya membuka kunci di perangkat, bukan dikirim ke server) |

MFA menggabungkan ≥ 2 faktor berbeda. **Passkey** (WebAuthn/FIDO2) menggabungkan kepemilikan perangkat dan biometrik/PIN,
serta tahan phishing.

### Model otorisasi

| Model | Ide | Contoh |
| --- | --- | --- |
| RBAC (role-based) | Izin melekat pada peran | `cashier`, `manager`, `owner` |
| ABAC (attribute-based) | Keputusan dari atribut user, resource, konteks | Void hanya < 24 jam dan nilai < Rp1 juta |
| ReBAC (relationship-based) | Berdasarkan relasi | User adalah anggota outlet yang memiliki order |
| Scopes (OAuth) | Izin yang didelegasikan ke aplikasi klien | `orders:read` |

Dalam praktik sering digabung: RBAC untuk izin kasar, pemeriksaan relasi/kepemilikan untuk setiap objek.

### OAuth 2.0 vs OpenID Connect

- **OAuth 2.0** adalah kerangka **otorisasi terdelegasi**: aplikasi mendapat access token untuk memanggil API atas nama pengguna.
- **OpenID Connect (OIDC)** adalah lapisan **autentikasi** di atas OAuth 2.0: menambahkan ID token berisi identitas pengguna.
- Untuk aplikasi mobile: gunakan **Authorization Code + PKCE** melalui browser sistem (RFC 8252), bukan WebView dan bukan *implicit flow*.

## How It Works

```text
Request → [AuthN] verifikasi token (tanda tangan, exp, aud) → identitas: userId, tenantId, roles
        → [AuthZ kasar] apakah peran boleh melakukan aksi ini? (orders:void)
        → [AuthZ objek] apakah resource ini milik tenant/outlet user? (order.outlet_id ∈ outlet user)
        → [AuthZ bisnis] aturan kontekstual (void < 24 jam)
        → eksekusi
```

## Implementation

### Node.js: middleware autentikasi + policy otorisasi

```ts
// AuthN: siapa
export async function authenticate(req: FastifyRequest) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) throw new UnauthorizedError();
  req.user = await verifyAccessToken(token);           // { userId, tenantId, roles }
}

// AuthZ: izin peran (kasar)
const PERMISSIONS = {
  cashier: ['orders:create', 'orders:read'],
  manager: ['orders:create', 'orders:read', 'orders:void', 'reports:read'],
  owner:   ['*'],
} as const;

export const requirePermission = (perm: string) => async (req: FastifyRequest) => {
  const ok = req.user.roles.some((r) => {
    const perms: readonly string[] = PERMISSIONS[r as keyof typeof PERMISSIONS] ?? [];
    return perms.includes('*') || perms.includes(perm);
  });
  if (!ok) throw new ForbiddenError();
};
```

```ts
// AuthZ objek + aturan bisnis: di service, dengan query yang dibatasi tenant
async function voidOrder(user: AuthUser, orderId: string, reason: string) {
  const order = await orderRepo.findForTenant(orderId, user.tenantId);   // WHERE id = $1 AND tenant_id = $2
  if (!order) throw new NotFoundError();                                  // bukan miliknya → tidak terlihat
  if (!(await outletMembers.isMember(user.userId, order.outletId))) throw new NotFoundError();
  if (order.status !== 'paid') throw new ConflictError('Order tidak dapat di-void');
  if (Date.now() - order.paidAt.getTime() > 24 * 3600_000) throw new ForbiddenError('Melewati batas void');
  await orderRepo.void(order.id, user.userId, reason);
  audit.info('order_voided', { orderId, by: user.userId, reason });
}

app.post('/v1/orders/:id/void', { preHandler: [authenticate, requirePermission('orders:void')] },
  async (req) => voidOrder(req.user, req.params.id, req.body.reason));
```

### Multi-tenant: ID dari token, bukan dari body

```ts
// ❌ tenant dari input pengguna
await orderRepo.list(req.query.tenantId);
// ✅ tenant dari identitas terverifikasi
await orderRepo.list(req.user.tenantId);
```

Sebagai lapisan tambahan, PostgreSQL Row Level Security dapat memastikan query yang lupa filter tetap tidak membocorkan data
tenant lain.

### Flutter: UI menyesuaikan izin, server tetap menegakkan

```dart
class Can extends StatelessWidget {
  const Can(this.permission, {super.key, required this.child});
  final String permission;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final allowed = context.select((SessionCubit c) => c.state.permissions.contains(permission));
    return allowed ? child : const SizedBox.shrink();
  }
}

// Tombol void hanya tampil untuk manajer. Bila API tetap mengembalikan 403, tampilkan pesan yang sesuai
Can('orders:void', child: VoidOrderButton(orderId: order.id));
```

Menyembunyikan tombol hanya untuk UX. Penyerang bisa memanggil API langsung, jadi server adalah penentu akhir.

### Login OIDC di mobile (garis besar)

```text
App buat code_verifier acak + code_challenge = SHA256(verifier)
→ buka browser sistem ke /authorize?response_type=code&client_id=..&redirect_uri=com.example.pos:/cb&code_challenge=..&state=..
→ pengguna login di halaman identity provider (password/MFA/passkey)
→ redirect ke app dengan code + state (cek state sama)
→ app tukar code + code_verifier di /token → access token, refresh token, ID token
Library: AppAuth (Android/iOS), flutter_appauth
```

## Best Practices

- **Otorisasi di server untuk setiap request dan setiap objek**.
- **Deny by default**: izin harus diberikan eksplisit.
- **Identitas & tenant dari token terverifikasi**, bukan dari input.
- **Pisahkan izin kasar (peran) dan pemeriksaan objek/aturan bisnis**, lalu uji keduanya.
- **MFA/passkey untuk akun berisiko tinggi** (owner, admin).
- **Audit log** untuk aksi sensitif (void, refund, ubah harga, ubah peran).

## Anti-Patterns

- Mengandalkan UI yang menyembunyikan tombol sebagai kontrol akses.
- Endpoint yang hanya mengecek "sudah login" lalu mengembalikan data berdasarkan ID dari URL.
- Peran atau izin dikirim dari klien dan dipercaya server.
- Login di WebView buatan sendiri untuk OAuth (pengguna mengetik password di app pihak ketiga, rentan phishing).
- Satu peran "admin" untuk semua hal tanpa pemisahan tugas.

## Performance Considerations

Pemeriksaan otorisasi berjalan di setiap request. Simpan peran di token (claims) untuk pemeriksaan kasar tanpa DB, cache
keanggotaan outlet dengan TTL pendek bila mahal, dan gabungkan filter kepemilikan ke dalam query utama
(`WHERE tenant_id = $2`) alih-alih query terpisah.

## Security Considerations

Perubahan peran harus berlaku cepat: access token berumur pendek atau pemeriksaan versi izin. Gunakan 404 untuk resource
milik orang lain bila keberadaannya sensitif. Rate limit endpoint login/OTP, kunci akun sementara secara bijak (hindari
penguncian yang bisa disalahgunakan), dan pesan error login yang generik.

## Real-World Use Cases

- POS multi-outlet: kasir hanya melihat order outletnya. Manajer bisa void dalam 24 jam. Owner melihat laporan semua outlet.
- Integration test otomatis mencoba membaca order tenant lain dan memastikan hasilnya 404.
- Login karyawan memakai OIDC perusahaan (Google Workspace/Azure AD) dengan PKCE.

## Interview Questions

1. Apa beda authentication dan authorization?
2. Apa itu BOLA/IDOR dan bagaimana mencegahnya?
3. Apa beda RBAC dan ABAC?
4. Apa beda OAuth 2.0 dan OpenID Connect?
5. Mengapa aplikasi mobile memakai Authorization Code + PKCE?
6. Apakah cukup menyembunyikan tombol di UI untuk peran tertentu?

## Sample Answers

1. Authentication memverifikasi identitas pengguna. Authorization menentukan apakah identitas tersebut boleh melakukan aksi pada resource tertentu. Gagal authN menghasilkan 401, gagal authZ menghasilkan 403.
2. Pengguna mengakses objek milik orang lain dengan mengganti ID. Cegah dengan selalu memfilter query berdasarkan pemilik/tenant dari token, memeriksa relasi pengguna dengan objek di service, dan menguji akses lintas pengguna secara otomatis.
3. RBAC memberi izin berdasarkan peran. ABAC memutuskan dari atribut pengguna, resource, dan konteks (waktu, jumlah, lokasi). ABAC lebih fleksibel, RBAC lebih sederhana. Sering digabung.
4. OAuth 2.0 untuk otorisasi terdelegasi (access token ke API). OIDC menambahkan autentikasi di atasnya dengan ID token dan endpoint userinfo.
5. Aplikasi mobile tidak bisa menyimpan client secret. PKCE mengikat permintaan authorization code ke verifier rahasia sementara sehingga code yang dicegat tidak bisa ditukar oleh aplikasi lain. Browser sistem memastikan pengguna memasukkan kredensial di halaman identity provider.
6. Tidak. Itu hanya UX. Server harus menegakkan izin karena API bisa dipanggil langsung.

## Practical Exercises

1. Rancang matriks peran × izin untuk aplikasi POS Anda.
2. Implementasikan pemeriksaan kepemilikan objek dan tulis test BOLA (akses data tenant lain → 404).
3. Integrasikan login OIDC dengan `flutter_appauth` ke identity provider uji.

## Quick Reference

```text
AuthN = siapa (401) · AuthZ = boleh apa (403/404) · authZ di setiap request & objek
MFA/passkey · sesi/token berumur pendek
OAuth2 = delegasi akses · OIDC = identitas (ID token) · mobile: Auth Code + PKCE + browser sistem
RBAC (peran) + cek objek/relasi (ReBAC) + aturan bisnis (ABAC) · deny by default
Tenant/user dari token · UI menyembunyikan untuk UX, server menegakkan · audit aksi sensitif
```

## Related Topics

- [JWT Security](/security/jwt-security/)
- [Authentication & Authorization (Backend)](/backend/authentication-authorization/)
- [OWASP Top 10](/security/owasp-top-10/)
