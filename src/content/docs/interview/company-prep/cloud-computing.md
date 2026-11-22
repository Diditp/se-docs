---
title: "Basic Cloud Computing"
description: "Dasar cloud computing untuk interview: karakteristik cloud, IaaS/PaaS/SaaS, public/private/hybrid, region & availability zone, layanan inti (compute, storage, database, network), shared responsibility, biaya, dan contoh arsitektur sederhana."
level: beginner
status: complete
updated: 2026-11-13
tags: [interview, company-prep, cloud, iaas, paas, saas]
---

## Overview

**Cloud computing** adalah penyediaan sumber daya komputasi (server, storage, database, jaringan, software) **sesuai
permintaan melalui internet** dengan model bayar sesuai pemakaian. Penyedia publik besar: AWS, Google Cloud, Microsoft
Azure; di Indonesia juga ada penyedia cloud lokal dan layanan data center/cloud milik perusahaan telekomunikasi & TIK.

Definisi NIST menyebut lima karakteristik: **on-demand self-service**, **broad network access**, **resource pooling**,
**rapid elasticity**, dan **measured service**.

## Why It Matters

Perusahaan TIK besar umumnya mengelola data center, layanan cloud, dan konektivitas — sekaligus memakai cloud untuk
aplikasinya. Kandidat software engineer diharapkan paham istilah dasar (IaaS/PaaS/SaaS, region, autoscaling, shared
responsibility) dan bisa menjelaskan bagaimana aplikasi di-deploy dan diskalakan.

## Core Concepts

### Model layanan

| Model | Anda kelola | Penyedia kelola | Contoh |
| --- | --- | --- | --- |
| **IaaS** | OS, runtime, aplikasi, data | Hardware, virtualisasi, jaringan fisik | VM (EC2, Compute Engine), block storage |
| **PaaS** | Aplikasi & data | + OS, runtime, scaling platform | App Engine, Cloud Run, Heroku, managed database |
| **SaaS** | Data & konfigurasi | Semuanya | Gmail, Microsoft 365, Salesforce |
| (FaaS/Serverless) | Fungsi kode | + server & scaling per request | AWS Lambda, Cloud Functions |

### Model deployment

| Model | Ciri |
| --- | --- |
| Public cloud | Infrastruktur penyedia, dipakai banyak pelanggan (multi-tenant) |
| Private cloud | Infrastruktur khusus satu organisasi (on-premise atau dedicated) |
| Hybrid cloud | Gabungan on-premise/private + public, terhubung |
| Multi-cloud | Memakai lebih dari satu penyedia public cloud |

### Istilah inti

- **Region** — lokasi geografis berisi beberapa **Availability Zone (AZ)** (data center terpisah dalam region).
- **Compute** — VM, container (Kubernetes/managed container), serverless.
- **Storage** — block (disk VM), file, **object storage** (S3/GCS — file, gambar, backup).
- **Database terkelola** — PostgreSQL/MySQL managed, NoSQL, cache (Redis).
- **Networking** — VPC/VNet, subnet publik/privat, security group/firewall, load balancer, CDN, VPN/Direct Connect.
- **Autoscaling** — menambah/mengurangi instance otomatis berdasarkan metrik.
- **IAM** — identitas & hak akses (least privilege).
- **Shared responsibility model** — penyedia bertanggung jawab atas keamanan *cloud* (fisik, hardware, hypervisor); pelanggan atas keamanan *di dalam cloud* (konfigurasi, data, akses, aplikasi).

## How It Works

Virtualisasi dan container memungkinkan satu server fisik dibagi menjadi banyak mesin/lingkungan terisolasi; API
penyedia memungkinkan semua sumber daya dibuat dan dihapus secara terprogram (Infrastructure as Code).

```text
Arsitektur web/mobile backend sederhana di cloud (satu region, dua AZ)
Internet → DNS → CDN (aset statis) → Load Balancer (publik)
                                         ├── AZ-a: container/VM API (subnet privat)
                                         └── AZ-b: container/VM API (subnet privat)   ← autoscaling
                                     Managed PostgreSQL (primary AZ-a, standby AZ-b) · Redis · Object storage (foto, backup)
                                     Monitoring & logging terpusat · IAM per layanan · secrets manager
```

## Implementation

### Contoh deploy container ke platform serverless container (gambaran)

```bash
# Build & push image, lalu deploy sebagai layanan terkelola (contoh: Google Cloud Run)
docker build -t asia-southeast2-docker.pkg.dev/<project>/apps/pos-api:1.8.0 .
docker push asia-southeast2-docker.pkg.dev/<project>/apps/pos-api:1.8.0
gcloud run deploy pos-api \
  --image asia-southeast2-docker.pkg.dev/<project>/apps/pos-api:1.8.0 \
  --region asia-southeast2 --min-instances 1 --max-instances 10 \
  --set-secrets DATABASE_URL=pos-db-url:latest
```

`asia-southeast2` adalah region Jakarta di Google Cloud; penyedia lain juga memiliki region di Jakarta. Pemilihan region
memengaruhi latency ke user dan kepatuhan lokasi data.

### Membandingkan opsi deploy

| Opsi | Kelebihan | Kekurangan | Cocok |
| --- | --- | --- | --- |
| VM (IaaS) | Kontrol penuh | Patch OS, scaling manual | Legacy, kebutuhan khusus |
| Managed container / PaaS | Deploy cepat, autoscale | Kurang kontrol, batas platform | API stateless |
| Kubernetes | Fleksibel, standar industri | Kompleks untuk tim kecil | Banyak layanan, tim platform |
| Serverless functions | Bayar per eksekusi, nol server | Cold start, batas durasi | Event, webhook, job ringan |

