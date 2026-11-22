# AGENTS.md — Database (PostgreSQL)

> Package-level instructions for the `db/` folder (migrations, seeds, SQL). Agents that support nested instruction
> files load this automatically when editing files here. Replace every `<placeholder>`.
> Full rules: `docs/agents/database/AGENTS.md`. Global: `docs/agents/global/AGENTS.md`.

## Database Facts

- **Engine:** PostgreSQL <16> (same major version in Docker, CI, staging, production)
- **Migration tool:** <node-pg-migrate | Prisma Migrate | Knex | Flyway> — the only tool allowed
- **Extensions:** <pgcrypto, pg_trgm> (declared in migrations)
- **Tenancy:** every tenant table has `<outlet_id>`; queries filter by ids from the access token
- **Large tables:** <orders, order_items, stock_movements> — partitioned monthly by `created_at`
- **Sensitive columns:** listed in `docs/data-classification.md`

## Commands

| Purpose | Command |
| --- | --- |
| New migration | `<npm run db:migration:create -- add_customer_phone>` |
| Apply locally | `<npm run db:migrate>` |
| Status | `<npm run db:status>` |
| psql | `docker compose exec db psql -U app <dbname>` |

**MUST NOT** run migrations, resets, or data fixes against non-local databases.

## 1. Coding Standards

`docs/agents/database/AGENTS.md` §1 — parameterized SQL, explicit columns, `ORDER BY` + `LIMIT` on lists, UPPER CASE keywords.

## 2. Project Structure

```
db/
  AGENTS.md                         (this file)
  migrations/<timestamp>_<name>.sql (immutable after merge)
  seeds/                            (synthetic, idempotent)
docs/erd.md · docs/data-classification.md
```

## 3. Architecture & Design Principles

`docs/agents/database/AGENTS.md` §3: constraints enforce invariants, `timestamptz`, money as `<bigint rupiah | numeric(18,2)>`, snapshots on transactional rows, ledger for stock/balances.

## 4. Naming Conventions

`docs/agents/database/AGENTS.md` §4 (tables plural snake_case, `idx_`/`uq_`/`ck_` prefixes).

## 5. Dependency Management

Only the migration tool and query library already in the project; extensions added via migration with an ADR.

## 6. Error Handling

`docs/agents/database/AGENTS.md` §6 — map SQLSTATE codes in repositories; retry only `40001`/`40P01`.

## 7. Testing Requirements

Every migration applied from scratch in CI; data migrations tested with representative rows; repository tests on PostgreSQL (not SQLite).

## 8. Security Requirements

App role has DML only; migration role separate; no production data in seeds; PII listed and protected.

## 9. Performance Considerations

Index FKs and frequent filters (equality → range); `CREATE INDEX CONCURRENTLY` on large tables; `SET lock_timeout = '5s'` for DDL; attach `EXPLAIN (ANALYZE, BUFFERS)` for new queries on large tables.

## 10. Anti-Patterns to Avoid

`docs/agents/database/AGENTS.md` §10. Never edit a merged migration; never add `NOT NULL` without default/backfill on a populated table in one step.

## 11. Definition of Done

- [ ] Migration applies on empty DB and current schema; rollback documented
- [ ] Constraints and indexes named per convention
- [ ] `docs/erd.md` and data classification updated

## 12. Code Review Checklist

`docs/agents/database/AGENTS.md` §12.
