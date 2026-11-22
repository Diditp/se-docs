# Template — Full-Stack Application (Monorepo)

**Use when:** one repository contains the Flutter app, the Node.js API, the database migrations, the API contract,
and infrastructure. The root file coordinates cross-package work; package files carry package rules.

## Files in this template

| File | Copy to |
| --- | --- |
| `templates/fullstack/AGENTS.md` | `AGENTS.md` (root) |
| `templates/flutter-app/AGENTS.md` | `mobile/AGENTS.md` (remove sections already covered by root, keep package facts/commands) |
| `templates/nodejs-backend/AGENTS.md` | `backend/AGENTS.md` |
| `templates/postgresql/AGENTS.md` | `backend/db/AGENTS.md` |
| `/AGENTS.md` (global) | `docs/agents/global/AGENTS.md` |
| All domain rule folders | `docs/agents/<domain>/AGENTS.md` |
| shims | `CLAUDE.md`, `.github/copilot-instructions.md` |

## Resulting structure

```
product/
├── AGENTS.md · CLAUDE.md · .github/copilot-instructions.md
├── contracts/openapi.yaml
├── mobile/AGENTS.md · mobile/lib/ …
├── backend/AGENTS.md · backend/db/AGENTS.md · backend/src/ …
├── infra/compose.yaml · infra/Dockerfile.api
└── docs/agents/{global,flutter,android,backend,database,devops,security,testing,architecture}/AGENTS.md
```

## Setup (PowerShell)

```powershell
$kb = 'D:\projects\se-docs'; $p = 'D:\projects\product'
$t  = "$kb\docs\agents\templates"
New-Item -ItemType Directory -Force "$p\mobile","$p\backend\db","$p\docs\agents\global","$p\.github" | Out-Null
Copy-Item "$t\fullstack\AGENTS.md"      "$p\AGENTS.md"
Copy-Item "$t\flutter-app\AGENTS.md"    "$p\mobile\AGENTS.md"
Copy-Item "$t\nodejs-backend\AGENTS.md" "$p\backend\AGENTS.md"
Copy-Item "$t\postgresql\AGENTS.md"     "$p\backend\db\AGENTS.md"
Copy-Item "$kb\AGENTS.md" "$p\docs\agents\global\AGENTS.md"
foreach ($d in 'flutter','android','backend','database','devops','security','testing','architecture') {
  New-Item -ItemType Directory -Force "$p\docs\agents\$d" | Out-Null
  Copy-Item "$kb\docs\agents\$d\AGENTS.md" "$p\docs\agents\$d\AGENTS.md"
}
Copy-Item "$kb\docs\agents\shims\CLAUDE.md" "$p\CLAUDE.md"
Copy-Item "$kb\docs\agents\shims\copilot-instructions.md" "$p\.github\copilot-instructions.md"
```

## First prompt to try

> Read the root AGENTS.md. Add "void order with supervisor approval" end to end: update contracts/openapi.yaml,
> regenerate clients, add backend endpoint with permission `order:void` and audit log, add mobile UI with PIN
> confirmation, tests in both packages, and state the deploy order. Show the plan first.
