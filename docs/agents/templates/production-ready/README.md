# Template — Production-Ready Application (Overlay)

**Use when:** a project (Flutter, Android, Node.js, or full-stack) is about to serve, or already serves, real users.
This is an **overlay**: combine it with a stack template. It adds SLOs, observability, release safety, rollback,
backups, and privacy requirements that agents must respect.

## Files in this template

| File | Copy to |
| --- | --- |
| `templates/production-ready/AGENTS.md` | Append to root `AGENTS.md` **or** copy to `docs/agents/production/AGENTS.md` and add a routing row "Any change → also read docs/agents/production/AGENTS.md" |
| `devops/AGENTS.md`, `security/AGENTS.md`, `architecture/AGENTS.md`, `testing/AGENTS.md` | `docs/agents/<same>/AGENTS.md` (required) |

## Resulting structure (additions)

```
project/
├── docs/agents/production/AGENTS.md
├── docs/runbooks/{deploy,rollback,incident,restore-backup}.md
├── docs/slo.md
└── .github/workflows/  (required checks: lint, test, SAST, dependency scan, secret scan)
```

## Starter `docs/slo.md`

```markdown
| Journey | SLI | SLO | Alert |
| --- | --- | --- | --- |
| Login | success rate of POST /v1/auth/login (non-4xx) | 99.9% / 30 days | burn rate > 2% in 1 h |
| Checkout | p95 latency of POST /v1/orders | < 300 ms | p95 > 500 ms for 10 min |
| Mobile app | crash-free users | ≥ 99.5% per release | < 99% in staged rollout → halt |
```

## Setup (PowerShell)

```powershell
$kb = 'D:\Dev\Projects\software-engineer-docs'; $p = 'D:\Dev\Projects\my-project'
New-Item -ItemType Directory -Force "$p\docs\agents\production","$p\docs\runbooks" | Out-Null
Copy-Item "$kb\docs\agents\templates\production-ready\AGENTS.md" "$p\docs\agents\production\AGENTS.md"
foreach ($d in 'devops','security','architecture','testing') {
  New-Item -ItemType Directory -Force "$p\docs\agents\$d" | Out-Null
  Copy-Item "$kb\docs\agents\$d\AGENTS.md" "$p\docs\agents\$d\AGENTS.md"
}
# then add the routing row to the root AGENTS.md
```

## First prompt to try

> Read AGENTS.md and docs/agents/production/AGENTS.md. Review the current checkout flow for production readiness:
> list missing timeouts, idempotency, metrics, alerts, feature flags, and rollback steps as a prioritized checklist.
> Do not change code yet.
