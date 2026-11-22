# Template — PostgreSQL Database

**Use when:** a project owns a PostgreSQL schema (migrations, seeds, raw SQL). Use it on its own for a
database-centric project, or inside a backend/full-stack repo as `db/AGENTS.md`.

## Files in this template

| File | Copy to |
| --- | --- |
| `templates/postgresql/AGENTS.md` | `db/AGENTS.md` (package-level) |
| `database/AGENTS.md` | `docs/agents/database/AGENTS.md` |
| `security/AGENTS.md`, `testing/AGENTS.md` | `docs/agents/<same>/AGENTS.md` |
| `/AGENTS.md` (global) | `docs/agents/global/AGENTS.md` |

Add a row to the root `AGENTS.md` routing table: *SQL, migrations, repositories → `db/AGENTS.md` and `docs/agents/database/AGENTS.md`*.

## Resulting structure

```
project/
├── AGENTS.md                       (root, with routing row for db/)
├── db/AGENTS.md · db/migrations/ · db/seeds/
├── docs/agents/{global,database,security,testing}/AGENTS.md
└── docs/erd.md · docs/data-classification.md
```

## Starter files

`docs/data-classification.md`

```markdown
| Table.column | Class | Protection |
| --- | --- | --- |
| customers.phone | PII | masked in logs, access by role `cs` |
| customers.national_id | Sensitive PII | app-level encryption + blind index |
| payments.reference | Financial | audit logged |
```

Migration skeleton (expand step):

```sql
-- 20261112093000_add_customer_phone.sql
SET lock_timeout = '5s';
ALTER TABLE customers ADD COLUMN phone text;            -- nullable first (expand)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_outlet_id_phone ON customers (outlet_id, phone);
-- backfill in a batched job; enforce NOT NULL in a later migration (contract)
```

## First prompt to try

> Read db/AGENTS.md and docs/agents/database/AGENTS.md. Design the schema for stock movements as a ledger with a
> projected `stock_balances` table, constraints, indexes, and a migration safe for a 20-million-row orders table.
> Include an integration test proving two concurrent sales of the last item cannot both succeed.
