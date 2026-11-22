---
title: "AI Features in Mobile Apps"
description: "Menambahkan fitur AI ke aplikasi mobile: memilih on-device ML (ML Kit) atau cloud LLM, arsitektur aman dengan backend proxy (API key tidak di app), streaming respons, structured output, ekstraksi dokumen/nota, RAG dasar, biaya & rate limit, privasi data, fallback, evaluasi kualitas, dan contoh Flutter."
level: intermediate
status: complete
version: "Konsep umum. Contoh: Flutter (google_mlkit_*, http/Dio), Node.js/TypeScript backend. Nama model & harga berubah cepat: cek dokumentasi penyedia"
updated: 2026-11-22
tags: [ai, llm, ml-kit, on-device, flutter, rag, privacy, mobile]
---

## Overview

Halaman lain di menu ini membahas **bekerja dengan** AI coding agent. Halaman ini membahas **membangun fitur AI di dalam aplikasi**: misalnya scan nota yang mengisi form otomatis, kategorisasi transaksi, ringkasan laporan, pencarian dengan bahasa alami, atau asisten chat untuk pengguna.

Ada dua keluarga teknologi:

- **On-device ML**: model kecil yang berjalan di HP (mis. ML Kit Text Recognition, barcode, face detection). Offline, cepat, gratis per panggilan, data tidak keluar perangkat.
- **Cloud model / LLM**: model besar lewat API dari penyedia AI. Jauh lebih pintar dan fleksibel, tetapi butuh internet, berbayar per penggunaan, dan data dikirim ke server.

## Why It Matters

- Banyak produk menambahkan fitur AI, tetapi sedikit mobile developer yang tahu cara melakukannya dengan **aman, hemat biaya, dan tetap berguna saat AI salah**.
- Kesalahan umum (API key ditanam di app, data sensitif dikirim tanpa persetujuan, tagihan membengkak) bisa merugikan perusahaan.
- Skill ini menggabungkan mobile, backend, keamanan, dan desain produk: kombinasi yang jarang dan dicari.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| On-device inference | Model berjalan di perangkat; offline; terbatas kemampuannya |
| Cloud inference | Model berjalan di server penyedia; dipanggil lewat API |
| Prompt | Instruksi + konteks yang dikirim ke LLM |
| Structured output | Meminta LLM menjawab dalam format JSON sesuai skema, lalu divalidasi |
| Streaming | Respons dikirim bertahap (token per token) agar UI terasa cepat |
| Token | Satuan teks yang dihitung untuk biaya & batas panjang |
| RAG | Retrieval-Augmented Generation: cari dokumen relevan dulu, lalu sertakan sebagai konteks ke LLM |
| Embedding | Representasi vektor teks untuk pencarian berdasarkan makna |
| Hallucination | LLM menghasilkan jawaban yang terdengar benar tetapi salah |
| Guardrail | Batasan dan validasi di sekitar AI (skema, aturan bisnis, filter konten, konfirmasi pengguna) |
| Backend proxy | Server Anda yang memanggil penyedia AI atas nama app; menyimpan API key dan menerapkan aturan |

## How It Works

```text
On-device:   Kamera/gambar → ML Kit (di HP) → teks/hasil → parser aturan bisnis → form terisi → pengguna konfirmasi

Cloud LLM:   App ──(token login pengguna)──▶ Backend proxy
                                            ├─ cek auth, kuota per user/tenant, ukuran input
                                            ├─ hapus/samarkan data sensitif bila perlu
                                            ├─ susun prompt + skema output
                                            └─▶ API penyedia AI (API key HANYA di server)
             App ◀── hasil tervalidasi (atau stream) ── Backend proxy ◀── respons model
             → tampilkan sebagai SARAN → pengguna konfirmasi/edit → simpan
```

Pola penting: **AI memberi saran, aturan bisnis dan pengguna yang memutuskan.** Terutama untuk uang, data hukum, atau medis.

## Implementation

### 1. Memilih on-device atau cloud

| Kebutuhan | Pilihan |
| --- | --- |
| Baca teks dari foto nota, barcode, dokumen terstruktur | On-device (ML Kit) + parser aturan |
| Harus jalan offline, data sangat sensitif | On-device |
| Memahami bahasa bebas, meringkas, mengklasifikasi kategori yang rumit | Cloud LLM |
| Ekstraksi dari dokumen berantakan (nota tulisan tangan, format beragam) | On-device dulu; cloud sebagai fallback bila diizinkan |
| Chat/asisten, pencarian dengan bahasa alami di data perusahaan | Cloud LLM + RAG |

Kombinasi sering paling baik: OCR di perangkat untuk mengambil teks, lalu LLM (opsional) untuk memahami struktur bila aturan sederhana gagal.

### 2. On-device: OCR dengan ML Kit (Flutter)

```dart
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

Future<String> readText(String imagePath) async {
  final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
  try {
    final result = await recognizer.processImage(InputImage.fromFilePath(imagePath));
    return result.text;
  } finally {
    await recognizer.close(); // lepaskan resource native
  }
}
```

