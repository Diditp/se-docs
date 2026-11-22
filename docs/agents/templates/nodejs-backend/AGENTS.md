# AGENTS.md — <Service Name> (Node.js + TypeScript API)

> Root instructions for AI coding agents in this backend service. Replace every `<placeholder>`.
> Global standards: `docs/agents/global/AGENTS.md` (always read first).

## Project Overview

- **Purpose:** <what the API serves, e.g. POS API for mobile cashier app and owner dashboard>
- **Stack:** Node.js <LTS> · TypeScript strict · <Express|Fastify|NestJS> · Zod · PostgreSQL <16> via <Kysely|Prisma|pg> · Redis · BullMQ · pino · <Vitest|Jest> + supertest
- **Contract:** `docs/api/openapi.yaml` (source of truth) · base path `/v1`
- **Tenancy:** <data scoped by outlet_id from the access token>

## Commands

| Purpose | Command |
| --- | --- |
| Install | `npm ci` |
| Local stack | `docker compose up -d db cache` |
| Dev | `npm run dev` |
| Quality | `npm run lint && npm run typecheck` |
| Tests | `npm test && npm run test:integration` |
| Migrations | `npm run db:migration:create -- <name>` · `npm run db:migrate` |

## Rule Routing

| Task touches | Read |
| --- | --- |
| Any TypeScript server code | `docs/agents/backend/AGENTS.md` |
| SQL, migrations, repositories | `docs/agents/database/AGENTS.md` |
| Auth, tokens, input, webhooks, secrets | `docs/agents/security/AGENTS.md` |
| Tests | `docs/agents/testing/AGENTS.md` |
| New module, queue, cache, integration | `docs/agents/architecture/AGENTS.md` |
| Dockerfile, CI/CD, deploy | `docs/agents/devops/AGENTS.md` |

## 1. Coding Standards

`docs/agents/backend/AGENTS.md` §1. Read config only from `src/config/index.ts`.

## 2. Project Structure

```
src/
  app.ts · server.ts
  config/ · shared/{errors,middleware,logger,db,cache,http}/
  modules/<module>/{<module>.routes,controller,service,repository,schemas,types}.ts
  jobs/
db/migrations/ · db/seeds/
tests/{unit,integration,factories,setup}/
docs/{api/openapi.yaml, adr/, runbooks/, agents/}
Dockerfile · compose.yaml · .env.example
```

## 3. Architecture & Design Principles

`docs/agents/backend/AGENTS.md` §3 and `docs/agents/architecture/AGENTS.md`. Project decisions: modular monolith; cross-module communication via services or domain events in `shared/events`; transactional outbox table `outbox_events` for external notifications.

## 4. Naming Conventions

`docs/agents/backend/AGENTS.md` §4 and `docs/agents/database/AGENTS.md` §4. JSON fields: <snake_case>.

## 5. Dependency Management

`docs/agents/backend/AGENTS.md` §5. New dependencies need the justification block in the PR.

## 6. Error Handling

`docs/agents/backend/AGENTS.md` §6. Error classes in `src/shared/errors/`; Problem Details `type` URIs: `https://<api-domain>/errors/<code>`.

## 7. Testing Requirements

`docs/agents/testing/AGENTS.md`. Integration tests use the compose PostgreSQL (`DATABASE_URL_TEST`).

## 8. Security Requirements

`docs/agents/security/AGENTS.md` + `docs/agents/backend/AGENTS.md` §8. Permissions catalog: `src/shared/auth/permissions.ts`.

## 9. Performance Considerations

`docs/agents/backend/AGENTS.md` §9 and `docs/agents/database/AGENTS.md` §9. Budget: p95 < <300> ms for read endpoints.

## 10. Anti-Patterns to Avoid

Referenced tables apply. Project-specific: no direct `process.env`, no SQL outside repositories, no cross-module repository imports.

## 11. Definition of Done

- [ ] Lint, typecheck, unit, and integration tests pass
- [ ] OpenAPI updated; `/v1` change is additive
- [ ] Migration backward compatible; runs from empty DB
- [ ] Authorization + cross-tenant tests for new endpoints
- [ ] Report with endpoints changed, verification, risks, rollback

## 12. Code Review Checklist

`docs/agents/backend/AGENTS.md` §12 + `docs/agents/database/AGENTS.md` §12 + `docs/agents/security/AGENTS.md` §12.
