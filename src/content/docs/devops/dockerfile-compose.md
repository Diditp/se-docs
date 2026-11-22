---
title: "Dockerfile & Docker Compose"
description: "Menulis Dockerfile production-ready untuk Node.js (multi-stage, non-root, layer caching, healthcheck) dan menjalankan stack lokal API + PostgreSQL + Redis dengan Docker Compose."
level: intermediate
status: complete
version: "Docker Engine 24+ · Compose v2 · BuildKit"
updated: 2026-11-07
tags: [docker, dockerfile, compose, devops, nodejs]
---

## Overview

- **Dockerfile** — resep untuk membangun **image**: base image, dependency, kode, perintah start.
- **Docker Compose** — file YAML untuk mendefinisikan dan menjalankan **beberapa container** (API, database, cache) sebagai satu stack dengan network dan volume.

## Why It Matters

- **"Works on my machine" hilang** — environment identik dari laptop, CI, staging, sampai production.
- **Onboarding cepat** — `docker compose up` dan seluruh dependency backend siap.
- **Deployment konsisten** — artefak yang dites adalah artefak yang dirilis (image yang sama).
- Image yang buruk = build lambat, ukuran ratusan MB–GB, dan permukaan serangan besar.

## Core Concepts

- **Image** — template read-only berlapis; **container** — instance image yang berjalan.
- **Layer & cache** — setiap instruksi (`RUN`, `COPY`) membentuk layer; cache dipakai ulang sampai ada layer yang berubah, lalu semua layer sesudahnya dibangun ulang.
- **Multi-stage build** — beberapa `FROM`; hanya hasil akhir yang masuk image final.
- **`.dockerignore`** — mengecualikan file dari build context (node_modules, .git, .env).
- **ENTRYPOINT/CMD** — proses utama container (PID 1).
- **Compose services, networks, volumes** — service saling memanggil memakai nama service sebagai hostname.
- **Healthcheck** — perintah untuk mengetahui container siap/sehat.

## How It Works

```text
docker build  ── kirim build context ──► BuildKit
                                          FROM node:22-slim     (layer base)
                                          COPY package*.json    (berubah hanya saat dependency berubah)
                                          RUN npm ci            ← di-cache jika layer sebelumnya sama
                                          COPY . .              (berubah setiap edit kode)
                                          RUN npm run build
docker run    ──► container = image layers (read-only) + writable layer tipis + namespaces + cgroups
```

## Implementation

### Dockerfile multi-stage untuk Node.js + TypeScript

```dockerfile
# syntax=docker/dockerfile:1

# ---- deps: dependency lengkap untuk build ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- build: compile TypeScript ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: hanya yang diperlukan untuk menjalankan ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# user non-root sudah tersedia di image node
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
```

```text
# .dockerignore
node_modules
dist
.git
.env*
coverage
*.log
Dockerfile*
docker-compose*.yml
```

### docker-compose.yml untuk development lokal

