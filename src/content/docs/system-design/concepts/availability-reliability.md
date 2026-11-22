---
title: "Availability, Reliability & High Availability"
description: "Availability dan reliability dalam desain sistem: angka 'nines' & downtime, SLI/SLO/SLA dan error budget, redundansi & menghilangkan single point of failure, multi-AZ vs multi-region, failover, RPO & RTO untuk backup/disaster recovery, ketergantungan berantai, graceful degradation, serta peran aplikasi mobile dalam ketahanan (offline, force update, kill switch)."
level: intermediate
status: complete
updated: 2026-11-13
tags: [system-design, availability, reliability, slo, disaster-recovery]
---

## Overview

- **Availability**: persentase waktu sistem dapat dipakai.
- **Reliability**: kemampuan sistem bekerja **dengan benar** secara konsisten (tidak hanya "hidup", tetapi memberi hasil yang benar).
- **High availability (HA)**: desain yang meminimalkan downtime melalui redundansi dan failover otomatis.

## Why It Matters

Sistem kasir yang down saat jam makan siang berarti kehilangan penjualan. Interviewer bertanya "berapa availability yang
ditargetkan dan bagaimana mencapainya?" untuk melihat pemahaman trade-off antara biaya dan ketahanan.

## Core Concepts

| Availability | Downtime per tahun | Downtime per bulan (≈30 hari) |
| --- | --- | --- |
| 99% | ~3,65 hari | ~7,2 jam |
| 99,9% | ~8,8 jam | ~43 menit |
| 99,95% | ~4,4 jam | ~22 menit |
| 99,99% | ~53 menit | ~4,3 menit |

| Istilah | Arti |
| --- | --- |
| SLI | Indikator terukur (persentase request sukses, p95 latensi) |
| SLO | Target internal untuk SLI (99,9% request sukses per 30 hari) |
| SLA | Janji kontraktual ke pelanggan, biasanya lebih longgar dari SLO, dengan konsekuensi |
| Error budget | `100% − SLO`: jumlah kegagalan yang "boleh" dipakai (mis. untuk rilis berisiko) |
| SPOF | Single point of failure: satu komponen yang bila gagal, seluruh sistem gagal |
| RPO | Recovery Point Objective: berapa banyak data (waktu) boleh hilang |
| RTO | Recovery Time Objective: berapa lama boleh pulih |
| MTTR / MTBF | Rata-rata waktu pemulihan / rata-rata waktu antar kegagalan |

### Availability berantai

```text
Komponen seri: availability total = perkalian
API 99,9% × DB 99,9% × payment gateway 99,5% ≈ 99,3%
Komponen paralel (redundan): 1 − (1 − A)^n → dua instance 99% → 99,99%
→ Kurangi dependensi sinkron di jalur kritis, tambahkan redundansi pada komponen lemah
```

## How It Works

```text
Tentukan SLO per alur penting → identifikasi SPOF di jalur kritis → tambahkan redundansi & failover
→ siapkan degradasi bertahap untuk fitur non-kritis → backup + uji restore (RPO/RTO)
→ monitoring SLI + alert berbasis error budget → latihan insiden & postmortem
```

## Implementation

### Menghilangkan SPOF

| Komponen | Redundansi |
| --- | --- |
| Instance API | ≥ 2 instance di zona berbeda di belakang LB |
| Load balancer | LB terkelola multi-AZ |
| Database | Primary + standby (replikasi) dengan failover otomatis |
| Cache | Replica + fallback ke DB bila cache down |
| Queue | Broker terkelola/cluster |
| DNS & sertifikat | Penyedia DNS andal, perpanjangan otomatis + alert kedaluwarsa |
| Orang & proses | Lebih dari satu orang bisa deploy & restore, runbook tertulis |

### Multi-AZ vs multi-region

| Opsi | Melindungi dari | Biaya & kompleksitas |
| --- | --- | --- |
| Single AZ | Kegagalan instance | Rendah |
| Multi-AZ | Kegagalan satu data center/zona | Sedang (pilihan umum untuk produksi) |
| Multi-region aktif-pasif | Kegagalan region | Tinggi: replikasi lintas region, failover DNS |
| Multi-region aktif-aktif | Kegagalan region + latensi global | Sangat tinggi: konflik data, konsistensi |

### Backup & disaster recovery

```text
Contoh target POS: RPO 5 menit, RTO 1 jam
- Point-in-time recovery (WAL archiving) → RPO menit
- Backup harian ke region/akun lain (lindungi dari kesalahan & ransomware)
- Uji restore terjadwal (backup yang tidak pernah diuji = belum tentu ada)
- Runbook langkah demi langkah + siapa yang bertanggung jawab
```

### Graceful degradation

