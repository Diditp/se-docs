# AGENTS.md — SQL & Database Engineering Rules

> Domain rules for schema design, migrations, queries, and transactions. Default: PostgreSQL 15+.
> MySQL 8 differences are noted where relevant. Load together with the global `/AGENTS.md` and the language rule file
> of the code that runs the queries (backend, Flutter/Drift, Android/Room).

## Scope

Applies to migrations (`db/migrations/`), repository/DAO code, ORM models/schemas, seed and fixture data, and any SQL
string in the codebase. Local databases (SQLite/Drift/Room) follow the same principles where applicable.

## 1. Coding Standards

- **MUST** use parameterized queries or a query builder/ORM that parameterizes; **MUST NOT** concatenate or interpolate input into SQL, including `ORDER BY` columns (use an allowlist map). *Why:* SQL injection.
- **MUST** name columns explicitly; **MUST NOT** use `SELECT *` in application code. *Why:* schema changes break silently and payloads grow.
- **MUST** give every list query a deterministic `ORDER BY` and a `LIMIT`.
- **MUST** write SQL keywords in UPPER CASE and identifiers in `snake_case` in raw SQL and migrations.
- **SHOULD** use CTEs to make complex queries readable, and window functions instead of correlated subqueries for ranking.

## 2. Project Structure

```
db/
  migrations/            # 20261112093000_create_orders.sql (timestamped, ordered, immutable after merge)
  seeds/                 # synthetic data only, idempotent
docs/
  data-classification.md # which columns hold PII/financial data
  erd.md                 # entity relationship overview (Mermaid)
src/modules/<module>/<module>.repository.ts   # all queries for the module
tests/integration/...   # repository tests against real PostgreSQL
```

## 3. Architecture & Design Principles

- **MUST** enforce integrity in the database: `NOT NULL`, primary keys, foreign keys with deliberate `ON DELETE`, `UNIQUE`, `CHECK` constraints for invariants (e.g. `qty >= 0`). *Why:* application bugs and race conditions cannot bypass constraints.
- **MUST** use `timestamptz` for timestamps, `numeric(p,s)` or `bigint` minor units for money, `uuid`/`bigint identity` for primary keys.
- **SHOULD** use UUID v7 (time-ordered) for client-generated IDs to keep index locality; random UUID v4 on clustered indexes (MySQL InnoDB) causes page splits.
- **MUST** snapshot historical facts (price, product name, tax rate) on transactional rows such as `order_items`. *Why:* reports must not change when master data changes.
- **MUST** model balances that many writers change (stock, wallet) as an append-only ledger plus a projected balance table. *Why:* concurrent/offline writers never overwrite each other.
- **MUST** normalize to 3NF by default; denormalize only for measured read performance, documented in an ADR.
- **SHOULD** partition very large time-series tables (orders, events, logs) by month and plan archival/retention.
- **Multi-tenant:** every tenant-owned table has `tenant_id`/`outlet_id`, included in indexes and in every query (or enforced via Row-Level Security).

## 4. Naming Conventions

| Item | Convention | Example |
| --- | --- | --- |
| Tables | plural `snake_case` | `order_items` |
| Columns | `snake_case` | `created_at` |
| Primary key | `id` | `id` |
| Foreign key | `<singular>_id` | `order_id` |
| Index | `idx_<table>_<cols>` | `idx_orders_outlet_id_created_at` |
| Unique | `uq_<table>_<cols>` | `uq_products_outlet_id_sku` |
| Check | `ck_<table>_<rule>` | `ck_stocks_qty_non_negative` |
| Booleans | `is_`/`has_` prefix | `is_active` |
| Timestamps | `<event>_at` | `voided_at` |

## 4b. Migrations (production-safe)

- **MUST** change schema only via new migration files; merged migrations are immutable.
- **MUST** follow expand → migrate → contract: add nullable/defaulted column → backfill in batches → enforce `NOT NULL` → remove old column in a later release. *Why:* old and new application versions run simultaneously during deploys.
- **MUST** create indexes on large tables with `CREATE INDEX CONCURRENTLY` (outside a transaction) — MySQL: online DDL `ALGORITHM=INPLACE, LOCK=NONE` where supported.
- **MUST** add foreign keys/checks on large tables as `NOT VALID` then `VALIDATE CONSTRAINT` separately.
- **MUST** set `lock_timeout` (e.g. `SET lock_timeout = '5s'`) for DDL. *Why:* DDL waiting behind a long query blocks all traffic.
- **MUST** make every migration run on an empty database; document rollback (down migration or manual steps).

