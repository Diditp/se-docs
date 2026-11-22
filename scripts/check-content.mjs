// Validasi konten: file untuk setiap topik, referensi topik di questions.json,
// dan kelengkapan 15 section pada halaman berstatus complete.
//   npm run check
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allTopics } from '../src/data/catalog.mjs';
import { AGENT_DOCS } from '../src/data/agents.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', 'src', 'content', 'docs');
const questions = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'questions.json'), 'utf8'));
const REQUIRED = ['Overview', 'Why It Matters', 'Core Concepts', 'How It Works', 'Implementation', 'Best Practices',
  'Anti-Patterns', 'Performance Considerations', 'Security Considerations', 'Real-World Use Cases',
  'Interview Questions', 'Sample Answers', 'Practical Exercises', 'Quick Reference', 'Related Topics'];

const errors = [];
const warns = [];
const topics = allTopics();
const slugs = new Set(topics.map((t) => t.slug));
const stats = { complete: 0, draft: 0, stub: 0, template: 0 };

for (const t of topics) {
  const file = [join(docs, t.slug + '.md'), join(docs, t.slug + '.mdx')].find(existsSync);
  if (!file) { errors.push(`Topik tanpa file: ${t.slug} (jalankan npm run stubs)`); continue; }
  const src = readFileSync(file, 'utf8');
  const status = /^status:\s*(\w+)/m.exec(src)?.[1] ?? 'complete';
  stats[status] = (stats[status] ?? 0) + 1;
  if (status === 'complete' && !t.slug.includes('/templates/')) {
    const missing = REQUIRED.filter((h) => !new RegExp(`^## ${h}\\s*$`, 'm').test(src));
    if (missing.length) warns.push(`${t.slug}: section hilang → ${missing.join(', ')}`);
  }
}

const ids = new Set();
for (const q of questions) {
  if (ids.has(q.id)) errors.push(`ID pertanyaan duplikat: ${q.id}`);
  ids.add(q.id);
  if (!slugs.has(q.topic)) errors.push(`Pertanyaan ${q.id} merujuk topik tak dikenal: ${q.topic}`);
  if (q.options && (q.correct == null || q.correct >= q.options.length)) errors.push(`Pertanyaan ${q.id}: index jawaban tidak valid`);
}


// ---- AI Agent Instructions: file ada & setiap AGENTS.md punya 12 section wajib
const AGENT_SECTIONS = ['Coding Standards', 'Project Structure', 'Architecture & Design Principles', 'Naming Conventions',
  'Dependency Management', 'Error Handling', 'Testing Requirements', 'Security Requirements',
  'Performance Considerations', 'Anti-Patterns to Avoid', 'Definition of Done', 'Code Review Checklist'];
const repo = join(here, '..');
let agentFiles = 0;
for (const d of AGENT_DOCS) {
  for (const f of d.files) {
    const abs = join(repo, f.path);
    if (!existsSync(abs)) { errors.push(`Agent doc ${d.slug}: file tidak ada ${f.path}`); continue; }
    agentFiles++;
    if (!f.path.endsWith('AGENTS.md')) continue;
    const src = readFileSync(abs, 'utf8');
    const missing = AGENT_SECTIONS.filter((h, i) => !new RegExp(`^## ${i + 1}\\. ${h.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}`, 'm').test(src));
    if (missing.length) errors.push(`${f.path}: section wajib hilang → ${missing.join(', ')}`);
  }
  for (const r of d.related) if (!AGENT_DOCS.some((x) => x.slug === r)) errors.push(`Agent doc ${d.slug}: related tak dikenal ${r}`);
}
console.log(`Agent instructions: ${AGENT_DOCS.length} halaman, ${agentFiles} file`);

console.log(`Topik: ${topics.length} | complete ${stats.complete} | draft ${stats.draft} | stub ${stats.stub}`);
console.log(`Pertanyaan: ${questions.length} (${questions.filter((q) => q.options).length} pilihan ganda)`);
warns.forEach((w) => console.warn('⚠ ' + w));
errors.forEach((e) => console.error('✗ ' + e));
process.exit(errors.length ? 1 : 0);
