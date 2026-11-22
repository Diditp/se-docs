---
title: "Software Architecture Fundamentals"
description: "Dasar arsitektur perangkat lunak: definisi, quality attributes, gaya arsitektur (layered, modular monolith, microservices, event-driven, client-server, hexagonal), coupling & cohesion, keputusan & ADR, serta diagram C4."
level: intermediate
status: complete
updated: 2026-11-12
tags: [fundamentals, architecture, coupling, cohesion, c4, adr]
---

## Overview

**Arsitektur perangkat lunak** adalah struktur tingkat tinggi sebuah sistem: komponen utamanya, tanggung jawab
masing-masing, cara mereka berkomunikasi, dan **keputusan penting yang mahal untuk diubah**. Arsitektur yang baik
didorong oleh **quality attributes** (NFR) dan konteks tim, bukan tren.

## Why It Matters

Arsitektur menentukan seberapa mudah sistem diskalakan, diuji, dirilis, dan dikembangkan tim. Kesalahan arsitektur
(mis. microservices terlalu dini, tidak ada batas modul) bisa memperlambat tim selama bertahun-tahun.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Quality attributes | Performance, scalability, availability, security, maintainability, testability, deployability |
| Coupling | Tingkat ketergantungan antar modul — usahakan **rendah** |
| Cohesion | Seberapa terkait tanggung jawab di dalam modul — usahakan **tinggi** |
| Separation of concerns | Pisahkan UI, logika bisnis, akses data, integrasi |
| Abstraction & boundaries | Modul berkomunikasi lewat kontrak yang jelas |
| Trade-off | Setiap pilihan mengorbankan sesuatu |
| Architecture Decision Record | Dokumen keputusan + alasan + alternatif |

### Gaya arsitektur

| Gaya | Inti | Cocok | Risiko |
| --- | --- | --- | --- |
| Layered (n-tier) | Presentation → business → data | Aplikasi bisnis umum | Layer "lasagna" tanpa nilai |
| Clean/Hexagonal (ports & adapters) | Domain di tengah, I/O di tepi | Logika bisnis kaya, testability | Boilerplate |
| Modular monolith | Satu deploy, modul dengan batas tegas | Tim kecil–menengah | Batas modul terkikis tanpa disiplin |
| Microservices | Layanan kecil, deploy & data terpisah | Banyak tim, skala berbeda per domain | Kompleksitas operasional & distributed system |
| Event-driven | Komunikasi lewat event asinkron | Integrasi longgar, workflow | Debugging & konsistensi eventual |
| Client–server / BFF | Klien tipis/tebal + API | Mobile & web | Kontrak API harus dikelola |
| Offline-first | Data lokal sebagai sumber UI + sync | Aplikasi lapangan/POS | Konflik & kompleksitas sinkronisasi |

## How It Works

Model **C4** untuk mendokumentasikan arsitektur pada beberapa level zoom:

```text
1. Context    : sistem + pengguna + sistem eksternal (gambar besar untuk semua orang)
2. Container  : aplikasi mobile, API, database, queue, worker (unit yang dapat di-deploy)
3. Component  : modul di dalam satu container (checkout, sync, auth)
4. Code       : class/diagram detail (jarang perlu)
```

Contoh level Container untuk aplikasi kasir:

```text
[Kasir] → [Flutter POS App + SQLite] ⇄ HTTPS ⇄ [API Node.js] → [PostgreSQL]
                                                    ↓
                                               [Queue] → [Worker laporan/notifikasi]
[Admin] → [Web Dashboard] ⇄ [API Node.js]          [Payment Gateway (eksternal)]
```

## Implementation

### Menjaga batas modul (modular monolith Node.js)

```text
src/
  modules/
    orders/      (api/, application/, domain/, infra/, index.ts ← satu-satunya pintu publik)
    inventory/
    payments/
  shared/        (util teknis, bukan logika bisnis)
Aturan: modul lain hanya boleh import dari modules/<x>/index.ts; dicek oleh lint (mis. eslint-plugin-boundaries/dependency-cruiser).
```

### ADR singkat

