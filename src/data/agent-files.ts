// Membaca isi file instruksi agent langsung dari repo (single source of truth).
const raw = import.meta.glob(['/AGENTS.md', '/docs/agents/**/*.md'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** key: path relatif repo tanpa slash depan, mis. 'docs/agents/flutter/AGENTS.md' */
export const AGENT_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k.replace(/^\//, ''), v]),
);

export function agentFile(path: string): string {
  const c = AGENT_FILES[path];
  if (c === undefined) throw new Error(`File instruksi tidak ditemukan: ${path}`);
  return c;
}

/** URL unduhan statis untuk sebuah file */
export const downloadUrl = (path: string) => `/agent-files/${path}`;
