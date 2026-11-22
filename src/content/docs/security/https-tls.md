---
title: "HTTPS & TLS"
description: "Memahami HTTPS dan TLS untuk mobile & backend: apa yang dilindungi TLS, handshake TLS 1.3, sertifikat & rantai kepercayaan, validasi hostname, HSTS, konfigurasi server (TLS termination, versi & cipher), aturan platform (Android Network Security Config, iOS ATS), certificate/public key pinning beserta risikonya, dan debugging dengan proxy hanya di build debug."
level: intermediate
status: complete
version: "TLS 1.2/1.3 · Android Network Security Config · iOS App Transport Security · Dio 5.x"
updated: 2026-11-13
tags: [security, tls, https, certificate-pinning, mobile, ats]
---

## Overview

**HTTPS** adalah HTTP di atas **TLS (Transport Layer Security)**. TLS memberi tiga jaminan pada data yang berpindah di
jaringan:

1. **Kerahasiaan**: pihak di tengah tidak bisa membaca isi.
2. **Integritas**: isi tidak bisa diubah tanpa terdeteksi.
3. **Autentikasi server**: klien yakin sedang berbicara dengan server yang benar (lewat sertifikat).

TLS **tidak** melindungi data di perangkat atau di server, dan tidak membuktikan bahwa klien adalah aplikasi Anda.

## Why It Matters

Aplikasi mobile sering dipakai di Wi-Fi publik (kafe, bandara). Tanpa TLS yang benar, token dan data pribadi dapat
disadap atau diubah oleh serangan man-in-the-middle (MITM). Kesalahan umum seperti menerima semua sertifikat
(`badCertificateCallback => true`) membuka celah yang sama parahnya dengan tidak memakai HTTPS.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Sertifikat | Mengikat public key ke nama domain, ditandatangani Certificate Authority (CA) |
| Rantai kepercayaan | Leaf → intermediate → root CA yang ada di trust store OS |
| Validasi hostname | Nama di sertifikat (SAN) harus cocok dengan host yang dihubungi |
| TLS 1.3 | Handshake 1-RTT, hanya cipher modern, forward secrecy wajib |
| Forward secrecy | Kunci sesi sementara (ECDHE), sehingga kebocoran private key nanti tidak membuka trafik lama |
| HSTS | Header yang memaksa browser selalu memakai HTTPS untuk domain tersebut |
| Pinning | Aplikasi hanya menerima sertifikat/public key tertentu, bukan semua yang dipercaya OS |
| mTLS | Klien juga menunjukkan sertifikat (umum untuk service-to-service) |

## How It Works

```text
TLS 1.3 (disederhanakan):
Client → ClientHello (versi, cipher, key share ECDHE, SNI = api.example.com)
Server → ServerHello (key share) + Certificate + CertificateVerify + Finished   (sudah terenkripsi)
Client: validasi rantai sertifikat ke root tepercaya + hostname + masa berlaku → Finished
Keduanya menurunkan kunci sesi simetris → data HTTP terenkripsi (AES-GCM / ChaCha20-Poly1305)
```

## Implementation

### Server: konfigurasi dasar yang baik

```text
- TLS 1.2 + 1.3 saja (matikan SSLv3, TLS 1.0, 1.1)
- Sertifikat dari CA publik (mis. Let's Encrypt) dengan perpanjangan otomatis & monitoring kedaluwarsa
- Kirim rantai lengkap (leaf + intermediate). Rantai tidak lengkap sering gagal di Android lama
- TLS termination di load balancer/reverse proxy. Trafik internal juga terenkripsi bila melewati jaringan tak tepercaya
- Redirect HTTP → HTTPS. Untuk domain web tambahkan HSTS
```

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Periksa konfigurasi dengan alat seperti SSL Labs Server Test atau `openssl s_client -connect api.example.com:443 -servername api.example.com`.

### Android: Network Security Config

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />          <!-- default untuk targetSdk 28+ -->
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>       <!-- server lokal emulator, hanya dev (lebih baik flavor debug) -->
  </domain-config>
  <debug-overrides>
    <trust-anchors><certificates src="user" /></trust-anchors>   <!-- proxy debugging hanya di build debug -->
  </debug-overrides>
