---
title: "Offline-First & Synchronization Strategy"
description: "Arsitektur offline-first dari sudut pandang desain sistem: database lokal sebagai sumber data UI, ID dari klien (UUIDv7), outbox di perangkat, kontrak sinkronisasi push/pull dengan cursor, tombstone untuk penghapusan, strategi konflik (server authority, last-write-wins, merge per field, event append-only, CRDT), versi & waktu, multi-perangkat, migrasi skema, keamanan data lokal, serta cara membahasnya di interview."
level: advanced
status: complete
updated: 2026-11-13
tags: [system-design, offline-first, sync, conflict-resolution, mobile]
---

## Overview

**Offline-first** berarti aplikasi **dirancang untuk bekerja tanpa jaringan sebagai kondisi normal**, dan jaringan
dipakai untuk menyinkronkan. UI selalu membaca dan menulis ke database lokal. Mesin sinkronisasi memindahkan perubahan
ke server dan menarik perubahan dari server di belakang layar.

Halaman ini membahas **desain sistem end-to-end** (klien + server + kontrak). Implementasi Flutter ada di
[Offline-First Application](/flutter/offline-first/) dan [Data Synchronization & Conflict Resolution](/flutter/data-sync-conflict-resolution/).

## Why It Matters

Aplikasi kasir, kurir, survei lapangan, dan inspeksi aset tidak boleh berhenti karena sinyal hilang. Di Indonesia,
koneksi seluler tidak merata, sehingga offline-first adalah pembeda nyata. Interviewer menyukai topik ini karena
menyentuh database, API, konsistensi, dan UX sekaligus.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Local source of truth (untuk UI) | UI membaca stream dari DB lokal, bukan langsung dari respons API |
| Client-generated ID | UUID (v7 berurutan waktu) dibuat di perangkat sehingga entitas bisa direferensikan sebelum sinkron |
| Outbox lokal | Antrean perubahan yang belum terkirim, diproses berurutan & idempoten |
| Pull dengan cursor | Server memberikan perubahan sejak cursor terakhir (`changes since`) |
| Tombstone | Penanda penghapusan agar klien lain tahu data dihapus |
| Konflik | Dua pihak mengubah data yang sama tanpa melihat perubahan satu sama lain |
| Server authority | Server adalah sumber kebenaran akhir untuk aturan bisnis (harga, stok, izin) |

### Strategi konflik

| Strategi | Cara | Cocok untuk | Risiko |
| --- | --- | --- | --- |
| Server authority / reject | Server menolak perubahan yang melanggar aturan, klien menampilkan dan memperbaiki | Harga, stok, status pembayaran | UX perlu menangani penolakan |
| Last-write-wins (LWW) | Versi terbaru menang (berdasarkan versi/waktu server) | Preferensi, catatan sederhana | Perubahan lain hilang diam-diam |
| Merge per field | Gabungkan field yang berbeda. Konflik hanya bila field sama | Profil, data master | Lebih kompleks |
| Append-only events | Simpan kejadian, bukan state (mutasi stok +5/−2) | Stok, poin, saldo | Butuh agregasi |
| Manual resolution | Tampilkan kedua versi ke pengguna | Dokumen, formulir panjang | Membebani pengguna |
| CRDT | Struktur data yang selalu konvergen | Kolaborasi real-time (teks, daftar) | Kompleks, overhead metadata |

Kunci desain: **pilih strategi per jenis data**, bukan satu strategi untuk semua.

## How It Works

```text
[Perangkat]
UI ⇄ DB lokal (Drift/Room) ──tulis──> tabel data + outbox (dalam satu transaksi lokal)
Sync engine (saat online/periodik/push):
  1. PUSH: kirim batch outbox (idempotency key per operasi) → server terapkan → hasil per item
  2. PULL: GET changes?since=cursor → upsert/delete lokal → simpan cursor baru
[Server]
  Terapkan operasi idempoten → validasi aturan bisnis → catat perubahan dengan versi/sequence
  → sediakan change feed per tenant/outlet → (opsional) push "ada perubahan" ke perangkat lain
```

## Implementation

### Kontrak sinkronisasi

```http
POST /v1/sync/push
{ "deviceId": "dev-7", "operations": [
  { "opId": "018f…a1", "entity": "sale", "type": "create", "data": { "id": "018f…9c", "items": [...], "clientCreatedAt": "..." } },
  { "opId": "018f…a2", "entity": "customer", "type": "update", "id": "c-12", "baseVersion": 4, "changes": { "phone": "0812..." } }
]}

200 → { "results": [
  { "opId": "018f…a1", "status": "applied", "version": 1 },
  { "opId": "018f…a2", "status": "conflict", "serverVersion": 5, "server": { ... } }
]}
```

