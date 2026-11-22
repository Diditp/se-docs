---
title: "Secure Token Storage"
description: "Menyimpan dan mengelola token autentikasi di aplikasi mobile dengan aman: access token di memori, refresh token di Keychain/Keystore (flutter_secure_storage), Android Keystore & iOS Keychain accessibility, refresh token rotation & reuse detection, interceptor refresh yang aman dari race condition, penguncian biometrik, logout & sisa Keychain setelah uninstall."
level: intermediate
status: complete
version: "flutter_secure_storage 9.x/10.x · Android Keystore · iOS Keychain. Opsi plugin berubah antar versi, cek changelog"
updated: 2026-11-13
tags: [security, mobile, token, keychain, keystore, flutter]
---

## Overview

Setelah login, aplikasi memegang **kredensial jangka panjang** (refresh token) dan **kredensial jangka pendek**
(access token). Siapa pun yang mendapatkan refresh token dapat bertindak sebagai pengguna sampai token dicabut. Topik ini
membahas **di mana** token disimpan, **bagaimana** token diperbarui, dan **kapan** token dihapus.

## Why It Matters

Pencurian token adalah jalur umum pengambilalihan akun: token di `SharedPreferences` bisa dibaca dari backup atau
perangkat yang di-root, token di log tersebar ke layanan pihak ketiga, dan refresh tanpa rotasi membuat token curian
berlaku selamanya. OWASP MASVS-STORAGE dan MASVS-AUTH mensyaratkan penyimpanan & pengelolaan sesi yang aman.

## Core Concepts

| Token | Masa berlaku | Disimpan di | Alasan |
| --- | --- | --- | --- |
| Access token | Pendek (5–15 menit) | Memori | Sering dipakai, dampak bocor terbatas waktu |
| Refresh token | Panjang (hari–minggu), dirotasi | Keychain (iOS) / Keystore-backed storage (Android) | Kredensial paling berharga di perangkat |
| PIN/kunci enkripsi DB | Sesuai sesi | Keychain/Keystore, opsional dikunci biometrik | Melindungi data lokal |

| Penyimpanan | Aman untuk secret? |
| --- | --- |
| `SharedPreferences` / `NSUserDefaults` | **Tidak**. Teks biasa di disk, ikut backup |
| File / database biasa | **Tidak**, kecuali dienkripsi dengan kunci dari Keystore/Keychain |
| iOS Keychain | Ya. Dienkripsi hardware, atur accessibility |
| Android Keystore | Ya. Kunci tidak bisa diekspor (bisa di TEE/StrongBox). Data dienkripsi dengan kunci tersebut |

### Konsep penting

- **Refresh token rotation**: setiap refresh mengeluarkan refresh token baru dan mematikan yang lama.
- **Reuse detection**: bila refresh token lama dipakai lagi, kemungkinan dicuri, jadi seluruh *token family* dicabut.
- **Keychain accessibility**: kapan item dapat dibaca (mis. hanya saat perangkat terbuka, tidak ikut ke perangkat lain).

## How It Works

```text
Login → server: access (JWT, 10 menit) + refresh (opaque, 30 hari, family F1)
App: access → memori · refresh → secure storage
Request → 401 (access kedaluwarsa) → satu refresh untuk semua request yang menunggu
→ server: verifikasi refresh, cabut yang lama, terbitkan pasangan baru (family F1)
→ app simpan refresh baru → ulangi request
Refresh lama dipakai lagi → server deteksi reuse → cabut F1 → pengguna harus login ulang
```

## Implementation

### Abstraksi penyimpanan

```dart
class TokenStore {
  TokenStore(this._secure);
  final FlutterSecureStorage _secure;
  String? _accessToken;                                   // hanya di memori

  static const _refreshKey = 'refresh_token';
  static const _iosOptions = IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device);
  // Android: gunakan opsi default plugin versi terbaru (berbasis Keystore). Hindari opsi yang sudah deprecated.

  String? get accessToken => _accessToken;

  Future<void> save({required String access, required String refresh}) async {
    _accessToken = access;
    await _secure.write(key: _refreshKey, value: refresh, iOptions: _iosOptions);
  }

  Future<String?> readRefresh() => _secure.read(key: _refreshKey, iOptions: _iosOptions);

  Future<void> clear() async {
    _accessToken = null;
    await _secure.delete(key: _refreshKey, iOptions: _iosOptions);
  }
}
```

