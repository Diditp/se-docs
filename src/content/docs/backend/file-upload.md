---
title: "File Upload"
description: "Menangani upload file dari aplikasi mobile ke backend Node.js: upload lewat server (multipart streaming) vs langsung ke object storage dengan presigned URL, alur konfirmasi, validasi tipe dari isi file, batas ukuran, pemrosesan gambar (thumbnail, hapus EXIF) di worker, resumable/multipart upload untuk jaringan buruk, akses file privat dengan signed URL, serta implementasi di Flutter."
level: intermediate
status: complete
version: "Node.js 22 · @fastify/multipart · AWS SDK v3 (S3-compatible: S3, GCS interop, R2, MinIO) · Dio 5"
updated: 2026-11-13
tags: [backend, file-upload, s3, presigned-url, multipart, mobile]
---

## Overview

Aplikasi mobile sering mengunggah file: foto produk, bukti pengiriman, foto KTP, lampiran tiket, atau backup data.
Ada dua pola utama:

1. **Melalui server API**: aplikasi mengirim multipart ke API, lalu API meneruskan ke storage.
2. **Langsung ke object storage**: API memberi **presigned URL** berumur pendek, lalu aplikasi mengunggah langsung ke storage. Server hanya mengatur izin dan mencatat metadata.

Untuk file berukuran sedang hingga besar dari mobile, pola kedua biasanya lebih efisien dan lebih tahan gangguan.

## Why It Matters

Upload yang ditangani dengan buruk dapat menghabiskan memori server (file di-buffer seluruhnya), membuka celah keamanan
(file berbahaya, path traversal), dan gagal terus di jaringan seluler yang lemah. Desain yang benar membuat upload
cepat, aman, dan bisa dilanjutkan.

## Core Concepts

| Aspek | Lewat server | Presigned URL langsung ke storage |
| --- | --- | --- |
| Beban server | Bandwidth & memori/disk server | Minimal (hanya membuat URL) |
| Kontrol | Penuh (bisa scan sebelum simpan) | Validasi setelah upload (event/konfirmasi) |
| Ukuran besar | Butuh streaming hati-hati | Didukung baik, termasuk multipart upload |
| Kompleksitas klien | Rendah | Sedang (dua langkah + konfirmasi) |
| Cocok untuk | File kecil (< beberapa MB), validasi ketat | Foto, video, dokumen, file besar |

| Konsep | Penjelasan |
| --- | --- |
| Object storage | S3/GCS/R2/MinIO: menyimpan objek berdasarkan key, murah & skalabel |
| Presigned URL | URL bertanda tangan dengan masa berlaku & batasan (method, key, content-type) |
| Multipart/resumable upload | File dipecah per bagian sehingga bagian yang gagal bisa diulang |
| Magic bytes | Tanda tangan di awal file untuk mengenali tipe sebenarnya |

## How It Works

```text
Presigned upload:
1. App: POST /v1/uploads { purpose: "delivery_proof", contentType: "image/jpeg", size: 812345 }
2. API: validasi izin & batas → buat record upload (status=pending) → presigned PUT URL (5 menit) + uploadId
3. App: PUT file ke URL storage
4. App: POST /v1/uploads/{id}/complete
5. API: cek objek ada & ukuran sesuai → antrekan job proses (validasi isi, thumbnail, strip EXIF) → status=ready
6. Data bisnis (mis. delivery) mereferensikan uploadId, bukan URL mentah
```

## Implementation

### 1. Membuat presigned URL

```ts
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: env.S3_REGION, endpoint: env.S3_ENDPOINT });
const PURPOSES = {
  delivery_proof: { maxBytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/webp'] },
  product_image:  { maxBytes: 3 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] },
} as const;

const CreateUpload = z.object({
  purpose: z.enum(['delivery_proof', 'product_image']),
  contentType: z.string(),
  size: z.number().int().positive(),
}).strict();

app.post('/v1/uploads', { preHandler: [authenticate] }, async (req, reply) => {
  const input = CreateUpload.parse(req.body);
  const rule = PURPOSES[input.purpose];
  if (!(rule.types as readonly string[]).includes(input.contentType) || input.size > rule.maxBytes) {
    throw new ValidationError('Tipe atau ukuran file tidak diizinkan');
  }
  const id = randomUUID();
  const key = `${req.user.tenantId}/${input.purpose}/${id}`;            // nama dari server, bukan dari pengguna
  await uploads.insert({ id, key, ownerId: req.user.id, tenantId: req.user.tenantId, ...input, status: 'pending' });

  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: env.UPLOAD_BUCKET, Key: key, ContentType: input.contentType, ContentLength: input.size,
  }), { expiresIn: 300 });

  return reply.code(201).send({ uploadId: id, url, headers: { 'Content-Type': input.contentType } });
});
```