Lalu parser aturan bisnis (regex/heuristik) mengambil total, tanggal, dan item, misalnya mengenali "TOTAL", format "12.500", atau singkatan "rb/jt". Hasilnya mengisi form sebagai **draf** yang dikonfirmasi pengguna.

### 3. Cloud LLM lewat backend proxy

**Jangan pernah menaruh API key penyedia AI di aplikasi mobile.** APK/IPA bisa dibongkar dan key dipakai orang lain atas tagihan Anda.

Backend (Node.js/TypeScript), menggunakan `fetch` ke API penyedia (bentuk request disederhanakan; sesuaikan dengan dokumentasi penyedia yang dipakai):

```ts
import { z } from 'zod';

const ReceiptSchema = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(),          // ISO 8601
  totalMinor: z.number().int().nonnegative().nullable(),
  items: z.array(z.object({ name: z.string(), amountMinor: z.number().int() })).max(100),
});

app.post('/ai/receipt-extract', requireAuth, rateLimitPerUser(20, '1h'), async (req, res) => {
  const text = z.string().max(8_000).parse(req.body.ocrText);   // batasi input
  const raw = await callModel({                                   // wrapper ke API penyedia
    system: 'Extract receipt data. Reply ONLY with JSON matching the schema. Use null when unsure.',
    input: text,
    jsonSchema: ReceiptSchema,
    maxOutputTokens: 800,
    timeoutMs: 20_000,
  });
  const parsed = ReceiptSchema.safeParse(raw);                    // jangan percaya output mentah
  if (!parsed.success) return res.status(422).json({ error: 'extraction_failed' });
  res.json(parsed.data);                                          // app menampilkan sebagai draf
});
```

Flutter memanggil endpoint ini seperti REST API biasa, dengan token login pengguna.

### 4. Streaming untuk respons panjang (chat/ringkasan)

```dart
final request = http.Request('POST', Uri.parse('$baseUrl/ai/summary'))
  ..headers.addAll({'Authorization': 'Bearer $token', 'Content-Type': 'application/json'})
  ..body = jsonEncode({'reportId': id});
final response = await client.send(request);
await for (final chunk in response.stream.transform(utf8.decoder)) {
  // backend meneruskan potongan teks (mis. Server-Sent Events); tambahkan ke state BLoC
  add(SummaryChunkReceived(chunk));
}
```

Sediakan tombol batal dan tangani koneksi putus di tengah jalan.

### 5. RAG dasar (jawab dari data perusahaan)

```text
Persiapan: dokumen/FAQ → dipotong (chunk) → embedding → simpan di vector store (mis. pgvector)
Saat bertanya: pertanyaan → embedding → cari chunk paling mirip (filter tenant & izin user!)
            → prompt: "Jawab HANYA dari konteks berikut, sebutkan sumbernya; bila tidak ada, bilang tidak tahu"
            → jawaban + daftar sumber → app menampilkan jawaban beserta tautan sumber
```

Filter **tenant dan hak akses** harus diterapkan saat pencarian, bukan diserahkan ke LLM.

### 6. Biaya, kuota, dan fallback

- Kuota per pengguna/tenant dan batas ukuran input/output di backend.
- Cache hasil untuk input yang sama (mis. hash teks OCR).
- Pilih model terkecil yang cukup untuk tugasnya; model besar hanya bila perlu.
- Timeout + fallback: bila AI gagal, app tetap bisa dipakai secara manual.
- Feature flag (mis. Remote Config) untuk mematikan fitur AI tanpa rilis baru.

### 7. Mengukur kualitas (evaluasi)

Kumpulkan contoh nyata (nota yang sudah disamarkan) beserta jawaban benar, jalankan pipeline AI terhadapnya setiap kali prompt/model diubah, dan ukur akurasi per field (total, tanggal, item). Catat juga seberapa sering pengguna mengoreksi hasil AI sebagai sinyal kualitas di produksi.

## Best Practices

- **API key hanya di server**; app memanggil backend dengan auth pengguna.
- **Validasi output** dengan skema dan aturan bisnis; perlakukan sebagai saran.
- **Pengguna mengonfirmasi** sebelum data AI disimpan, terutama angka uang.
- **On-device dulu** bila cukup; cloud untuk kasus yang benar-benar membutuhkan.
- **Kuota, timeout, cache, feature flag, dan fallback manual.**
- **Transparan ke pengguna**: beri tahu bila fitur memakai AI dan data dikirim ke layanan pihak ketiga; minta persetujuan bila perlu.
- **Evaluasi** dengan kumpulan contoh setiap kali prompt/model berubah.

## Anti-Patterns

- Menanam API key penyedia AI di kode Flutter atau file konfigurasi app.
- Menyimpan hasil AI langsung ke data keuangan tanpa konfirmasi.
- Mengirim seluruh data pelanggan/transaksi ke LLM "supaya pintar".
- Tidak membatasi panjang input atau jumlah panggilan per user (tagihan membengkak).
- Mengandalkan LLM untuk menegakkan izin akses ("jangan tampilkan data tenant lain").
- Fitur inti aplikasi tidak bisa dipakai saat layanan AI gangguan.

