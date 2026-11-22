---
title: "Dependency Vulnerability Scanning"
description: "Mengelola risiko dependensi pihak ketiga (supply chain): lockfile, memilih package, scanning kerentanan (npm audit, OSV-Scanner, Dependabot, Trivy), triase CVE berdasarkan keterjangkauan, update terjadwal, SBOM, risiko package jahat & typosquatting, dependensi Flutter (pub), Gradle & CocoaPods/SPM, serta image container."
level: intermediate
status: complete
version: "npm/pnpm · pub · Gradle · CocoaPods/SPM · OSV-Scanner · Dependabot · Trivy. Fitur tool berubah, cek dokumentasi"
updated: 2026-11-13
tags: [security, dependencies, supply-chain, sbom, dependabot, cve]
---

## Overview

Sebagian besar kode di aplikasi modern berasal dari **dependensi**: package npm, plugin Flutter, library Gradle, pod iOS,
dan base image Docker. Setiap dependensi membawa risiko **kerentanan** yang diketahui (CVE) dan risiko **supply chain**
(package jahat, akun maintainer dibobol). Dependency scanning adalah proses menemukan, menilai, dan memperbaiki risiko ini
secara berkelanjutan.

## Why It Matters

Kerentanan di library populer dapat memengaruhi ribuan aplikasi sekaligus, dan penyerang aktif memindai versi rentan.
Selain itu, package jahat yang meniru nama populer (typosquatting) atau versi baru yang disusupi dapat mencuri secret
dari mesin developer dan CI.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Direct vs transitive | Dependensi yang Anda deklarasikan vs dependensi dari dependensi |
| Lockfile | Mengunci versi persis semua dependensi (package-lock.json, pnpm-lock.yaml, pubspec.lock, gradle lockfile, Podfile.lock) |
| CVE / advisory | Kerentanan publik dengan ID dan tingkat keparahan (CVSS) |
| Reachability | Apakah kode rentan benar-benar dipakai/terjangkau di aplikasi Anda |
| SBOM | Software Bill of Materials: daftar semua komponen (CycloneDX/SPDX) |
| Typosquatting | Package jahat dengan nama mirip (`expresss`, `lodahs`) |
| Install scripts | Skrip yang berjalan saat instalasi package (vektor serangan umum di npm) |

## How It Works

```text
Lockfile → scanner mencocokkan versi dengan database advisory (GitHub Advisory, OSV, NVD)
→ laporan per CVE (severity, versi perbaikan) → triase (terjangkau? terekspos? ada perbaikan?)
→ update / mitigasi / terima risiko berbatas waktu → CI gagal untuk temuan baru yang kritis
```

## Implementation

### Scanning per ekosistem

```bash
# Node.js
npm audit --omit=dev --audit-level=high
# Lintas ekosistem (npm, pub, Gradle, Maven, CocoaPods, Go, dll.) berbasis lockfile
osv-scanner scan -r .
# Flutter
flutter pub outdated            # lihat versi yang tertinggal
flutter pub get                 # pub versi baru menampilkan security advisory dari pub.dev untuk versi terdampak
osv-scanner scan --lockfile=pubspec.lock
# Container image & filesystem
trivy image registry.example.com/pos-api:1.8.0
trivy fs --scanners vuln,secret,misconfig .
```

### Dependabot / Renovate

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /backend
    schedule: { interval: weekly }
    groups:
      minor-and-patch: { update-types: [minor, patch] }
  - package-ecosystem: pub
    directory: /mobile
    schedule: { interval: weekly }
  - package-ecosystem: gradle
    directory: /mobile/android
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
  - package-ecosystem: docker
    directory: /backend
    schedule: { interval: weekly }
```

### Gate di CI

```yaml
- name: Dependency scan
  run: |
    npm ci --ignore-scripts
    npm audit --omit=dev --audit-level=high
    osv-scanner scan --lockfile=package-lock.json