Untuk batas ukuran yang benar-benar ditegakkan storage, gunakan **presigned POST** dengan kondisi `content-length-range`
(S3) atau fitur serupa di penyedia Anda.

### 2. Konfirmasi & pemrosesan

```ts
app.post('/v1/uploads/:id/complete', { preHandler: [authenticate] }, async (req) => {
  const up = await uploads.findOwned(req.params.id, req.user.id);
  if (!up || up.status !== 'pending') throw new NotFoundError();
  const head = await s3.send(new HeadObjectCommand({ Bucket: env.UPLOAD_BUCKET, Key: up.key }));
  if (head.ContentLength !== up.size) throw new ValidationError('Ukuran tidak sesuai');
  await uploads.update(up.id, { status: 'processing' });
  await fileQueue.add('process-upload', { uploadId: up.id }, { jobId: `upload:${up.id}` });
  return { status: 'processing' };
});
```

```ts
// Worker: validasi isi + re-encode (menghapus EXIF/payload tersembunyi) + thumbnail
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

new Worker('files', async (job) => {
  const up = await uploads.get(job.data.uploadId);
  const buf = await readObject(up.key);
  const type = await fileTypeFromBuffer(buf);                         // magic bytes
  if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) {
    await deleteObject(up.key); return uploads.update(up.id, { status: 'rejected' });
  }
  const clean = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const thumb = await sharp(buf).rotate().resize({ width: 320 }).webp({ quality: 70 }).toBuffer();
  await putObject(`${up.key}.webp`, clean, 'image/webp');
  await putObject(`${up.key}_thumb.webp`, thumb, 'image/webp');
  await uploads.update(up.id, { status: 'ready', processedKey: `${up.key}.webp`, thumbKey: `${up.key}_thumb.webp` });
}, { connection, concurrency: 4 });
```

`sharp` tidak menyalin metadata EXIF ke output kecuali diminta, dan `.rotate()` tanpa argumen menerapkan orientasi EXIF
sebelum metadata dibuang.

### 3. Upload lewat server (file kecil) dengan streaming

```ts
await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

app.post('/v1/avatars', { preHandler: [authenticate] }, async (req) => {
  const file = await req.file();
  if (!file) throw new ValidationError('File wajib');
  const buf = await file.toBuffer();                                  // aman karena dibatasi 2 MB
  if (file.file.truncated) throw new ValidationError('File terlalu besar');
  // validasi magic bytes + re-encode seperti di atas, lalu simpan ke storage
});
```

Untuk file besar via server, alirkan (`pipeline`) langsung ke storage, jangan `toBuffer()`.

### 4. Akses file privat

```ts
// Bucket privat. URL baca berumur pendek dibuat saat dibutuhkan, setelah cek otorisasi
const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.UPLOAD_BUCKET, Key: up.thumbKey }), { expiresIn: 600 });
```

Gambar publik (katalog) dapat disajikan lewat CDN dengan key berhash dan cache panjang.

### 5. Klien Flutter

```dart
Future<String> uploadDeliveryProof(File file) async {
  final bytes = await compressImage(file);                            // kompres di perangkat dulu (lihat Image Optimization)
  final res = await api.post('/v1/uploads', data: {
    'purpose': 'delivery_proof', 'contentType': 'image/webp', 'size': bytes.length,
  });
  final uploadId = res.data['uploadId'] as String;

  await Dio().put(                                                    // Dio TANPA interceptor auth: URL sudah bertanda tangan
    res.data['url'] as String,
    data: Stream.fromIterable([bytes]),
    options: Options(headers: {
      Headers.contentLengthHeader: bytes.length,
      'Content-Type': 'image/webp',
    }),
    onSendProgress: (sent, total) => progress.value = sent / total,
  );

  await api.post('/v1/uploads/$uploadId/complete');
  return uploadId;
}
```

