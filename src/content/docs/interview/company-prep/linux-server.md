---
title: "Linux & Server Fundamentals"
description: "Dasar Linux untuk software engineer: struktur filesystem, permission, user & sudo, proses & systemd, jaringan, log, SSH, package manager, dan langkah troubleshooting server aplikasi."
level: beginner
status: complete
version: "Ubuntu/Debian & RHEL-family (contoh perintah umum)"
updated: 2026-11-13
tags: [interview, company-prep, linux, server, ssh, systemd]
---

## Overview

Mayoritas server aplikasi, database, container, dan CI runner berjalan di **Linux**. Seorang software engineer perlu
bisa **masuk ke server (SSH)**, **membaca log**, **memeriksa proses, port, disk, dan memori**, **mengatur permission**,
serta **menjalankan aplikasi sebagai service**. Tes atau interview teknis sering menanyakan perintah dasar dan langkah
troubleshooting.

## Why It Matters

Saat API lambat atau down di production, pertanyaan pertama biasanya: proses masih jalan? disk penuh? memori habis?
port terbuka? log berkata apa? Kemampuan menjawab ini dengan cepat membedakan engineer yang bisa menangani insiden.

## Core Concepts

### Struktur direktori penting

| Path | Isi |
| --- | --- |
| `/etc` | Konfigurasi sistem & layanan (`/etc/nginx`, `/etc/ssh/sshd_config`) |
| `/var/log` | Log (`syslog`/`messages`, `nginx/`, `auth.log`) |
| `/var/lib` | Data layanan (`/var/lib/postgresql`, `/var/lib/docker`) |
| `/home/<user>` | Direktori user |
| `/opt`, `/srv` | Aplikasi tambahan / data layanan |
| `/tmp` | File sementara |
| `/proc`, `/sys` | Informasi kernel & proses (virtual) |

### Permission

```text
-rwxr-x---  1 app  app  4096  app.sh
 │└┬┘└┬┘└┬┘
 │ │  │  └─ others: ---  (tidak ada akses)
 │ │  └──── group : r-x  (baca, eksekusi)
 │ └─────── owner : rwx  (baca, tulis, eksekusi)
 └───────── tipe: - file, d direktori, l symlink
Angka: r=4 w=2 x=1 → rwxr-x--- = 750
```

### Proses & service

- **Proses** punya PID, user, status; dikelola dengan `ps`, `top/htop`, `kill`.
- **systemd** mengelola service: start/stop/restart/enable, log via **journald**.
- **Sinyal**: `SIGTERM` (berhenti dengan tertib), `SIGKILL` (paksa, tidak bisa ditangani), `SIGHUP` (reload konfigurasi pada banyak daemon).

## How It Works

```text
Boot → kernel → systemd (PID 1) → menjalankan unit service (nginx, postgresql, pos-api)
Request masuk → firewall (ufw/firewalld/iptables) → port 443 (nginx) → proxy ke 127.0.0.1:3000 (pos-api) → DB 5432
Log: stdout/stderr service → journald (journalctl) · aplikasi tertentu → /var/log/<app>/
```

## Implementation

### Perintah harian

```bash
# Navigasi & file
pwd; ls -lah; cd /var/log; cat file; less file; head -n 50 file; tail -f file
cp -r src dst; mv a b; rm file; mkdir -p a/b/c; find / -name "*.log" -size +100M 2>/dev/null
grep -rn "ERROR" /var/log/pos-api/; grep -i "timeout" app.log | wc -l

# Permission & kepemilikan
chmod 640 config.env; chmod +x deploy.sh; chown app:app -R /opt/pos-api
sudo -u app whoami

# Resource
df -h               # disk per filesystem
du -sh /var/log/*   # ukuran direktori
free -h             # memori
top / htop          # CPU & memori per proses
uptime              # load average

# Proses & port
ps aux | grep node
ss -tulpn           # port yang listen + proses (pengganti netstat)
sudo lsof -i :3000
kill -TERM <pid>; kill -9 <pid>   # -9 hanya jika terpaksa

# Jaringan
ip a                # alamat IP
ping -c 4 db.internal; curl -v http://127.0.0.1:3000/health
dig api.example.com +short; traceroute api.example.com

# Package
sudo apt update && sudo apt install -y nginx     # Debian/Ubuntu
sudo dnf install -y nginx                         # RHEL/Fedora/Rocky
```

### Menjalankan aplikasi sebagai systemd service

```ini
# /etc/systemd/system/pos-api.service
[Unit]
Description=POS API
After=network-online.target
Wants=network-online.target

[Service]
User=app
Group=app
WorkingDirectory=/opt/pos-api
EnvironmentFile=/etc/pos-api/env          # chmod 600, milik root/app
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pos-api
systemctl status pos-api
journalctl -u pos-api -f --since "10 min ago"
```

### SSH aman

```bash
ssh-keygen -t ed25519 -C "you@laptop"
ssh-copy-id app@203.0.113.10
ssh app@203.0.113.10
```

```text
# /etc/ssh/sshd_config (lalu: sudo systemctl reload sshd)
PasswordAuthentication no
PermitRootLogin no
```

### Checklist troubleshooting "API down/lambat"