</network-security-config>
```

```xml
<application android:networkSecurityConfig="@xml/network_security_config" ...>
```

### iOS: App Transport Security

ATS mewajibkan HTTPS dengan TLS modern secara default. Jangan menambahkan `NSAllowsArbitraryLoads`. Bila benar-benar perlu
pengecualian (perangkat lokal seperti printer di LAN), batasi ke domain tertentu di `NSExceptionDomains` dan dokumentasikan
alasannya.

### Flutter: jangan pernah menonaktifkan validasi

```dart
// ❌ JANGAN: menerima sertifikat apa pun = MITM terbuka
(dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () =>
    HttpClient()..badCertificateCallback = (cert, host, port) => true;
```

### Certificate / public key pinning (bila diperlukan)

Pinning menambah perlindungan bila ada CA yang dikompromikan atau perangkat memasang CA berbahaya, tetapi **berisiko
mengunci pengguna keluar** saat sertifikat berganti. Rencana rotasi wajib ada.

```xml
<!-- Android: pin public key (SPKI) dengan pin cadangan dan tanggal kedaluwarsa -->
<domain-config>
  <domain includeSubdomains="true">api.example.com</domain>
  <pin-set expiration="2027-06-30">
    <pin digest="SHA-256">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=</pin>   <!-- kunci aktif -->
    <pin digest="SHA-256">BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=</pin>   <!-- kunci cadangan (belum dipakai) -->
  </pin-set>
</domain-config>
```

```dart
// Flutter + Dio 5: validasi tambahan setelah validasi sistem berhasil
final allowedSha256 = {'3f1a…', '9c2b…'};    // fingerprint sertifikat aktif + cadangan (DER, SHA-256)

dio.httpClientAdapter = IOHttpClientAdapter(
  validateCertificate: (cert, host, port) {
    if (cert == null) return false;
    return allowedSha256.contains(sha256.convert(cert.der).toString());
  },
);
// Mem-pin sertifikat leaf berarti harus memperbarui app sebelum sertifikat diganti. Pin public key/intermediate lebih tahan rotasi
```

| Pilihan pin | Kelebihan | Kekurangan |
| --- | --- | --- |
| Leaf certificate | Paling ketat | Harus update app setiap ganti sertifikat (Let's Encrypt: tiap ~90 hari) |
| Public key leaf (SPKI) | Bertahan bila sertifikat diperbarui dengan kunci sama | Harus mengelola kunci |
| Intermediate CA | Rotasi sertifikat mudah | Lebih longgar. CA bisa mengganti intermediate |

Strategi aman: selalu sertakan **pin cadangan**, gunakan **remote kill switch** (Remote Config) untuk menonaktifkan pinning
bila darurat, dan pantau error TLS di produksi.

### Debugging trafik

Untuk melihat request saat pengembangan, pasang CA proxy (Charles/Proxyman/mitmproxy) dan percayai hanya di `debug-overrides`
atau flavor debug. Build release tidak boleh mempercayai CA pengguna.

## Best Practices

- **HTTPS di semua endpoint**, termasuk gambar & webhook.
- **TLS 1.2+ (utamakan 1.3)**, rantai sertifikat lengkap, perpanjangan otomatis.
- **Jangan pernah menonaktifkan validasi sertifikat** di release.
- **Cleartext dimatikan**, pengecualian sempit dan terdokumentasi.
- **Pinning hanya dengan rencana rotasi**, pin cadangan, dan kill switch.
- **Pantau kedaluwarsa sertifikat** (alert 30/14/7 hari).

## Anti-Patterns

- `badCertificateCallback => true` "sementara" yang ikut ke production.
- `NSAllowsArbitraryLoads = YES` atau `usesCleartextTraffic="true"` global.
- Pinning tanpa pin cadangan sehingga semua pengguna terkunci saat sertifikat berganti.
- Mengira HTTPS membuat data aman disimpan di perangkat atau log.
- Mengirim token di URL HTTPS (tetap tercatat di log server/proxy).

## Performance Considerations

TLS 1.3 hanya butuh satu round-trip untuk handshake, dan session resumption mempercepat koneksi berikutnya. Gunakan ulang
koneksi (keep-alive, HTTP/2) dengan satu instance klien HTTP di aplikasi, jangan membuat `Dio`/`HttpClient` baru per
request. Hal ini penting di jaringan seluler berlatensi tinggi.

## Security Considerations

TLS melindungi jalur, bukan endpoint. Tetap perlukan autentikasi, otorisasi, validasi input, dan penyimpanan aman.
Pinning menyulitkan analisis trafik, tetapi bukan perlindungan mutlak: penyerang yang mengendalikan perangkatnya sendiri
dapat mem-bypass pinning dengan tool instrumentasi. Karena itu keamanan tetap harus ditegakkan di server.

## Real-World Use Cases

- Aplikasi pembayaran: pinning public key dengan dua pin dan kill switch Remote Config.
- Aplikasi kasir yang mencetak ke printer jaringan lokal: pengecualian ATS/cleartext hanya untuk IP printer, dengan alasan terdokumentasi.
- Insiden sertifikat kedaluwarsa dicegah dengan monitoring dan perpanjangan otomatis.

## Interview Questions

1. Apa yang dilindungi oleh HTTPS dan apa yang tidak?
2. Jelaskan secara singkat handshake TLS.
3. Apa itu certificate pinning, kapan dipakai, dan apa risikonya?
4. Bagaimana Android dan iOS membatasi trafik non-HTTPS?
5. Bagaimana men-debug trafik HTTPS aplikasi dengan aman?

## Sample Answers

1. Melindungi kerahasiaan dan integritas data dalam perjalanan serta mengautentikasi server. Tidak melindungi data di perangkat/server, tidak memverifikasi bahwa klien adalah aplikasi resmi, dan tidak mencegah bug otorisasi.
2. Klien mengirim ClientHello dengan cipher dan key share. Server membalas dengan key share dan sertifikat. Klien memvalidasi rantai sertifikat dan hostname. Keduanya menurunkan kunci sesi lewat ECDHE, lalu data dienkripsi secara simetris.
3. Aplikasi hanya menerima sertifikat/public key tertentu untuk domain API, sehingga CA berbahaya atau proxy MITM ditolak. Dipakai untuk aplikasi berisiko tinggi. Risikonya pengguna terkunci saat rotasi, sehingga perlu pin cadangan, masa berlaku, dan kill switch.
4. Android (targetSdk 28+) memblokir cleartext secara default lewat Network Security Config. iOS ATS mewajibkan HTTPS dengan TLS modern. Pengecualian harus spesifik per domain.
5. Pasang CA proxy dan percayai hanya di build debug (`debug-overrides` atau flavor debug), atau gunakan DevTools/logging interceptor di debug. Jangan pernah menonaktifkan validasi di release.

## Practical Exercises

1. Periksa konfigurasi TLS API Anda dengan `openssl s_client` dan SSL Labs.
2. Tambahkan Network Security Config yang memblokir cleartext dan hanya memercayai CA user di debug.
3. Rancang rencana pinning dengan pin cadangan dan kill switch, lalu tulis prosedur rotasinya.

## Quick Reference

```text
TLS = kerahasiaan + integritas + autentikasi server · bukan keamanan data at-rest
TLS 1.2+/1.3 · rantai lengkap · auto-renew + alert kedaluwarsa · HSTS untuk web
Android: cleartextTrafficPermitted=false · debug-overrides untuk proxy · iOS: ATS tanpa NSAllowsArbitraryLoads
Pinning: SPKI + pin cadangan + expiration + kill switch · jangan badCertificateCallback => true
Satu klien HTTP dipakai ulang (keep-alive, HTTP/2)
```

## Related Topics

- [Mobile Application Security](/security/mobile-app-security/)
- [Secure Token Storage](/security/secure-token-storage/)
- [Debugging Techniques](/testing-performance/debugging-techniques/)
