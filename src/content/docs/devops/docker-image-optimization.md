---
title: "Docker Image Optimization"
description: "Mengoptimalkan image Docker: memilih base image (alpine, slim, distroless), multi-stage build, urutan layer untuk cache, .dockerignore, BuildKit cache mount, mengurangi ukuran node_modules, non-root, image reproducible (pin versi & digest), multi-arch (amd64/arm64), scanning kerentanan, SBOM, dan mengukur hasilnya dengan docker history/dive."
level: advanced
status: complete
version: "Docker BuildKit/buildx · Node.js 22 · Trivy"
updated: 2026-11-13
tags: [devops, docker, image, optimization, security, buildkit]
---

## Overview

Image yang dioptimalkan **lebih kecil, lebih cepat dibangun, lebih cepat di-deploy, dan lebih aman**. Optimasi
utama: multi-stage build (hanya membawa yang dibutuhkan saat runtime), urutan layer yang ramah cache, base image minimal,
dan pemindaian kerentanan.

## Why It Matters

Image 1,5 GB memperlambat CI, menaikkan biaya registry dan bandwidth, memperlambat autoscaling (cold start), dan membawa
ratusan paket dengan CVE yang tidak pernah dipakai. Image 150 MB dari kode yang sama sering kali hanya butuh perubahan
Dockerfile.

## Core Concepts

| Base image | Ukuran kasar | Catatan |
| --- | --- | --- |
| `node:22` (Debian penuh) | Besar | Banyak tool, banyak CVE |
| `node:22-slim` | Sedang | Debian minimal, kompatibilitas glibc baik |
| `node:22-alpine` | Kecil | musl libc, kadang masalah dengan native module |
| Distroless (`gcr.io/distroless/nodejs22-debian12`) | Kecil | Tanpa shell & package manager, permukaan serangan minimal, debugging lebih sulit |

| Teknik | Dampak |
| --- | --- |
| Multi-stage | Tool build (TypeScript, compiler) tidak ikut ke image akhir |
| Urutan layer | Dependensi (jarang berubah) sebelum kode (sering berubah) → cache hit |
| `.dockerignore` | Konteks build kecil, tidak membawa `.git`, `node_modules`, `.env` |
| Prune dev dependencies | `node_modules` produksi saja |
| Cache mount BuildKit | Cache npm dipakai ulang antar build tanpa masuk image |

## How It Works

```text
Setiap instruksi → layer. Bila input layer tidak berubah → cache dipakai, dan layer berikutnya juga
Perubahan pada layer awal (mis. COPY . .) membatalkan cache semua layer setelahnya
Image akhir = hanya layer dari stage terakhir
```

## Implementation

### Dockerfile yang dioptimalkan

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22.11-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci              # cache npm antar build

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev                    # buang devDependencies

FROM node:22.11-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini                                   # init kecil untuk sinyal & zombie process
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
```

### `.dockerignore`

```text
.git
node_modules
dist
coverage
.env
.env.*
*.log
Dockerfile*
docker-compose*.yml
test
```

### Mengukur

```bash
docker images pos-api                       # ukuran total
docker history pos-api:1.8.0                # ukuran per layer
dive pos-api:1.8.0                          # eksplor layer & file terbuang (tool pihak ketiga)
```

### Reproducible & multi-arch

```bash
# Pin versi base image; untuk reproducibility penuh gunakan digest
# FROM node:22.11-alpine@sha256:<digest>

docker buildx build --platform linux/amd64,linux/arm64 -t registry.example.com/pos-api:1.8.0 --push .
```

Multi-arch penting bila developer memakai Mac Apple Silicon (arm64) sementara server amd64, atau bila deploy ke
instance ARM yang lebih murah.

### Cache di CI (GitHub Actions)

```yaml
- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v6
  with:
    push: true
    tags: ghcr.io/acme/pos-api:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

### Keamanan image

```bash
trivy image --severity HIGH,CRITICAL --exit-code 1 ghcr.io/acme/pos-api:${GITHUB_SHA}
syft ghcr.io/acme/pos-api:${GITHUB_SHA} -o cyclonedx-json > sbom.json       # SBOM
```