```

### Triase yang masuk akal

| Kondisi | Tindakan |
| --- | --- |
| Critical/high, terjangkau, terekspos ke input pengguna | Perbaiki segera (hotfix) |
| High tetapi hanya di devDependency/build tool | Perbaiki dalam siklus berikutnya |
| Tidak ada versi perbaikan | Mitigasi (nonaktifkan fitur, validasi input, ganti library), pantau |
| Tidak terjangkau / false positive | Dokumentasikan alasan + tanggal tinjau ulang (jangan abaikan permanen) |

### Mengurangi risiko supply chain

```text
- Pilih package: maintainer aktif, rilis terbaru, issue ditanggapi, unduhan wajar, lisensi sesuai, tanpa dependensi berlebihan
- Periksa nama package dengan teliti (typosquatting). Di pub.dev perhatikan verified publisher
- Install dari lockfile di CI (npm ci, flutter pub get dengan lock, Gradle dependency locking)
- npm: pertimbangkan --ignore-scripts di CI dan izinkan script hanya untuk package tertentu
- Gunakan registry/proxy internal bila organisasi besar
- Pin GitHub Actions ke commit SHA
- Hasilkan SBOM per rilis (mis. syft, cyclonedx) agar cepat menjawab "apakah kita terdampak CVE X?"
```

### Khusus mobile

```text
- Plugin Flutter membawa kode native (Android/iOS) dan izin. Periksa manifest/Info.plist hasil merge
- SDK pihak ketiga (iklan, analitik) dapat mengumpulkan data → berdampak pada Data Safety / Privacy Manifest
- Library native yang rentan tetap ada di aplikasi yang sudah terpasang sampai pengguna update → pertimbangkan force update untuk kerentanan kritis
```

## Best Practices

- **Commit lockfile** dan instal dari lockfile di CI.
- **Scan otomatis** di setiap PR dan terjadwal (CVE baru muncul untuk versi lama).
- **Update kecil & sering** melalui Dependabot/Renovate dengan test otomatis.
- **Triase berdasarkan keterjangkauan dan eksposur**, catat pengecualian dengan tanggal kedaluwarsa.
- **Minimalkan dependensi**, terutama untuk fungsi sederhana.
- **SBOM per rilis**.

## Anti-Patterns

- `npm audit fix --force` tanpa test (dapat menaikkan versi mayor dan merusak aplikasi).
- Mengabaikan semua temuan karena "terlalu banyak".
- Versi longgar (`^`, `any`) tanpa lockfile.
- Menambah package untuk 5 baris kode.
- Tidak pernah memperbarui dependensi sampai migrasi besar yang menyakitkan.

## Performance Considerations

Scan biasanya cepat (detik) karena memakai lockfile. Jalankan scan image di pipeline build, bukan di setiap commit kecil
bila lambat. Update dependensi kecil secara rutin jauh lebih murah dibanding lompatan versi besar.

## Security Considerations

Mesin developer dan CI adalah target supply chain: batasi secret yang tersedia saat instalasi dependensi, jalankan
install tanpa script bila memungkinkan, dan gunakan token CI dengan cakupan minimum. Pantau advisory untuk dependensi
kritis (auth, crypto, parsing).

## Real-World Use Cases

- PR mingguan Dependabot untuk npm, pub, Gradle, dan Actions dengan CI hijau sebelum merge.
- CVE kritis di library parsing gambar: SBOM menunjukkan versi terdampak di backend, hotfix dalam satu hari.

## Interview Questions

1. Bagaimana Anda mengelola kerentanan dependensi di proyek?
2. Apa itu lockfile dan mengapa penting?
3. Apa itu supply chain attack dan contoh mitigasinya?
4. Apa itu SBOM?
5. Bagaimana Anda memprioritaskan temuan CVE?

## Sample Answers

1. Commit lockfile, scan otomatis di CI dan terjadwal (npm audit/OSV/Trivy), update rutin dengan Dependabot/Renovate dan test otomatis, triase berdasarkan keterjangkauan, dan dokumentasi pengecualian.
2. File yang mengunci versi persis semua dependensi termasuk transitive, sehingga build dapat direproduksi dan scanner tahu versi yang benar-benar dipakai.
3. Penyerang menyusupkan kode jahat melalui dependensi atau tooling (typosquatting, akun maintainer dibobol, install script). Mitigasi: verifikasi package, lockfile, install tanpa script di CI, pin versi/commit, cakupan secret minimum, dan pemantauan advisory.
4. Daftar seluruh komponen perangkat lunak beserta versinya dalam format standar (CycloneDX/SPDX), untuk menjawab cepat apakah suatu rilis terdampak kerentanan.
5. Berdasarkan keparahan, apakah kode rentan terjangkau dan terekspos ke input pengguna, ketersediaan perbaikan, serta dampak bisnis. Kritis yang terjangkau diperbaiki segera, sisanya dijadwalkan atau dimitigasi.

## Practical Exercises

1. Jalankan `osv-scanner` pada repo backend dan mobile Anda lalu triase hasilnya.
2. Konfigurasikan Dependabot untuk semua ekosistem proyek.
3. Hasilkan SBOM untuk rilis terakhir.

## Quick Reference

```text
Lockfile di-commit · npm ci / pub get dengan lock · Gradle locking
Scan: npm audit · osv-scanner (lintas ekosistem) · Trivy (image/fs) · Dependabot/Renovate
Triase: severity × reachability × eksposur · pengecualian bertanggal
Supply chain: cek package · --ignore-scripts di CI · pin Actions SHA · SBOM · secret minimum saat install
Mobile: plugin = kode native + izin · SDK pihak ketiga & privasi · force update untuk CVE kritis
```

## Related Topics

- [Secure Coding Practices](/security/secure-coding/)
- [GitHub Actions](/devops/github-actions/)
- [Docker Image Optimization](/devops/docker-image-optimization/)
