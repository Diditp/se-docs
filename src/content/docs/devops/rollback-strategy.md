---
title: "Rollback Strategy"
description: "Strategi rollback dan roll-forward untuk backend dan aplikasi mobile: kapan rollback vs hotfix, rollback image/revisi, feature flag sebagai kill switch, rollback database (kenapa sulit, expand-contract, backup/PITR), kompatibilitas data saat rollback, halt staged rollout di Play Store/App Store, force update, serta runbook dan latihan rollback."
level: advanced
status: complete
updated: 2026-11-13
tags: [devops, rollback, feature-flags, release, mobile, incident]
---

## Overview

**Rollback** adalah mengembalikan sistem ke versi sebelumnya yang diketahui baik. **Roll-forward** adalah memperbaiki
dengan merilis versi baru (hotfix). Di backend, rollback biasanya cepat. Di **mobile, rollback binary tidak mungkin**:
versi yang sudah terpasang di perangkat pengguna tidak bisa ditarik kembali. Karena itu strategi mobile berbeda:
menghentikan rollout, mematikan fitur dari jarak jauh, dan force update.

## Why It Matters

Seberapa cepat Anda pulih dari rilis buruk (MTTR) sering lebih penting daripada mencegah semua bug. Tim yang dapat
rollback dalam lima menit dapat merilis lebih sering dengan risiko lebih kecil.

## Core Concepts

| Mekanisme | Kecepatan | Berlaku untuk |
| --- | --- | --- |
| Matikan feature flag | Detik | Backend & mobile (fitur di balik flag) |
| Rollback image/revisi | Menit | Backend |
| Alihkan trafik (blue-green/canary) | Detik–menit | Backend |
| Halt staged rollout | Menit | Mobile (Play Console, App Store phased release) |
| Hotfix (roll-forward) | Jam | Semua. Mobile tergantung review store |
| Force update | Tergantung adopsi | Mobile (memaksa pindah dari versi rusak) |
| Restore database / PITR | Menit–jam, berisiko kehilangan data | Kasus kerusakan data serius |

| Konsep | Penjelasan |
| --- | --- |
| Backward compatible deploy | Versi lama tetap bisa berjalan dengan skema/data setelah versi baru dirilis, syarat rollback aman |
| Kill switch | Flag untuk mematikan fitur tanpa rilis |
| Rollback criteria | Ambang metrik yang memicu rollback (error rate, crash rate) |

## How It Works

```text
Deteksi (alert/metrik/laporan) → nilai dampak → mitigasi tercepat:
  fitur baru bermasalah?          → matikan flag
  backend versi baru bermasalah?  → rollback revisi/image
  aplikasi mobile bermasalah?     → halt rollout + flag + (bila perlu) hotfix + force update
  data rusak?                     → hentikan penulisan → perbaiki data (skrip) atau restore terarah
→ stabil → investigasi akar masalah → postmortem
```

## Implementation

### Rollback backend

```bash
# Cloud Run: alihkan trafik ke revisi sebelumnya
gcloud run services update-traffic pos-api --to-revisions=pos-api-00042-abc=100 --region=asia-southeast2

# Kubernetes
kubectl rollout undo deployment/pos-api
kubectl rollout status deployment/pos-api

# Docker Compose (tag immutable)
API_TAG=git-prev123 docker compose up -d api
```

Syarat: artefak versi lama masih ada (tag immutable, bukan `latest`) dan konfigurasi/secret yang dibutuhkan masih
tersedia.

### Database: alasan rollback sulit

```text
Rollback kode mudah, rollback data tidak:
- Data baru yang ditulis versi baru bisa hilang bila restore backup
- Kolom yang dihapus tidak bisa dikembalikan tanpa restore
Solusi: migrasi expand-contract sehingga versi lama tetap berjalan dengan skema baru
- Rilis N: tambah kolom (versi N−1 masih aman) → rollback kode ke N−1 tidak butuh rollback DB
- Hapus kolom hanya beberapa rilis kemudian
Migrasi "down" otomatis jarang dipakai di produksi. Lebih aman membuat migrasi perbaikan baru (roll-forward)
```

```text
Kerusakan data: hentikan sumber penulisan (flag/rollback) → ukur dampak (baris mana) →
perbaiki dengan skrip yang direview & ditest di salinan data → atau PITR ke instance terpisah lalu salin data yang dibutuhkan
Restore seluruh DB ke titik waktu lalu adalah pilihan terakhir (kehilangan transaksi setelahnya)
```

### Feature flag sebagai kill switch

```ts
// Backend
if (await flags.isEnabled('new_checkout_pricing', { tenantId })) {
  return newPricing(cart);
}
return legacyPricing(cart);
```

```dart
// Flutter (Remote Config / layanan flag), dengan default aman bila fetch gagal
final useNewScanner = remoteConfig.getBool('new_barcode_scanner');     // default false di aplikasi
```

```text
Aturan flag: default aman (off) · jalur lama tetap dirawat selama flag ada · hapus flag setelah stabil (utang teknis)
```

### Mobile: halt rollout & force update

