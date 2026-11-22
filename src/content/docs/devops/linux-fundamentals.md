---
title: "Linux Fundamentals & Command Line"
description: "Dasar Linux & command line untuk developer: struktur filesystem, navigasi & manipulasi file, permission & ownership, user & sudo, proses & sinyal, systemd & journalctl, jaringan (ss, curl, dig), log, disk & memori, pipe & redirection, grep/find/awk, SSH & key, package manager, serta troubleshooting server dan container."
level: beginner
status: complete
version: "Ubuntu/Debian LTS sebagai contoh. Perintah inti berlaku di kebanyakan distro"
updated: 2026-11-13
tags: [devops, linux, cli, ssh, systemd, troubleshooting]
---

## Overview

Hampir semua server, container, dan runner CI berjalan di Linux. Developer tidak harus menjadi sysadmin, tetapi perlu
**nyaman di terminal**: membaca log, memeriksa proses, menguji koneksi, mengatur permission, dan masuk ke server dengan
SSH secara aman.

## Why It Matters

Saat API bermasalah di produksi atau build CI gagal, jawabannya sering ada di log, variabel environment, permission file,
atau port yang tidak terbuka. Kemampuan Linux dasar mempercepat debugging dan sering ditanyakan dalam interview yang
mencakup deployment.

## Core Concepts

| Direktori | Isi |
| --- | --- |
| `/etc` | Konfigurasi sistem & layanan |
| `/var/log` | Log sistem & layanan |
| `/home/<user>` | Direktori pengguna |
| `/opt`, `/srv` | Aplikasi tambahan / data layanan |
| `/tmp` | File sementara |
| `/proc` | Info proses & kernel (virtual) |

| Konsep | Penjelasan |
| --- | --- |
| Permission `rwx` | Read/write/execute untuk owner, group, others (`chmod 640` = rw-r-----) |
| Proses & PID | Setiap program berjalan sebagai proses dengan ID |
| Sinyal | `SIGTERM` (minta berhenti dengan rapi), `SIGKILL` (paksa), `SIGHUP` (reload) |
| systemd | Pengelola layanan (start, stop, restart otomatis, log via journald) |
| Exit code | `0` sukses, selain itu gagal. Dipakai skrip & CI |
| stdin/stdout/stderr | Aliran input, output, dan error (0, 1, 2) |

## How It Works

```text
Shell (bash/zsh) membaca perintah → menjalankan program sebagai proses → output ke stdout/stderr
Pipe (|) menyambungkan stdout satu program ke stdin program lain → komposisi tool kecil
```

## Implementation

### Navigasi & file

```bash
pwd; ls -lah; cd /var/log
cat app.log | less                 # atau: less app.log
head -n 50 app.log; tail -f app.log # ikuti log secara langsung
cp -r src/ backup/; mv old new; mkdir -p a/b/c
rm file.txt                        # hati-hati: tidak ada recycle bin
du -sh *; df -h                    # ukuran folder; sisa disk
```

### Mencari

```bash
grep -rn "ECONNREFUSED" /var/log/myapp/          # cari teks rekursif dengan nomor baris
grep -i "error" app.log | tail -20
find . -name "*.log" -mtime +7                   # file log lebih dari 7 hari
jq '.level, .msg' app.json.log                   # parse log JSON
awk '{print $9}' access.log | sort | uniq -c | sort -rn | head   # hitung status code
```

### Permission & user

```bash
ls -l .env                         # -rw------- 1 deploy deploy ...
chmod 600 .env                     # hanya pemilik yang bisa baca/tulis
chown deploy:deploy /srv/app -R
sudo -u deploy whoami              # jalankan sebagai user lain
id; groups
```

Jalankan aplikasi sebagai user khusus non-root, dan file secret hanya bisa dibaca user tersebut.

### Proses & sinyal

```bash
ps aux | grep node
top                                # atau htop
kill -TERM <pid>                   # minta berhenti dengan rapi
kill -9 <pid>                      # paksa (terakhir; tidak sempat cleanup)
lsof -i :3000                      # proses yang memakai port 3000
```

### systemd