```markdown
# ADR-003: Modular monolith untuk backend v1
Konteks: Tim 4 engineer, rilis mingguan, satu database PostgreSQL.
Keputusan: Satu service Node.js dengan modul orders/inventory/payments berbatas tegas; komunikasi antar modul via interface & event in-process.
Alternatif: Microservices (ditolak: beban operasional terlalu tinggi untuk tim saat ini).
Konsekuensi: Deploy sederhana; perlu disiplin batas modul; modul dapat dipisah menjadi service bila ada kebutuhan skala/tim.
```

## Best Practices

- **Mulai dari quality attributes & konteks tim**, lalu pilih gaya arsitektur.
- **Mulai sederhana** (modular monolith) dan pisahkan saat ada alasan nyata.
- **Batas modul eksplisit** dan dijaga otomatis (lint/arsitektur test).
- **Dokumentasikan keputusan** dengan ADR dan diagram C4 level 1–2.
- **Rancang untuk diubah**: isolasi dependensi eksternal di balik adapter.

## Anti-Patterns

- Microservices sejak hari pertama untuk tim kecil.
- *Big ball of mud*: tidak ada batas, semua saling memanggil.
- *Distributed monolith*: service terpisah tetapi harus di-deploy bersamaan dan berbagi database.
- Arsitektur hanya di kepala satu orang.
- Memilih teknologi sebelum memahami kebutuhan.

## Performance Considerations

Setiap batas jaringan menambah latency dan titik gagal. Panggilan in-process (monolith) jauh lebih murah daripada
panggilan antar service; desain microservices harus meminimalkan percakapan sinkron berantai.

## Security Considerations

Arsitektur menentukan permukaan serangan: batasi komponen yang terekspos publik (API gateway), segmentasi jaringan
(database tidak terbuka ke internet), prinsip least privilege antar komponen, dan secret terpusat.

## Real-World Use Cases

- Modular monolith Node.js + aplikasi Flutter offline-first untuk POS multi-outlet.
- Event-driven untuk integrasi sistem enterprise (order, billing, notifikasi).
- BFF untuk menyesuaikan API dengan kebutuhan layar mobile.

## Interview Questions

1. Apa itu arsitektur perangkat lunak?
2. Jelaskan coupling dan cohesion.
3. Monolith vs microservices — kapan memilih masing-masing?
4. Apa itu hexagonal/ports & adapters?
5. Bagaimana Anda mendokumentasikan arsitektur?

## Sample Answers

1. Struktur tingkat tinggi sistem — komponen, tanggung jawab, komunikasi, dan keputusan penting yang sulit diubah — yang didorong oleh quality attributes.
2. Coupling adalah tingkat ketergantungan antar modul (rendah lebih baik agar perubahan tidak merambat); cohesion adalah keterkaitan tanggung jawab di dalam modul (tinggi lebih baik agar modul fokus).
3. Monolith (sebaiknya modular) untuk tim kecil–menengah dan domain yang masih berkembang: sederhana untuk deploy dan debug. Microservices ketika banyak tim butuh rilis independen, kebutuhan skala berbeda per domain, dan organisasi siap dengan observability, CI/CD, dan operasi terdistribusi.
4. Domain berada di tengah dan mendefinisikan port (interface); adapter di tepi mengimplementasikannya untuk UI, database, atau layanan eksternal — sehingga domain dapat diuji tanpa infrastruktur.
5. Diagram C4 level context & container, ADR untuk keputusan penting, kontrak API (OpenAPI), dan README per modul — disimpan bersama kode.

## Practical Exercises

1. Gambar diagram C4 level 1 dan 2 untuk proyek Anda.
2. Tulis ADR untuk satu keputusan arsitektur yang sudah diambil.
3. Identifikasi 3 tempat dengan coupling tinggi dan usulkan perbaikannya.

## Quick Reference

```text
Arsitektur = struktur + keputusan mahal · didorong quality attributes
Low coupling · high cohesion · separation of concerns · batas modul eksplisit
Layered · Clean/Hexagonal · Modular monolith (default) · Microservices (bila ada alasan) · Event-driven
Dokumentasi: C4 (context, container) + ADR
```

## Related Topics

- [Functional & Non-Functional Requirements](/fundamentals/functional-non-functional-requirements/)
- [System Design Fundamentals](/system-design/concepts/fundamentals/)
- [Monolithic vs Microservices](/system-design/concepts/monolith-vs-microservices/)
- [Clean Architecture (Flutter)](/flutter/clean-architecture/)
