---
title: "Android App Security"
description: "Keamanan aplikasi Android: OWASP MASVS/MASTG, penyimpanan aman (Keystore, enkripsi), network security (TLS, Network Security Config, pinning), komponen exported & intent, WebView, R8/obfuscation, deteksi root/emulator & Play Integrity, FLAG_SECURE, backup rules, logging, dan checklist rilis."
level: advanced
status: complete
version: "Android 8–15 · OWASP MASVS v2 — rujuk mas.owasp.org untuk versi terbaru"
updated: 2026-11-13
tags: [android, security, masvs, keystore, network-security, obfuscation]
---

## Overview

Aplikasi mobile berjalan di perangkat yang **dikendalikan pengguna (atau penyerang)**: APK bisa dibongkar, traffic
dicegat, perangkat di-root. Prinsipnya: **jangan percaya klien** — rahasia penting dan aturan bisnis ada di server,
sedangkan aplikasi melindungi data di perangkat, komunikasi, dan mempersulit penyalahgunaan. Kerangka rujukan industri
adalah **OWASP MASVS** (standar) dan **MASTG** (panduan pengujian).

## Why It Matters

Bank, fintech, e-commerce, dan aplikasi BUMN/korporat sering mensyaratkan pentest mobile sebelum rilis. Pertanyaan
"bagaimana mengamankan token di aplikasi?" hampir selalu muncul di interview mobile.

## Core Concepts

| Area MASVS | Kontrol utama di Android |
| --- | --- |
| STORAGE | Data sensitif minimal; enkripsi dengan kunci Keystore; tidak di log/backup/clipboard |
| CRYPTO | Algoritma standar (AES-GCM), kunci di Android Keystore, tidak ada kunci hardcode |
| AUTH | Autentikasi & sesi di server; biometrik terikat kunci kriptografi (`CryptoObject`) |
| NETWORK | TLS saja, Network Security Config, pinning bila risiko tinggi |
| PLATFORM | Komponen tidak di-export sembarangan, validasi intent & deep link, WebView aman |
| CODE | Dependensi terbaru, validasi input, tanpa kode debug di release |
| RESILIENCE | Obfuscation (R8), deteksi root/tamper, Play Integrity API (untuk aplikasi berisiko tinggi) |
| PRIVACY | Minimisasi data, izin minimum, transparansi |

## How It Works

```text
Penyerang: bongkar APK (jadx/apktool) → cari secret & endpoint → proxy (MITM) traffic → root/Frida untuk hook fungsi
Pertahanan berlapis:
  secret tidak di APK → TLS + pinning → token terenkripsi Keystore → obfuscation → integrity check
  → SEMUA keputusan penting divalidasi server (otorisasi, harga, limit)
```

## Implementation

### Penyimpanan token terenkripsi

```kotlin
// Kunci AES di Android Keystore (tidak bisa diekstrak dari perangkat)
private fun getOrCreateKey(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
        KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build()
    )
    return gen.generateKey()
}

fun encrypt(plain: ByteArray): Pair<ByteArray, ByteArray> {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, getOrCreateKey()) }
    return cipher.iv to cipher.doFinal(plain)          // simpan IV + ciphertext (mis. di DataStore)
}
```

:::caution[Version-dependent]
`androidx.security:security-crypto` (EncryptedSharedPreferences) telah di-deprecate oleh Google. Untuk kode baru,
gunakan Keystore + Tink/AES-GCM dengan DataStore seperti di atas, atau library yang aktif dipelihara. Di Flutter,
`flutter_secure_storage` memakai Keystore di Android.
:::

### Network Security Config

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config>
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2027-06-30">
            <pin digest="SHA-256">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=</pin>  <!-- kunci saat ini (contoh) -->
            <pin digest="SHA-256">BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=</pin>  <!-- kunci cadangan -->
        </pin-set>
    </domain-config>
    <debug-overrides><trust-anchors><certificates src="user" /></trust-anchors></debug-overrides>