Untuk offline-first: simpan file di direktori aplikasi + entri outbox `upload_pending`. Sync engine mengunggah saat
online dan meminta presigned URL baru bila yang lama kedaluwarsa. Untuk file besar (video), gunakan multipart/resumable
upload dari penyedia storage.

## Best Practices

- **Presigned URL untuk file sedang/besar**, server untuk kontrol & metadata.
- **Nama/key dibuat server**, termasuk tenant di prefix.
- **Validasi ganda**: tipe & ukuran saat meminta URL, magic bytes & ukuran nyata setelah upload.
- **Re-encode gambar** di worker (strip EXIF, ubah ukuran, thumbnail).
- **Bucket privat + signed URL baca**, CDN hanya untuk konten publik.
- **Kompres di perangkat** dan dukung retry/resume.

## Anti-Patterns

- Menyimpan file di disk server aplikasi (hilang saat scale/deploy).
- Base64 file di dalam JSON.
- Mempercayai ekstensi atau `Content-Type` dari klien.
- Bucket publik untuk dokumen pribadi.
- Presigned URL berumur berhari-hari.

## Performance Considerations

Upload langsung ke storage menghilangkan bandwidth ganda melalui server. Proses gambar berat (sharp) di worker terpisah
dengan concurrency terbatas. Di klien, kompresi sebelum upload adalah optimasi terbesar untuk jaringan seluler.

## Security Considerations

Batasi tipe & ukuran, validasi isi, scan malware untuk file yang dibagikan ke pengguna lain, simpan di bucket privat,
otorisasi setiap akses baca, hapus metadata lokasi, dan tetapkan retensi (mis. foto KTP dihapus setelah verifikasi).

## Real-World Use Cases

- Kurir mengunggah foto bukti pengiriman 300 KB via presigned URL. Upload tertunda saat offline lalu dilanjutkan.
- Admin mengunggah foto produk. Worker membuat versi WebP dan thumbnail untuk CDN.

## Interview Questions

1. Apa beda upload lewat server dan presigned URL, dan kapan memakai masing-masing?
2. Bagaimana mengamankan fitur upload file?
3. Bagaimana menangani upload di jaringan mobile yang tidak stabil?

## Sample Answers

1. Lewat server memberi kontrol penuh tetapi membebani bandwidth dan memori server, cocok untuk file kecil. Presigned URL membuat klien mengunggah langsung ke storage dengan izin terbatas waktu, cocok untuk file sedang hingga besar.
2. Izin dan batas tipe/ukuran saat meminta URL, key dari server, validasi magic bytes setelah upload, re-encode gambar, scan malware bila dibagikan, bucket privat, signed URL baca setelah otorisasi, dan retensi data.
3. Kompres di perangkat, simpan di antrean lokal, retry dengan backoff, minta URL baru bila kedaluwarsa, multipart/resumable upload untuk file besar, dan konfirmasi idempoten ke API setelah upload berhasil.

## Practical Exercises

1. Implementasikan alur presigned upload + konfirmasi + worker thumbnail.
2. Uji dengan file `.jpg` yang sebenarnya PDF dan pastikan ditolak.
3. Tambahkan upload tertunda saat offline di aplikasi Flutter.

## Quick Reference

```text
Kecil → multipart lewat server (limit, stream) · sedang/besar → presigned URL ke object storage
POST /uploads (validasi, key dari server) → PUT ke storage → POST /complete → worker: magic bytes, sharp re-encode, thumb
Bucket privat · GET signed URL setelah authZ · CDN untuk publik
Flutter: kompres → presigned PUT (Dio tanpa auth) → complete · offline: outbox + URL baru
```

## Related Topics

- [Image & Asset Optimization](/testing-performance/image-asset-optimization/)
- [Input Validation & Sanitization](/security/input-validation/)
- [Background Jobs & Queue](/backend/background-jobs-queue/)
