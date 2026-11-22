---
title: "Server Deployment"
description: "Pilihan dan praktik deploy backend: VPS dengan Docker Compose + reverse proxy, PaaS/serverless container (Cloud Run, Fly.io, Render), Kubernetes, dan layanan terkelola. Membahas TLS otomatis, strategi deploy (rolling, blue-green, canary), health check, migrasi saat deploy, pipeline CD dari GitHub Actions, firewall, dan checklist pasca-deploy."
level: intermediate
status: complete
updated: 2026-11-13
tags: [devops, deployment, docker, cloud-run, kubernetes, caddy]
---

## Overview

**Deployment** adalah proses membawa versi baru aplikasi ke server yang melayani pengguna. Pilihan platform berkisar dari
satu VPS yang dikelola sendiri sampai Kubernetes. Untuk backend aplikasi mobile skala kecil-menengah, platform container
terkelola atau VPS + Docker Compose sering paling efisien.

## Why It Matters

Deploy yang manual dan tidak konsisten (SSH, `git pull`, restart) adalah sumber downtime dan kesalahan. Deploy otomatis
yang dapat diulang, dengan health check dan rollback, membuat rilis menjadi rutinitas yang aman.

## Core Concepts

| Platform | Kelebihan | Kekurangan | Cocok untuk |
| --- | --- | --- | --- |
| VPS + Docker Compose | Murah, kontrol penuh, sederhana | Patch OS, scaling, HA dikelola sendiri | MVP, beban kecil, budget ketat |
| Container serverless (Cloud Run, App Runner, Fly.io, Render) | Autoscaling, TLS, tanpa kelola server | Cold start, batas platform | Kebanyakan backend API |
| Kubernetes (GKE, EKS, AKS) | Fleksibel, ekosistem besar | Kompleks, butuh keahlian & biaya operasional | Banyak layanan, tim platform |
| Serverless functions | Bayar per eksekusi | Batas waktu & model pemrograman | Handler event, webhook, beban sporadis |

| Strategi deploy | Cara | Risiko |
| --- | --- | --- |
| Recreate | Matikan lama, nyalakan baru | Downtime |
| Rolling | Ganti instance bertahap | Dua versi berjalan bersamaan (harus kompatibel) |
| Blue-green | Dua environment penuh, alihkan trafik sekaligus | Biaya ganda sementara, rollback instan |
| Canary | Sebagian kecil trafik ke versi baru, naik bertahap | Butuh metrik & routing |

## How It Works

```text
Merge ke main → CI: test, build image git-<sha>, scan, push registry
→ CD: migrasi (expand) → deploy ke staging → smoke test → approval
→ deploy produksi (rolling/canary) → health check → pantau metrik → selesai / rollback
```

## Implementation

### Opsi A: VPS + Docker Compose + Caddy (TLS otomatis)

```yaml
# /srv/pos/docker-compose.yml
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro", "caddy_data:/data"]
    restart: unless-stopped
  api:
    image: ghcr.io/acme/pos-api:${API_TAG}
    env_file: /etc/pos-api/env
    restart: unless-stopped
    deploy: { resources: { limits: { memory: 512m } } }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health/ready"]
      interval: 10s
volumes: { caddy_data: {} }
```

```text
# Caddyfile
api.example.com {
  reverse_proxy api:3000
  encode gzip
}
```

```bash
# Deploy (dijalankan CI via SSH dengan kunci khusus deploy)
cd /srv/pos && API_TAG=git-3f2a9c1 docker compose pull api && API_TAG=git-3f2a9c1 docker compose up -d api
```

Satu instance di VPS berarti ada jeda singkat saat container diganti. Untuk tanpa downtime, jalankan dua instance di
belakang proxy dan ganti bergantian, atau pindah ke platform terkelola.

### Opsi B: Cloud Run dari GitHub Actions

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: deployer@acme.iam.gserviceaccount.com
      - uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: pos-api
          region: asia-southeast2
          image: asia-southeast2-docker.pkg.dev/acme/pos/pos-api:git-${{ github.sha }}
          flags: --min-instances=1 --max-instances=10 --concurrency=80
      - run: curl -fsS https://api.example.com/health/ready
```

Cloud Run mendukung pembagian trafik antar revisi untuk canary (`gcloud run services update-traffic --to-revisions`).

### Opsi C: Kubernetes (rolling update)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: pos-api }
spec:
  replicas: 3
  strategy: { rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }
  template:
    spec:
      terminationGracePeriodSeconds: 40
      containers:
        - name: api
          image: ghcr.io/acme/pos-api:git-3f2a9c1
          resources: { requests: { cpu: 250m, memory: 256Mi }, limits: { memory: 512Mi } }
          readinessProbe: { httpGet: { path: /health/ready, port: 3000 }, periodSeconds: 5 }
          livenessProbe: { httpGet: { path: /health/live, port: 3000 }, periodSeconds: 10 }
```

