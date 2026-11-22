---
title: "Container Networking & Volumes"
description: "Jaringan dan penyimpanan container: bridge network & DNS antar container, port publishing vs komunikasi internal, localhost di dalam container, host.docker.internal, akses dari emulator/perangkat Android, named volume vs bind mount vs tmpfs, persistensi database, backup volume, permission, serta pola Compose untuk development dan produksi."
level: intermediate
status: complete
version: "Docker Engine 27+ · Compose v2"
updated: 2026-11-13
tags: [devops, docker, networking, volumes, compose]
---

## Overview

Container terisolasi secara default: punya jaringan dan filesystem sendiri. **Networking** menentukan bagaimana container
berkomunikasi satu sama lain dan dengan dunia luar. **Volume** menentukan data apa yang bertahan setelah container
dihapus.

## Why It Matters

Kesalahan networking & volume adalah sumber masalah Docker paling umum: API tidak bisa terhubung ke `localhost:5432`,
aplikasi Flutter di emulator tidak bisa mengakses backend lokal, atau data database hilang setelah `docker compose down`.

## Core Concepts

### Networking

| Mode | Perilaku |
| --- | --- |
| bridge (default/user-defined) | Jaringan privat. Container di network yang sama saling menemukan lewat **nama service** (DNS) |
| host | Container memakai jaringan host langsung (Linux). Tanpa isolasi port |
| none | Tanpa jaringan |

| Situasi | Alamat |
| --- | --- |
| API → DB di Compose yang sama | `db:5432` (nama service) |
| Di dalam container, `localhost` | Container itu sendiri, **bukan** host |
| Container → layanan di host (Docker Desktop) | `host.docker.internal` |
| Host → container | Port yang di-publish (`-p 3000:3000`) via `localhost:3000` |
| Emulator Android → host | `10.0.2.2` |
| HP fisik → laptop | IP LAN laptop (mis. `192.168.1.10`), atau `adb reverse` |

### Penyimpanan

| Jenis | Lokasi | Cocok untuk |
| --- | --- | --- |
| Named volume | Dikelola Docker | Data DB, data persisten |
| Bind mount | Folder host tertentu | Kode sumber saat development (hot reload), file konfigurasi |
| tmpfs | Memori | Data sementara/sensitif yang tidak boleh ke disk |
| Layer tulis container | Di dalam container | Tidak untuk data penting (hilang saat container dihapus) |

## How It Works

```text
docker compose up → membuat network <project>_default → setiap service terdaftar di DNS internal dengan namanya
api → "db" → resolve ke IP container db → koneksi di network privat (tanpa publish port)
Volume pgdata → di-mount ke /var/lib/postgresql/data → tetap ada walau container db dibuat ulang
```

## Implementation

### Compose untuk development

```yaml
services:
  api:
    build: .
    ports: ["3000:3000"]                          # dibuka ke host agar app Flutter bisa memanggil
    environment:
      DATABASE_URL: postgres://pos:pos@db:5432/pos   # nama service, bukan localhost
      REDIS_URL: redis://redis:6379
    volumes:
      - ./src:/app/src                            # bind mount untuk hot reload
    depends_on:
      db: { condition: service_healthy }
  db:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: pos, POSTGRES_PASSWORD: pos, POSTGRES_DB: pos }
    ports: ["127.0.0.1:5432:5432"]                # hanya dari laptop sendiri, untuk tool DB
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pos -d pos"]
      interval: 5s
      retries: 10
  redis:
    image: redis:7-alpine
volumes:
  pgdata:
```

```bash
docker compose up -d
docker compose down          # hapus container & network, volume TETAP ada
docker compose down -v       # ⚠️ juga menghapus volume (data hilang)
```

### Aplikasi Flutter mengakses backend lokal

```dart
// config dev
const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');   // emulator Android
```

```bash
adb reverse tcp:3000 tcp:3000      # HP fisik via USB: localhost:3000 di HP → laptop
```

Ingat: Android memblokir HTTP cleartext secara default. Izinkan hanya untuk host dev di Network Security Config build
debug, atau gunakan HTTPS lokal.

### Memisahkan network

```yaml
services:
  proxy:  { image: caddy:2, ports: ["80:80", "443:443"], networks: [public, internal] }
  api:    { image: pos-api:1.8.0, networks: [internal] }           # tidak dipublish langsung
  db:     { image: postgres:16-alpine, networks: [internal] }
networks:
  public: {}
  internal: { internal: true }        # tanpa akses keluar internet
```

### Backup & restore volume

