---
title: "Ticketing System"
description: "Studi kasus sistem tiket event/transportasi dengan aplikasi mobile: requirement, lonjakan trafik saat penjualan dibuka, antrean virtual, pemilihan kursi dengan hold berbatas waktu, mencegah double booking, pembayaran, penerbitan e-ticket ber-QR tertanda tangan, validasi di gerbang secara offline, anti-bot & anti-calo, serta failure mode."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, case-study, ticketing, concurrency, queue, qr-code]
---

## Overview

Desain sistem penjualan tiket (konser, olahraga, kereta/bus, bioskop) dengan aplikasi mobile: pengguna memilih event,
memilih kursi atau kategori, membayar dalam batas waktu, menerima e-ticket berbentuk QR, lalu tiket dipindai di gerbang.

## Why It Matters

Soal ini menguji penanganan **lonjakan trafik ekstrem** (ratusan ribu orang pada detik yang sama), **konkurensi** (satu
kursi tidak boleh terjual dua kali), dan **validasi offline** di gerbang. Hal yang sama muncul pada flash sale dan
pemesanan slot (dokter, layanan publik).

## Core Concepts

| Fungsional | Non-fungsional |
| --- | --- |
| Daftar event & kategori/kursi | Tidak ada double booking |
| Pemilihan kursi + hold sementara | Tahan lonjakan 100× normal saat on-sale |
| Pembayaran dalam batas waktu | Adil (antrean) dan tahan bot |
| E-ticket QR di aplikasi (offline) | Validasi gerbang cepat (< 1 detik) walau internet buruk |
| Transfer/refund sesuai kebijakan | Tiket tidak bisa dipalsukan/diduplikasi |
| Scan & validasi di gerbang | |

| Konsep | Penjelasan |
| --- | --- |
| Inventory kursi | Setiap kursi/kuota adalah unit dengan status: available → held → sold |
| Hold | Kursi dikunci untuk satu pengguna selama N menit menunggu pembayaran |
| Virtual waiting room | Antrean di depan sistem saat permintaan melebihi kapasitas |
| Signed ticket | Isi QR ditandatangani server sehingga dapat diverifikasi offline |

## How It Works

```text
On-sale dibuka
App → CDN (halaman event statis) → Waiting room (token antrean, giliran masuk terbatas laju)
    → API booking (hanya pemegang token giliran) → hold kursi (Redis/DB atomik) → order PENDING (TTL 10 menit)
    → payment gateway → webhook → SOLD → tiket diterbitkan (QR tertanda tangan) → push ke app
Hari H: scanner app (offline) memverifikasi tanda tangan QR + daftar tiket sah/terpakai → sinkron ke server
```

### Data model

```text
events(id, venue_id, starts_at, on_sale_at, status)
seats(id, event_id, section, row, number, category_id)          -- atau kuota per kategori untuk festival
seat_inventory(seat_id, status: available|held|sold, hold_id, hold_expires_at, version)
holds(id, user_id, event_id, expires_at, status)
orders(id, user_id, hold_id, total, status, idempotency_key)
tickets(id, order_id, seat_id, holder_name, status: valid|used|refunded, issued_at)
scans(ticket_id, gate_id, device_id, scanned_at, result)
```

## Implementation

### 1. Antrean virtual

```text
- Halaman event dan countdown dari CDN (waktu dari server)
- Saat on-sale: klien meminta token antrean (posisi acak/urut sesuai kebijakan) → polling posisi dengan interval dari server
- Gerbang mengizinkan N pengguna/detik masuk ke alur booking (sesuai kapasitas yang telah diuji beban)
- Token giliran bertanda tangan & berumur pendek, diwajibkan oleh API booking
```

### 2. Hold kursi tanpa double booking

```sql
-- Hold atomik untuk beberapa kursi: semua berhasil atau tidak sama sekali
UPDATE seat_inventory
SET status = 'held', hold_id = $1, hold_expires_at = now() + interval '10 minutes', version = version + 1
WHERE seat_id = ANY($2) AND (status = 'available' OR (status = 'held' AND hold_expires_at < now()))
RETURNING seat_id;
-- Jumlah baris < jumlah kursi diminta → ROLLBACK, kembalikan "kursi sudah diambil"
```

```text
Untuk kategori tanpa kursi (festival): kuota di Redis (DECRBY atomik) sebagai gerbang cepat, lalu dicatat di DB
Job pembersih: hold kedaluwarsa → kembali available (hold yang sudah dibayar tidak disentuh)
```

### 3. Pembayaran

```text
Order PENDING terikat hold · batas bayar = TTL hold
Webhook sukses sebelum hold kedaluwarsa → kursi SOLD, tiket diterbitkan
Webhook sukses SETELAH hold kedaluwarsa dan kursi sudah dijual ke orang lain → refund otomatis + notifikasi (kasus tepi wajib ditangani)
```

### 4. E-ticket bertanda tangan

```text
Payload QR (ringkas): ticketId · eventId · seat · issuedAt · versi kunci
Tanda tangan: Ed25519/ECDSA oleh server (private key di KMS). Scanner menyimpan public key
QR dinamis (opsional): aplikasi menampilkan kode yang berubah tiap 30 detik (TOTP berbasis secret tiket) untuk mencegah screenshot dibagikan
Tiket disimpan di aplikasi (dan bisa ditambahkan ke Google Wallet/Apple Wallet) agar tersedia offline
```

