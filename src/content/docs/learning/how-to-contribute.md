---
title: Cara Menulis & Menambah Materi
description: Standar format halaman, frontmatter, alur menambah topik baru, dan checklist kualitas materi.
trackable: false
updated: 2026-11-07
---

Website ini adalah dokumentasi jangka panjang. Halaman ini adalah **kontrak kualitas** yang berlaku untuk setiap materi.

## Menambah topik baru

1. Tambahkan entri di `src/data/catalog.mjs` pada domain yang sesuai: `['slug-topik', 'Judul Topik', 'i']`.
2. Jalankan `npm run stubs` — file stub dengan 15 section dibuat otomatis (file lama tidak ditimpa).
3. Isi materi, ubah frontmatter `status: stub` menjadi `draft` lalu `complete`, dan perbarui `updated`.
4. Tambahkan 2–5 pertanyaan ke `src/data/questions.json` dengan `topic` = path halaman.
5. Jalankan `npm run check` lalu `npm run build`.

## Frontmatter

```yaml
---
title: "Async Programming: Future, Stream & Isolate"
description: "Satu kalimat ringkasan — dipakai untuk SEO dan hasil pencarian."
level: intermediate          # beginner | intermediate | advanced
status: complete             # stub | draft | complete
version: "Dart 3.x / Flutter 3.x"   # wajib untuk materi yang bergantung versi
updated: 2026-11-07
tags: [dart, async, isolate]
---
```

## Struktur 15 section (wajib, urutan tetap)

| # | Section | Pertanyaan yang dijawab |
| --- | --- | --- |
| 1 | Overview | Apa itu? |
| 2 | Why It Matters | Masalah apa yang diselesaikan? |
| 3 | Core Concepts | Istilah fundamental apa yang wajib dipahami? |
| 4 | How It Works | Bagaimana cara kerjanya secara internal? |
| 5 | Implementation | Bagaimana mengimplementasikannya (kode nyata)? |
| 6 | Best Practices | Apa yang direkomendasikan **dan mengapa**? |
| 7 | Anti-Patterns | Apa yang harus dihindari? |
| 8 | Performance Considerations | Apa dampaknya terhadap performa? |
| 9 | Security Considerations | Apa risikonya? |
| 10 | Real-World Use Cases | Di mana dipakai di aplikasi produksi? |
| 11 | Interview Questions | Apa yang biasa ditanyakan? |
| 12 | Sample Answers | Bagaimana menjawabnya dengan ringkas dan tepat? |
| 13 | Practical Exercises | Bagaimana melatihnya? |
| 14 | Quick Reference | Ringkasan 1 menit |
| 15 | Related Topics | Topik terkait |

## Checklist kualitas sebelum `status: complete`

- [ ] Menjawab tiga pertanyaan: **apa** yang harus diketahui, **bagaimana** mengimplementasikan, **kapan & mengapa** dipakai.
- [ ] Setiap best practice disertai alasan; setiap keputusan disertai trade-off dan *kapan sebaiknya dihindari*.
- [ ] Kode dapat dijalankan, memakai API modern, tanpa secret asli.
- [ ] Materi yang bergantung versi diberi `version` dan catatan `:::caution[Version-dependent]`.
- [ ] Merujuk dokumentasi resmi untuk klaim spesifik teknologi.
- [ ] Bahasa Indonesia yang jelas; istilah teknis tetap bahasa Inggris bila lebih tepat.
- [ ] Ada minimal 5 interview question bertingkat + sample answer.

## Komponen yang tersedia

- **Callout:** `:::note`, `:::tip`, `:::caution`, `:::danger` (bawaan Starlight).
- **Diagram:** di file `.mdx`, `import Mermaid from '@components/Mermaid.astro'` lalu ``<Mermaid code={`flowchart LR\n A-->B`} />``.
- **Tabs / Cards / Steps:** `import { Tabs, TabItem, Steps } from '@astrojs/starlight/components'`.
- **Jawaban tersembunyi:** gunakan `<details><summary>Jawaban</summary>…</details>` untuk latihan.