```text
Payment gateway down → terima pembayaran tunai, tandai non-tunai tidak tersedia
Layanan rekomendasi down → tampilkan produk terlaris statis
Laporan lambat → tetap izinkan transaksi (prioritas jalur penjualan)
Gunakan timeout, circuit breaker, dan feature flag untuk mematikan fitur non-kritis
```

### Peran aplikasi mobile

```text
- Offline-first: penjualan tetap berjalan saat backend/jaringan bermasalah
- Retry dengan backoff + jitter (hindari badai retry yang memperparah insiden)
- Kill switch / Remote Config untuk mematikan fitur bermasalah tanpa rilis
- Force update untuk versi dengan bug kritis
- Pesan status yang jelas ("Pembayaran QRIS sedang gangguan, gunakan tunai")
```

## Best Practices

- **SLO per alur bisnis penting**, bukan satu angka untuk semua.
- **Hilangkan SPOF di jalur kritis** dan kurangi dependensi sinkron.
- **Multi-AZ sebagai default produksi**, multi-region bila kebutuhan bisnis membenarkan biaya.
- **RPO/RTO tertulis dan restore diuji**.
- **Degradasi bertahap** untuk fitur non-kritis.
- **Postmortem tanpa menyalahkan** dan tindak lanjut nyata.

## Anti-Patterns

- Menargetkan 99,99% tanpa memahami biaya dan dependensi.
- Backup tanpa pernah uji restore.
- Satu fitur non-kritis yang down menjatuhkan seluruh aplikasi.
- Retry agresif dari klien saat server sudah kewalahan.
- Hanya satu orang yang tahu cara memulihkan sistem.

## Performance Considerations

Redundansi dan replikasi sinkron menambah latensi tulis. Failover memakan waktu (detik–menit) sehingga klien harus
mampu retry. Health check yang terlalu agresif dapat menyebabkan failover palsu, sedangkan yang terlalu lambat
memperpanjang downtime.

## Security Considerations

Serangan (DDoS, ransomware, kredensial bocor) adalah penyebab downtime yang nyata: rate limiting, backup immutable atau
di akun terpisah, prinsip least privilege, dan rencana respons insiden adalah bagian dari availability.

## Real-World Use Cases

- POS dengan SLO transaksi 99,9%: API multi-AZ, PostgreSQL dengan standby, aplikasi offline-first sebagai lapisan ketahanan terakhir.
- Error budget habis karena rilis bermasalah → pembekuan fitur dan fokus pada stabilitas.

## Interview Questions

1. Apa beda availability dan reliability?
2. Apa itu SLI, SLO, SLA, dan error budget?
3. Bagaimana menghitung availability sistem dengan beberapa dependensi?
4. Apa itu RPO dan RTO?
5. Bagaimana desain Anda menghadapi kegagalan layanan pihak ketiga?

## Sample Answers

1. Availability mengukur seberapa sering sistem dapat diakses. Reliability mengukur apakah sistem bekerja dengan benar secara konsisten. Sistem bisa "hidup" tetapi tidak andal bila sering memberi hasil salah.
2. SLI adalah metrik yang diukur, SLO target internal untuk metrik itu, SLA janji kontraktual ke pelanggan, dan error budget adalah selisih 100% dengan SLO yang menentukan seberapa banyak risiko (mis. rilis) yang masih bisa diambil.
3. Untuk dependensi seri, kalikan availability masing-masing. Untuk komponen redundan paralel, gunakan 1 − hasil kali peluang gagal masing-masing.
4. RPO adalah batas kehilangan data yang dapat diterima (dalam waktu). RTO adalah batas waktu pemulihan. Keduanya menentukan strategi backup, replikasi, dan failover.
5. Timeout dan circuit breaker, retry dengan backoff untuk operasi idempoten, antrean untuk pekerjaan yang bisa ditunda, degradasi bertahap (fitur alternatif), dan komunikasi status ke pengguna.

## Practical Exercises

1. Tetapkan SLO untuk tiga alur utama aplikasi Anda.
2. Gambar jalur kritis transaksi dan tandai semua SPOF.
3. Lakukan uji restore database ke lingkungan terpisah dan catat waktunya (RTO aktual).

## Quick Reference

```text
99,9% ≈ 43 menit/bulan · 99,99% ≈ 4,3 menit/bulan
SLI (ukur) → SLO (target) → SLA (kontrak) · error budget = 100% − SLO
Seri: kalikan · paralel: 1 − Π(1 − A)
Hilangkan SPOF · multi-AZ default · RPO/RTO + uji restore
Degradasi bertahap · circuit breaker · kill switch · offline-first di mobile
```

## Related Topics

- [Fault Tolerance](/system-design/concepts/fault-tolerance/)
- [Load Balancing](/system-design/concepts/load-balancing/)
- [Backup & Recovery](/database/backup-recovery/)
