---
title: "Common Engineering Mistakes"
description: "Kesalahan engineering yang paling sering terjadi di mobile & backend — uang sebagai double, zona waktu, retry tanpa idempotency, N+1, menelan error, secret di repo, migrasi tanpa rencana, overengineering — beserta gejala, dampak, dan cara mencegahnya."
level: intermediate
status: complete
updated: 2026-11-12
tags: [fundamentals, mistakes, best-practices, pitfalls]
---

## Overview

Halaman ini mengumpulkan **kesalahan yang berulang kali muncul** di proyek nyata — sering bukan karena kurang pintar,
tetapi karena terburu-buru atau belum pernah melihat dampaknya. Setiap kesalahan dilengkapi gejala, dampak, dan
pencegahan. Gunakan sebagai checklist review.

## Why It Matters

Banyak insiden production berasal dari pola yang sama. Mengenalinya lebih awal jauh lebih murah daripada memperbaikinya
setelah data rusak atau pengguna terdampak. Cerita "kesalahan yang pernah saya buat dan apa yang saya pelajari" juga
bahan bagus untuk interview behavioral.

## Core Concepts

| # | Kesalahan | Dampak | Pencegahan |
| --- | --- | --- | --- |
| 1 | Uang sebagai `double`/`float` | Selisih pembulatan (0.1 + 0.2 ≠ 0.3) | Integer satuan terkecil / tipe decimal |
| 2 | Waktu tanpa zona waktu | Laporan harian salah, jadwal meleset | Simpan UTC (`timestamptz`), tampilkan lokal |
| 3 | Retry tanpa idempotency | Transaksi/notifikasi ganda | Idempotency key + unique constraint |
| 4 | N+1 query | API lambat saat data bertambah | JOIN/eager loading/batching |
| 5 | Menelan error (`catch {}`) | Bug tak terlihat, data setengah jadi | Tangani, log, atau lempar ulang dengan konteks |
| 6 | Secret di repo/aplikasi | Kebocoran akses | Secret manager, env, scanning |
| 7 | Migrasi skema tanpa rencana | Downtime, data hilang, app lama crash | Expand–contract, backup, test dari versi lama |
| 8 | Tidak ada timeout | Thread/request menggantung | Timeout di semua panggilan I/O |
| 9 | Validasi hanya di klien | Data invalid/berbahaya masuk server | Validasi ulang di server |
| 10 | Race condition read-modify-write | Stok/saldo salah | Transaksi, atomic update, lock/version |
| 11 | Logging data sensitif | Kebocoran data pribadi/token | Redaksi & allowlist field |
| 12 | Tidak ada pagination | Memori habis, respons lambat | Cursor pagination, limit maksimum |
| 13 | Asumsi jaringan selalu ada | App freeze/crash di sinyal lemah | Offline state, retry, cache |
| 14 | Overengineering | Lambat rilis, sulit dipahami | YAGNI, mulai sederhana |
| 15 | Tidak ada monitoring | Insiden diketahui dari keluhan user | Crash reporting, metrik, alert |
| 16 | Memory leak (listener/controller) | App lambat lalu crash | `dispose`, `cancel`, review lifecycle |
| 17 | Mengabaikan versi app lama | Breaking change merusak user yang belum update | Versioning API, min supported version |

## How It Works

Pola umumnya: **asumsi diam-diam** ("jaringan selalu stabil", "request hanya dikirim sekali", "satu zona waktu") yang
benar di laptop developer, tetapi salah di dunia nyata. Cara melawannya: tuliskan asumsi, uji kondisi buruk
(offline, lambat, duplikat, concurrency), dan pasang pengaman di level paling bawah (constraint database).

## Implementation

### 1. Uang

```dart
print(0.1 + 0.2);                 // 0.30000000000000004
const priceRupiah = 18000;        // ✅ integer
final total = items.fold<int>(0, (s, i) => s + i.price * i.qty);
```

### 2. Waktu

```sql
created_at timestamptz NOT NULL DEFAULT now()    -- simpan instant (UTC)
-- Laporan "hari ini" di zona waktu outlet:
-- (timestamp tanpa zona + AT TIME ZONE → instant yang tepat untuk tengah malam WIB)
WHERE created_at >= (timestamp '2026-11-12 00:00' AT TIME ZONE 'Asia/Jakarta')
  AND created_at <  (timestamp '2026-11-13 00:00' AT TIME ZONE 'Asia/Jakarta')
```

### 5. Menelan error

