---
title: "XSS & CSRF"
description: "Cross-Site Scripting (stored, reflected, DOM-based) dan Cross-Site Request Forgery: cara kerja, dampak, pencegahan dengan auto-escaping, sanitasi HTML, Content Security Policy, cookie HttpOnly/Secure/SameSite, CSRF token, serta relevansinya bagi mobile developer (dashboard web admin, WebView, JavaScript bridge, Flutter Web)."
level: intermediate
status: complete
updated: 2026-11-13
tags: [security, xss, csrf, csp, webview, cookies]
---

## Overview

- **XSS (Cross-Site Scripting)**: penyerang menyisipkan skrip yang kemudian **dijalankan di browser korban** dalam konteks situs Anda.
- **CSRF (Cross-Site Request Forgery)**: situs jahat membuat browser korban **mengirim request ke situs Anda** dengan cookie sesi korban.

Keduanya terutama masalah aplikasi web, tetapi mobile developer tetap bersinggungan: dashboard web admin/owner yang
menampilkan data dari aplikasi, **WebView** di dalam aplikasi, dan Flutter Web.

## Why It Matters

Data yang diketik di aplikasi kasir (nama pelanggan, catatan order) sering ditampilkan di dashboard web. Bila tidak
di-escape, satu catatan berisi skrip dapat mencuri sesi admin. WebView dengan JavaScript bridge dapat memberi skrip
jahat akses ke fungsi native aplikasi.

## Core Concepts

| Jenis XSS | Alur |
| --- | --- |
| Stored | Skrip tersimpan di DB (catatan order) → ditampilkan ke pengguna lain |
| Reflected | Skrip dari URL/parameter langsung dipantulkan di respons |
| DOM-based | JavaScript klien menulis data tak tepercaya ke DOM (`innerHTML`) |

```text
CSRF:
Korban login di admin.example.com (cookie sesi)
→ membuka situs jahat yang berisi <form action="https://admin.example.com/refunds" method="POST"> otomatis submit
→ browser menyertakan cookie korban → refund dibuat atas nama korban
```

CSRF hanya relevan untuk autentikasi yang **dikirim otomatis oleh browser** (cookie). API yang memakai header
`Authorization: Bearer` dari aplikasi mobile tidak rentan CSRF dengan cara ini.

## How It Works

```text
XSS dicegah dengan: encoding output sesuai konteks + sanitasi HTML bila perlu + CSP sebagai lapisan kedua
CSRF dicegah dengan: SameSite cookie + CSRF token / verifikasi Origin untuk request yang mengubah data
```

## Implementation

### Mencegah XSS di web

```tsx
// React meng-escape otomatis
<td>{order.note}</td>                                   // aman
<td dangerouslySetInnerHTML={{ __html: order.note }} /> // ❌ berbahaya tanpa sanitasi

// Bila HTML kaya memang diizinkan (mis. deskripsi produk)
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.descriptionHtml) }} />
```

```ts
// DOM: gunakan textContent, bukan innerHTML
el.textContent = userInput;
```

```text
Konteks lain: atribut HTML (quote + escape), URL (tolak skema javascript:), JavaScript inline (hindari), CSS (hindari input pengguna)
```

### Content Security Policy

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

CSP membatasi sumber skrip sehingga skrip yang tersisip sulit dijalankan. Ini **lapisan tambahan**, bukan pengganti
escaping. Hindari `'unsafe-inline'` untuk skrip.

### Cookie sesi yang aman

```ts
reply.setCookie('sid', sessionId, {
  httpOnly: true,       // tidak bisa dibaca JavaScript → mengurangi dampak XSS
  secure: true,         // hanya HTTPS
  sameSite: 'lax',      // tidak dikirim pada sebagian besar request lintas situs (POST) → mitigasi CSRF
  path: '/',
  maxAge: 60 * 60 * 8,
});
```

### CSRF token untuk dashboard berbasis cookie

```text
- Token acak per sesi, disisipkan di form/header (X-CSRF-Token), diverifikasi server untuk POST/PUT/PATCH/DELETE
- Verifikasi header Origin/Referer sebagai lapisan tambahan
- Jangan ubah data lewat GET
```

### WebView di aplikasi mobile

```dart
// webview_flutter
controller
  ..setJavaScriptMode(JavaScriptMode.unrestricted)       // hanya bila perlu
  ..setNavigationDelegate(NavigationDelegate(
      onNavigationRequest: (req) {
        final uri = Uri.parse(req.url);
        return uri.scheme == 'https' && allowedHosts.contains(uri.host)
            ? NavigationDecision.navigate
            : NavigationDecision.prevent;             // tolak domain lain & skema aneh
      }))
  ..addJavaScriptChannel('PosBridge', onMessageReceived: (msg) {
      final cmd = BridgeCommand.tryParse(msg.message); // validasi ketat, allowlist perintah
      if (cmd == null) return;
      handle(cmd);                                     // jangan expose aksi sensitif (token, pembayaran) ke bridge
  });
```

