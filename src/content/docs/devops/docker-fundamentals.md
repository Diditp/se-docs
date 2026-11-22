---
title: "Docker Fundamentals"
description: "Konsep dasar Docker untuk developer: container vs virtual machine, image, layer, container, registry, tag, siklus hidup container, perintah penting (build, run, exec, logs, ps, inspect), port mapping, environment, volume sekilas, restart policy, resource limit, membersihkan disk, serta Docker untuk development backend dan CI aplikasi mobile."
level: beginner
status: complete
version: "Docker Engine 27+/Docker Desktop · Compose v2"
updated: 2026-11-13
tags: [devops, docker, container, image, registry]
---

## Overview

**Docker** mengemas aplikasi beserta runtime dan dependensinya ke dalam **image**, lalu menjalankannya sebagai
**container** yang terisolasi. Hasilnya: "jalan di laptop saya" berarti juga jalan di CI dan server, karena lingkungannya
sama.

## Why It Matters

Bagi mobile developer, Docker berguna untuk menjalankan backend, PostgreSQL, dan Redis lokal dalam satu perintah, untuk
integration test (Testcontainers), dan untuk men-deploy backend ringan. Docker juga merupakan dasar Kubernetes dan
platform cloud modern (Cloud Run, ECS, Fly.io).

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Image | Template read-only berlapis (filesystem + metadata + perintah start) |
| Layer | Setiap instruksi Dockerfile membuat layer yang di-cache dan dibagikan |
| Container | Instance image yang berjalan, dengan layer tulis sendiri (hilang saat container dihapus) |
| Registry | Penyimpanan image (Docker Hub, GHCR, Artifact Registry, ECR) |
| Tag / digest | Nama versi (`pos-api:1.8.0`) / hash isi yang immutable (`@sha256:...`) |
| Volume | Penyimpanan persisten di luar container |
| Network | Jaringan virtual agar container saling terhubung |

| Container | Virtual machine |
| --- | --- |
| Berbagi kernel host | Kernel sendiri (hypervisor) |
| Start dalam detik/milidetik | Start dalam menit |
| Ringan (MB) | Berat (GB) |
| Isolasi proses (namespace, cgroup) | Isolasi lebih kuat |

Di Windows/macOS, Docker Desktop menjalankan VM Linux kecil di belakang layar (WSL2 di Windows).

## How It Works

```text
Dockerfile → docker build → image (layer) → docker push → registry
Server: docker pull → docker run → container (proses terisolasi dengan namespace & cgroup)
```

## Implementation

### Perintah inti

```bash
docker build -t pos-api:dev .                       # build image dari Dockerfile
docker images                                       # daftar image
docker run -d --name api -p 3000:3000 --env-file .env pos-api:dev   # jalankan di background, map port host:container
docker ps                                           # container berjalan (-a untuk semua)
docker logs -f api                                  # ikuti log
docker exec -it api sh                              # masuk shell di container
docker inspect api | jq '.[0].State'                # detail status
docker stop api && docker rm api                    # hentikan (SIGTERM → tunggu → SIGKILL) & hapus
docker pull postgres:16-alpine
```

### Menjalankan dependensi lokal