```text
Google Play: staged rollout (mis. 5% → 20% → 50% → 100%) → "Halt rollout" saat crash-free turun
  Versi yang sudah terpasang tidak ditarik. Rilis versi baru (versionCode lebih tinggi) untuk memperbaiki
  Android Play In-App Updates dapat meminta update immediate/flexible
App Store: phased release 7 hari dapat di-pause. Versi lama tidak bisa dikembalikan, harus submit build baru (expedited review bila kritis)
Force update: min_supported_version di Remote Config/endpoint + layar update untuk versi rusak
```

### Kriteria rollback (contoh)

| Metrik | Ambang otomatis/manual |
| --- | --- |
| Backend error rate 5xx | > 2% selama 5 menit setelah deploy → rollback |
| p95 latency | Naik > 50% dibanding revisi sebelumnya → investigasi/rollback |
| Crash-free users (versi baru) | < 99% → halt rollout |
| Metrik bisnis (order/menit) | Turun tajam → investigasi segera |

### Runbook rollback (ringkas)

```markdown
1. Umumkan insiden di channel (siapa memimpin)
2. Identifikasi versi baik terakhir (backend revisi, versi aplikasi)
3. Backend: update-traffic / rollout undo · Mobile: halt rollout, matikan flag
4. Verifikasi: health, error rate, smoke test
5. Catat timeline · buat issue akar masalah · jadwalkan postmortem
```

Latih rollback secara berkala di staging agar langkahnya terbukti, bukan hanya tertulis.

## Best Practices

- **Setiap rilis harus dapat di-rollback** atau punya alasan tertulis mengapa tidak.
- **Artefak immutable** dan konfigurasi versi lama tetap tersedia.
- **Migrasi kompatibel mundur** (expand-contract).
- **Feature flag** untuk perubahan berisiko, termasuk di aplikasi mobile.
- **Staged rollout mobile + kriteria halt** yang jelas.
- **Runbook & latihan** rollback.

## Anti-Patterns

- Deploy kode dan hapus kolom dalam satu rilis.
- Tag `latest` sehingga versi sebelumnya tidak jelas.
- Rilis mobile langsung 100% untuk perubahan besar.
- Flag yang tidak pernah dihapus (logika bercabang menumpuk).
- Restore seluruh database sebagai respons pertama terhadap bug kecil.

## Performance Considerations

Canary dan staged rollout memberi data performa nyata sebelum semua pengguna terdampak. Bandingkan metrik per revisi
atau per versi aplikasi, bukan rata-rata global, agar regresi terlihat cepat.

## Security Considerations

Rollback juga dapat mengembalikan celah keamanan yang baru diperbaiki. Bila rilis berisi patch keamanan, pilih
roll-forward. Untuk aplikasi mobile dengan celah serius, gunakan force update. Catat setiap rollback di audit log.

## Real-World Use Cases

- Revisi API baru menaikkan 5xx ke 4%. Trafik dialihkan ke revisi sebelumnya dalam 2 menit.
- Versi aplikasi 2.5.0 crash di Android 10 saat 10% rollout. Rollout dihentikan, scanner baru dimatikan via Remote Config, dan 2.5.1 dirilis keesokan harinya.

## Interview Questions

1. Bagaimana strategi rollback untuk backend dan untuk aplikasi mobile berbeda?
2. Mengapa rollback database sulit dan bagaimana menghindarinya?
3. Apa itu feature flag dan bagaimana membantu pemulihan?
4. Kapan memilih roll-forward daripada rollback?

## Sample Answers

1. Backend dapat kembali ke image/revisi sebelumnya dalam menit. Aplikasi mobile yang sudah terpasang tidak bisa ditarik, sehingga strateginya adalah staged rollout yang dapat dihentikan, kill switch via Remote Config, hotfix, dan force update.
2. Data yang ditulis versi baru bisa hilang dan struktur yang dihapus tidak bisa dikembalikan tanpa restore. Hindari dengan migrasi expand-contract agar versi lama tetap kompatibel, sehingga rollback kode tidak memerlukan rollback database.
3. Saklar konfigurasi untuk menyalakan/mematikan fitur tanpa deploy. Fitur bermasalah dapat dimatikan dalam detik, termasuk di aplikasi mobile yang sudah terpasang.
4. Bila rollback akan mengembalikan celah keamanan, bila perubahan data membuat versi lama tidak kompatibel, atau bila perbaikannya kecil dan dapat dirilis lebih cepat daripada risiko rollback.

## Practical Exercises

1. Tulis runbook rollback untuk backend dan aplikasi Anda.
2. Latih rollback revisi di staging dan ukur waktunya.
3. Tambahkan kill switch Remote Config untuk satu fitur baru di aplikasi Flutter.

## Quick Reference

```text
Flag (detik) → rollback revisi/image (menit) → hotfix (jam) → restore DB (terakhir)
Backend: update-traffic / rollout undo / tag immutable · migrasi expand-contract
Mobile: staged rollout + halt · Remote Config kill switch · hotfix + force update (min_supported_version)
Kriteria: 5xx, p95, crash-free, metrik bisnis per revisi/versi · runbook + latihan
Keamanan: patch → roll-forward, bukan rollback
```

## Related Topics

- [Server Deployment](/devops/server-deployment/)
- [Android Signing & Google Play Release](/devops/android-play-release/)
- [Versioning & Release Management](/devops/versioning-release/)