## Best Practices

- **Managed service lebih dulu** (database, cache, object storage) agar tim fokus pada aplikasi.
- **Multi-AZ** untuk komponen kritis (load balancer, aplikasi, database standby).
- **Subnet privat** untuk aplikasi & database; hanya load balancer yang publik.
- **IAM least privilege** dan secrets manager — bukan access key di kode.
- **Infrastructure as Code** (Terraform/Pulumi) agar lingkungan bisa direproduksi.
- **Pantau biaya**: budget alert, matikan resource dev di luar jam kerja, pilih ukuran instance yang tepat.
- **Backup & uji restore** terjadwal; tentukan RPO/RTO.

## Anti-Patterns

- "Lift and shift" tanpa menyesuaikan arsitektur → biaya tinggi, tidak memanfaatkan elastisitas.
- Database terekspos ke internet dengan password lemah.
- Bucket object storage publik berisi data pelanggan.
- Satu akun root dipakai bersama tanpa MFA.
- Semua resource di satu AZ untuk sistem yang butuh ketersediaan tinggi.

## Performance Considerations

- Pilih region terdekat dengan user (Jakarta untuk user Indonesia) untuk latency rendah.
- CDN untuk aset statis; cache untuk data panas.
- Autoscaling berbasis metrik yang tepat (CPU, latency, kedalaman antrian) dan instance minimum untuk menghindari cold start.
- Read replica untuk beban baca laporan.

## Security Considerations

- Pahami **shared responsibility**: misconfiguration (bucket publik, security group terbuka) adalah tanggung jawab pelanggan dan penyebab kebocoran yang umum.
- Enkripsi at rest (default di banyak layanan) dan in transit (TLS).
- Logging audit (siapa mengubah apa), MFA, dan rotasi kredensial.
- Kepatuhan: lokasi data dan regulasi perlindungan data pribadi (mis. UU PDP di Indonesia) memengaruhi pemilihan region & penyedia.

## Real-World Use Cases

- Backend aplikasi pelanggan di managed container + managed PostgreSQL multi-AZ.
- Object storage untuk foto bukti instalasi dari aplikasi teknisi.
- Hybrid: sistem inti di data center sendiri, layanan digital baru di public cloud, terhubung lewat koneksi privat.

## Interview Questions

1. Apa itu cloud computing dan apa karakteristiknya?
2. Jelaskan IaaS, PaaS, dan SaaS dengan contoh.
3. Apa beda public, private, dan hybrid cloud?
4. Apa itu region dan availability zone?
5. Apa itu shared responsibility model?
6. Apa keuntungan dan risiko memakai cloud?

## Sample Answers

1. Penyediaan sumber daya komputasi sesuai permintaan melalui jaringan dengan pembayaran sesuai pemakaian; karakteristiknya self-service, akses jaringan luas, resource pooling, elastisitas cepat, dan layanan yang terukur.
2. IaaS menyewa infrastruktur (VM, storage) dan Anda mengelola OS ke atas — mis. EC2. PaaS menyediakan platform untuk menjalankan aplikasi tanpa mengelola server — mis. Cloud Run, App Engine, managed database. SaaS adalah aplikasi jadi — mis. Gmail.
3. Public dipakai banyak pelanggan di infrastruktur penyedia; private khusus satu organisasi; hybrid menggabungkan keduanya dengan konektivitas dan pengelolaan terpadu.
4. Region adalah lokasi geografis; availability zone adalah data center terisolasi di dalam region. Menyebar aplikasi ke beberapa AZ menjaga layanan tetap berjalan jika satu AZ gagal.
5. Penyedia bertanggung jawab atas keamanan infrastruktur cloud (fisik, hardware, virtualisasi); pelanggan bertanggung jawab atas data, identitas & akses, konfigurasi, dan aplikasi. Porsi pelanggan mengecil dari IaaS ke SaaS.
6. Keuntungan: elastisitas, tanpa investasi hardware awal, layanan terkelola, jangkauan global, ketersediaan tinggi. Risiko: biaya tak terkendali, misconfiguration keamanan, vendor lock-in, ketergantungan koneksi, dan kepatuhan lokasi data.

## Practical Exercises

1. Gambar arsitektur cloud untuk backend POS Anda (region, AZ, subnet, layanan terkelola).
2. Deploy API latihan sebagai container ke salah satu platform free tier dan hubungkan ke managed PostgreSQL.
3. Buat tabel perbandingan biaya bulanan perkiraan untuk VM vs managed container pada beban kecil.

## Quick Reference

```text
5 ciri NIST: on-demand · network access · pooling · elasticity · measured
IaaS (VM) · PaaS (platform/managed) · SaaS (aplikasi) · FaaS (fungsi)
Public · Private · Hybrid · Multi-cloud · Region ⊃ AZ · VPC + subnet privat · LB publik
Shared responsibility: penyedia = security OF cloud · pelanggan = security IN cloud
Managed first · multi-AZ · IAM least privilege · IaC · budget alert · backup + uji restore
```

## Related Topics

- [Linux & Server Fundamentals](/interview/company-prep/linux-server/)
- [Dockerfile & Docker Compose](/devops/dockerfile-compose/)
- [Scalability](/system-design/concepts/scalability/)
- [Availability & Reliability](/system-design/concepts/availability-reliability/)
- Referensi: [NIST SP 800-145 — Definition of Cloud Computing](https://csrc.nist.gov/pubs/sp/800/145/final).
