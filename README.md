# Software Engineering Knowledge Base

Personal handbook untuk belajar, review berkala, dan persiapan interview — Flutter (primary), Android/Kotlin,
Node.js, Database, System Design, DevOps, Security, Testing, Interview Prep (termasuk PLN Icon Plus), dan AI Agents.

> Build knowledge once, document it properly, review it regularly, and apply it in real projects.

Dibangun dengan [Astro Starlight](https://starlight.astro.build): sidebar, pencarian (Pagefind), TOC, dark/light mode,
syntax highlighting + copy button, responsive.

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:4321 (stub topik dibuat otomatis lewat predev)
npm run build      # output statis di dist/
npm run preview
```

Butuh Node.js 22 LTS atau lebih baru.

## Fitur belajar

Semua tersimpan di `localStorage` browser (gunakan **Export/Import JSON** di Dashboard untuk backup):

- Dashboard: progress per domain, streak, weekly activity, continue learning, bookmarks, weak topics, random question
- Tombol per halaman: ✓ Tandai dipelajari · ☆ Bookmark · ⚐ Topik lemah · Catatan pribadi · Self-assessment
- Flashcards (Leitner spaced repetition), Quiz pilihan ganda, Interview Simulator (timer), Daily/Weekly Review

## Struktur

```
src/data/catalog.mjs        # SUMBER KEBENARAN daftar topik → sidebar, dashboard, progress
src/data/questions.json     # bank pertanyaan (flashcards, quiz, simulator)
src/content/docs/<domain>/  # materi (.md / .mdx)
src/components/             # Dashboard, Practice, TopicList, Mermaid, overrides Starlight
scripts/generate-stubs.mjs  # npm run stubs → buat stub 15-section untuk topik baru
scripts/check-content.mjs   # npm run check → validasi katalog, pertanyaan, kelengkapan section
```

## Menambah materi

1. Tambah topik di `src/data/catalog.mjs`.
2. `npm run stubs` → file stub dengan 15 section standar.
3. Tulis materi; ubah `status: stub` → `draft` → `complete`; perbarui `updated`.
4. Tambah pertanyaan di `src/data/questions.json`.
5. `npm run check && npm run build`.

Panduan lengkap ada di halaman **Learning Center → Cara Menulis & Menambah Materi**.

## Deploy

Output `dist/` adalah situs statis — bisa di-deploy ke Netlify, Vercel, Cloudflare Pages, atau GitHub Pages.
Ubah `site` di `astro.config.mjs` ke domain Anda.
