---
title: "Versioning & Release Management"
description: "Mengelola versi dan rilis untuk backend dan mobile: Semantic Versioning, versi API, changelog & Conventional Commits, release branch vs trunk, release train, feature flag, staged rollout, minimum supported version & force update, kompatibilitas aplikasi versi lama, OTA patch, hotfix, dan rollback."
level: intermediate
status: complete
updated: 2026-11-13
tags: [devops, release, versioning, semver, feature-flag, force-update]
---

## Overview

**Release management** adalah proses merencanakan, membangun, menguji, merilis, dan memantau versi perangkat lunak
secara teratur dan aman. Di mobile, tantangannya khas: **versi lama tetap terpasang di perangkat pengguna** selama
berbulan-bulan, sehingga backend dan aplikasi harus kompatibel lintas versi, dan "rollback" berarti strategi lain.

## Why It Matters

Rilis yang tidak terkelola menghasilkan breaking change yang merusak aplikasi lama, hotfix kacau, dan pengguna yang
terjebak di versi bermasalah. Interviewer sering bertanya "bagaimana Anda merilis dan menangani bug setelah rilis?".

## Core Concepts

### Semantic Versioning (SemVer)

`MAJOR.MINOR.PATCH` — MAJOR untuk perubahan tidak kompatibel, MINOR untuk fitur kompatibel, PATCH untuk perbaikan.
Untuk aplikasi (bukan library), banyak tim memakai SemVer secara longgar atau **CalVer** (`2026.11.1`).

| Lapisan | Versi | Contoh |
| --- | --- | --- |
| Aplikasi mobile | version name + build number | `1.5.0+57` (Flutter) |
| API backend | versi kontrak | `/v1`, `/v2` |
| Library/paket internal | SemVer ketat | `core_network 2.3.1` |
| Skema database | nomor migrasi | `20261113_add_note` |

### Strategi branching rilis

| Strategi | Inti | Cocok |
| --- | --- | --- |
| Trunk-based + feature flag | Semua merge ke main; fitur belum siap disembunyikan | Tim yang rilis sering |
| Release branch | `release/1.5` dipotong dari main, hanya fix masuk | Rilis terjadwal/mobile dengan review store |
| Release train | Jadwal tetap (mis. tiap 2 minggu); fitur yang belum siap ikut kereta berikutnya | Banyak tim/fitur |

### Alat keselamatan rilis mobile

| Alat | Fungsi |
| --- | --- |
| Feature flag / Remote Config | Mengaktifkan/mematikan fitur tanpa rilis baru |
| Staged rollout | Rilis bertahap ke persentase pengguna |
| Minimum supported version | Memaksa update bila versi terlalu lama/berbahaya |
| Kompatibilitas API | Backend mendukung beberapa versi app sekaligus |
| OTA patch (mis. Shorebird untuk kode Dart) | Memperbaiki bug Dart tanpa menunggu review store — dengan batasan & kepatuhan kebijakan |
| Hotfix branch | Perbaikan cepat dari tag rilis |

## How It Works

```text
main (trunk) ──●──●──●──●──●──
                 \ release/1.5 ──fix──► tag v1.5.0 → staged rollout
                                   \──hotfix──► v1.5.1 (cherry-pick ke main juga)
Backend: v1 tetap melayani app 1.3–1.5, v2 untuk app ≥1.6 → setelah adopsi tinggi, naikkan minimum version → pensiunkan v1
```

## Implementation

### Changelog dari Conventional Commits

```text
feat(checkout): pembayaran QRIS          → MINOR
fix(sync): transaksi ganda saat retry     → PATCH
feat(api)!: ubah format respons order     → MAJOR (breaking)
```

Alat seperti release-please atau semantic-release dapat membuat changelog dan tag otomatis.

### Force update (Flutter)

```dart
class VersionGate {
  VersionGate(this.remoteConfig, this.packageInfo);
  final FirebaseRemoteConfig remoteConfig;
  final PackageInfo packageInfo;

  bool get mustUpdate {
    final min = remoteConfig.getString('min_supported_version');        // mis. "1.4.0"
    return min.isNotEmpty && _compare(packageInfo.version, min) < 0;
  }

  static int _compare(String a, String b) {
    final pa = a.split('.').map(int.parse).toList(), pb = b.split('.').map(int.parse).toList();
    for (var i = 0; i < 3; i++) {
      final d = (i < pa.length ? pa[i] : 0) - (i < pb.length ? pb[i] : 0);
      if (d != 0) return d;
    }
    return 0;
  }
}
// Bila mustUpdate → tampilkan layar wajib update dengan tombol ke store (Android: dapat memakai In-App Updates).
// Backend juga dapat menolak versi terlalu lama dengan kode error khusus (mis. 426 + pesan), sebagai lapisan kedua.
```

### Feature flag dengan default aman