```yaml
services:
  api:
    build: { context: ., target: runtime }
    ports: ["3000:3000"]
    env_file: .env                      # .env tidak di-commit; sediakan .env.example
    environment:
      DATABASE_URL: postgres://app:app@db:5432/pos     # hostname = nama service
      REDIS_URL: redis://cache:6379
    depends_on:
      db: { condition: service_healthy }
      cache: { condition: service_started }
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app            # hanya untuk lokal
      POSTGRES_DB: pos
    volumes:
      - pgdata:/var/lib/postgresql/data # data bertahan saat container dibuat ulang
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d pos"]
      interval: 5s
      timeout: 3s
      retries: 10

  cache:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

```bash
docker compose up -d --build          # bangun & jalankan
docker compose logs -f api            # lihat log
docker compose exec db psql -U app pos
docker compose down                   # stop (volume tetap)
docker compose down -v                # stop + hapus volume (data hilang!)
```

### Graceful shutdown (penting di container)

```ts
const server = app.listen(3000);
const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {          // berhenti menerima koneksi baru, selesaikan yang berjalan
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();   // batas waktu
};
process.on('SIGTERM', () => shutdown('SIGTERM'));      // dikirim oleh docker stop / Kubernetes
process.on('SIGINT', () => shutdown('SIGINT'));
```

## Best Practices

- **Multi-stage build** — image final tanpa compiler, devDependencies, dan source TS. Alasan: lebih kecil, lebih cepat di-pull, permukaan serangan lebih kecil.
- **Urutkan instruksi dari yang jarang ke sering berubah** — `COPY package*.json` + `npm ci` sebelum `COPY src`.
- **`npm ci` + lockfile** — build deterministik.
- **Jalankan sebagai non-root** (`USER node`).
- **Pin versi base image** (`node:22-bookworm-slim`, idealnya by digest di production) — hindari `latest`.
- **Satu proses per container**; konfigurasi via environment variable (12-factor).
- **Exec form** `CMD ["node", "dist/server.js"]` agar sinyal SIGTERM sampai ke Node; tangani graceful shutdown.
- **Healthcheck & readiness** — orchestrator tahu kapan container siap menerima trafik.
- **Jangan menaruh secret di image** (`ENV API_KEY=...`, `COPY .env`) — gunakan secret runtime atau BuildKit `--mount=type=secret` saat build.

## Anti-Patterns

- `COPY . .` sebelum install dependency → cache selalu invalid, build lambat.
- `FROM node:latest` → build tidak reproducible, ukuran besar.
- Menjalankan database production di Compose pada satu VM tanpa backup/HA, lalu menganggapnya "production ready".
- Shell form `CMD npm start` → `npm` menjadi PID 1, sinyal tidak diteruskan dengan benar.
- Container yang menulis data penting ke filesystem container (hilang saat container dihapus) alih-alih volume/object storage.
- Satu image untuk semua environment tetapi dengan config yang di-bake ke dalam image.

## Performance Considerations

- **Ukuran image**: `slim`/`alpine`/distroless jauh lebih kecil dari image penuh. (Alpine memakai musl — beberapa native module bisa bermasalah; uji dulu.)
- **BuildKit cache mount** (`--mount=type=cache`) mempercepat `npm ci` berulang.
- **Cache layer di CI** (`cache-from/cache-to` GitHub Actions cache atau registry).
- **Resource limits** (`deploy.resources.limits` / Kubernetes requests & limits) agar satu container tidak menghabiskan host; atur `--max-old-space-size` sesuai limit memory.

## Security Considerations

- Non-root user, filesystem read-only bila memungkinkan, drop capabilities.
- **Scan image** (Trivy, Docker Scout) di CI; update base image secara berkala.
- Jangan expose port database ke publik (`ports` hanya untuk lokal; di server gunakan network internal).
- Secret dari secret manager/orchestrator, bukan dari file di image.
- Jangan mount Docker socket (`/var/run/docker.sock`) ke container aplikasi — setara akses root ke host.

## Real-World Use Cases

- **Development backend POS**: API + PostgreSQL + Redis + Adminer dalam satu `docker compose up`.
- **Integration test di CI** memakai service container PostgreSQL yang sama dengan versi production.
- **Deploy ke VM/Cloud Run/Kubernetes** memakai image yang sama yang sudah lulus test.

## Interview Questions

1. **(Fundamental)** Apa beda image dan container? Container vs VM?
2. **(Fundamental)** Apa fungsi `.dockerignore`?
3. **(Intermediate)** Jelaskan layer caching dan bagaimana mengoptimalkan urutan Dockerfile.
4. **(Intermediate)** Apa itu multi-stage build?
5. **(Intermediate)** Bagaimana service di Compose saling berkomunikasi? Apa itu volume?
6. **(Advanced)** Bagaimana membuat container yang aman dan shutdown dengan benar?

## Sample Answers

1. Image adalah template read-only berlapis; container adalah instance image yang berjalan dengan writable layer. Container berbagi kernel host (isolasi via namespaces & cgroups) sehingga ringan; VM menjalankan OS tamu penuh di atas hypervisor dengan isolasi lebih kuat namun lebih berat.
2. Mengecualikan file dari build context — mempercepat build, mencegah cache invalid karena file tidak relevan, dan mencegah secret (`.env`) ikut masuk image.
3. Docker menyimpan hasil tiap instruksi sebagai layer; jika instruksi & input sama, layer diambil dari cache, tetapi perubahan satu layer membangun ulang semua layer berikutnya. Letakkan instruksi yang jarang berubah (install dependency) sebelum yang sering berubah (source code).
4. Dockerfile dengan beberapa tahap `FROM`; tahap build berisi tooling, tahap final hanya menyalin artefak (`COPY --from=build`). Hasilnya image kecil dan lebih aman.
5. Compose membuat network default; setiap service dapat dijangkau dengan nama service sebagai hostname (mis. `db:5432`). Volume adalah penyimpanan persisten di luar lifecycle container agar data (mis. PostgreSQL) tidak hilang saat container dibuat ulang.
6. Base image minimal & dipin, non-root, tanpa secret di image, scan vulnerability, resource limit, port minimal. Shutdown: exec form CMD agar proses menerima SIGTERM, tangani SIGTERM dengan berhenti menerima request, menyelesaikan request berjalan, menutup koneksi DB, lalu exit dalam batas waktu.

## Practical Exercises

1. Containerize API Node.js Anda; bandingkan ukuran image single-stage vs multi-stage (`docker image ls`).
2. Ubah urutan instruksi dan ukur waktu rebuild setelah mengedit satu file source.
3. Buat Compose stack API + PostgreSQL + Redis dengan healthcheck; pastikan API menunggu DB sehat.
4. Scan image dengan Trivy dan perbaiki temuan severity HIGH.

## Quick Reference

```text
Multi-stage · slim base dipin · npm ci + lockfile · COPY manifest → install → COPY src
USER node · exec-form CMD · HEALTHCHECK · .dockerignore · tanpa secret di image
Compose: service name = hostname · volume untuk data · depends_on + service_healthy
docker compose up -d --build | logs -f | exec | down [-v]
```

## Related Topics

- [Docker Fundamentals](/devops/docker-fundamentals/)
- [Docker Image Optimization](/devops/docker-image-optimization/)
- [Container Networking & Volumes](/devops/container-networking-volumes/)
- [GitHub Actions](/devops/github-actions/)
- [Secrets Management](/devops/secrets-management/)
- Referensi resmi: [Dockerfile best practices](https://docs.docker.com/build/building/best-practices/), [Compose file reference](https://docs.docker.com/reference/compose-file/).
