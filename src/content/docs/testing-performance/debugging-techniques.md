---
title: "Debugging Techniques"
description: "Teknik debugging sistematis untuk mobile & backend: reproduksi, membaca stack trace, breakpoint & conditional breakpoint, logging terarah, Flutter DevTools (Inspector, Network, Logging), Android Studio/Logcat, Xcode console, debugging jaringan dengan proxy, git bisect, rubber duck, serta debugging bug yang hanya terjadi di release/perangkat tertentu."
level: intermediate
status: complete
updated: 2026-11-13
tags: [debugging, devtools, logcat, xcode, proxy, git-bisect]
---

## Overview

**Debugging** adalah proses menemukan **penyebab** perilaku yang salah, bukan sekadar menghilangkan gejalanya. Engineer
yang efektif tidak menebak-nebak: mereka mereproduksi, mengumpulkan bukti, mempersempit kemungkinan, lalu memverifikasi
perbaikan.

## Why It Matters

Sebagian besar waktu engineer dihabiskan untuk memahami dan memperbaiki kode. Interviewer sering menanyakan "ceritakan
bug tersulit Anda" untuk menilai metode debugging.

## Core Concepts

| Langkah | Pertanyaan kunci |
| --- | --- |
| Reproduksi | Langkah persis? Perangkat/OS/versi app? Data? Selalu atau kadang? |
| Observasi | Apa yang terjadi vs yang diharapkan? Log, stack trace, request? |
| Persempit | Lapisan mana (UI, state, data, jaringan, backend)? Sejak versi/commit mana? |
| Hipotesis | Penyebab paling mungkin & paling mudah diuji? |
| Eksperimen | Ubah satu hal, amati |
| Perbaiki & cegah | Fix akar masalah + regression test + monitoring |

### Alat utama

| Platform | Alat |
| --- | --- |
| Flutter | DevTools (Inspector, Network, Logging, Performance, Memory), `debugPrint`, `debugger()`, `flutter logs` |
| Android | Android Studio debugger, Logcat (filter tag/package), Layout Inspector, App Inspection (DB, network, background task) |
| iOS | Xcode debugger & console, View Hierarchy, Instruments, Console.app |
| Jaringan | Charles/Proxyman/mitmproxy, DevTools Network, HTTP logging interceptor (debug saja) |
| Backend | Debugger Node (`--inspect`), log terstruktur + request ID, tracing |
| Riwayat | `git bisect`, `git log -S` (cari perubahan string) |

## How It Works

```text
Bug report → reproduksi lokal (atau kumpulkan bukti dari crash report/log bila tidak bisa)
→ baca stack trace dari atas: frame kode Anda yang pertama
→ breakpoint di sekitar lokasi / log terarah → inspeksi state
→ temukan asumsi yang salah → tulis test yang gagal → perbaiki → test lulus → cek tidak ada efek samping
```

## Implementation

### Membaca stack trace Flutter

```text
══╡ EXCEPTION CAUGHT BY WIDGETS LIBRARY ╞═══
Null check operator used on a null value
#0  CheckoutPage.build (package:pos/features/checkout/checkout_page.dart:42:31)   ← mulai dari frame kode Anda
#1  StatelessElement.build (package:flutter/src/widgets/framework.dart:...)
Baris 42: final outlet = context.read<SessionCubit>().state.outlet!;   → outlet null setelah process death?
```

### Breakpoint & log terarah

```dart
import 'dart:developer';

void applyPromo(Cart cart, Promo promo) {
  if (cart.total > 1_000_000) debugger();          // conditional pause saat debug
  log('applyPromo', name: 'checkout', error: {'cart': cart.id, 'promo': promo.code});  // tampil di DevTools Logging
}
```

### Android Logcat

```bash
adb logcat --pid=$(adb shell pidof -s com.example.pos)      # hanya proses aplikasi
adb logcat *:E                                              # hanya error
adb shell am crash com.example.pos                          # uji penanganan crash
```

### Debugging jaringan dengan proxy (debug build)

```xml
<!-- res/xml/network_security_config.xml : percayai CA user HANYA di debug -->
<network-security-config>
  <debug-overrides><trust-anchors><certificates src="user" /></trust-anchors></debug-overrides>
</network-security-config>
```

Untuk Flutter/Dio, set proxy di HttpClient debug build atau gunakan DevTools Network untuk melihat request/response.

### git bisect untuk regresi

```bash
git bisect start
git bisect bad                 # versi sekarang rusak
git bisect good v1.4.0         # versi ini masih benar
# uji setiap commit yang ditawarkan → git bisect good/bad → Git menemukan commit penyebab
git bisect run flutter test test/checkout_total_test.dart     # otomatis dengan test
git bisect reset
```