```text
1. systemctl status pos-api / docker ps         → proses hidup? restart loop?
2. journalctl -u pos-api -n 200 / docker logs   → error terakhir?
3. df -h                                        → disk penuh (log membengkak)?
4. free -h ; top                                → memori habis (OOM killer: dmesg | grep -i oom)? CPU 100%?
5. ss -tulpn ; curl localhost:3000/health       → port listen? health OK dari dalam server?
6. curl -v https://api.example.com/health       → masalah di nginx/TLS/firewall/DNS?
7. Koneksi DB: pg_isready -h db.internal        → database terjangkau? koneksi penuh?
8. Apa yang berubah terakhir? (deploy, konfigurasi, sertifikat kedaluwarsa)
```

## Best Practices

- **Login dengan SSH key**, nonaktifkan password & root login; gunakan `sudo` untuk perintah admin.
- **Jalankan aplikasi sebagai user non-root** khusus (`app`).
- **Service dikelola systemd** (atau container orchestrator) dengan restart otomatis.
- **Log rotation** (`logrotate`/journald limits) agar disk tidak penuh.
- **Firewall default deny**, buka port seperlunya (22 dari IP admin, 80/443 publik).
- **Update keamanan rutin** (`unattended-upgrades` atau jadwal patch).
- **Konfigurasi & secret** di file dengan permission ketat atau secret manager, bukan di repo.

## Anti-Patterns

- `chmod -R 777` untuk "memperbaiki" error permission.
- Menjalankan aplikasi sebagai root.
- Menjalankan aplikasi dengan `nohup node app.js &` tanpa supervisor → mati saat crash/reboot.
- `kill -9` sebagai langkah pertama (tidak ada graceful shutdown).
- Mengedit konfigurasi production langsung tanpa backup/versi.

## Performance Considerations

- **Load average** dibandingkan jumlah core (`nproc`): load jauh di atas jumlah core → antrian CPU/I/O.
- `iostat`/`vmstat` untuk melihat I/O wait dan swap; swap tinggi menandakan memori kurang.
- Batas file descriptor (`ulimit -n`) untuk server dengan banyak koneksi.
- Pisahkan disk data database dari disk OS bila memungkinkan.

## Security Considerations

- Prinsip least privilege untuk user, file, dan service (`NoNewPrivileges`, permission 600 untuk secret).
- Pantau `/var/log/auth.log` (atau `journalctl -u ssh`) untuk percobaan login; fail2ban untuk SSH brute force.
- Hanya port yang diperlukan yang terbuka; database tidak listen di IP publik.
- Sertifikat TLS diperbarui otomatis (certbot/ACME) dan dipantau masa berlakunya.

## Real-World Use Cases

- Deploy API di VM: Nginx (TLS) → systemd service Node.js → PostgreSQL di subnet privat.
- Investigasi "aplikasi tidak bisa login": ternyata disk penuh oleh log sehingga database tidak bisa menulis.
- Cron/systemd timer untuk backup database harian ke object storage.

## Interview Questions

1. Bagaimana melihat proses yang memakai port tertentu?
2. Jelaskan permission `chmod 755` dan `640`.
3. Bagaimana menjalankan aplikasi agar tetap hidup setelah reboot/crash?
4. API tidak bisa diakses — langkah troubleshooting Anda?
5. Apa beda `SIGTERM` dan `SIGKILL`?
6. Bagaimana mengamankan akses SSH?

## Sample Answers

1. `ss -tulpn | grep :3000` atau `sudo lsof -i :3000` untuk melihat PID dan nama proses.
2. 755: owner rwx, group r-x, others r-x (umum untuk direktori/skrip yang boleh dibaca semua). 640: owner rw-, group r--, others tidak ada akses (cocok untuk file konfigurasi yang dibaca grup service).
3. Membuat unit systemd dengan `Restart=on-failure` dan `systemctl enable`, atau menjalankannya sebagai container dengan restart policy/orchestrator.
4. Cek status proses & log, resource (disk, memori, CPU, OOM), port yang listen dan health check lokal, lalu dari luar (nginx, TLS, firewall, DNS), konektivitas database, dan perubahan terakhir (deploy/konfigurasi/sertifikat).
5. SIGTERM meminta proses berhenti dengan tertib (bisa ditangani untuk graceful shutdown); SIGKILL menghentikan paksa oleh kernel tanpa kesempatan cleanup.
6. Login dengan key (ed25519), nonaktifkan password & root login, batasi IP sumber via firewall, fail2ban, dan perbarui OpenSSH.

## Practical Exercises

1. Siapkan VM/WSL Ubuntu, buat user `app`, deploy API latihan sebagai systemd service di belakang Nginx.
2. Simulasikan disk penuh (`fallocate -l 5G big.file` pada disk kecil) dan amati gejala aplikasi; perbaiki.
3. Latih checklist troubleshooting dengan mematikan database dan membaca log aplikasi.

## Quick Reference

```text
ls -lah · cd · cat/less/tail -f · grep -rn · find · chmod 640 / chown app:app
df -h · du -sh · free -h · top/htop · uptime · ps aux · ss -tulpn · lsof -i :PORT · kill -TERM
systemctl status|restart|enable --now · journalctl -u svc -f · dmesg | grep -i oom
ssh key ed25519 · PasswordAuthentication no · PermitRootLogin no · firewall deny-by-default
```

## Related Topics

- [Linux Fundamentals & Command Line (DevOps)](/devops/linux-fundamentals/)
- [Networking & Internet Fundamentals](/interview/company-prep/networking-internet/)
- [Basic Cloud Computing](/interview/company-prep/cloud-computing/)
- [Dockerfile & Docker Compose](/devops/dockerfile-compose/)
