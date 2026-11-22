---
title: "Functional & Non-Functional Requirements"
description: "Perbedaan kebutuhan fungsional dan non-fungsional, kategori NFR (performance, scalability, availability, security, usability, maintainability, compatibility), cara menulis NFR yang terukur, dan dampaknya ke arsitektur."
level: beginner
status: complete
updated: 2026-11-12
tags: [fundamentals, requirements, nfr, quality-attributes]
---

## Overview

- **Functional requirement (FR)** — *apa* yang dilakukan sistem: fitur dan perilaku ("kasir dapat mencetak struk").
- **Non-functional requirement (NFR)** — *seberapa baik* sistem melakukannya: kualitas dan batasan ("struk tercetak ≤ 2
  detik", "berjalan di Android 8+", "data terenkripsi").

NFR sering disebut **quality attributes** dan paling banyak menentukan **arsitektur**.

## Why It Matters

Dua sistem dengan fitur sama bisa sangat berbeda arsitekturnya karena NFR: aplikasi untuk 100 user vs 1 juta user,
online-only vs offline-first. NFR yang tidak ditulis biasanya baru ketahuan setelah rilis — saat paling mahal untuk
diperbaiki.

## Core Concepts

| Kategori NFR | Pertanyaan | Contoh terukur |
| --- | --- | --- |
| Performance | Seberapa cepat? | p95 API < 300 ms; cold start < 2 s di perangkat kelas menengah |
| Scalability | Seberapa besar bisa tumbuh? | Mendukung 500 outlet, 50 transaksi/detik puncak |
| Availability | Seberapa sering bisa dipakai? | 99,9% per bulan (± 43 menit downtime) |
| Reliability | Seberapa andal? | Tidak ada transaksi hilang; crash-free users ≥ 99,5% |
| Security | Seberapa aman? | TLS 1.2+, token kedaluwarsa 15 menit, audit log void |
| Usability | Seberapa mudah dipakai? | Kasir baru bisa transaksi tanpa pelatihan dalam 10 menit |
| Maintainability | Seberapa mudah diubah? | Coverage domain ≥ 80%, build CI < 15 menit |
| Compatibility | Di mana bisa jalan? | Android 8.0+, layar 5–10 inci, printer ESC/POS |
| Portability/Offline | Dalam kondisi apa? | Transaksi tetap jalan offline hingga 3 hari |
| Compliance | Aturan apa? | Penyimpanan & pemrosesan data pribadi sesuai regulasi yang berlaku |
| Observability | Bagaimana dipantau? | Log terstruktur, alert error rate > 2% |

## How It Works

```text
Kebutuhan bisnis → FR (fitur) + NFR (kualitas)
NFR → keputusan arsitektur:
  offline 3 hari         → database lokal + outbox + sync
  99,9% availability     → multi-instance + health check + DB replica
  p95 < 300 ms           → index, cache, pagination
  audit wajib            → event log append-only
```

## Implementation

### Contoh daftar kebutuhan fitur "Checkout"

```markdown
## Functional
- FR-01 Kasir dapat menambahkan produk via scan barcode atau pencarian nama.
- FR-02 Sistem menghitung subtotal, diskon, pajak, dan total.
- FR-03 Kasir dapat memilih metode bayar: tunai, QRIS, kartu.
- FR-04 Sistem mencetak struk setelah pembayaran berhasil.

## Non-functional
- NFR-01 (Performance) Penambahan item tampil ≤ 100 ms; pencarian ≤ 300 ms untuk 20.000 produk.
- NFR-02 (Availability/Offline) Checkout tunai berfungsi tanpa internet; data sinkron ≤ 5 menit setelah online.
- NFR-03 (Reliability) Tidak ada transaksi ganda saat retry sinkronisasi.
- NFR-04 (Security) PIN supervisor untuk void; token di secure storage; seluruh komunikasi via HTTPS.
- NFR-05 (Compatibility) Android 8.0+, RAM 2 GB, printer Bluetooth ESC/POS 58 mm.
```

### Menguji NFR

| NFR | Cara verifikasi |
| --- | --- |
| Performance | Benchmark di perangkat target, load test API (k6/JMeter) |
| Offline | Test dengan mode pesawat, integration test sync |
| Security | Code review, SAST, penetration test |
| Availability | Monitoring uptime, chaos/failover test |
| Usability | Uji dengan pengguna nyata, waktu penyelesaian tugas |

## Best Practices

- **Buat NFR terukur** (angka, kondisi, perangkat) agar dapat diuji.
- **Prioritaskan NFR** — tidak semua sistem butuh 99,99%.
- **Dokumentasikan trade-off** (mis. konsistensi kuat vs offline).
- **Masukkan NFR ke Definition of Done** dan pipeline (performance budget, security scan).
- **Tinjau ulang NFR** saat skala atau konteks bisnis berubah.

## Anti-Patterns

- NFR kabur: "harus cepat", "harus aman", "user-friendly".
- Target berlebihan tanpa alasan bisnis (biaya infrastruktur membengkak).
- Tidak pernah diuji — hanya tertulis di dokumen.
- Menganggap NFR urusan "nanti setelah fitur selesai".

## Performance Considerations

Performance NFR sebaiknya dinyatakan dalam persentil (p95/p99) dan kondisi (perangkat, jaringan, ukuran data), karena
rata-rata menyembunyikan pengalaman pengguna terburuk.

## Security Considerations

Security adalah NFR yang paling sering dilupakan. Turunkan dari risiko: data apa yang sensitif, ancaman apa yang
relevan, kontrol apa yang dibutuhkan (autentikasi, otorisasi, enkripsi, audit, retensi). Lihat
[OWASP Top 10](/security/owasp-top-10/).

## Real-World Use Cases

- SRS proyek klien/tender yang menuntut SLA dan standar keamanan.
- Menentukan arsitektur offline-first untuk aplikasi lapangan.
- Menetapkan performance budget aplikasi mobile (ukuran APK, startup).

## Interview Questions

1. Apa beda functional dan non-functional requirement?
2. Sebutkan contoh NFR untuk aplikasi mobile.
3. Bagaimana NFR memengaruhi arsitektur?
4. Bagaimana menulis NFR yang baik?
5. Apa arti availability 99,9%?

## Sample Answers

1. FR mendefinisikan apa yang dilakukan sistem (fitur/perilaku); NFR mendefinisikan kualitas dan batasan cara sistem melakukannya (performa, keamanan, ketersediaan, dll.).
2. Cold start < 2 detik, crash-free users ≥ 99,5%, berjalan di Android 8+, tetap bisa transaksi offline, ukuran unduhan < 30 MB, token disimpan di secure storage.
3. NFR menentukan pilihan struktural: offline → database lokal & sinkronisasi; skala tinggi → service stateless, cache, replika; audit → event log; keamanan → enkripsi & segmentasi.
4. Spesifik, terukur, dengan kondisi yang jelas (perangkat, beban, jaringan), dapat diuji, dan memiliki prioritas serta alasan bisnis.
5. Sistem tersedia 99,9% dari waktu dalam periode tertentu — sekitar 43 menit downtime per bulan (± 8,8 jam per tahun).

## Practical Exercises

1. Ubah 5 NFR kabur di proyek Anda menjadi NFR terukur.
2. Pilih 3 NFR dan jelaskan keputusan arsitektur yang dihasilkannya.
3. Rancang cara menguji NFR "transaksi offline hingga 3 hari".

## Quick Reference

```text
FR = apa · NFR = seberapa baik / dalam batasan apa
NFR: performance · scalability · availability · reliability · security · usability · maintainability · compatibility · compliance
Terukur: angka + kondisi + cara uji · 99,9% ≈ 43 mnt/bulan · NFR → arsitektur
```

## Related Topics

- [Requirement Analysis](/fundamentals/requirement-analysis/)
- [Software Architecture Fundamentals](/fundamentals/software-architecture-fundamentals/)
- [System Design Fundamentals](/system-design/concepts/fundamentals/)