```bash
# Database: gunakan tool native (konsisten), bukan menyalin folder data saat berjalan
docker compose exec -T db pg_dump -U pos -Fc pos > backup.dump
docker compose exec -T db pg_restore -U pos -d pos --clean < backup.dump

# Volume umum: arsipkan lewat container sementara
docker run --rm -v uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads.tgz -C /data .
```

### Permission bind mount

```text
Container berjalan sebagai user non-root (mis. uid 1000) → folder host harus bisa ditulis uid tersebut
Gejala: EACCES saat menulis → sesuaikan ownership atau gunakan named volume
```

### Produksi

```text
- Database sebaiknya layanan terkelola (Cloud SQL, RDS) atau server dengan backup terencana, bukan container ad-hoc
- File unggahan ke object storage, bukan volume lokal (instance bisa diganti/diskalakan)
- Hanya reverse proxy/load balancer yang mem-publish port. DB & Redis tidak terbuka ke internet
```

## Best Practices

- **Gunakan nama service** untuk komunikasi antar container.
- **Publish port seperlunya**, bind ke `127.0.0.1` untuk tool lokal.
- **Named volume untuk data**, bind mount untuk kode saat development.
- **Healthcheck + depends_on** agar urutan start benar.
- **Backup dengan tool native database** dan uji restore.
- **Object storage untuk file di produksi**.

## Anti-Patterns

- `localhost:5432` dari dalam container API untuk mengakses container DB.
- Publish port DB/Redis ke `0.0.0.0` di server.
- `docker compose down -v` tanpa sadar data akan terhapus.
- Menyalin folder data PostgreSQL saat database berjalan sebagai "backup".
- Menyimpan upload pengguna di filesystem container.

## Performance Considerations

Bind mount di Docker Desktop (Windows/macOS) bisa lambat untuk folder dengan banyak file. Simpan proyek di filesystem
WSL2/Linux atau pakai named volume untuk `node_modules`. Network bridge menambah overhead sangat kecil, umumnya tidak
perlu dioptimasi.

## Security Considerations

Jangan mengekspos port database, Redis, atau dashboard admin ke publik. Gunakan network internal, password kuat bahkan
untuk development yang dapat diakses jaringan, dan tmpfs untuk file sensitif sementara. Ingat bahwa Docker dapat
melewati aturan firewall UFW saat mem-publish port di Linux. Bind ke `127.0.0.1` atau atur firewall dengan benar.

## Real-World Use Cases

- Developer Flutter menjalankan stack backend dengan Compose dan mengakses API dari emulator lewat `10.0.2.2:3000`.
- Server kecil: Caddy sebagai satu-satunya port publik, API & DB di network internal, backup `pg_dump` harian ke storage.

## Interview Questions

1. Mengapa `localhost` di dalam container tidak mengarah ke container lain?
2. Apa beda named volume dan bind mount?
3. Bagaimana aplikasi di emulator Android mengakses backend di laptop?
4. Bagaimana mem-backup database yang berjalan di container?

## Sample Answers

1. Setiap container memiliki network namespace sendiri, sehingga `localhost` adalah container itu sendiri. Container lain diakses lewat nama service/DNS di network yang sama.
2. Named volume dikelola Docker dan cocok untuk data persisten seperti database. Bind mount memetakan folder host tertentu, cocok untuk kode sumber saat development atau file konfigurasi.
3. Lewat alamat khusus `10.0.2.2` yang mengarah ke host. Untuk HP fisik gunakan IP LAN laptop atau `adb reverse`, dengan cleartext hanya diizinkan untuk host dev di build debug.
4. Gunakan tool native seperti `pg_dump` melalui `docker exec` untuk backup konsisten, simpan di luar host, dan uji `pg_restore` secara berkala.

## Practical Exercises

1. Buat Compose dengan API, DB, Redis yang saling terhubung via nama service dan healthcheck.
2. Hubungkan aplikasi Flutter di emulator dan HP fisik ke API lokal.
3. Backup & restore database dari container ke file.

## Quick Reference

```text
Antar container: nama service (db:5432) · localhost = diri sendiri · host.docker.internal = host (Desktop)
Emulator Android → 10.0.2.2 · HP fisik → IP LAN / adb reverse
ports "127.0.0.1:5432:5432" untuk lokal · network internal: true
Named volume (data) · bind mount (kode dev) · tmpfs (sementara) · down -v menghapus data
Backup: pg_dump/pg_restore · produksi: DB terkelola + object storage
```

## Related Topics

- [Docker Fundamentals](/devops/docker-fundamentals/)
- [Dockerfile & Docker Compose](/devops/dockerfile-compose/)
- [Backup & Recovery](/database/backup-recovery/)
