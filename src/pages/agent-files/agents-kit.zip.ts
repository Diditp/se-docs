// Paket ZIP berisi seluruh rule library dengan tata letak siap salin ke project:
//   docs/agents/global/AGENTS.md (dari /AGENTS.md), docs/agents/<domain>/AGENTS.md, templates/, shims/
import type { APIRoute } from 'astro';
import { zipSync, strToU8 } from 'fflate';
import { AGENT_FILES } from '../../data/agent-files';

export const GET: APIRoute = () => {
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(AGENT_FILES)) {
    const target = path === 'AGENTS.md' ? 'docs/agents/global/AGENTS.md' : path;
    files[`agents-kit/${target}`] = strToU8(content);
  }
  const zip = zipSync(files, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') });
  return new Response(zip, { headers: { 'Content-Type': 'application/zip' } });
};
