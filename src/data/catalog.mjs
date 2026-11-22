// ============================================================================
// KATALOG TOPIK — single source of truth untuk sidebar, dashboard, progress,
// dan generator stub (scripts/generate-stubs.mjs).
//
// Format topik: [slug, judul, level]
//   level: 'b' = Beginner, 'i' = Intermediate, 'a' = Advanced
// Tambah topik baru di sini, lalu jalankan `npm run stubs` untuk membuat file.
// ============================================================================

import { agentSidebar } from './agents.mjs';

export const LEVELS = { b: 'Beginner', i: 'Intermediate', a: 'Advanced' };

/** @typedef {[string, string, 'b'|'i'|'a']} Topic */
/** @typedef {{ label: string, dir: string, topics: Topic[] }} Group */
/** @typedef {{ id: string, num: string, dir: string, title: string, short: string, icon: string, description: string, core?: boolean, topics?: Topic[], groups?: Group[] }} Domain */

/** @type {Domain[]} */
export const DOMAINS = [
  {
    id: 'fundamentals', num: '01', dir: 'fundamentals', icon: 'puzzle',
    title: 'Software Engineering Fundamentals', short: 'Fundamentals',
    description: 'SDLC, requirement, OOP, SOLID, clean code, design patterns, Git, dan cara kerja tim engineering.',
    core: true,
    topics: [
      ['sdlc', 'Software Development Life Cycle (SDLC)', 'b'],
      ['requirement-analysis', 'Requirement Analysis', 'b'],
      ['functional-non-functional-requirements', 'Functional & Non-Functional Requirements', 'b'],
      ['oop', 'Object-Oriented Programming (OOP)', 'b'],
      ['solid-principles', 'SOLID Principles', 'i'],
      ['clean-code', 'Clean Code & Code Readability', 'b'],
      ['design-patterns', 'Design Patterns', 'i'],
      ['refactoring', 'Refactoring', 'i'],
      ['git-workflow', 'Git & Git Workflow', 'b'],
      ['agile-scrum-code-review', 'Agile, Scrum & Code Review', 'b'],
      ['software-architecture-fundamentals', 'Software Architecture Fundamentals', 'i'],
      ['common-engineering-mistakes', 'Common Engineering Mistakes', 'i'],
      ['money-financial-calculations', 'Money & Financial Calculations', 'i'],
    ],
  },
  {
    id: 'flutter', num: '02', dir: 'flutter', icon: 'seti:dart',
    title: 'Flutter & Dart Engineering', short: 'Flutter & Dart',
    description: 'Primary expertise: Dart, state management, arsitektur, offline-first, testing, performa, dan release.',
    core: true,
    topics: [
      ['dart-fundamentals', 'Dart Fundamentals hingga Advanced', 'b'],
      ['null-safety-generics-extensions', 'Null Safety, Generics & Extensions', 'i'],
      ['async-programming', 'Async Programming: Future, Stream & Isolate', 'i'],
      ['state-management', 'State Management: Provider, Riverpod & Bloc', 'i'],
      ['clean-architecture', 'Clean Architecture di Flutter', 'i'],
      ['feature-first-architecture', 'Feature-First Architecture', 'i'],
      ['repository-pattern-di', 'Repository Pattern & Dependency Injection', 'i'],
      ['widget-lifecycle', 'Widget Lifecycle', 'b'],
      ['navigation-routing', 'Navigation & Routing', 'i'],
      ['rest-api-integration', 'REST API Integration', 'i'],
      ['local-database', 'Local Database: SQLite, Drift & Hive', 'i'],
      ['offline-first', 'Offline-First Application', 'a'],
      ['data-sync-conflict-resolution', 'Data Synchronization & Conflict Resolution', 'a'],
      ['firebase-integration', 'Firebase Integration', 'i'],
      ['maps-location', 'Maps & Location Services', 'i'],
      ['push-notifications', 'Push Notifications', 'i'],
      ['background-processing', 'Background Processing', 'a'],
      ['testing', 'Unit, Widget & Integration Testing', 'i'],
      ['error-handling', 'Error Handling', 'i'],
      ['memory-management', 'Memory Management', 'a'],
      ['rendering-performance', 'Rendering & Performance Optimization', 'a'],
      ['build-release-deployment', 'Build, Release & Deployment', 'i'],
      ['ota-update', 'OTA Update', 'a'],
      ['security-best-practices', 'Flutter Security Best Practices', 'a'],
      ['cross-platform-comparison', 'Flutter vs React Native vs Native vs KMP', 'i'],
    ],
  },
  {
    id: 'android', num: '03', dir: 'android', icon: 'seti:kotlin',
    title: 'Android Native & Kotlin', short: 'Android & Kotlin',
    description: 'Secondary expertise: Kotlin, coroutines, lifecycle, Jetpack, Compose, dan integrasi dengan Flutter.',
    topics: [
      ['kotlin-fundamentals', 'Kotlin Fundamentals', 'b'],
      ['advanced-kotlin', 'OOP & Advanced Kotlin', 'i'],
      ['coroutines-flow', 'Coroutines & Flow', 'i'],
      ['android-architecture', 'Android Architecture', 'i'],
      ['activity-lifecycle', 'Activity Lifecycle', 'b'],
      ['fragment-lifecycle', 'Fragment Lifecycle', 'i'],
      ['application-lifecycle', 'Android Application & Process Lifecycle', 'i'],
      ['viewmodel-lifecycle-aware', 'ViewModel & Lifecycle-Aware Components', 'i'],
      ['jetpack-compose', 'Jetpack Compose Fundamentals', 'i'],
      ['navigation', 'Navigation', 'i'],
      ['room-database', 'Room Database', 'i'],
      ['workmanager', 'WorkManager', 'i'],
      ['dependency-injection', 'Dependency Injection (Hilt/Koin)', 'i'],
      ['permissions', 'Android Permissions', 'b'],
      ['background-services', 'Background Services', 'a'],
      ['networking', 'Networking (Retrofit/OkHttp/Ktor)', 'i'],
      ['app-security', 'Android App Security', 'a'],
      ['performance-memory', 'Performance & Memory Management', 'a'],
      ['flutter-vs-native', 'Flutter vs Native Android', 'i'],
      ['platform-channels', 'Platform Channels & Native Integration', 'a'],
    ],
  },
  {
    id: 'ios', num: '04', dir: 'ios', icon: 'seti:swift',
    title: 'iOS & Swift Essentials (untuk Flutter Developer)', short: 'iOS & Swift',
    description: 'Dasar Swift dan platform iOS yang dibutuhkan Flutter developer: lifecycle, Info.plist, izin, plugin Swift, APNs, background, Keychain, signing & App Store.',
    topics: [
      ['swift-fundamentals', 'Swift Fundamentals', 'b'],
      ['ios-project-structure', 'Struktur Proyek iOS di Flutter', 'b'],
      ['ios-app-lifecycle', 'iOS App & Scene Lifecycle', 'i'],
      ['ios-permissions-privacy', 'Permission & Privacy di iOS', 'i'],
      ['swift-platform-channels', 'Platform Channel & Pigeon di Swift', 'a'],
      ['apns-push', 'Push Notification: APNs & FCM', 'i'],
      ['ios-background', 'Background Execution di iOS', 'a'],
      ['keychain-security', 'Keychain & iOS App Security', 'i'],
      ['signing-testflight-appstore', 'Signing, TestFlight & App Store', 'i'],
      ['ios-vs-android-gotchas', 'iOS vs Android: Perbedaan yang Sering Menjebak', 'i'],
    ],
  },
  {
    id: 'backend', num: '05', dir: 'backend', icon: 'seti:javascript',
    title: 'Backend Engineering (Node.js)', short: 'Backend Node.js',
    description: 'TypeScript, event loop, REST API, auth, caching, queue, testing, dan production readiness.',
    core: true,
    topics: [
      ['js-ts-fundamentals', 'JavaScript & TypeScript Fundamentals', 'b'],
      ['nodejs-event-loop', 'Node.js Runtime & Event Loop', 'i'],
      ['express-nestjs', 'Express.js vs NestJS', 'i'],
      ['restful-api-design', 'RESTful API Design', 'i'],
      ['api-versioning', 'API Versioning', 'i'],
      ['graphql', 'GraphQL untuk Mobile', 'i'],
      ['authentication-authorization', 'Authentication & Authorization (JWT, OAuth2)', 'i'],
      ['middleware', 'Middleware', 'b'],
      ['validation-error-handling', 'Validation & Error Handling', 'i'],
      ['logging', 'Logging', 'i'],
      ['file-upload', 'File Upload', 'i'],
      ['pagination-filtering-sorting', 'Pagination, Filtering & Sorting', 'i'],
      ['rate-limiting', 'Rate Limiting', 'i'],
      ['caching', 'Caching (Redis)', 'a'],
      ['websocket-realtime', 'WebSocket & Real-Time Communication', 'a'],
      ['background-jobs-queue', 'Background Jobs & Queue', 'a'],
      ['api-documentation', 'API Documentation (OpenAPI)', 'b'],
      ['testing', 'Unit, Integration & API Testing', 'i'],
      ['backend-architecture', 'Backend Architecture', 'a'],
      ['backend-for-mobile', 'Backend Ringan untuk Mobile Developer (BaaS, Serverless, BFF)', 'i'],
      ['production-best-practices', 'Deployment & Production Best Practices', 'a'],
    ],
  },
  {
    id: 'database', num: '06', dir: 'database', icon: 'seti:db',
    title: 'Database Engineering', short: 'Database & SQL',
    description: 'Schema design, relasi, SQL, JOIN, indexing, transaksi, concurrency, dan optimasi query.',
    core: true,
    topics: [
      ['database-fundamentals', 'Database Fundamentals', 'b'],
      ['relational-concepts', 'Relational Database Concepts', 'b'],
      ['postgresql-mysql', 'PostgreSQL vs MySQL', 'i'],
      ['schema-design', 'Database Schema Design', 'i'],
      ['erd-relationship-mapping', 'ERD & Relationship Mapping', 'b'],
      ['keys-relationships', 'Primary Key, Foreign Key & Jenis Relasi', 'b'],
      ['normalization', 'Normalization & Denormalization', 'i'],
      ['sql-crud', 'SQL CRUD', 'b'],
      ['joins', 'JOIN: INNER, LEFT, RIGHT, FULL', 'b'],
      ['group-by-having', 'GROUP BY & HAVING', 'b'],
      ['subquery-cte', 'Subquery, CTE & Window Function', 'i'],
      ['indexing', 'Indexing', 'i'],
      ['transactions-acid', 'Transactions & ACID', 'i'],
      ['isolation-levels', 'Isolation Levels', 'a'],
      ['locking-concurrency', 'Locking & Concurrency', 'a'],
      ['query-optimization', 'Query Optimization & EXPLAIN ANALYZE', 'a'],
      ['migration', 'Database Migration', 'i'],
      ['backup-recovery', 'Backup & Recovery', 'i'],
      ['database-security', 'Database Security', 'i'],
      ['orm-vs-raw-sql', 'ORM vs Raw SQL', 'i'],
    ],
  },
  {
    id: 'system-design', num: '07', dir: 'system-design', icon: 'random',
    title: 'System Design & Application Architecture', short: 'System Design',
    description: 'Scalability, reliability, caching, queue, event-driven, offline-first, dan studi kasus nyata.',
    core: true,
    groups: [
      {
        label: 'Konsep', dir: 'concepts', topics: [
          ['fundamentals', 'System Design Fundamentals', 'b'],
          ['monolith-vs-microservices', 'Monolithic vs Microservices', 'i'],
          ['modular-layered-architecture', 'Modular & Layered Architecture', 'i'],
          ['clean-architecture', 'Clean Architecture (Lintas Platform)', 'i'],
          ['ddd-fundamentals', 'Domain-Driven Design Fundamentals', 'a'],
          ['scalability', 'Scalability: Horizontal vs Vertical', 'i'],
          ['availability-reliability', 'Availability, Reliability & High Availability', 'i'],
          ['load-balancing', 'Load Balancing', 'i'],
          ['caching-strategy', 'Caching Strategy', 'i'],
          ['message-queue', 'Message Queue', 'a'],
          ['event-driven-architecture', 'Event-Driven Architecture', 'a'],
          ['api-gateway', 'API Gateway', 'i'],
          ['database-scaling', 'Database Scaling', 'a'],
          ['distributed-systems', 'Distributed Systems Fundamentals', 'a'],
          ['offline-first-architecture', 'Offline-First & Synchronization Strategy', 'a'],
          ['real-time-systems', 'Real-Time Systems', 'a'],
          ['fault-tolerance', 'Fault Tolerance', 'a'],
        ],
      },
      {
        label: 'Case Studies', dir: 'case-studies', topics: [
          ['pos-erp', 'POS / ERP Application', 'a'],
          ['e-commerce', 'E-Commerce Application', 'a'],
          ['banking-financial', 'Banking / Financial Application', 'a'],
          ['ticketing-system', 'Ticketing System', 'a'],
          ['inventory-management', 'Inventory Management', 'a'],
          ['customer-management', 'Customer Management (CRM)', 'i'],
          ['telecom-service-management', 'Telecom Service Management', 'a'],
          ['monitoring-notification', 'Monitoring & Notification System', 'a'],
        ],
      },
      {
        label: 'Mobile System Design', dir: 'mobile', topics: [
          ['framework', 'Framework Mobile System Design', 'i'],
          ['feed-infinite-scroll', 'Design: Feed & Infinite Scroll', 'a'],
          ['chat-app', 'Design: Aplikasi Chat Real-Time', 'a'],
          ['image-loading-caching', 'Design: Image Loading & Caching', 'a'],
          ['deep-linking', 'Design: Deep Link & Navigasi Lintas Kanal', 'i'],
          ['modularization', 'Design: Modularisasi Aplikasi Mobile Besar', 'a'],
        ],
      },
    ],
  },
  {
    id: 'devops', num: '08', dir: 'devops', icon: 'seti:docker',
    title: 'DevOps, Docker & CI/CD', short: 'DevOps & CI/CD',
    description: 'Linux, Docker, Compose, pipeline CI/CD, environment, secrets, release, observability, rollback.',
    topics: [
      ['windows-dev-storage', 'Setup Dev di Windows: Pindahkan Cache & SDK dari Drive C', 'b'],
      ['linux-fundamentals', 'Linux Fundamentals & Command Line', 'b'],
      ['environment-variables', 'Environment Variables', 'b'],
      ['docker-fundamentals', 'Docker Fundamentals', 'b'],
      ['dockerfile-compose', 'Dockerfile & Docker Compose', 'i'],
      ['container-networking-volumes', 'Container Networking & Volumes', 'i'],
      ['docker-image-optimization', 'Docker Image Optimization', 'a'],
      ['cicd-fundamentals', 'CI/CD Fundamentals', 'b'],
      ['github-actions', 'GitHub Actions (Test, Build & Deploy Pipeline)', 'i'],
      ['environment-management', 'Environment Management: Dev, Staging, Prod', 'i'],
      ['secrets-management', 'Secrets Management', 'i'],
      ['versioning-release', 'Versioning & Release Management', 'i'],
      ['monitoring-observability', 'Monitoring, Logging & Observability', 'a'],
      ['server-deployment', 'Server Deployment', 'i'],
      ['rollback-strategy', 'Rollback Strategy', 'a'],
      ['mobile-cicd-pipeline', 'Mobile CI/CD Pipeline (Flutter Android & iOS)', 'i'],
      ['android-play-release', 'Android Signing & Google Play Release', 'i'],
      ['store-accounts-publishing', 'Akun Developer & Publikasi App Store/Play Store (Personal vs Company)', 'b'],
      ['mobile-monitoring', 'Crash Reporting & Mobile Monitoring', 'i'],
    ],
  },
  {
    id: 'security', num: '09', dir: 'security', icon: 'seti:lock',
    title: 'Application Security', short: 'Security',
    description: 'OWASP, auth, kriptografi praktis, keamanan API & mobile, secrets, dan secure coding.',
    core: true,
    topics: [
      ['security-fundamentals', 'Security Fundamentals', 'b'],
      ['owasp-top-10', 'OWASP Top 10', 'i'],
      ['owasp-api-security', 'OWASP API Security Top 10', 'i'],
      ['authn-vs-authz', 'Authentication vs Authorization', 'b'],
      ['password-hashing', 'Password Hashing', 'i'],
      ['jwt-security', 'JWT Security', 'i'],
      ['https-tls', 'HTTPS & TLS', 'i'],
      ['input-validation', 'Input Validation & Sanitization', 'b'],
      ['sql-injection', 'SQL Injection', 'i'],
      ['xss-csrf', 'XSS & CSRF', 'i'],
      ['secure-api-design', 'Secure API Design & Rate Limiting', 'i'],
      ['secure-token-storage', 'Secure Token Storage', 'i'],
      ['mobile-app-security', 'Mobile Application Security', 'a'],
      ['sensitive-data-protection', 'Sensitive Data Protection & Encryption', 'a'],
      ['environment-secrets', 'Environment Secrets', 'i'],
      ['dependency-scanning', 'Dependency Vulnerability Scanning', 'i'],
      ['secure-coding', 'Secure Coding Practices', 'i'],
    ],
  },
  {
    id: 'testing-performance', num: '10', dir: 'testing-performance', icon: 'rocket',
    title: 'Testing, Debugging & Performance', short: 'Testing & Performa',
    description: 'Strategi testing, mocking, debugging, profiling, optimasi, load test, dan monitoring performa.',
    topics: [
      ['testing-fundamentals', 'Testing Fundamentals & Test Pyramid', 'b'],
      ['unit-testing', 'Unit Testing', 'b'],
      ['tdd', 'Test-Driven Development (TDD)', 'i'],
      ['integration-testing', 'Integration Testing', 'i'],
      ['e2e-testing', 'End-to-End Testing', 'i'],
      ['mocking-di', 'Mocking & Dependency Injection', 'i'],
      ['test-coverage', 'Test Coverage', 'b'],
      ['debugging-techniques', 'Debugging Techniques', 'i'],
      ['logging-error-tracking', 'Logging & Error Tracking', 'i'],
      ['memory-leak-detection', 'Memory Leak Detection', 'a'],
      ['cpu-network-profiling', 'CPU & Network Profiling', 'a'],
      ['database-performance', 'Database Performance', 'a'],
      ['api-performance', 'API Performance', 'a'],
      ['startup-optimization', 'Application Startup Optimization', 'a'],
      ['image-asset-optimization', 'Image & Asset Optimization', 'i'],
      ['load-stress-testing', 'Load & Stress Testing', 'a'],
      ['performance-monitoring', 'Performance Monitoring', 'a'],
    ],
  },
  {
    id: 'interview', num: '11', dir: 'interview', icon: 'star',
    title: 'Interview Preparation', short: 'Interview Prep',
    description: 'Technical, coding test, system design, behavioral, persiapan interview untuk berbagai tipe perusahaan, serta karier (bahasa Inggris, remote/freelance, produk sendiri) — fokus mobile engineer.',
    core: true,
    groups: [
      {
        label: 'A. Technical Interview', dir: 'technical', topics: [
          ['flutter-dart', 'Flutter & Dart Questions', 'i'],
          ['kotlin-android', 'Kotlin & Android Questions', 'i'],
          ['backend-nodejs', 'Backend & Node.js Questions', 'i'],
          ['database-sql', 'Database & SQL Questions', 'i'],
          ['oop-solid-patterns', 'OOP, SOLID & Design Patterns', 'i'],
          ['clean-architecture', 'Clean Architecture Questions', 'i'],
          ['rest-api', 'REST API Questions', 'i'],
          ['git-cicd', 'Git & CI/CD Questions', 'b'],
          ['security', 'Security Questions', 'i'],
          ['debugging-performance', 'Debugging & Performance Questions', 'a'],
        ],
      },
      {
        label: 'B. Coding Test', dir: 'coding-test', topics: [
          ['problem-solving-framework', 'Problem Solving Framework & Big-O', 'b'],
          ['arrays-strings', 'Array, List & String Manipulation', 'b'],
          ['hashmap-set', 'Hash Map & Set', 'b'],
          ['sorting-searching', 'Sorting & Searching', 'i'],
          ['stack-queue', 'Stack & Queue', 'i'],
          ['recursion', 'Recursion', 'i'],
          ['data-structures', 'Data Structures Overview', 'i'],
          ['sql-challenges', 'SQL Query Challenges', 'i'],
        ],
      },
      {
        label: 'C. System Design Interview', dir: 'system-design', topics: [
          ['framework', 'Framework Menjawab System Design', 'i'],
          ['scalable-rest-api', 'Design a Scalable REST API', 'a'],
          ['offline-first-pos', 'Design an Offline-First POS Application', 'a'],
          ['inventory-system', 'Design an Inventory Management System', 'a'],
          ['notification-system', 'Design a Notification System', 'a'],
          ['ticketing-app', 'Design a Ticketing Application', 'a'],
          ['telecom-platform', 'Design a Telecom Service Management Platform', 'a'],
        ],
      },
      {
        label: 'D. Behavioral Interview', dir: 'behavioral', topics: [
          ['star-method', 'STAR Method & Story Bank', 'b'],
          ['problem-solving', 'Problem Solving', 'b'],
          ['production-bugs', 'Handling Production Bugs', 'i'],
          ['working-under-pressure', 'Working Under Pressure', 'b'],
          ['team-collaboration', 'Team Collaboration', 'b'],
          ['technical-decision-making', 'Technical Decision Making', 'i'],
          ['technical-debt', 'Handling Technical Debt', 'i'],
          ['project-ownership', 'Project Ownership', 'i'],
          ['explaining-experience', 'Explaining Previous Work Experience', 'b'],
        ],
      },
      {
        label: 'E. Company Interview Prep', dir: 'company-prep', topics: [
          ['overview', 'Strategi Persiapan Interview', 'b'],
          ['company-types', 'Tipe Perusahaan & Fokus Penilaian', 'b'],
          ['mobile-engineering', 'Mobile Application Engineering', 'i'],
          ['se-fundamentals', 'Software Engineering Fundamentals', 'b'],
          ['networking-internet', 'Networking & Internet Fundamentals', 'b'],
          ['client-server', 'Client-Server Architecture', 'b'],
          ['api-database', 'API & Database', 'i'],
          ['cloud-computing', 'Basic Cloud Computing', 'b'],
          ['linux-server', 'Linux & Server Fundamentals', 'b'],
          ['cybersecurity', 'Cybersecurity Fundamentals', 'b'],
          ['system-design', 'System Design untuk Mobile Engineer', 'i'],
          ['technical-practice', 'Technical Interview Practice', 'i'],
          ['hr-interview', 'HR Interview Preparation', 'b'],
          ['portfolio', 'Portfolio & Project Explanation', 'b'],
          ['bumn-pln-icon-plus', 'Contoh: BUMN & PLN Icon Plus', 'b'],
        ],
      },
      {
        label: 'F. Career & Growth', dir: 'career', topics: [
          ['english-for-engineers', 'English for Software Engineers', 'b'],
          ['remote-freelancing', 'Remote Work & Freelancing for International Clients', 'i'],
          ['building-own-product', 'Building Your Own Product', 'i'],
        ],
      },
    ],
  },
  {
    id: 'ai-engineering', num: '12', dir: 'ai-engineering', icon: 'laptop',
    title: 'AI Engineering & Agent Documentation', short: 'AI Engineering',
    description: 'Konsep & workflow membangun project bersama AI agent, serta menambahkan fitur AI ke aplikasi. Aturan siap pakai ada di menu AI Agent Instructions.',
    core: true,
    groups: [
      {
        label: 'Panduan', dir: 'guides', topics: [
          ['agents-md-fundamentals', 'AGENTS.md: Konsep & Cara Menulis', 'b'],
          ['ai-coding-workflow', 'AI Coding Workflow', 'i'],
          ['coding-standards-naming', 'Coding Standards & Naming Conventions', 'b'],
          ['folder-structure', 'Folder Structure Guidelines', 'i'],
          ['api-conventions', 'API Design Conventions', 'i'],
          ['testing-requirements', 'Testing Requirements', 'i'],
          ['security-performance-rules', 'Security & Performance Rules', 'i'],
          ['git-commit-pr', 'Git Commit, PR & Code Review Checklist', 'b'],
          ['documentation-generation', 'Documentation Generation Guidelines', 'b'],
        ],
      },
      {
        label: 'AI di Aplikasi', dir: 'apps', topics: [
          ['ai-features-mobile', 'AI Features in Mobile Apps', 'i'],
        ],
      },
    ],
  },
];