## Performance Considerations

On-device: model menambah ukuran app (gunakan model yang diunduh terpisah bila tersedia), jalankan di luar UI thread, perkecil gambar sebelum diproses, dan tutup recognizer setelah selesai. Cloud: latensi beberapa detik adalah hal biasa, jadi gunakan streaming, indikator progres, dan timeout. Cache hasil dan batasi ukuran prompt untuk menekan latensi dan biaya.

## Security Considerations

- **Kebocoran key**: key di app = key publik. Gunakan backend proxy (atau layanan resmi yang dirancang untuk klien dengan App Check/attestation).
- **Prompt injection**: teks dari pengguna atau dokumen bisa berisi instruksi seperti "abaikan aturan sebelumnya". Jangan biarkan output model langsung menjalankan aksi berisiko; validasi dan batasi aksi yang tersedia.
- **Privasi & UU PDP**: kirim data seminimal mungkin, samarkan data pribadi bila bisa, pahami kebijakan retensi data penyedia, dan dapatkan persetujuan pengguna bila diperlukan.
- **Isolasi tenant**: filter data per tenant sebelum dikirim ke model atau dicari di RAG.
- **Logging**: jangan mencatat prompt/respons berisi data sensitif tanpa penyamaran.

## Real-World Use Cases

- **Aplikasi keuangan:** foto nota → OCR on-device → form pengeluaran terisi otomatis sebagai draf; LLM opsional untuk nota yang formatnya sulit.
- **POS / back office:** ringkasan penjualan harian dalam bahasa alami untuk pemilik usaha, dihasilkan dari angka yang sudah dihitung sistem (bukan dihitung oleh LLM).
- **Aplikasi perusahaan:** asisten tanya-jawab SOP internal dengan RAG dan sumber yang dikutip.

## Interview Questions

1. Kapan Anda memilih ML on-device dibanding LLM di cloud?
2. Bagaimana mengintegrasikan LLM ke aplikasi Flutter dengan aman?
3. Bagaimana menangani jawaban AI yang salah (hallucination)?
4. Apa itu RAG dan kapan dipakai?
5. Bagaimana mengendalikan biaya fitur AI?

## Sample Answers

1. On-device bila tugasnya spesifik (OCR, barcode), harus offline, atau datanya sensitif. Cloud LLM bila butuh pemahaman bahasa bebas, ringkasan, atau penalaran yang tidak sanggup dilakukan model kecil. Sering dikombinasikan: OCR di perangkat lalu LLM sebagai fallback.
2. App tidak pernah memegang API key. App memanggil backend dengan token pengguna; backend memeriksa auth dan kuota, membatasi input, menyusun prompt, memanggil penyedia, memvalidasi output dengan skema, lalu mengembalikan hasil yang ditampilkan sebagai saran untuk dikonfirmasi pengguna.
3. Batasi tugas dan minta structured output, validasi dengan skema dan aturan bisnis, gunakan RAG dengan sumber untuk pertanyaan faktual, minta model menjawab "tidak tahu" bila ragu, dan selalu sediakan konfirmasi/koreksi oleh pengguna untuk data penting.
4. RAG mencari potongan dokumen yang relevan (biasanya dengan embedding) lalu memasukkannya sebagai konteks ke LLM agar jawaban berdasarkan data Anda sendiri. Dipakai untuk tanya-jawab dokumen internal, FAQ, atau data produk; filter hak akses diterapkan saat pencarian.
5. Kuota per pengguna/tenant, batas ukuran input/output, cache hasil, memilih model terkecil yang cukup, on-device untuk tugas sederhana, memantau pemakaian, dan feature flag untuk mematikan fitur bila perlu.

## Practical Exercises

1. Buat fitur scan nota: ML Kit OCR → parser total & tanggal → form draf → konfirmasi pengguna, beserta unit test parser.
2. Buat endpoint backend proxy yang meminta LLM mengekstrak JSON dari teks nota dan memvalidasinya dengan skema.
3. Tambahkan kuota per user dan feature flag untuk mematikan fitur AI.
4. Siapkan 20 contoh nota tersamarkan dan ukur akurasi ekstraksi per field.

## Quick Reference

```text
On-device (ML Kit): offline, privat, gratis per panggilan, terbatas · Cloud LLM: pintar, berbayar, butuh internet
API key HANYA di backend proxy · app → backend (auth, kuota, batas input) → penyedia AI
Structured output + validasi skema · hasil AI = SARAN → pengguna konfirmasi (wajib untuk uang)
RAG: embedding + cari konteks (filter tenant!) → jawab dari konteks + sumber
Biaya: kuota, cache, model terkecil yang cukup · timeout + fallback manual + feature flag
Risiko: key bocor, prompt injection, data pribadi (UU PDP), hallucination
```

## Related Topics

- [AI Coding Workflow](/ai-engineering/guides/ai-coding-workflow/)
- [Firebase Integration](/flutter/firebase-integration/)
- [Secure Token Storage](/security/secure-token-storage/)
- [Money & Financial Calculations](/fundamentals/money-financial-calculations/)
