// ============================================================================
// REGISTRY "AI Agent Instructions" — metadata untuk halaman website.
// Isi instruksi TIDAK ditulis di sini: sumber kebenarannya adalah file Markdown di
// /AGENTS.md dan /docs/agents/** (file yang sama yang Anda salin ke project).
// Tambah file instruksi baru → tambahkan entri di sini → otomatis muncul di sidebar.
// ============================================================================

/**
 * @typedef {{ path: string, label: string, target: string }} AgentFile
 *   path   = lokasi file di repo knowledge base ini
 *   target = lokasi yang disarankan di project Anda
 * @typedef {{ slug: string, group: 'core'|'domain'|'template', title: string, summary: string,
 *   when: string[], files: AgentFile[], related: string[], routingRow?: string, prompt?: string }} AgentDoc
 */

/** @type {AgentDoc[]} */
export const AGENT_DOCS = [
  // ------------------------------------------------------------------ core
  {
    slug: 'readme', group: 'core', title: 'Index & Cara Kerja',
    summary: 'Peta seluruh rule library: struktur hierarki, cara agent memuat hanya aturan yang relevan, kompatibilitas tool, dan cara mengadopsi ke project.',
    when: [
      'Pertama kali memakai rule library ini — baca ini dulu.',
      'Saat menjelaskan ke tim bagaimana AGENTS.md diorganisasi.',
    ],
    files: [{ path: 'docs/agents/README.md', label: 'docs/agents/README.md', target: 'docs/agents/README.md' }],
    related: ['global', 'shims', 'template-flutter-app'],
  },
  {
    slug: 'global', group: 'core', title: 'AGENTS.md — Global Engineering Standards',
    summary: 'Aturan yang berlaku untuk semua project dan semua bahasa: working agreement agent, routing ke aturan domain, 12 standar engineering, Definition of Done, dan code review checklist.',
    when: [
      'Selalu — setiap project yang dikerjakan dengan AI agent.',
      'Di repo ini file ini adalah /AGENTS.md. Di project Anda, simpan sebagai docs/agents/global/AGENTS.md dan biarkan root AGENTS.md (dari template) merujuknya.',
    ],
    files: [{ path: 'AGENTS.md', label: 'AGENTS.md (global)', target: 'docs/agents/global/AGENTS.md' }],
    related: ['readme', 'security', 'testing', 'architecture'],
    prompt: 'Read AGENTS.md and docs/agents/global/AGENTS.md. Summarize the rules you will follow for this task, then propose a plan.',
  },
  {
    slug: 'shims', group: 'core', title: 'Shim: CLAUDE.md & Copilot',
    summary: 'File penghubung untuk tool yang membaca nama file instruksinya sendiri, agar semua agent tetap memakai satu sumber aturan (AGENTS.md).',
    when: [
      'Tim memakai Claude Code (membaca CLAUDE.md) atau GitHub Copilot (membaca .github/copilot-instructions.md).',
      'Ingin menghindari dua versi aturan yang berbeda per tool.',
    ],
    files: [
      { path: 'docs/agents/shims/CLAUDE.md', label: 'CLAUDE.md', target: 'CLAUDE.md' },
      { path: 'docs/agents/shims/copilot-instructions.md', label: 'copilot-instructions.md', target: '.github/copilot-instructions.md' },
    ],
    related: ['readme', 'global'],
  },
  // ------------------------------------------------------------------ domain
  {
    slug: 'flutter', group: 'domain', title: 'Flutter & Dart Rules',
    summary: 'Clean Architecture feature-first, Bloc/Cubit, error mapping, offline-first, keamanan token, performa widget, testing, DoD, dan checklist review untuk kode Dart/Flutter.',
    when: ['Setiap tugas yang mengubah *.dart, pubspec.yaml, atau analysis_options.yaml.'],
    files: [{ path: 'docs/agents/flutter/AGENTS.md', label: 'flutter/AGENTS.md', target: 'docs/agents/flutter/AGENTS.md' }],
    related: ['android', 'security', 'testing', 'template-flutter-app'],
    routingRow: '| Dart / Flutter code | `docs/agents/flutter/AGENTS.md` |',
  },
  {
    slug: 'android', group: 'domain', title: 'Kotlin & Android Native Rules',
    summary: 'Unidirectional data flow, Compose, ViewModel + StateFlow, coroutines, Hilt, Room migration, WorkManager, keamanan komponen Android, dan platform channel.',
    when: [
      'Tugas yang mengubah *.kt, Gradle, atau AndroidManifest.xml.',
      'Bagian Android dari plugin/platform channel di project Flutter.',
    ],
    files: [{ path: 'docs/agents/android/AGENTS.md', label: 'android/AGENTS.md', target: 'docs/agents/android/AGENTS.md' }],
    related: ['flutter', 'database', 'template-android-app'],
    routingRow: '| Kotlin / Android native | `docs/agents/android/AGENTS.md` |',
  },
  {
    slug: 'backend', group: 'domain', title: 'Node.js & TypeScript Backend Rules',
    summary: 'Layer controller → service → repository, contract-first API, Problem Details, idempotency, background job, graceful shutdown, dan keamanan API.',
    when: ['Tugas pada server TypeScript: endpoint, service, job, konfigurasi, kontrak OpenAPI.'],
    files: [{ path: 'docs/agents/backend/AGENTS.md', label: 'backend/AGENTS.md', target: 'docs/agents/backend/AGENTS.md' }],
    related: ['database', 'security', 'testing', 'template-nodejs-backend'],
    routingRow: '| Node.js / TypeScript backend | `docs/agents/backend/AGENTS.md` |',
  },
  {
    slug: 'database', group: 'domain', title: 'SQL & Database Rules',
    summary: 'Desain schema, constraint, migrasi aman (expand/contract, CONCURRENTLY, lock_timeout), query berparameter, indexing, transaksi & concurrency, data sensitif.',
    when: ['Tugas yang menyentuh migrasi, query SQL, repository/DAO, ORM model, atau seed data.'],
    files: [{ path: 'docs/agents/database/AGENTS.md', label: 'database/AGENTS.md', target: 'docs/agents/database/AGENTS.md' }],
    related: ['backend', 'template-postgresql', 'security'],
    routingRow: '| SQL, migrations, queries | `docs/agents/database/AGENTS.md` |',
  },
  {
    slug: 'devops', group: 'domain', title: 'Docker, CI/CD & Deployment Rules',
    summary: 'Build once deploy many, Dockerfile multi-stage non-root, pipeline least-privilege dengan action dipin, environment & secrets, rollback, observability.',
    when: ['Tugas pada Dockerfile, compose, workflow CI/CD, script deploy, signing/release mobile.'],
    files: [{ path: 'docs/agents/devops/AGENTS.md', label: 'devops/AGENTS.md', target: 'docs/agents/devops/AGENTS.md' }],
    related: ['security', 'template-production-ready'],
    routingRow: '| Docker, CI/CD, deploy | `docs/agents/devops/AGENTS.md` |',
  },
  {
    slug: 'security', group: 'domain', title: 'Application Security Requirements',
    summary: 'Aturan lintas domain: validasi input, otorisasi fungsi & objek (BOLA), secrets, token & sesi, proteksi data, web/API hardening, dan perilaku aman agent (prompt injection, perintah destruktif).',
    when: [
      'SELALU dimuat tambahan saat tugas menyentuh auth, token, secrets, input user, file upload, pembayaran, atau data pribadi.',
    ],
    files: [{ path: 'docs/agents/security/AGENTS.md', label: 'security/AGENTS.md', target: 'docs/agents/security/AGENTS.md' }],
    related: ['global', 'backend', 'flutter'],
    routingRow: '| Auth, tokens, secrets, input, personal data | `docs/agents/security/AGENTS.md` (always, in addition) |',
  },
  {
    slug: 'testing', group: 'domain', title: 'Testing & QA Rules',
    summary: 'Test pyramid, test minimum per jenis perubahan, fake vs mock, determinisme, regression test, dan larangan melemahkan test agar CI hijau.',
    when: ['Hampir setiap perubahan perilaku; juga saat mengubah tooling atau struktur test.'],
    files: [{ path: 'docs/agents/testing/AGENTS.md', label: 'testing/AGENTS.md', target: 'docs/agents/testing/AGENTS.md' }],
    related: ['global', 'flutter', 'backend', 'android'],
    routingRow: '| Tests | `docs/agents/testing/AGENTS.md` |',
  },
  {
    slug: 'architecture', group: 'domain', title: 'Architecture & System Design Rules',
    summary: 'Dependency rule, modular monolith dulu, contract-first, outbox & idempotency, offline-first, resiliensi, observability, dan ADR untuk keputusan penting.',
    when: ['Membuat fitur/modul baru, mengubah batas modul, menambah infrastruktur (queue, cache, service), atau integrasi sistem luar.'],
    files: [{ path: 'docs/agents/architecture/AGENTS.md', label: 'architecture/AGENTS.md', target: 'docs/agents/architecture/AGENTS.md' }],
    related: ['global', 'template-fullstack', 'template-production-ready'],
    routingRow: '| New module, integration, data flow | `docs/agents/architecture/AGENTS.md` |',
  },
  // ------------------------------------------------------------------ templates
  {
    slug: 'template-flutter-app', group: 'template', title: 'Template: Flutter Application',
    summary: 'Root AGENTS.md siap isi untuk aplikasi Flutter (Clean Architecture, Bloc, Dio, Drift) + daftar file aturan yang perlu disalin.',
    when: ['Memulai atau merapikan project Flutter yang akan dikerjakan bersama AI agent.'],
    files: [
      { path: 'docs/agents/templates/flutter-app/README.md', label: 'README (panduan template)', target: '(dibaca saja)' },
      { path: 'docs/agents/templates/flutter-app/AGENTS.md', label: 'AGENTS.md (root project)', target: 'AGENTS.md' },
    ],
    related: ['flutter', 'security', 'testing', 'shims'],
  },
  {
    slug: 'template-android-app', group: 'template', title: 'Template: Kotlin Android Application',
    summary: 'Root AGENTS.md untuk aplikasi Android native multi-module (app, core, feature) dengan Compose, Hilt, Room.',
    when: ['Project Android native baru atau yang sudah berjalan.'],
    files: [
      { path: 'docs/agents/templates/android-app/README.md', label: 'README (panduan template)', target: '(dibaca saja)' },
      { path: 'docs/agents/templates/android-app/AGENTS.md', label: 'AGENTS.md (root project)', target: 'AGENTS.md' },
    ],
    related: ['android', 'database', 'testing'],
  },
  {
    slug: 'template-nodejs-backend', group: 'template', title: 'Template: Node.js / TypeScript Backend',
    summary: 'Root AGENTS.md untuk REST API modular monolith dengan PostgreSQL, Redis, BullMQ, kontrak OpenAPI.',
    when: ['Membangun backend API untuk aplikasi mobile/web.'],
    files: [
      { path: 'docs/agents/templates/nodejs-backend/README.md', label: 'README (panduan template)', target: '(dibaca saja)' },
      { path: 'docs/agents/templates/nodejs-backend/AGENTS.md', label: 'AGENTS.md (root project)', target: 'AGENTS.md' },
    ],
    related: ['backend', 'database', 'template-postgresql', 'devops'],
  },
  {
    slug: 'template-postgresql', group: 'template', title: 'Template: PostgreSQL Database',
    summary: 'AGENTS.md level folder untuk db/ (migrasi, seed, SQL) beserta contoh data classification dan skeleton migrasi aman.',
    when: ['Project yang memiliki schema PostgreSQL sendiri — dipakai sebagai db/AGENTS.md.'],
    files: [
      { path: 'docs/agents/templates/postgresql/README.md', label: 'README (panduan template)', target: '(dibaca saja)' },
      { path: 'docs/agents/templates/postgresql/AGENTS.md', label: 'db/AGENTS.md', target: 'db/AGENTS.md' },
    ],
    related: ['database', 'template-nodejs-backend'],
  },
  {
    slug: 'template-fullstack', group: 'template', title: 'Template: Full-Stack Monorepo',
    summary: 'Root AGENTS.md untuk monorepo Flutter + Node.js + PostgreSQL: contract-first, kompatibilitas versi app, urutan deploy lintas paket.',
    when: ['Satu repo berisi mobile, backend, kontrak API, dan infrastruktur.'],
    files: [
      { path: 'docs/agents/templates/fullstack/README.md', label: 'README (panduan template)', target: '(dibaca saja)' },
      { path: 'docs/agents/templates/fullstack/AGENTS.md', label: 'AGENTS.md (root monorepo)', target: 'AGENTS.md' },
    ],
    related: ['template-flutter-app', 'template-nodejs-backend', 'template-postgresql', 'architecture'],
  },
  {
    slug: 'template-production-ready', group: 'template', title: 'Template: Production-Ready Overlay',
    summary: 'Lapisan tambahan untuk aplikasi yang melayani user nyata: SLO, observability, feature flag, rollback, backup, privasi data.',
    when: ['Aplikasi akan/sudah rilis ke production — digabung dengan template stack mana pun.'],
    files: [
      { path: 'docs/agents/templates/production-ready/README.md', label: 'README (panduan template)', target: '(dibaca saja)' },
      { path: 'docs/agents/templates/production-ready/AGENTS.md', label: 'production/AGENTS.md', target: 'docs/agents/production/AGENTS.md' },
    ],
    related: ['devops', 'security', 'architecture'],
  },
];

export const AGENT_GROUPS = {
  core: 'Inti',
  domain: 'Aturan per Domain',
  template: 'Template Project',
};

export const agentDoc = (slug) => AGENT_DOCS.find((d) => d.slug === slug);

/** Sidebar group untuk astro.config */
export function agentSidebar() {
  const link = (d) => ({ label: d.title.replace(/^Template: /, '').replace(/^AGENTS\.md — /, ''), link: `/agent-instructions/${d.slug}/` });
  return {
    label: 'AI Agent Instructions',
    items: [
      { label: 'Overview', link: '/agent-instructions/' },
      ...Object.entries(AGENT_GROUPS).map(([g, label]) => ({
        label, collapsed: g !== 'core', items: AGENT_DOCS.filter((d) => d.group === g).map(link),
      })),
    ],
  };
}
