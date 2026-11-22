// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { existsSync, readFileSync } from 'node:fs';
import { buildSidebar } from './src/data/catalog.mjs';

// Topik yang belum ditulis (status: stub) ditandai "soon" di sidebar.
const isStub = (path) => {
  const file = ['.md', '.mdx'].map((ext) => `./src/content/docs/${path}${ext}`).find(existsSync);
  return !file || /^status:\s*stub\s*$/m.test(readFileSync(file, 'utf8'));
};

export default defineConfig({
  // URL produksi (Cloudflare Workers). Ganti bila memakai domain sendiri.
  site: 'https://se-docs.imadegedeuditayanakusumaputra.workers.dev',
  integrations: [
    starlight({
      title: 'SE Knowledge Base',
      description:
        'Personal Software Engineering Knowledge Base — Flutter, Android, Node.js, Database, System Design, DevOps, Security, Interview & AI Agents.',
      defaultLocale: 'root',
      locales: { root: { label: 'Bahasa Indonesia', lang: 'id' } },
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      customCss: ['./src/styles/custom.css'],
      lastUpdated: false,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
        styleOverrides: { borderRadius: '0.5rem' },
      },
      components: {
        PageTitle: './src/components/overrides/PageTitle.astro',
        Footer: './src/components/overrides/Footer.astro',
      },
      sidebar: buildSidebar({ isStub }),
    }),
  ],
});