```ini
# /etc/systemd/system/pos-api.service
[Unit]
Description=POS API
After=network-online.target

[Service]
User=deploy
WorkingDirectory=/srv/pos-api
EnvironmentFile=/etc/pos-api/env
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
TimeoutStopSec=30
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

### Jaringan

```bash
curl -i https://api.example.com/health/ready             # status & header
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" https://api.example.com/health/ready
ss -tulpn                                                # port yang mendengarkan
dig api.example.com +short                               # resolusi DNS
nc -zv db.internal 5432                                  # tes port TCP terbuka
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null | head
```

### Memori & disk

```bash
free -h
df -h; du -sh /var/lib/docker
dmesg | grep -i "killed process"       # proses dibunuh OOM killer
```

### SSH

```bash
ssh-keygen -t ed25519 -C "you@laptop"            # kunci baru (dengan passphrase)
ssh-copy-id deploy@server
ssh -i ~/.ssh/id_ed25519 deploy@server
scp dist.tar.gz deploy@server:/tmp/
ssh -L 5433:localhost:5432 deploy@bastion            # tunnel ke DB tanpa membuka port publik
```

Di server: nonaktifkan login password dan login root lewat SSH, gunakan kunci, dan batasi akses dengan firewall.

### Pipe, redirection, exit code

```bash
npm test > test.log 2>&1         # stdout & stderr ke file
command || echo "gagal"          # jalankan bila gagal
set -euo pipefail                # di skrip: berhenti saat error, variabel tak terdefinisi, atau pipe gagal
echo $?                          # exit code perintah terakhir
```

### Di dalam container

```bash
docker exec -it pos-api sh       # image alpine: sh, bukan bash
env | sort                       # cek variabel environment (hati-hati menampilkan secret)
```

## Best Practices

- **User non-root** untuk aplikasi, sudo hanya bila perlu.
- **SSH dengan kunci**, tanpa password & tanpa root login.
- **systemd atau orkestrator** untuk restart otomatis dan log terpusat.
- **`set -euo pipefail`** di skrip shell.
- **Periksa log & resource dulu** sebelum menebak penyebab masalah.

## Anti-Patterns

- `chmod 777` untuk "memperbaiki" permission.
- Menjalankan aplikasi sebagai root.
- `kill -9` sebagai cara normal menghentikan layanan.
- Menyalin secret ke `/tmp` atau riwayat shell (`export TOKEN=...` tercatat di history).
- `rm -rf` dengan variabel yang mungkin kosong (`rm -rf $DIR/`).

## Performance Considerations

Pantau CPU, memori, IO, dan disk penuh. Disk penuh (log atau image Docker) adalah penyebab gangguan yang sangat umum.
Gunakan rotasi log (logrotate/journald limits) dan bersihkan image lama (`docker system prune` dengan hati-hati).

## Security Considerations

Prinsip least privilege berlaku di OS: user terpisah per layanan, permission file secret `600`, firewall hanya membuka
port yang diperlukan, update keamanan rutin (`unattended-upgrades`), dan akses SSH yang diaudit.

## Real-World Use Cases

- API tidak merespons: `systemctl status` → `journalctl` menunjukkan `ECONNREFUSED` ke DB → `nc -zv` mengonfirmasi port DB tertutup firewall.
- Container restart terus: `dmesg` menunjukkan OOM kill → batas memori dinaikkan dan leak diperbaiki.

## Interview Questions

1. Bagaimana Anda mencari penyebab layanan yang tiba-tiba berhenti di server Linux?
2. Apa beda SIGTERM dan SIGKILL?
3. Apa arti permission `640`?
4. Bagaimana mengakses database di jaringan privat dari laptop dengan aman?

## Sample Answers

1. Cek status layanan (`systemctl status`), log (`journalctl -u` atau log aplikasi), resource (`free`, `df`, `top`), OOM kill (`dmesg`), port (`ss`), dan konektivitas dependensi (`curl`, `nc`, `dig`).
2. SIGTERM meminta proses berhenti sehingga aplikasi dapat melakukan graceful shutdown. SIGKILL menghentikan paksa tanpa kesempatan cleanup.
3. Owner dapat membaca & menulis (6), group dapat membaca (4), others tidak punya akses (0).
4. Melalui SSH tunnel ke bastion host (`ssh -L`) atau VPN, tanpa membuka port database ke internet, dengan kredensial yang dibatasi.

## Practical Exercises

1. Buat service systemd untuk API Node.js dan uji restart otomatis.
2. Hitung 10 IP/route teratas dari access log dengan `awk | sort | uniq -c`.
3. Konfigurasikan SSH key login dan matikan password login di VM uji.

## Quick Reference

```text
ls -lah · cd · less · tail -f · grep -rn · find · jq · du -sh · df -h · free -h
chmod 600 · chown · sudo -u · ps aux · top · lsof -i :PORT · kill -TERM
systemctl status|restart · journalctl -u svc -f · ss -tulpn · curl -i · dig · nc -zv · openssl s_client
ssh-keygen -t ed25519 · ssh -L (tunnel) · set -euo pipefail · $? exit code
```

## Related Topics

- [Docker Fundamentals](/devops/docker-fundamentals/)
- [Server Deployment](/devops/server-deployment/)
- [Environment Variables](/devops/environment-variables/)