```bash
docker run -d --name pg -p 5432:5432 \
  -e POSTGRES_USER=pos -e POSTGRES_PASSWORD=pos -e POSTGRES_DB=pos \
  -v pgdata:/var/lib/postgresql/data postgres:16-alpine

docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Untuk lebih dari satu layanan, gunakan Docker Compose (lihat [Dockerfile & Docker Compose](/devops/dockerfile-compose/)).

### Restart policy & resource limit

```bash
docker run -d --restart unless-stopped --memory 512m --cpus 1 pos-api:1.8.0
```

Tanpa batas memori, satu container yang bocor dapat menghabiskan memori host.

### Tag & versi

```text
✅ pos-api:1.8.0, pos-api:git-3f2a9c1 (immutable, dapat ditelusuri)
⚠️ pos-api:latest: berubah-ubah, tidak jelas versi mana yang berjalan, menyulitkan rollback
Deploy produksi memakai tag versi atau digest
```

### Membersihkan disk

```bash
docker system df                     # penggunaan disk
docker image prune                   # image dangling
docker builder prune                 # build cache
docker system prune                  # container berhenti, network tak terpakai, dangling image (hati-hati di server)
```

Di Windows, data Docker Desktop (WSL) dapat dipindah dari drive C (lihat [Setup Dev di Windows](/devops/windows-dev-storage/)).

### Docker untuk proyek mobile

```text
- Backend + DB lokal untuk development aplikasi Flutter (emulator Android mengakses host via 10.0.2.2)
- Testcontainers untuk integration test backend di CI
- Image builder Android (SDK + Flutter) untuk CI self-hosted. Build iOS tetap membutuhkan macOS (tidak bisa di Docker)
```

## Best Practices

- **Satu proses utama per container**.
- **Tag immutable** untuk deploy, bukan `latest`.
- **Data persisten di volume**, bukan di layer container.
- **Konfigurasi via env**, image yang sama untuk semua environment.
- **Batas resource & restart policy**.
- **Bersihkan image & cache** secara berkala.

## Anti-Patterns

- Menyimpan data database di dalam container tanpa volume.
- `docker exec` untuk mengubah file di container produksi (perubahan hilang & tidak tercatat).
- Image berbeda untuk dev/staging/prod.
- Menjalankan container sebagai root dengan `--privileged` tanpa alasan.
- Memasukkan secret ke image saat build.

## Performance Considerations

Container memiliki overhead sangat kecil dibanding VM. Di Docker Desktop (Windows/macOS), bind mount folder proyek dapat
lambat. Simpan proyek di filesystem WSL atau gunakan volume untuk folder berat seperti `node_modules`.

## Security Considerations

Gunakan image resmi dan minimal, jalankan sebagai non-root, scan kerentanan image (Trivy), jangan memasukkan secret ke
layer image, dan jangan mengekspos socket Docker (`/var/run/docker.sock`) ke container yang tidak tepercaya karena setara
dengan akses root ke host.

## Real-World Use Cases

- Developer Flutter menjalankan `docker compose up` untuk backend + PostgreSQL + Redis lokal.
- CI membangun image `pos-api:git-<sha>`, men-scan, lalu mendorongnya ke registry untuk di-deploy.

## Interview Questions

1. Apa beda image dan container?
2. Apa beda container dan virtual machine?
3. Mengapa tidak memakai tag `latest` untuk produksi?
4. Bagaimana data database tetap ada saat container dihapus?

## Sample Answers

1. Image adalah template read-only berlapis. Container adalah instance image yang sedang berjalan dengan layer tulis sendiri.
2. Container berbagi kernel host dan mengisolasi proses dengan namespace/cgroup sehingga ringan dan cepat. VM menjalankan kernel sendiri di atas hypervisor dengan isolasi lebih kuat tetapi lebih berat.
3. `latest` dapat menunjuk ke image berbeda dari waktu ke waktu, sehingga tidak jelas versi apa yang berjalan, sulit direproduksi, dan sulit di-rollback. Tag versi atau digest bersifat pasti.
4. Dengan menyimpan data di volume (named volume atau penyimpanan terkelola) yang terpisah dari siklus hidup container.

## Practical Exercises

1. Jalankan PostgreSQL & Redis dengan Docker dan hubungkan backend lokal Anda.
2. Build image backend, jalankan dengan batas memori, dan amati `docker stats`.
3. Bersihkan disk Docker dan bandingkan `docker system df` sebelum/sesudah.

## Quick Reference

```text
Image (template berlapis) → container (instance) · registry · tag vs digest
build -t · run -d -p host:ctr --env-file · ps · logs -f · exec -it sh · stop/rm · inspect
-v nama:/path (volume) · --restart unless-stopped · --memory/--cpus
Tag immutable · satu proses per container · non-root · tanpa secret di image · system df/prune
```

## Related Topics

- [Dockerfile & Docker Compose](/devops/dockerfile-compose/)
- [Container Networking & Volumes](/devops/container-networking-volumes/)
- [Docker Image Optimization](/devops/docker-image-optimization/)