### Migrasi saat deploy

```text
- Jalankan migrasi sebagai langkah terpisah (job) SEBELUM versi baru menerima trafik
- Migrasi harus kompatibel dengan versi lama (expand-contract), karena saat rolling kedua versi berjalan
- Jangan jalankan migrasi otomatis di startup setiap instance (race condition antar instance)
```

### Firewall & jaringan

```text
VPS: buka hanya 22 (dibatasi IP/VPN), 80, 443 · DB tidak publik · SSH key-only
Cloud: DB terkelola dengan private IP · layanan internal tidak publik · egress terkontrol
```

### Checklist pasca-deploy

```text
□ Health check hijau & versi yang berjalan sesuai (endpoint /version atau label)
□ Error rate & p95 tidak naik dibanding sebelum deploy (dashboard per revisi)
□ Log tidak berisi error baru · antrean job normal
□ Smoke test alur kritis (login, order) · aplikasi mobile versi lama masih berfungsi
□ Rencana rollback siap
```

## Best Practices

- **Deploy otomatis dari CI**, artefak immutable.
- **Platform terkelola** bila tim kecil. Hindari kompleksitas yang belum dibutuhkan.
- **Readiness/liveness + graceful shutdown**.
- **Migrasi sebagai langkah terpisah & kompatibel mundur**.
- **Rolling/canary** dengan metrik sebagai gerbang.
- **TLS otomatis & firewall ketat**.

## Anti-Patterns

- SSH ke server lalu `git pull && npm install && pm2 restart` secara manual.
- Kubernetes untuk satu API dengan tim satu orang.
- Migrasi berjalan di startup setiap instance.
- Deploy tanpa health check atau metrik pembanding.
- Port database terbuka ke internet "untuk sementara".

## Performance Considerations

Atur `min-instances` untuk mengurangi cold start pada platform serverless di jam sibuk, `concurrency` per instance sesuai
karakter aplikasi Node (I/O bound), dan resource request/limit yang realistis. Pilih region dekat pengguna (mis.
Jakarta, `asia-southeast2`) untuk latensi rendah dari aplikasi mobile.

## Security Considerations

Kredensial deploy dengan cakupan minimum (OIDC), image dari registry tepercaya (opsional signed), layanan berjalan dengan
service account terbatas, patch OS rutin pada VPS, dan audit siapa men-deploy apa dan kapan.

## Real-World Use Cases

- MVP: VPS 2 vCPU + Docker Compose + Caddy + PostgreSQL terkelola, deploy via GitHub Actions SSH.
- Skala menengah: Cloud Run region Jakarta, min 1 instance, canary 10% per rilis, migrasi via Cloud Run job.

## Interview Questions

1. Bagaimana Anda men-deploy backend tanpa downtime?
2. Apa beda rolling, blue-green, dan canary deployment?
3. Kapan Anda memilih Kubernetes?
4. Bagaimana menjalankan migrasi database saat deploy?

## Sample Answers

1. Minimal dua instance di belakang load balancer, rolling update dengan readiness check, graceful shutdown dan connection draining, migrasi kompatibel mundur yang dijalankan sebelum versi baru menerima trafik, serta metrik untuk memutuskan lanjut atau rollback.
2. Rolling mengganti instance bertahap. Blue-green menyiapkan environment baru penuh lalu mengalihkan semua trafik sekaligus (rollback instan). Canary mengirim sebagian kecil trafik ke versi baru lalu menaikkannya berdasarkan metrik.
3. Saat ada banyak layanan dengan kebutuhan orkestrasi kompleks dan tim/keahlian untuk mengoperasikannya. Untuk sedikit layanan, platform container terkelola biasanya lebih sederhana dan murah.
4. Sebagai langkah/job terpisah sebelum deploy aplikasi, dengan migrasi yang kompatibel dengan versi lama (expand-contract), lock_timeout, dan tidak di startup setiap instance.

## Practical Exercises

1. Deploy API ke VPS dengan Docker Compose + Caddy dan TLS otomatis.
2. Buat workflow deploy Cloud Run dengan OIDC dan smoke test.
3. Latih canary 10% → 100% dan rollback.

## Quick Reference

```text
VPS + Compose + Caddy (murah) · Cloud Run/Fly/Render (terkelola) · Kubernetes (kompleks) · functions (event)
Recreate · rolling · blue-green · canary
CI: test → image git-<sha> → scan → push → migrasi (job) → staging → approval → prod → health/metrik
readiness/liveness · graceful shutdown · min-instances · region dekat pengguna · firewall: 80/443 saja
```

## Related Topics

- [Rollback Strategy](/devops/rollback-strategy/)
- [Deployment & Production Best Practices](/backend/production-best-practices/)
- [Load Balancing](/system-design/concepts/load-balancing/)
