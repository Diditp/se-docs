# AGENTS.md — <Product Name> Monorepo (Flutter + Node.js + PostgreSQL)

> Root instructions for a full-stack monorepo. Package-level files (`mobile/AGENTS.md`, `backend/AGENTS.md`,
> `backend/db/AGENTS.md`) add package rules and are loaded when editing those packages.
> Global standards: `docs/agents/global/AGENTS.md` (always read first). Replace every `<placeholder>`.

## Project Overview

- **Product:** <one sentence>
- **Packages:** `mobile/` (Flutter app) · `backend/` (Node.js API) · `contracts/` (OpenAPI) · `infra/` (Docker, deploy)
- **Users & roles:** <cashier, supervisor, owner>
- **Environments:** local (Docker) · staging · production

## Commands

| Purpose | Command |
| --- | --- |
| Local stack | `docker compose -f infra/compose.yaml up -d` (API at http://localhost:3000) |
| Backend checks | `npm --prefix backend run lint && npm --prefix backend run typecheck && npm --prefix backend test` |
| Mobile checks | `cd mobile && dart format --output=none --set-exit-if-changed . && flutter analyze --fatal-infos && flutter test` |
| Contract codegen | `npm --prefix backend run gen:api` · `cd mobile && dart run build_runner build -d` |

Android emulator reaches the local API at `http://10.0.2.2:3000`.

## Rule Routing

| Task touches | Read |
| --- | --- |
| `mobile/**` | `mobile/AGENTS.md` → `docs/agents/flutter/AGENTS.md` |
| `backend/**` | `backend/AGENTS.md` → `docs/agents/backend/AGENTS.md` |
| `backend/db/**`, SQL | `backend/db/AGENTS.md` → `docs/agents/database/AGENTS.md` |
| `contracts/**` or any API change | this file §3 + `docs/agents/architecture/AGENTS.md` |
| `infra/**`, `.github/workflows/**` | `docs/agents/devops/AGENTS.md` |
| Auth, secrets, personal data (anywhere) | `docs/agents/security/AGENTS.md` |
| Tests (anywhere) | `docs/agents/testing/AGENTS.md` |

## 1. Coding Standards

Per package rule files. Shared conventions: UUID v7 ids, UTC ISO 8601 timestamps, money as integer rupiah, JSON `snake_case`.

## 2. Project Structure

```
contracts/openapi.yaml          # source of truth for the API
mobile/   AGENTS.md  lib/  test/  integration_test/  pubspec.yaml
backend/  AGENTS.md  src/  tests/  db/AGENTS.md  db/migrations/  package.json
infra/    compose.yaml  Dockerfile.api  deploy/
docs/     agents/  adr/  runbooks/  architecture.md
.github/workflows/  mobile-ci.yml  backend-ci.yml  backend-cd.yml
```

## 3. Architecture & Design Principles

- **Contract-first:** change `contracts/openapi.yaml` → regenerate backend types and Dart client → implement backend → implement mobile. Mobile uses generated models only.
- **Compatibility:** mobile versions stay in the field for weeks — API changes in `/v1` are additive; clients ignore unknown fields and handle unknown enum values; removals follow deprecation + minimum app version bump.
- **Deploy order** for coordinated changes: DB migration (expand) → backend → mobile release → cleanup (contract) in a later release. State the order in the PR.
- **Offline sync:** mobile outbox + idempotent backend endpoints keyed by client UUID; see `docs/agents/architecture/AGENTS.md`.
- **Feature flags** served by `GET /v1/config`; unfinished features stay off in production.

## 4. Naming Conventions

Per package rule files; API resources plural kebab-case; events past tense (`OrderPaid`).

## 5. Dependency Management

Per package. Cross-package shared code only through `contracts/` (generated), never by importing source across packages.

## 6. Error Handling

Backend returns Problem Details; mobile maps `status`/`type` to domain `Failure`s and shows localized messages (never raw `detail`).

## 7. Testing Requirements

Per package + contract tests (`npm --prefix backend run test:contract`) and E2E for <login, checkout, sync> against the local stack.

## 8. Security Requirements

`docs/agents/security/AGENTS.md`. Authorization only in backend; mobile role checks are UX only. No server secrets in the mobile app.

## 9. Performance Considerations

Mobile: minimize round trips (aggregate endpoints, delta sync with cursors). Backend: p95 budget <300 ms>; pagination everywhere.

## 10. Anti-Patterns to Avoid

Hand-written JSON models for contract endpoints; breaking `/v1` changes; mobile and backend changes merged without a stated deploy order; sharing a database between services.

## 11. Definition of Done

- [ ] Contract updated and generated code committed
- [ ] CI green for every affected package
- [ ] Backward compatibility with the previous mobile version explained
- [ ] Deploy order and rollback in the PR
- [ ] ADR/runbook updated for architectural or operational changes

## 12. Code Review Checklist

Package checklists + :
- [ ] Contract, backend, and mobile consistent?
- [ ] Old app versions keep working?
- [ ] Migration/deploy order safe to roll back?