```text
Aturan WebView:
- Muat hanya konten tepercaya via HTTPS. Jangan muat URL dari deep link/push tanpa allowlist
- JavaScript bridge hanya untuk domain tepercaya, perintah allowlist, argumen divalidasi
- Jangan menyuntikkan token ke halaman web yang bisa memuat konten pihak ketiga
- Android: hindari setAllowFileAccess/universal access dari file URL. iOS: WKWebView (bukan UIWebView)
- Untuk login OAuth gunakan browser sistem, bukan WebView
```

### Flutter Web

Flutter Web merender widget, sehingga teks biasanya aman. Risiko muncul ketika memakai `HtmlElementView`, merender HTML
dari pengguna, atau memanggil JS interop dengan data tak tepercaya. Tetap pasang CSP saat hosting.

## Best Practices

- **Auto-escaping template/framework**, hindari API HTML mentah.
- **Sanitasi dengan library teruji** bila HTML kaya diizinkan.
- **CSP ketat** sebagai lapisan kedua.
- **Cookie HttpOnly + Secure + SameSite** untuk sesi web, CSRF token untuk aksi yang mengubah data.
- **WebView: allowlist domain, bridge minimal, validasi pesan**.
- **Escape data dari aplikasi mobile saat ditampilkan di web**.

## Anti-Patterns

- `innerHTML`/`dangerouslySetInnerHTML` dengan data pengguna.
- Menyimpan token sesi web di `localStorage` (mudah dicuri melalui XSS).
- Mengubah data lewat GET.
- WebView dengan JavaScript bridge yang terbuka untuk domain mana saja.
- Menganggap CSP cukup tanpa escaping.

## Performance Considerations

Escaping dan sanitasi murah. DOMPurify sebaiknya dijalankan saat render untuk konten yang memang HTML, atau sanitasi
sekali saat disimpan dan sekali lagi saat ditampilkan untuk konten penting. CSP tidak berdampak signifikan pada performa.

## Security Considerations

XSS di dashboard admin berdampak besar karena sesi admin memiliki hak tinggi. Terapkan juga MFA untuk admin, sesi
berumur pendek, dan audit log. Untuk API mobile berbasis Bearer token, fokus pada CORS yang ketat dan validasi token,
bukan CSRF token.

## Real-World Use Cases

- Catatan order `<img src=x onerror=fetch(...)>` dari aplikasi kasir ditampilkan aman di dashboard React karena auto-escape.
- Halaman promo di WebView aplikasi hanya boleh dari `promo.example.com`, dengan bridge `openProduct(id)` saja.

## Interview Questions

1. Apa itu XSS dan jenis-jenisnya?
2. Bagaimana mencegah XSS?
3. Apa itu CSRF dan kapan API rentan terhadapnya?
4. Apa fungsi atribut cookie HttpOnly, Secure, dan SameSite?
5. Risiko keamanan apa saja saat memakai WebView di aplikasi mobile?

## Sample Answers

1. Penyisipan skrip yang dijalankan di browser korban dalam konteks situs. Jenisnya stored (tersimpan di server), reflected (dipantulkan dari request), dan DOM-based (JavaScript klien menulis data tak tepercaya ke DOM).
2. Encoding output sesuai konteks (auto-escape framework), sanitasi HTML dengan library teruji bila HTML diizinkan, menghindari API HTML mentah, CSP sebagai lapisan kedua, dan cookie HttpOnly agar sesi tidak bisa dibaca skrip.
3. Situs jahat memicu browser korban mengirim request yang mengubah data dengan cookie korban. API rentan bila autentikasinya dikirim otomatis oleh browser (cookie). API dengan header Bearer dari aplikasi mobile tidak rentan dengan cara ini.
4. HttpOnly mencegah JavaScript membaca cookie, Secure membatasi pengiriman ke HTTPS, dan SameSite membatasi pengiriman cookie pada request lintas situs sehingga mengurangi CSRF.
5. Memuat konten tak tepercaya, JavaScript bridge yang memberi akses ke fungsi native, navigasi ke domain/skema berbahaya, akses file lokal, dan memasukkan token ke halaman yang memuat konten pihak ketiga.

## Practical Exercises

1. Cari pemakaian HTML mentah di dashboard web Anda dan ganti dengan escaping/sanitasi.
2. Pasang CSP dan perbaiki pelanggaran yang muncul di console.
3. Audit WebView di aplikasi Anda: domain yang diizinkan, bridge, dan pengaturan file access.

## Quick Reference

```text
XSS: stored · reflected · DOM → auto-escape · DOMPurify · textContent · CSP (lapisan 2) · HttpOnly
CSRF: hanya auth berbasis cookie → SameSite + CSRF token + cek Origin · tanpa ubah data via GET
Bearer token API mobile → tidak rentan CSRF klasik, fokus CORS & validasi token
WebView: HTTPS + allowlist domain · bridge minimal & divalidasi · tanpa token ke konten pihak ketiga · OAuth di browser sistem
```

## Related Topics

- [Input Validation & Sanitization](/security/input-validation/)
- [OWASP Top 10](/security/owasp-top-10/)
- [Mobile Application Security](/security/mobile-app-security/)