```http
GET /v1/sync/pull?outletId=o1&since=eyJzIjoxMjM0NX0&limit=500

200 → { "changes": [
  { "entity": "product", "op": "upsert", "id": "p1", "version": 9, "data": { ... } },
  { "entity": "product", "op": "delete", "id": "p7", "version": 10 }          ← tombstone
], "nextCursor": "eyJzIjoxMjg5MH0", "hasMore": false }
```

Aturan penting:

- `opId` unik per operasi → server menyimpan hasilnya sehingga retry tidak menggandakan transaksi.
- Hasil **per operasi**, bukan semua-atau-tidak, agar satu data buruk tidak memblokir antrean.
- Cursor berbasis **sequence server** (monoton), bukan jam perangkat.
- `baseVersion` memungkinkan deteksi konflik (optimistic concurrency).

### Server: change feed dengan sequence

```sql
CREATE TABLE changes (
  seq        bigserial PRIMARY KEY,           -- urutan monoton untuk cursor
  outlet_id  uuid NOT NULL,
  entity     text NOT NULL,
  entity_id  uuid NOT NULL,
  op         text NOT NULL CHECK (op IN ('upsert', 'delete')),
  version    int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON changes (outlet_id, seq);
-- Pull: SELECT ... FROM changes WHERE outlet_id = $1 AND seq > $2 ORDER BY seq LIMIT 500
-- lalu ambil data terbaru tiap entity_id (atau simpan snapshot di payload)
```

Catatan: `bigserial` bisa memiliki celah urutan saat transaksi bersamaan commit tidak berurutan. Untuk sistem bervolume
tinggi, gunakan pembacaan yang menunggu transaksi lebih tua selesai (mis. membaca hanya sampai sequence yang sudah pasti
commit) atau change data capture dari WAL.

### Data uang & stok: jangan LWW

```text
Penjualan offline di dua kasir mengurangi stok produk yang sama:
❌ Kirim "stok = 8" (state) → LWW → salah satu pengurangan hilang
✅ Kirim event "sale item p1 qty 2" → server menjumlahkan mutasi → stok akurat
Bila stok menjadi negatif: aturan bisnis menentukan (izinkan & beri alert, atau tandai untuk review), bukan menolak penjualan yang sudah terjadi
```

### Waktu & urutan

| Masalah | Solusi |
| --- | --- |
| Jam perangkat salah | Simpan `clientCreatedAt` untuk laporan, tetapi urutan sinkron memakai versi/sequence server |
| Perbandingan "siapa terakhir" | Versi per record (`version` naik setiap update) |
| Kausalitas antar perangkat | Hybrid logical clock / vector clock bila benar-benar perlu (jarang di aplikasi bisnis) |

### Siklus hidup & operasional

```text
- Initial sync: snapshot besar (paginasi/kompresi atau file bundle) lalu delta
- Migrasi skema lokal: versi DB lokal + migrasi teruji. Server tetap menerima format lama selama versi app masih aktif
- Pemangkasan data: hapus data lokal lama yang sudah tersinkron (mis. > 90 hari)
- Observabilitas: ukuran outbox, umur operasi tertua, rasio konflik per entitas (kirim sebagai metrik/custom key)
- UX: indikator "belum tersinkron", tombol sinkron manual, penjelasan konflik
```

### Cara membahas di interview (kerangka)

```text
1. Klarifikasi: data apa yang dibuat offline? berapa lama offline? berapa perangkat per akun/outlet?
2. Klien: DB lokal sebagai sumber UI, UUIDv7, outbox, sync engine (trigger: online, resume, periodik, push)
3. API: push batch idempoten + pull cursor + tombstone
4. Konflik: strategi per entitas (stok = event, harga = server, catatan = LWW/field merge)
5. Skala & operasional: initial sync, pagination, migrasi, monitoring, keamanan data lokal
```

## Best Practices

- **UI membaca dari DB lokal**, jaringan hanya untuk sinkron.
- **ID dari klien + operasi idempoten**.
- **Push per operasi dengan hasil per item**, pull dengan cursor sequence server.
- **Strategi konflik per jenis data**, dan perubahan uang/stok sebagai event.
- **Tombstone** untuk penghapusan, dengan masa simpan yang cukup lama untuk perangkat yang lama offline.
- **Tampilkan status sinkron** kepada pengguna.