```text
- Non-root (USER node) · tanpa secret di layer (gunakan BuildKit secret mount bila build butuh token)
- Rebuild berkala (mis. mingguan) untuk menarik patch base image
- Hapus tool yang tidak dibutuhkan di runtime (curl, git, compiler)
```

```dockerfile
# Token private registry hanya saat build, tidak tersimpan di layer
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```

### Native module & alpine

Beberapa paket (mis. `sharp`, `bcrypt`, driver tertentu) memiliki binary native. Pastikan versi yang kompatibel dengan
musl (alpine) atau gunakan `-slim`. Build dan runtime harus memakai base yang sama agar binary cocok.

## Best Practices

- **Multi-stage** dengan runtime minimal.
- **Copy manifest dependensi dulu**, kode belakangan.
- **`.dockerignore` lengkap**.
- **Pin versi base image** (digest untuk reproducibility).
- **Non-root, tini/init, tanpa secret**.
- **Scan & SBOM di CI**, rebuild berkala.

## Anti-Patterns

- `COPY . .` di awal sebelum `npm ci` (cache selalu batal).
- Image produksi berisi devDependencies, source TypeScript, test, dan `.git`.
- `ARG`/`ENV` berisi token yang tersimpan di riwayat image.
- `FROM node:latest`.
- Mengejar ukuran terkecil sampai debugging produksi mustahil tanpa rencana (siapkan image debug terpisah bila memakai distroless).

## Performance Considerations

Image kecil mempercepat pull (deploy & autoscaling) dan mengurangi biaya. Cache layer yang baik mempercepat CI dari
menit menjadi detik untuk perubahan kode saja. Ukur waktu build dan ukuran image sebagai metrik pipeline.

## Security Considerations

Setiap paket di image adalah potensi kerentanan. Base minimal + scanning + patch rutin mengurangi risiko. Distroless
menghilangkan shell sehingga eksploitasi lebih sulit. Signing image (cosign) dan kebijakan "hanya image dari registry
tepercaya" memperkuat supply chain.

## Real-World Use Cases

- Image API turun dari 1,2 GB menjadi 140 MB dengan multi-stage + alpine + prune, waktu deploy berkurang drastis.
- Trivy di CI memblokir rilis karena CVE kritis di base image. Rebuild dengan base terbaru menyelesaikannya.

## Interview Questions

1. Bagaimana memperkecil ukuran image Docker?
2. Mengapa urutan instruksi Dockerfile penting?
3. Apa itu multi-stage build?
4. Bagaimana mencegah secret masuk ke image?

## Sample Answers

1. Multi-stage build, base image minimal (slim/alpine/distroless), `.dockerignore`, hanya dependensi produksi, hapus cache/tool build, dan gabungkan langkah yang menghasilkan file sementara.
2. Docker meng-cache layer. Bila suatu layer berubah, semua layer setelahnya dibangun ulang. Menyalin manifest dependensi dan menginstalnya sebelum kode membuat perubahan kode tidak memicu instal ulang dependensi.
3. Dockerfile dengan beberapa tahap `FROM`, di mana tahap build berisi tool kompilasi dan tahap akhir hanya menyalin hasil yang diperlukan untuk runtime.
4. Jangan memakai `ARG`/`ENV`/`COPY` untuk secret. Gunakan BuildKit secret mount saat build, injeksi secret saat runtime, `.dockerignore` untuk `.env`, dan scan image untuk secret.

## Practical Exercises

1. Ukur ukuran & waktu build image Anda, lalu terapkan multi-stage + cache mount.
2. Tambahkan Trivy dan SBOM ke pipeline CI.
3. Build image multi-arch dan jalankan di mesin arm64.

## Quick Reference

```text
Base: slim/alpine/distroless, versi ter-pin (digest) · multi-stage: deps → build → runtime
COPY package*.json → npm ci (cache mount) → COPY src → build → prune --omit=dev
.dockerignore · USER node · tini · tanpa secret (secret mount)
docker history · dive · buildx multi-arch · cache gha · trivy --exit-code 1 · syft SBOM · rebuild berkala
```

## Related Topics

- [Dockerfile & Docker Compose](/devops/dockerfile-compose/)
- [Dependency Vulnerability Scanning](/security/dependency-scanning/)
- [GitHub Actions](/devops/github-actions/)