### Bug yang hanya terjadi di build release / perangkat tertentu

| Gejala | Dugaan |
| --- | --- |
| Crash hanya di release | R8/obfuscation menghapus kelas (butuh keep rule), assert yang menutupi bug, perbedaan konfigurasi flavor |
| Hanya perangkat tertentu | Versi OS (izin/background), RAM kecil (process death, OOM), OEM battery optimization, ABI |
| Hanya setelah lama di background | Process death, token kedaluwarsa, socket mati |
| Hanya di jaringan seluler | Timeout, MTU/proxy operator, IPv6, cleartext diblokir |

Gunakan `flutter run --release`/`--profile` di perangkat nyata, symbol untuk stack trace obfuscated, dan Crashlytics custom key
(model, OS, flavor) untuk mencari pola.

## Best Practices

- **Reproduksi dulu**; tulis langkahnya.
- **Ubah satu hal setiap kali**.
- **Baca pesan error utuh** dan frame kode Anda pertama.
- **Tulis test yang gagal** sebelum memperbaiki.
- **Catat temuan** di tiket/PR (berguna untuk tim & interview).
- **Rubber duck**: jelaskan masalah ke orang lain/catatan — sering menemukan asumsi salah.

## Anti-Patterns

- Mengubah banyak hal acak sampai "jalan".
- Menambah `try/catch` atau `?.` untuk menyembunyikan gejala.
- Print debugging yang tertinggal di release.
- Menyalahkan library/OS sebelum memeriksa kode sendiri.

## Performance Considerations

Debug mode Flutter jauh lebih lambat (JIT, assertion) — jangan menilai performa di debug. Logging berlebihan di loop
panas juga mengubah perilaku timing; gunakan log bersyarat.

## Security Considerations

Log debug dan konfigurasi proxy (trust user CA) hanya untuk build debug. Jangan menyalin data pribadi pengguna dari
production ke laptop untuk debugging; gunakan data yang dianonimkan.

## Real-World Use Cases

- Menemukan null error setelah process death di layar checkout.
- Bisect regresi total harga setelah merge refactor.
- Crash release karena keep rule R8 hilang untuk model serialisasi.

## Interview Questions

1. Jelaskan langkah Anda men-debug bug yang dilaporkan pengguna.
2. Bagaimana men-debug bug yang tidak bisa Anda reproduksi?
3. Apa itu git bisect?
4. Mengapa bug bisa muncul hanya di build release?
5. Alat apa yang Anda pakai untuk debugging jaringan?

## Sample Answers

1. Kumpulkan detail & reproduksi, baca log/stack trace, persempit lapisan dan versi, susun hipotesis, uji satu per satu, tulis test yang gagal, perbaiki akar masalah, verifikasi, dan tambah monitoring bila perlu.
2. Tambahkan logging/telemetri terarah dan custom key di crash report, cari pola (perangkat, OS, jaringan, waktu), coba kondisi serupa (jaringan lambat, process death, memori rendah), lalu rilis perbaikan dengan pemantauan.
3. Perintah Git yang melakukan binary search pada riwayat commit untuk menemukan commit pertama yang memperkenalkan bug, bisa diotomatiskan dengan test.
4. Perbedaan konfigurasi (flavor, base URL), R8/obfuscation menghapus kelas, assertion debug yang tidak aktif, AOT vs JIT, dan timing berbeda.
5. Flutter DevTools Network, logging interceptor di debug, proxy (Charles/Proxyman/mitmproxy) dengan trust CA khusus debug, dan log server dengan request ID.

## Practical Exercises

1. Ambil satu bug lama dan tulis ulang "laporan debugging" lengkap: gejala, bukti, hipotesis, penyebab, fix, test.
2. Latih `git bisect run` dengan test otomatis.
3. Siapkan proxy untuk build debug dan periksa request aplikasi Anda.

## Quick Reference

```text
Reproduksi → observasi → persempit → hipotesis → eksperimen (satu perubahan) → fix + regression test
DevTools · Logcat (--pid) · Xcode console · proxy (debug only) · git bisect run
Release-only: R8 keep rule · flavor config · process death · OEM/OS · symbol untuk stack trace
```

## Related Topics

- [Logging & Error Tracking](/testing-performance/logging-error-tracking/)
- [Problem Solving (behavioral)](/interview/behavioral/problem-solving/)
- [Git Workflow](/fundamentals/git-workflow/)