### 5. Validasi di gerbang (offline-first)

```text
Sebelum acara: scanner mengunduh public key + daftar ticketId sah (dan yang sudah refund)
Scan: verifikasi tanda tangan → cek di DB lokal (valid & belum used) → tandai used lokal → hijau/merah < 1 detik
Sinkron: kirim scan ke server sesering mungkin, terima scan dari gerbang lain (mencegah satu tiket masuk dua gerbang)
Konflik (tiket dipakai di dua gerbang saat offline) → dicatat untuk investigasi, kebijakan masuk pertama
```

### 6. Anti-bot & anti-calo

```text
Batas tiket per akun/identitas, verifikasi nomor HP, Play Integrity/App Attest
Rate limit & deteksi pola · tiket atas nama (nama pemegang) · transfer resmi lewat aplikasi saja
```

## Best Practices

- **Antrean virtual** untuk melindungi sistem dan memberi keadilan.
- **Hold atomik berbatas waktu** dengan pembersihan otomatis.
- **Tangani pembayaran yang terlambat** (refund otomatis).
- **Tiket bertanda tangan** yang dapat diverifikasi offline.
- **Scanner offline-first** dengan sinkron antar gerbang.
- **Load test** tepat pada skenario on-sale.

## Anti-Patterns

- Membiarkan semua pengguna langsung mengakses API booking saat on-sale.
- Mengecek ketersediaan lalu memesan dalam dua langkah terpisah (race condition).
- QR berisi ID berurutan tanpa tanda tangan (mudah dipalsukan).
- Validasi gerbang yang membutuhkan internet untuk setiap scan.
- Hold tanpa kedaluwarsa (kursi terkunci selamanya).

## Performance Considerations

Halaman statis via CDN, waiting room membatasi beban ke kapasitas yang terukur, hold atomik dengan index pada
`(event_id, status)`, kuota di Redis untuk kategori besar, dan penerbitan tiket/notifikasi lewat antrean. Validasi di
gerbang lokal sehingga tidak bergantung latensi jaringan.

## Security Considerations

Private key penandatangan di KMS dengan rotasi berversi, token antrean bertanda tangan, idempotensi pembayaran,
verifikasi webhook, anti-bot, dan perlindungan data pemegang tiket. Scanner hanya untuk perangkat staf terdaftar.

## Real-World Use Cases

- Penjualan tiket konser 50.000 kursi habis dalam 10 menit dengan waiting room dan hold 10 menit.
- Gerbang stadion dengan 40 scanner Android offline yang sinkron melalui Wi-Fi lokal setiap beberapa detik.

## Interview Questions

1. Bagaimana mencegah satu kursi terjual dua kali?
2. Bagaimana menangani 500 ribu pengguna yang membuka aplikasi tepat saat penjualan dibuka?
3. Bagaimana memvalidasi tiket di gerbang tanpa internet?
4. Apa yang terjadi bila pembayaran berhasil setelah hold kedaluwarsa?

## Sample Answers

1. Hold kursi dengan update atomik bersyarat (hanya bila available atau hold sebelumnya kedaluwarsa) untuk semua kursi dalam satu transaksi, dengan TTL, lalu konversi ke sold hanya oleh pembayaran yang terkait hold tersebut.
2. Halaman statis di CDN, antrean virtual yang memasukkan pengguna sesuai kapasitas teruji, token giliran bertanda tangan, rate limit dan anti-bot, sistem booking yang diskalakan dan diuji beban, serta antrean untuk pekerjaan setelah pembayaran.
3. Tiket QR ditandatangani server. Scanner menyimpan public key dan daftar tiket sah, memverifikasi tanda tangan dan status lokal, menandai tiket terpakai, lalu menyinkronkan data scan antar gerbang dan server saat ada koneksi.
4. Sistem mendeteksi hold tidak lagi valid. Bila kursi masih tersedia, pesanan dapat diselesaikan. Bila sudah terjual ke orang lain, dana direfund otomatis dan pengguna diberi tahu.

## Practical Exercises

1. Implementasikan hold kursi atomik dan uji 1.000 permintaan bersamaan untuk kursi yang sama.
2. Rancang format QR bertanda tangan dan verifikasinya di aplikasi scanner Flutter.
3. Rencanakan kapasitas & load test untuk on-sale 200 ribu pengguna.

## Quick Reference

```text
CDN + waiting room (token giliran) → booking terbatas laju
Hold atomik (available | held expired) + TTL + job pembersih · kuota festival di Redis
Pembayaran dalam TTL · terlambat → selesaikan bila tersedia / refund otomatis
QR bertanda tangan (KMS) · QR dinamis opsional · wallet pass
Scanner offline: public key + daftar sah + used lokal + sinkron antar gerbang
```

## Related Topics

- [E-Commerce Application](/system-design/case-studies/e-commerce/)
- [Load & Stress Testing](/testing-performance/load-stress-testing/)
- [Offline-First & Synchronization Strategy](/system-design/concepts/offline-first-architecture/)