Pilih `first_unlock_this_device` hanya bila kode background perlu membaca token (mis. sinkronisasi). Jika tidak, gunakan
`unlocked_this_device`. Akhiran `_this_device` mencegah item ikut dipindah ke perangkat lain lewat backup.

### Item Keychain bertahan setelah uninstall (iOS)

```dart
Future<void> clearStaleKeychainOnFreshInstall(SharedPreferences prefs, TokenStore store) async {
  if (prefs.getBool('has_run_before') != true) {     // SharedPreferences terhapus saat uninstall, Keychain tidak
    await store.clear();
    await prefs.setBool('has_run_before', true);
  }
}
```

### Interceptor refresh tanpa race condition (Dio)

```dart
class AuthInterceptor extends QueuedInterceptor {          // memproses error satu per satu
  AuthInterceptor(this._store, this._authApi, this._dio, this._onLoggedOut);
  final TokenStore _store;
  final AuthApi _authApi;                                  // Dio terpisah tanpa interceptor ini
  final Dio _dio;
  final void Function() _onLoggedOut;

  @override
  void onRequest(RequestOptions o, RequestInterceptorHandler h) {
    final t = _store.accessToken;
    if (t != null) o.headers['Authorization'] = 'Bearer $t';
    h.next(o);
  }

  @override
  Future<void> onError(DioException e, ErrorInterceptorHandler h) async {
    if (e.response?.statusCode != 401 || e.requestOptions.extra['retried'] == true) return h.next(e);

    final sentWith = e.requestOptions.headers['Authorization'];
    final current = _store.accessToken;
    if (current != null && sentWith != 'Bearer $current') {
      return h.resolve(await _retry(e.requestOptions, current));     // sudah di-refresh oleh request lain
    }

    final refresh = await _store.readRefresh();
    if (refresh == null) { _onLoggedOut(); return h.next(e); }
    try {
      final pair = await _authApi.refresh(refresh);
      await _store.save(access: pair.access, refresh: pair.refresh);  // simpan refresh BARU (rotasi)
      h.resolve(await _retry(e.requestOptions, pair.access));
    } on DioException catch (re) {
      if (re.response?.statusCode == 401) { await _store.clear(); _onLoggedOut(); }   // dicabut/reuse
      h.next(e);
    }
  }

  Future<Response<dynamic>> _retry(RequestOptions o, String token) => _dio.fetch(o
    ..headers['Authorization'] = 'Bearer $token'
    ..extra['retried'] = true);
}
```

### Server: rotasi & reuse detection (garis besar)

```ts
async function refresh(presented: string) {
  const row = await db.refreshTokens.findByHash(sha256(presented));   // simpan HASH, bukan token mentah
  if (!row) throw new UnauthorizedError();
  if (row.revokedAt || row.replacedBy) {                              // token lama dipakai lagi
    await db.refreshTokens.revokeFamily(row.familyId);
    audit.warn('refresh_token_reuse', { userId: row.userId, familyId: row.familyId });
    throw new UnauthorizedError();
  }
  if (row.expiresAt < new Date()) throw new UnauthorizedError();
  const next = randomToken();
  await db.tx(async (t) => {
    const created = await t.refreshTokens.insert({ hash: sha256(next), familyId: row.familyId, userId: row.userId, expiresAt: addDays(30) });
    await t.refreshTokens.update(row.id, { replacedBy: created.id, revokedAt: new Date() });
  });
  return { access: await signAccessToken(row.userId), refresh: next };
}
```

Jaringan mobile bisa membuat respons refresh hilang setelah server merotasi. Banyak implementasi memberi **grace period
singkat** (mis. beberapa detik) agar retry refresh yang sama tidak langsung dianggap pencurian.

### Kunci dengan biometrik (opsional, untuk aksi sensitif)

```text
Android: kunci Keystore dengan setUserAuthenticationRequired(true) + BiometricPrompt dengan CryptoObject
iOS: item Keychain dengan access control biometryCurrentSet
Biometrik membuka KUNCI. Hanya mengecek "biometrik berhasil" (boolean) di Dart mudah di-bypass pada perangkat yang dimodifikasi
```

### Logout yang benar

```text
1. Panggil API revoke (refresh token/family) bila online. Bila offline, tandai untuk dicabut nanti
2. Hapus token dari memori & secure storage
3. Hapus data pengguna yang di-cache (DB lokal bila perlu, cache gambar pribadi)
4. Batalkan sesi lain: unregister token push, tutup WebSocket
```

## Best Practices