## 5. Dependency Management

- **MUST** use the single migration tool and ORM/query builder already chosen by the project; **MUST NOT** introduce a second one.
- **MUST** pin the database major version in Docker/CI to match production.
- **SHOULD** keep extensions (`pgcrypto`, `pg_trgm`, `uuid-ossp`) declared in migrations, not installed manually.

## 6. Error Handling

- Map database errors to domain errors in the repository: unique violation (`23505`) → `ConflictError`; FK violation (`23503`) → `ValidationError`/`NotFoundError`; check violation (`23514`) → `ValidationError`.
- Retry only serialization failure (`40001`) and deadlock (`40P01`), max 3 attempts with backoff + jitter.
- **MUST** roll back on any error inside a transaction and release the connection in `finally`.
- **MUST NOT** expose SQL, table names, or constraint names to API clients.

## 7. Testing Requirements

- Repository/DAO tests run against the same engine as production (PostgreSQL in Docker / Testcontainers), not SQLite as a substitute.
- Each migration is applied from scratch in CI; data migrations have a test with representative rows.
- Concurrency-sensitive logic (stock, balance, idempotency) has a test with parallel requests.
- New queries on large tables include `EXPLAIN (ANALYZE, BUFFERS)` output from representative data in the PR.

## 8. Security Requirements

- Application DB user has least privilege (DML only); migrations use a separate role. No superuser in apps.
- Tenant filter in every query on tenant data; consider Row-Level Security for defense in depth.
- PII columns listed in `docs/data-classification.md`; encrypt highly sensitive fields at the application level; use a keyed hash (blind index) to search encrypted values.
- **MUST NOT** copy production data into dev/test/seed files; use synthetic data.
- Backups encrypted; restore procedure tested periodically.
- Audit tables for sensitive changes (who, when, what) written in the same transaction.

## 9. Performance Considerations

- **MUST** index foreign keys and columns used in filters/joins/sorts of frequent queries; composite index order = equality columns first, then range/sort.
- **MUST NOT** wrap indexed columns in functions in `WHERE` (`DATE(created_at) = …`); use ranges or expression indexes.
- **MUST** use keyset (cursor) pagination for large/infinite lists.
- **MUST** avoid N+1: use joins or batched `WHERE id = ANY($1)`.
- **MUST** keep transactions short; no network calls inside a transaction.
- **SHOULD** serve heavy reports from a read replica or pre-aggregated tables.
- **SHOULD** remove unused/duplicate indexes (`pg_stat_user_indexes.idx_scan = 0`).

## 10. Anti-Patterns to Avoid

| Do not | Do instead | Why |
| --- | --- | --- |
| Check-then-insert to prevent duplicates | Unique constraint + `ON CONFLICT` | Race conditions |
| Read-modify-write stock in app code | Conditional atomic `UPDATE … WHERE qty >= $n` or `FOR UPDATE` | Lost updates |
| `float` for money | `numeric` / `bigint` minor units | Rounding errors |
| `timestamp` without time zone | `timestamptz` | Timezone bugs |
| `NOT IN (subquery)` with nullable column | `NOT EXISTS` | Returns nothing when NULL present |
| One huge `UPDATE` on millions of rows | Batched updates | Locks, WAL bloat, replica lag |
| Soft delete without partial unique index | `UNIQUE … WHERE deleted_at IS NULL` | Duplicates/blocked re-creation |

## 11. Definition of Done

- [ ] Migration runs from empty DB and on a copy of current schema; rollback documented
- [ ] Constraints enforce the business invariants introduced
- [ ] Indexes support new queries; `EXPLAIN ANALYZE` attached for large tables
- [ ] Every tenant query filtered; no `SELECT *`; lists have `ORDER BY` + `LIMIT`
- [ ] Repository integration tests pass on PostgreSQL
- [ ] Data classification updated for new PII columns

## 12. Code Review Checklist

- [ ] Types correct (`timestamptz`, money type, keys)?
- [ ] Migration safe for large tables and backward compatible?
- [ ] Constraints and indexes named per convention?
- [ ] Queries parameterized, tenant-scoped, paginated, and free of N+1?
- [ ] Transactions short with correct error/rollback handling?
- [ ] Concurrency handled (atomic updates, locks, idempotency)?
- [ ] Sensitive data protected and not seeded from production?
