---
title: "Technical Interview Practice"
description: "Rencana latihan interview teknis: format sesi yang umum, bank 40 pertanyaan lintas topik dengan poin jawaban, cara latihan mandiri dan berpasangan, serta rubrik penilaian diri."
level: intermediate
status: complete
updated: 2026-11-13
tags: [interview, company-prep, practice, technical-interview]
---

## Overview

Halaman ini adalah **program latihan** untuk interview teknis: bagaimana sesi biasanya berjalan, pertanyaan lintas topik
yang perlu bisa Anda jawab lisan, dan cara mengevaluasi diri. Gunakan bersama [Interview Simulator](/learning/interview-simulator/)
dan [Quiz](/learning/quiz/) di Learning Center.

## Why It Matters

Memahami materi berbeda dengan **mampu menjelaskannya dengan jelas di bawah tekanan waktu**. Latihan lisan yang teratur
memperbaiki struktur jawaban, mengurangi "blank", dan membuat Anda terbiasa menghadapi pertanyaan lanjutan.

## Core Concepts

Format interview teknis yang umum (bisa berbeda per perusahaan/periode — sesuaikan dengan informasi resmi):

| Bagian | Isi | Persiapan |
| --- | --- | --- |
| Perkenalan & pengalaman | Ceritakan diri & proyek | Pitch 60 detik, cerita arsitektur 3 menit |
| Konsep teknis | Tanya-jawab konsep | Bank pertanyaan di bawah |
| Studi kasus / desain | Desain fitur atau sistem | [System Design](/interview/company-prep/system-design/) |
| Coding / SQL | Soal logika atau query | [Coding Test](/interview/coding-test/problem-solving-framework/), [SQL](/interview/coding-test/sql-challenges/) |
| Pertanyaan untuk interviewer | Anda bertanya | 2–3 pertanyaan bermakna |

Rubrik penilaian diri (1–4 per jawaban): **Benar** · **Terstruktur** · **Contoh nyata** · **Trade-off** · **Ringkas**.

## How It Works

Siklus latihan mingguan:

```text
Senin–Jumat: 3 pertanyaan/hari dari bank (rekam jawaban ≤ 2 menit) + 15 menit Review flashcards
Rabu: 1 soal coding + 1 soal SQL dengan timer
Sabtu: mock interview 45 menit (teman / rekam diri) memakai rubrik
Minggu: perbaiki 3 jawaban terlemah, tandai topik lemah di website (⚐)
```

## Implementation

### Bank pertanyaan lintas topik (dengan poin jawaban)

**Fundamental & OOP**

1. Jelaskan 4 pilar OOP. → encapsulation, abstraction, inheritance, polymorphism + contoh kode Anda.
2. Apa itu SOLID? Contoh pelanggaran yang pernah Anda perbaiki. → SRP/OCP dengan cerita konkret.
3. Beda interface dan abstract class. → kontrak murni vs implementasi sebagian; multiple implements.
4. Apa itu dependency injection dan manfaatnya? → testability, loose coupling, composition root.
5. Beda merge dan rebase. → histori, kapan aman memakai rebase.

**Flutter & mobile**

6. Widget, Element, RenderObject? → konfigurasi, instance/posisi, layout & paint.
7. Lifecycle StatefulWidget. → initState → didChangeDependencies → build → … → dispose.
8. Future vs Stream vs Isolate. → satu nilai, banyak nilai, paralelisme CPU.
9. Bloc vs Riverpod/Provider. → event-state vs provider graph; alasan pilihan.
10. Bagaimana app Anda bekerja offline? → DB lokal, outbox, UUID, sync idempotent.
11. Di mana menyimpan token? → secure storage, memori, refresh single-flight.
12. Cara mendiagnosis jank. → profile mode, DevTools, UI vs raster.
13. Activity lifecycle saat rotasi. → destroy & recreate; ViewModel bertahan.
14. Platform channel. → MethodChannel/EventChannel, pigeon, thread.

**Backend & API**

15. Prinsip REST & status code penting. → resource, method, 201/400/401/403/404/409/422.
16. Bagaimana JWT bekerja dan risikonya? → header.payload.signature, expiry, revocation.
17. Apa itu idempotency? → retry aman, Idempotency-Key.
18. Event loop Node.js. → single thread, libuv, jangan blokir.
19. Kapan memakai queue/background job? → pekerjaan lambat, retry, decoupling.
20. Cara menangani error API secara konsisten. → error handler terpusat, Problem Details.

**Database**

21. INNER vs LEFT JOIN. → irisan vs semua kiri.
22. WHERE vs HAVING. → sebelum vs sesudah agregasi.
23. Apa itu index? Kapan merugikan? → B-tree, write overhead.
24. ACID. → empat properti + contoh transfer saldo.
25. Normalisasi 1NF–3NF. → atomik, dependensi parsial, transitif.
26. Mencegah stok minus saat transaksi bersamaan. → update bersyarat, FOR UPDATE, CHECK.