```dart
final qrisEnabled = remoteConfig.getBool('feature_qris_enabled');   // default di app = false
if (qrisEnabled) showQrisOption();
```

### Kompatibilitas API untuk aplikasi lama

```text
✅ Tambah field opsional baru                    (app lama mengabaikan)
✅ Tambah endpoint baru
❌ Hapus/ganti nama field yang dipakai app lama  → buat /v2 atau tunggu min version naik
❌ Ubah arti nilai enum                          → nilai baru + app lama punya fallback "unknown"
Klien: parsing toleran (abaikan field tak dikenal, enum unknown) — lihat ignoreUnknownKeys / @JsonKey(unknownEnumValue)
```

### Runbook hotfix mobile

```markdown
1. Mitigasi: matikan fitur via flag / halt staged rollout
2. Branch hotfix dari tag rilis, perbaiki + test regresi
3. Naikkan PATCH & build number → internal testing → rilis (expedited review iOS bila perlu)
4. Cherry-pick ke main
5. Bila versi bermasalah berbahaya: naikkan min_supported_version
6. Postmortem
```

## Best Practices

- **Versi & build number otomatis dari CI**; tag Git untuk setiap rilis.
- **Changelog** yang dapat dibaca tim non-teknis.
- **Feature flag untuk fitur berisiko**, dengan default aman bila config gagal dimuat.
- **Kompatibilitas mundur** API untuk beberapa versi aplikasi.
- **Kebijakan versi minimum** yang jelas (berapa lama versi lama didukung).
- **Bersihkan flag lama** agar tidak menjadi technical debt.

## Anti-Patterns

- Breaking change API yang dirilis bersamaan dengan versi app baru (app lama langsung rusak).
- Force update untuk setiap rilis kecil (mengganggu pengguna).
- Flag tanpa pemilik dan tanggal kedaluwarsa.
- Hotfix langsung di main tanpa tag/cabang rilis yang jelas.

## Performance Considerations

Remote Config/flag sebaiknya di-cache dengan nilai default lokal agar startup tidak menunggu jaringan. Pantau adopsi
versi (persentase pengguna per versi) untuk memutuskan kapan memensiunkan API lama.

## Security Considerations

Versi minimum adalah alat keamanan: saat kerentanan ditemukan di aplikasi, naikkan minimum version dan tolak versi rentan
di backend. Flag tidak boleh menjadi satu-satunya kontrol akses untuk fitur sensitif — otorisasi tetap di server.

## Real-World Use Cases

- Release train dua mingguan untuk aplikasi kasir dengan release branch.
- Fitur QRIS diaktifkan bertahap per outlet via flag.
- Memaksa update setelah perbaikan bug sinkronisasi kritis.

## Interview Questions

1. Jelaskan Semantic Versioning.
2. Bagaimana menangani bug kritis setelah aplikasi mobile dirilis?
3. Bagaimana menjaga backend kompatibel dengan versi aplikasi lama?
4. Apa itu feature flag dan risikonya?
5. Kapan memakai force update?

## Sample Answers

1. MAJOR.MINOR.PATCH: MAJOR untuk perubahan tidak kompatibel, MINOR untuk fitur yang kompatibel, PATCH untuk perbaikan bug.
2. Mitigasi dulu (flag off, halt rollout), hotfix dari tag rilis dengan test regresi, rilis PATCH bertahap, cherry-pick ke main, naikkan minimum version bila perlu, lalu postmortem.
3. Perubahan additive, versi API untuk breaking change, parsing toleran di klien, memantau adopsi versi, dan memensiunkan versi lama setelah minimum version dinaikkan.
4. Saklar untuk mengaktifkan fitur tanpa rilis baru; risikonya kompleksitas kode, flag yang terlupa, kombinasi yang tidak diuji, dan salah memakainya sebagai kontrol keamanan.
5. Ketika versi lama memiliki bug/kerentanan serius atau tidak kompatibel dengan backend yang harus berubah; bukan untuk setiap rilis.

## Practical Exercises

1. Implementasikan `min_supported_version` + layar update di aplikasi Anda.
2. Tulis changelog rilis terakhir dengan format Conventional Commits.
3. Buat runbook hotfix untuk tim Anda.

## Quick Reference

```text
SemVer MAJOR.MINOR.PATCH · Flutter 1.5.0+57 · tag tiap rilis · changelog otomatis
Trunk + flag · release branch · release train · staged rollout · hotfix dari tag
Mobile: versi lama hidup lama → API kompatibel + parsing toleran + min_supported_version (force update)
OTA patch (Dart only, sesuai kebijakan) · flag default aman · bersihkan flag lama
```

## Related Topics

- [Android Signing & Google Play Release](/devops/android-play-release/)
- [OTA Update (Flutter)](/flutter/ota-update/)
- [Git Workflow](/fundamentals/git-workflow/)