- **Access token di memori, refresh token di Keychain/Keystore**.
- **Rotasi refresh token + reuse detection** di server. Simpan hash token di DB.
- **Satu refresh untuk banyak request bersamaan** (QueuedInterceptor/mutex).
- **Accessibility Keychain eksplisit** dan pembersihan setelah reinstall.
- **Logout menghapus semua jejak** dan mencabut token di server.
- **Jangan pernah log token** (redaksi header `Authorization`).

## Anti-Patterns

- Refresh token di `SharedPreferences`, file, atau Hive tanpa enkripsi.
- Access token berumur berhari-hari "agar tidak repot refresh".
- Refresh token yang sama dipakai terus tanpa rotasi.
- Setiap request yang gagal 401 memicu refresh sendiri-sendiri (badai refresh, reuse terdeteksi palsu).
- Mengunci fitur dengan `if (await localAuth.authenticate())` saja untuk data sangat sensitif.

## Performance Considerations

Membaca Keychain/Keystore relatif lambat (milidetik). Baca refresh token hanya saat startup atau refresh, dan simpan
access token di memori. Serialisasikan refresh agar tidak terjadi beberapa panggilan jaringan bersamaan.

## Security Considerations

Secure storage melindungi dari pembacaan file biasa dan backup, tetapi tidak dari perangkat yang sudah dikompromikan
sepenuhnya saat aplikasi berjalan. Karena itu tetap gunakan token berumur pendek, rotasi, pencabutan dari server, deteksi
anomali (perangkat/lokasi baru), dan bila perlu App Attest/Play Integrity. Untuk aplikasi finansial, pertimbangkan
token yang terikat perangkat (device-bound key / proof-of-possession).

## Real-World Use Cases

- Aplikasi kasir: refresh token 30 hari di Keystore, access 10 menit di memori. Logout shift menghapus token dan antrean data pribadi.
- Aplikasi bank: transfer membutuhkan kunci Keystore yang terkunci biometrik untuk menandatangani request.
- Deteksi reuse mencabut sesi ketika refresh token lama muncul dari perangkat lain.

## Interview Questions

1. Di mana Anda menyimpan access token dan refresh token di aplikasi Flutter?
2. Apa itu refresh token rotation dan reuse detection?
3. Bagaimana mencegah banyak refresh bersamaan saat beberapa request mendapat 401?
4. Mengapa `SharedPreferences` tidak aman untuk token?
5. Apa saja yang dilakukan saat logout?

## Sample Answers

1. Access token di memori karena berumur pendek. Refresh token di `flutter_secure_storage`, yang memakai Keychain di iOS dan penyimpanan terenkripsi kunci Keystore di Android, dengan accessibility Keychain yang dipilih eksplisit.
2. Rotasi: setiap refresh menghasilkan refresh token baru dan menonaktifkan yang lama. Reuse detection: bila token lama dipakai lagi, server menganggapnya dicuri dan mencabut seluruh keluarga token sehingga penyerang dan pengguna harus login ulang.
3. Serialisasikan penanganan 401 (QueuedInterceptor atau mutex). Request yang datang belakangan memeriksa apakah token sudah diperbarui lalu cukup mengulang dengan token baru.
4. Disimpan sebagai teks biasa di sandbox aplikasi, bisa ikut backup, dan mudah dibaca di perangkat root/jailbreak atau oleh alat forensik.
5. Cabut token di server, hapus token dari memori dan secure storage, hapus data pengguna yang tersimpan lokal sesuai kebijakan, unregister push token, dan tutup koneksi real-time.

## Practical Exercises

1. Implementasikan `TokenStore` + `AuthInterceptor` dan uji dengan 5 request paralel yang semuanya mendapat 401.
2. Implementasikan rotasi + reuse detection di server dan tulis integration test-nya.
3. Uji perilaku Keychain setelah uninstall-reinstall di iOS.

## Quick Reference

```text
Access → memori (5–15 menit) · Refresh → Keychain/Keystore (rotasi, hash di DB)
Reuse lama → cabut family · grace period kecil untuk jaringan buruk
QueuedInterceptor: satu refresh, request lain retry dengan token baru · Dio terpisah untuk refresh
iOS: accessibility eksplisit, *_this_device, bersihkan Keychain saat fresh install
Biometrik membuka kunci (CryptoObject/access control), bukan boolean
Logout: revoke server + hapus storage + data lokal + push token
```

## Related Topics

- [JWT Security](/security/jwt-security/)
- [Mobile Application Security](/security/mobile-app-security/)
- [Authentication & Authorization (Backend)](/backend/authentication-authorization/)