/** Flatten semua topik menjadi daftar { slug, title, level, domain, group } */
export function allTopics() {
  const out = [];
  for (const d of DOMAINS) {
    const groups = d.groups ?? [{ label: null, dir: null, topics: d.topics }];
    for (const g of groups) {
      for (const [slug, title, level] of g.topics) {
        const path = [d.dir, g.dir, slug].filter(Boolean).join('/');
        out.push({ slug: path, title, level, domain: d.id, domainTitle: d.short, group: g.label });
      }
    }
  }
  return out;
}

/**
 * Sidebar Starlight dibangun dari katalog agar urutan konsisten.
 * @param {{ isStub?: (path: string) => boolean }} [opts] topik stub diberi badge "soon" & tampil redup.
 */
export function buildSidebar(opts = {}) {
  const item = (path) => opts.isStub?.(path)
    ? { slug: path, badge: { text: 'soon', variant: 'default', class: 'sb-soon' }, attrs: { 'data-stub': '', title: 'Belum ditulis' } }
    : { slug: path };
  const learning = {
    label: 'Learning Center',
    items: [
      { label: 'Dashboard', link: '/' },
      { slug: 'learning/roadmap' },
      { slug: 'learning/review' },
      { slug: 'learning/flashcards' },
      { slug: 'learning/quiz' },
      { slug: 'learning/interview-simulator' },
      { slug: 'learning/bookmarks' },
      { slug: 'learning/how-to-contribute' },
    ],
  };
  const domains = DOMAINS.map((d) => {
    const items = [{ label: 'Overview', slug: d.dir }];
    if (d.groups) {
      for (const g of d.groups) {
        items.push({
          label: g.label,
          collapsed: true,
          items: g.topics.map(([slug]) => item(`${d.dir}/${g.dir}/${slug}`)),
        });
      }
    } else {
      for (const [slug] of d.topics) items.push(item(`${d.dir}/${slug}`));
    }
    return { label: `${d.num} — ${d.short}`, collapsed: true, items };
  });
  return [learning, agentSidebar(), ...domains];
}