```ts
// ❌
try { await syncSales(); } catch {}

// ✅
try {
  await syncSales();
} catch (err) {
  logger.error({ err, outletId }, 'sync_sales_failed');
  throw new SyncError('Sinkronisasi gagal', { cause: err });
}
```

### 8. Timeout

```dart
final dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 10), receiveTimeout: const Duration(seconds: 20)));
```

### 10. Race condition

```sql
-- ❌ aplikasi: stock = SELECT stock ...; UPDATE products SET stock = :stock - 1
-- ✅ atomik + aturan di database
UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock >= 1;
```

### 11. Log tanpa data sensitif

```ts
const logger = pino({ redact: ['req.headers.authorization', 'body.password', 'body.pin', '*.token'] });
```

## Best Practices

- **Tulis asumsi secara eksplisit** di desain/PR.
- **Uji kondisi buruk**: offline, timeout, duplikat, data kosong, dua user bersamaan.
- **Pertahanan berlapis**: validasi di klien untuk UX, di server untuk kebenaran, constraint di database sebagai jaring terakhir.
- **Postmortem tanpa menyalahkan** dan jadikan pelajaran checklist (atau aturan di AGENTS.md).

## Anti-Patterns

- "Di laptop saya jalan."
- Memperbaiki gejala (menambah `delay`) bukan penyebab.
- Menambahkan `try/catch` di mana-mana tanpa strategi error.
- Menunda monitoring sampai "nanti setelah rilis".

## Performance Considerations

Kesalahan performa paling umum: N+1, tidak ada index, tidak ada pagination, kerja berat di main/UI thread, gambar tanpa
resize, dan cache tanpa batas. Semua bisa dideteksi lebih awal dengan data uji yang realistis volumenya.

## Security Considerations

Kesalahan keamanan paling umum: secret di repo/aplikasi, otorisasi hanya di klien (IDOR), log data sensitif, dependensi
usang, dan konfigurasi debug yang ikut ke production. Lihat [OWASP Top 10](/security/owasp-top-10/).

## Real-World Use Cases

- Checklist code review tim.
- Bahan aturan "Anti-Patterns to Avoid" di [AGENTS.md](/agent-instructions/).
- Cerita kegagalan & pembelajaran untuk interview behavioral.

## Interview Questions

1. Mengapa uang tidak boleh disimpan sebagai float?
2. Bagaimana menyimpan waktu dengan benar untuk aplikasi multi-zona waktu?
3. Apa itu race condition? Beri contoh dan solusinya.
4. Kesalahan engineering apa yang pernah Anda buat dan apa yang dipelajari?
5. Mengapa validasi di klien saja tidak cukup?

## Sample Answers

1. Float biner tidak dapat merepresentasikan banyak pecahan desimal secara tepat sehingga terjadi selisih pembulatan yang terakumulasi. Gunakan integer satuan terkecil atau tipe decimal/numeric.
2. Simpan sebagai instant UTC (`timestamptz`), simpan zona waktu pengguna/outlet bila relevan, konversi ke waktu lokal saat menampilkan atau menghitung batas hari.
3. Hasil bergantung pada urutan eksekusi yang tidak terkontrol, mis. dua kasir mengurangi stok terakhir bersamaan dari nilai yang dibaca sebelumnya. Solusi: atomic update dengan kondisi, transaksi + lock, atau optimistic locking.
4. Ceritakan dengan STAR: kesalahan nyata (mis. retry tanpa idempotency), dampaknya, perbaikan, dan pencegahan permanen (test, constraint, checklist).
5. Klien dapat dimodifikasi atau dilewati (request langsung ke API); server harus memvalidasi ulang dan menegakkan aturan bisnis serta otorisasi.

## Practical Exercises

1. Audit proyek Anda terhadap 17 kesalahan di tabel; beri status ✓/✗.
2. Tulis test yang mensimulasikan request ganda dan dua user bersamaan pada endpoint stok.
3. Tambahkan konfigurasi redaksi log di backend Anda.

## Quick Reference

```text
Uang = integer · waktu = UTC timestamptz · retry = idempotency key · query = hindari N+1 + pagination
Error: jangan ditelan · I/O: selalu timeout · validasi: klien + server + constraint
Concurrency: atomic update/lock/version · secret: di luar repo · log: redaksi · monitoring sejak awal
```

## Related Topics

- [Clean Code](/fundamentals/clean-code/)
- [Transactions & ACID](/database/transactions-acid/)
- [Handling Production Bugs](/interview/behavioral/production-bugs/)
