# AGENTS.md — Website Source (Astro Starlight)

> Aturan khusus untuk kode website di `src/`. Aturan engineering global ada di `/AGENTS.md`; aturan per domain di `/docs/agents/`.

## Overview
Situs dokumentasi pribadi berbahasa Indonesia (istilah teknis tetap bahasa Inggris). Astro + Starlight, konten Markdown/MDX.
Fitur belajar (progress, bookmark, catatan, flashcards, quiz) berjalan di client dengan `localStorage` (`src/scripts/store.ts`).

## Commands
- Install: `npm install` · Dev: `npm run dev` · Build: `npm run build`
- Stub topik baru: `npm run stubs` (tidak menimpa file yang ada)
- Validasi konten: `npm run check` → harus exit 0

## Content Rules (WAJIB)
- Daftar topik HANYA diubah di `src/data/catalog.mjs`; sidebar dibangun dari sana. Jangan menulis sidebar manual di `astro.config.mjs`.
- Menu **AI Agent Instructions** dibangun dari `src/data/agents.mjs` (metadata) + file asli `/AGENTS.md` dan `/docs/agents/**` (isi). Jangan menyalin isi aturan ke halaman website — edit file Markdown sumbernya.
- Setiap `AGENTS.md` di `/docs/agents/` wajib memiliki 12 section bernomor (dicek `npm run check`). Saat menambah teknologi/standar baru di materi belajar, evaluasi apakah file aturan terkait perlu diperbarui.
- Setiap halaman materi memakai 15 section dengan heading `##` persis dan urutan tetap:
  Overview, Why It Matters, Core Concepts, How It Works, Implementation, Best Practices, Anti-Patterns,
  Performance Considerations, Security Considerations, Real-World Use Cases, Interview Questions, Sample Answers,
  Practical Exercises, Quick Reference, Related Topics.
- Frontmatter: `title`, `description`, `level` (beginner|intermediate|advanced), `status` (stub|draft|complete), `updated` (YYYY-MM-DD); `version` wajib untuk materi yang bergantung versi.
- Setiap best practice disertai alasan; setiap keputusan teknis disertai trade-off dan kapan TIDAK dipakai.
- Contoh kode harus benar, modern, dan dapat dijalankan; jangan menulis API yang tidak Anda yakini ada — tandai `:::caution[Version-dependent]` bila perlu.
- Klaim spesifik teknologi merujuk dokumentasi resmi di Related Topics.
- Materi interview bersifat umum untuk semua tipe perusahaan dengan fokus mobile engineer; contoh perusahaan spesifik (mis. BUMN/PLN Icon Plus) hanya sebagai ilustrasi di `interview/company-prep/`. DILARANG menulis klaim "soal resmi/bocoran" atau detail rekrutmen yang tidak diverifikasi.
- Link internal memakai path absolut dengan trailing slash: `/database/indexing/`.
- Diagram: gunakan komponen `Mermaid` di file `.mdx` (hapus `.md` stub dengan nama sama).

## Questions Bank
- `src/data/questions.json`: `id` unik (`<prefix>-NNN`), `topic` = path halaman yang ada di katalog, `level` b|i|a.
- Pilihan ganda: `options` + `correct` (index 0-based) + `explain`.

## Code Rules
- Komponen di `src/components/`; override Starlight di `src/components/overrides/`.
- Semua akses `localStorage` melalui `src/scripts/store.ts` (sudah dibungkus try/catch).
- Escape semua teks yang disisipkan ke `innerHTML` dengan `escapeHtml`.
- Gunakan CSS variable Starlight (`--sl-color-*`) agar dark/light mode konsisten.

## Definition of Done
- [ ] `npm run check` lulus tanpa error (warning section hilang hanya boleh untuk status draft)
- [ ] `npm run build` sukses
- [ ] Halaman baru muncul di sidebar dan Dashboard menghitungnya