</network-security-config>
```

### Komponen & intent

```xml
<activity android:name=".MainActivity" android:exported="true"> <!-- launcher/deep link saja -->
<service android:name=".sync.InternalService" android:exported="false" />
<provider android:name="androidx.core.content.FileProvider" android:exported="false" android:grantUriPermissions="true" ... />
```

```kotlin
// Validasi data dari deep link / intent eksternal
val orderId = intent.data?.lastPathSegment?.takeIf { it.matches(Regex("^[A-Za-z0-9-]{1,40}$")) } ?: return showNotFound()
```

### Layar sensitif, backup, logging

```kotlin
window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)  // cegah screenshot/recents
```

```xml
<application android:allowBackup="false" android:dataExtractionRules="@xml/data_extraction_rules" ...>
```

```kotlin
if (BuildConfig.DEBUG) Timber.plant(Timber.DebugTree())     // release: tanpa log atau log teredaksi ke crash reporter
```

### R8 & integritas

```kotlin
android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
```

Untuk aplikasi berisiko tinggi (finansial), gunakan **Play Integrity API**: aplikasi meminta token integritas, **server**
memverifikasinya, lalu memutuskan (mis. membatasi transaksi bila perangkat tidak lolos). Deteksi root di klien saja
mudah dilewati — perlakukan sebagai sinyal, bukan pengaman utama.

### WebView

```kotlin
webView.settings.apply {
    javaScriptEnabled = true                 // hanya bila konten tepercaya membutuhkannya
    allowFileAccess = false
    allowContentAccess = false
}
// Hindari addJavascriptInterface untuk konten yang tidak sepenuhnya Anda kendalikan; batasi URL yang boleh dimuat.
```

### Checklist rilis

```markdown
- [ ] Tidak ada secret/API key server di APK (cek dengan jadx)
- [ ] cleartextTrafficPermitted=false; pinning (bila ada) punya pin cadangan & tanggal kedaluwarsa
- [ ] Token & data sensitif terenkripsi dengan kunci Keystore
- [ ] Semua komponen exported diperiksa; deep link divalidasi
- [ ] FLAG_SECURE di layar PIN/saldo/data pribadi
- [ ] allowBackup/data extraction rules sesuai
- [ ] R8 aktif; tidak ada log debug di release
- [ ] Dependensi terbaru, tanpa kerentanan diketahui
- [ ] Otorisasi & aturan bisnis divalidasi server
```

## Best Practices

- **Server sebagai sumber kebenaran** untuk otorisasi, harga, limit, dan status.
- **Kunci di Keystore**, bukan di kode atau SharedPreferences.
- **Simpan sesedikit mungkin** data sensitif di perangkat.
- **Pinning dengan rencana rotasi** (pin cadangan, kedaluwarsa, mekanisme update).
- **Uji dengan alat penyerang** (jadx, proxy, emulator root) sebelum rilis.

## Anti-Patterns

- API key layanan pihak ketiga dengan hak penuh di `strings.xml`/`BuildConfig`.
- Menonaktifkan validasi TLS (`TrustManager` yang menerima semua sertifikat).
- `android:exported="true"` pada komponen internal.
- Mengandalkan deteksi root di klien sebagai satu-satunya pertahanan.
- Logging token/PIN, termasuk di crash report.

## Performance Considerations

Operasi Keystore dan kriptografi relatif mahal — cache kunci/objek cipher seperlunya dan jalankan di background.
Pinning tidak menambah latency berarti. R8 justru memperkecil ukuran dan dapat mempercepat aplikasi.

## Security Considerations

Halaman ini adalah topik keamanan. Tambahan: siapkan proses respons insiden (rotasi kunci server, revoke token, force
update minimum version) dan ikuti kebijakan Google Play (Data safety, izin sensitif).

## Real-World Use Cases

- Aplikasi kasir yang mengenkripsi token & database lokal, dengan FLAG_SECURE di layar PIN supervisor.
- Aplikasi fintech dengan Play Integrity, pinning, dan biometrik terikat kunci.
- Persiapan pentest berdasarkan MASVS sebelum go-live di klien korporat.

## Interview Questions

1. Bagaimana menyimpan token dengan aman di Android?
2. Apa itu certificate pinning dan risikonya?
3. Mengapa tidak boleh menyimpan API secret di aplikasi?
4. Apa itu `android:exported` dan mengapa penting?
5. Apa itu OWASP MASVS?
6. Apakah deteksi root cukup untuk mengamankan aplikasi?

## Sample Answers

1. Enkripsi dengan kunci di Android Keystore (AES-GCM) lalu simpan ciphertext (DataStore/file), atau gunakan library terpelihara berbasis Keystore; access token berumur pendek, refresh token dicabut saat logout, tidak pernah di log.
2. Aplikasi hanya menerima sertifikat/public key tertentu untuk domain API, mempersulit MITM; risikonya aplikasi tidak bisa terhubung saat sertifikat dirotasi — gunakan pin public key, pin cadangan, tanggal kedaluwarsa, dan rencana update.
3. APK dapat dibongkar dan string/kunci diekstrak; secret harus di server, aplikasi memanggil backend yang menyimpan secret, atau memakai key publik yang dibatasi (package/SHA-1, kuota).
4. Atribut yang menentukan apakah komponen dapat dipanggil aplikasi lain; komponen internal harus `false` agar tidak dapat dipicu/dieksploitasi dari luar, dan komponen yang diekspor wajib memvalidasi input.
5. Mobile Application Security Verification Standard dari OWASP — daftar persyaratan keamanan aplikasi mobile (storage, crypto, auth, network, platform, code, resilience, privacy), dengan MASTG sebagai panduan pengujiannya.
6. Tidak — deteksi di klien dapat dilewati dengan hooking; gunakan sebagai salah satu sinyal, kombinasikan dengan verifikasi server (Play Integrity) dan validasi semua keputusan penting di server.

## Practical Exercises

1. Bongkar APK release Anda dengan jadx dan cari string sensitif.
2. Pasang proxy (mitmproxy/Charles) dan pastikan aplikasi release menolak sertifikat proxy.
3. Jalankan checklist rilis di atas pada aplikasi Anda.

## Quick Reference

```text
Jangan percaya klien · secret di server · MASVS: storage · crypto · auth · network · platform · code · resilience · privacy
Keystore + AES-GCM · cleartext off · pinning + backup pin · exported=false · validasi intent/deep link
FLAG_SECURE · backup rules · R8 · log debug saja · Play Integrity diverifikasi server
```

## Related Topics

- [Mobile Application Security](/security/mobile-app-security/)
- [Flutter Security Best Practices](/flutter/security-best-practices/)
- [Security Questions](/interview/technical/security/)
