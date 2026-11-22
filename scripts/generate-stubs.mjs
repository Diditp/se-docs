// Membuat file stub untuk setiap topik di src/data/catalog.mjs yang belum ada.
// File yang SUDAH ada TIDAK akan ditimpa — aman dijalankan berulang kali.
//   npm run stubs
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAINS, LEVELS } from '../src/data/catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'docs');
const LEVEL_KEY = { b: 'beginner', i: 'intermediate', a: 'advanced' };
const today = new Date().toISOString().slice(0, 10);
let created = 0;

function write(path, content) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  created++;
  console.log('  + ' + path.replace(root, 'src/content/docs'));
}

const SECTIONS = [
  ['Overview', 'Apa itu konsep/teknologi ini? Definisikan dalam 2–3 kalimat.'],
  ['Why It Matters', 'Masalah apa yang diselesaikan? Apa akibatnya jika diabaikan?'],
  ['Core Concepts', 'Istilah dan konsep fundamental yang wajib dipahami.'],
  ['How It Works', 'Cara kerja internal. Tambahkan diagram jika membantu.'],
  ['Implementation', 'Contoh kode nyata, modern, dan siap dicoba.'],
  ['Best Practices', 'Praktik yang direkomendasikan — selalu sertakan ALASANNYA.'],
  ['Anti-Patterns', 'Kesalahan umum dan implementasi yang harus dihindari.'],
  ['Performance Considerations', 'Dampak terhadap performa dan cara mengukurnya.'],
  ['Security Considerations', 'Risiko keamanan dan mitigasinya.'],
  ['Real-World Use Cases', 'Contoh penerapan pada aplikasi produksi (POS, e-commerce, dsb).'],
  ['Interview Questions', 'Pertanyaan dari fundamental hingga advanced.'],
  ['Sample Answers', 'Jawaban ringkas tetapi tepat untuk pertanyaan di atas.'],
  ['Practical Exercises', 'Latihan implementasi bertahap.'],
  ['Quick Reference', 'Ringkasan untuk dibaca ulang dalam 1 menit.'],
  ['Related Topics', 'Tautan ke topik terkait.'],
];

function stub(title, level, domain) {
  const body = SECTIONS.map(([h, hint]) => `## ${h}\n\n> TODO — ${hint}\n`).join('\n');
  return `---
title: "${title.replace(/"/g, '\\"')}"
description: "${title.replace(/"/g, '\\"')} — ${domain.short}."
level: ${LEVEL_KEY[level]}
status: stub
updated: ${today}
---

:::note[Materi belum ditulis]
Halaman ini adalah **stub** dengan struktur 15 bagian standar. Isi bertahap mengikuti
[panduan kontribusi](/learning/how-to-contribute/). Level target: **${LEVELS[level]}**.
:::

${body}`;
}

function domainIndex(d) {
  return `---
title: "${d.num} — ${d.title}"
description: "${d.description}"
trackable: false
---

import TopicList from '@components/TopicList.astro';

${d.description}

<TopicList domain="${d.id}" />
`;
}

for (const d of DOMAINS) {
  write(join(root, d.dir, 'index.mdx'), domainIndex(d));
  const groups = d.groups ?? [{ dir: '', topics: d.topics }];
  for (const g of groups) {
    for (const [slug, title, level] of g.topics) {
      const base = join(root, d.dir, g.dir, slug);
      if (existsSync(base + '.md') || existsSync(base + '.mdx')) continue;
      write(base + '.md', stub(title, level, d));
    }
  }
}
console.log(`\nSelesai. ${created} file baru dibuat.`);