## Anti-Patterns

- "Offline mode" sebagai cache read-only yang ditambahkan belakangan.
- Auto-increment ID dari server untuk data yang dibuat offline.
- Sinkronisasi berdasarkan `updated_at` dari jam perangkat.
- Last-write-wins untuk stok/saldo.
- Satu operasi gagal memblokir seluruh antrean tanpa visibilitas.

## Performance Considerations

Batasi ukuran batch (mis. 100–500 operasi), kompres payload, dan sinkron secara inkremental. Di perangkat, tulis lokal
harus cepat (transaksi + index) dan sinkron berjalan di background isolate/worker agar UI tidak terganggu. Di server,
endpoint pull harus memakai index `(tenant, seq)` dan paginasi.

## Security Considerations

Data lokal berisi informasi bisnis/pribadi: enkripsi DB (SQLCipher) dengan kunci dari Keystore/Keychain, hapus saat
logout atau saat perangkat dicabut aksesnya (remote wipe saat sinkron berikutnya). Server tetap memvalidasi setiap
operasi (izin, harga, batas) karena perangkat offline bisa dimanipulasi. Batasi berapa lama token boleh bekerja offline
untuk aksi sensitif.

## Real-World Use Cases

- POS multi-kasir: penjualan dibuat offline dengan UUIDv7, stok dihitung dari mutasi, harga divalidasi server saat sinkron.
- Survei lapangan: formulir & foto disimpan lokal, foto diunggah terpisah dengan resumable upload.
- Aplikasi catatan: merge per field, konflik pada field yang sama ditampilkan ke pengguna.

## Interview Questions

1. Rancang aplikasi kasir yang tetap bisa berjualan saat offline.
2. Bagaimana menghindari transaksi ganda saat sinkron di-retry?
3. Strategi apa untuk menangani konflik data, dan kapan memakai masing-masing?
4. Mengapa tidak memakai jam perangkat untuk sinkronisasi?
5. Bagaimana menyinkronkan penghapusan data?

## Sample Answers

1. DB lokal sebagai sumber UI, penjualan ditulis bersama outbox dalam satu transaksi lokal dengan UUID dari klien, sync engine mengirim batch idempoten saat online, menarik perubahan katalog dengan cursor, dan stok dihitung server dari mutasi penjualan. Harga & promo divalidasi server, dan status sinkron ditampilkan.
2. Setiap operasi punya ID unik (opId/idempotency key). Server menyimpan hasil per ID dan mengembalikan hasil yang sama untuk retry. Entitas memakai ID dari klien sehingga insert ulang terdeteksi.
3. Server authority untuk aturan bisnis (harga, izin). Event append-only untuk nilai kumulatif (stok, poin). LWW atau merge per field untuk data deskriptif. Resolusi manual untuk konten penting yang diedit bersama. CRDT untuk kolaborasi real-time.
4. Jam perangkat bisa salah, diubah pengguna, atau berbeda zona, sehingga urutan dan cursor menjadi tidak andal. Gunakan sequence/versi dari server.
5. Gunakan tombstone (penanda delete dengan versi) di change feed sehingga klien menghapus data lokal, dan simpan tombstone cukup lama agar perangkat yang lama offline tetap menerimanya.

## Practical Exercises

1. Tulis kontrak API push/pull untuk tiga entitas aplikasi Anda.
2. Tentukan strategi konflik untuk setiap entitas beserta alasannya.
3. Simulasikan dua perangkat offline yang menjual produk yang sama, lalu verifikasi stok akhir.

## Quick Reference

```text
UI ← DB lokal · tulis = data + outbox (satu transaksi) · UUIDv7 dari klien
PUSH batch idempoten (opId, hasil per item, baseVersion) · PULL since=cursor (sequence server) + tombstone
Konflik per entitas: server authority · event append-only (stok/saldo) · LWW/field merge · manual · CRDT
Jangan jam perangkat untuk urutan · initial snapshot + delta · migrasi kompatibel · monitor outbox
Enkripsi DB lokal · wipe saat logout/dicabut · server validasi semua operasi
```

## Related Topics

- [Offline-First Application (Flutter)](/flutter/offline-first/)
- [Data Synchronization & Conflict Resolution](/flutter/data-sync-conflict-resolution/)
- [Message Queue](/system-design/concepts/message-queue/)
