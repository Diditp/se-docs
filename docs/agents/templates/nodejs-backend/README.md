# Template — Node.js / TypeScript Backend

**Use when:** building a REST API service with Node.js + TypeScript and PostgreSQL (Express, Fastify, or NestJS),
organized as a modular monolith with controller → service → repository layers.

## Files in this template

| File | Copy to |
| --- | --- |
| `templates/nodejs-backend/AGENTS.md` | `AGENTS.md` (root) |
| `/AGENTS.md` (global) | `docs/agents/global/AGENTS.md` |
| `backend/`, `database/`, `security/`, `testing/`, `architecture/`, `devops/` rule files | `docs/agents/<same>/AGENTS.md` |
| `templates/postgresql/AGENTS.md` (optional, recommended) | `db/AGENTS.md` |
| shims | `CLAUDE.md`, `.github/copilot-instructions.md` |

## Resulting structure

```
my-api/
├── AGENTS.md · CLAUDE.md · .github/copilot-instructions.md
├── docs/agents/{global,backend,database,security,testing,architecture,devops}/AGENTS.md
├── docs/api/openapi.yaml · docs/adr/ · docs/runbooks/
├── db/AGENTS.md · db/migrations/ · db/seeds/
├── src/{config,shared,modules,jobs}/ · tests/{unit,integration,factories}/
└── Dockerfile · compose.yaml · .env.example · package.json · tsconfig.json
```

## Setup (PowerShell)

```powershell
$kb = 'D:\Dev\Projects\software-engineer-docs'; $p = 'D:\Dev\Projects\my-api'
Copy-Item "$kb\docs\agents\templates\nodejs-backend\AGENTS.md" "$p\AGENTS.md"
New-Item -ItemType Directory -Force "$p\docs\agents\global","$p\db" | Out-Null
Copy-Item "$kb\AGENTS.md" "$p\docs\agents\global\AGENTS.md"
Copy-Item "$kb\docs\agents\templates\postgresql\AGENTS.md" "$p\db\AGENTS.md"
foreach ($d in 'backend','database','security','testing','architecture','devops') {
  New-Item -ItemType Directory -Force "$p\docs\agents\$d" | Out-Null
  Copy-Item "$kb\docs\agents\$d\AGENTS.md" "$p\docs\agents\$d\AGENTS.md"
}
Copy-Item "$kb\docs\agents\shims\CLAUDE.md" "$p\CLAUDE.md"
New-Item -ItemType Directory -Force "$p\.github" | Out-Null
Copy-Item "$kb\docs\agents\shims\copilot-instructions.md" "$p\.github\copilot-instructions.md"
```

## First prompt to try

> Read AGENTS.md and the routed rule files. Implement `POST /v1/orders` per docs/api/openapi.yaml: Zod strict
> validation, Idempotency-Key support, server-side price calculation, a single transaction for order + items + stock
> movements, Problem Details errors, and integration tests for 201, 422, 401, 403, cross-outlet 404, and idempotent
> retry. Plan first.