**Jaringan, Linux, cloud, keamanan**

27. Apa yang terjadi saat membuka URL? → DNS, TCP, TLS, HTTP, server, render.
28. TCP vs UDP. → reliable vs cepat; contoh.
29. Hitung host usable /26. → 64 − 2 = 62.
30. Perintah melihat proses di port 3000. → `ss -tulpn`, `lsof -i :3000`.
31. IaaS/PaaS/SaaS. → contoh masing-masing.
32. CIA triad. → confidentiality, integrity, availability.
33. Enkripsi vs hashing vs encoding. → reversible dgn kunci, satu arah, format.
34. Cara mencegah SQL injection & IDOR. → parameterized query; otorisasi per objek.

**DevOps & kualitas**

35. Dockerfile multi-stage, mengapa? → image kecil & aman.
36. Isi pipeline CI. → lint, test, build, scan.
37. Test pyramid. → banyak unit, sedikit E2E.
38. Bagaimana rollback rilis? → deploy tag sebelumnya; staged rollout; migrasi expand/contract.

**Desain & pengalaman**

39. Rancang fitur lapor gangguan (endpoint + tabel). → lihat [API & Database](/interview/company-prep/api-database/).
40. Ceritakan bug production tersulit. → STAR + pencegahan.

### Pertanyaan yang bisa Anda ajukan ke interviewer

- "Seperti apa stack dan proses rilis aplikasi mobile di tim ini?"
- "Apa tantangan teknis terbesar tim dalam 6–12 bulan ke depan?"
- "Bagaimana tim mengukur keberhasilan engineer di tahun pertama?"

## Best Practices

- **Latihan lisan dan direkam**, bukan hanya membaca.
- **Batasi 1–2 menit** per jawaban konsep; detail menyusul jika diminta.
- **Jujur saat tidak tahu**: jelaskan bagaimana Anda akan mencari tahu, atau jawab bagian yang Anda yakini.
- **Ulangi pertanyaan untuk klarifikasi** bila ambigu.
- **Tandai topik lemah** dan ulang lewat Review sampai lancar.

## Anti-Patterns

- Menghafal jawaban kata per kata (terdengar kaku, rapuh terhadap pertanyaan lanjutan).
- Menebak dengan percaya diri saat tidak tahu.
- Hanya berlatih topik yang sudah dikuasai.
- Tidak menyiapkan pertanyaan balik untuk interviewer.

## Performance Considerations

Kelola energi dan waktu: tidur cukup sebelum hari interview, uji perangkat & koneksi untuk interview online 30 menit
sebelumnya, siapkan air minum, catatan singkat (bila diizinkan), dan lingkungan yang tenang.

## Security Considerations

Saat menjelaskan proyek dari pekerjaan sebelumnya, jangan membuka informasi rahasia (kode sumber, data klien, celah
keamanan yang belum ditutup). Gunakan contoh yang disanitasi.

## Real-World Use Cases

- 6 minggu menjelang seleksi: ikuti siklus mingguan di atas.
- Malam sebelum interview: baca *Quick Reference* topik inti & latih pitch 60 detik.
- Setelah interview: catat pertanyaan yang muncul dan jawaban yang kurang, tambahkan ke catatan pribadi.

## Interview Questions

Gunakan 40 pertanyaan di bagian Implementation. Versi acak dengan timer tersedia di [Interview Simulator](/learning/interview-simulator/).

## Sample Answers

Poin jawaban ada di setiap pertanyaan di atas; jawaban lengkap tersedia di halaman materi yang ditautkan dan di bank
pertanyaan website (Flashcards/Quiz/Simulator).

## Practical Exercises

1. Pilih 10 pertanyaan acak, rekam jawaban, nilai dengan rubrik (Benar · Terstruktur · Contoh · Trade-off · Ringkas).
2. Lakukan mock interview 45 menit dengan teman: 10 menit pengalaman, 20 menit konsep, 15 menit desain/SQL.
3. Ulangi pertanyaan dengan skor terendah 3 hari kemudian.

## Quick Reference

```text
Format: pengalaman → konsep → desain/kasus → coding/SQL → pertanyaan Anda
Jawaban ≤ 2 menit: definisi → cara kerja → contoh nyata → trade-off
Rubrik: Benar · Terstruktur · Contoh nyata · Trade-off · Ringkas
Latihan harian 3 pertanyaan + mock mingguan + Review topik lemah
```

## Related Topics

- [Strategi Persiapan Interview](/interview/company-prep/overview/)
- [Interview Simulator](/learning/interview-simulator/)
- [STAR Method](/interview/behavioral/star-method/)
- [Problem Solving Framework](/interview/coding-test/problem-solving-framework/)
