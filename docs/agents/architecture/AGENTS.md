# AGENTS.md — Architecture & System Design Rules

> Rules for structuring applications, modules, integrations, and data flow. Load together with the global `/AGENTS.md`
> when creating a new feature/module/service, changing boundaries between modules, adding infrastructure (queue, cache,
> search, new service), or integrating with external systems.

## Scope

Module and package boundaries, cross-module/service communication, API contracts between client and server,
offline/sync design, integrations, and architecture decision records (`docs/adr/`).

## 1. Coding Standards

- **MUST** express business rules in the domain/service layer using the business vocabulary (ubiquitous language): `Order`, `Shift`, `StockMovement`, `WorkOrder`.
- **MUST** depend on interfaces at boundaries (repositories, gateways, clients) and inject implementations from one composition root per app.
- **MUST** keep public module APIs small; everything else is internal to the module.
- **SHOULD** prefer composition over inheritance, and explicit data flow over global state/singletons.

## 2. Project Structure

Default for applications: **feature-first modular structure** with layers inside each feature.

```
<app>/
  core/ (or shared/)          # cross-cutting: config, logging, errors, network, db, auth, design system
  features/ (or modules/)/<feature>/
    domain/                   # entities, value objects, use cases, repository interfaces
    data/ (or infrastructure/) # repository implementations, DTOs, mappers, clients
    presentation/ (or api/)   # UI/state or HTTP controllers
docs/
  adr/NNNN-title.md           # decisions
  api/openapi.yaml            # client–server contract
  architecture.md             # context & container diagrams (Mermaid)
```

## 3. Architecture & Design Principles

- **Dependency rule:** source code dependencies point inward to the domain; the domain knows nothing about frameworks, UI, databases, or transport. *Why:* rules stay testable and stable while technology changes.
- **Start with a modular monolith.** Split into services only with a documented reason (independent scaling, independent deployment by separate teams, isolation of a risky/regulated component). *Why:* distributed systems add network failure, eventual consistency, and operational cost.
- **Contract-first integration:** client–server APIs defined in OpenAPI (or schema) before implementation; backward-compatible evolution; versioning for breaking changes.
- **Consistency:** keep a single database transaction for changes within one module; across modules/services use the **transactional outbox** + idempotent consumers or a saga with compensations — never distributed 2PC.
- **Idempotency** for every operation that can be retried (client sync, payments, webhooks, consumers).
- **Asynchronous work** (notifications, reports, integrations) goes through a queue; synchronous APIs return `202` + status resource when work is long-running.
- **Offline-first mobile:** local DB as UI source of truth, outbox in the same local transaction, client-generated UUIDs, cursor-based pull, explicit conflict strategy per entity (server-wins for master data, ledger for quantities/balances, field-level LWW for user-edited data).
- **Caching** only for measured read hot spots, with defined TTL and invalidation; never as a substitute for missing indexes.
- **Sync contracts:** push is a batch of idempotent operations with a result per operation; pull uses a server-assigned monotonic sequence/cursor (never device clocks) and returns tombstones for deletions.
- **Caching:** document a staleness budget per data type before adding a cache; money, stock at checkout, payment status, and revoked permissions are read from the source of truth, never from a cache. Every cache has a TTL and an invalidation path, and the system must still work (degraded) when the cache is empty or down.
- **Real-time:** the database is the source of truth and real-time channels only distribute; events carry a per-channel sequence so clients can catch up via REST after reconnect; connection gateways stay thin (no business logic); users who are not connected are reached through push notifications.
- **Resilience:** timeouts, retries with exponential backoff + jitter (idempotent calls only), circuit breakers, bulkheads; graceful degradation of non-critical features. Each timeout is shorter than its caller's; retry at one layer only, with full jitter and a retry budget, honoring `Retry-After`; liveness checks never depend on downstream services.
- **Scaling order:** measure first, then index/query fixes → pooling → vertical scaling → cache → read replicas → partitioning → separate analytics; sharding or splitting services requires an ADR with the measured bottleneck. Default architecture is a modular monolith with enforced module boundaries.
- **Observability as a requirement:** each module emits structured logs, metrics, and traces with correlation IDs.
- **Record decisions:** every significant choice (new dependency category, new infrastructure, boundary change, data model change with trade-offs) gets an ADR.

## 4. Naming Conventions

- Modules/features named after business capabilities (`checkout`, `inventory`, `work-orders`), not technical layers (`helpers`, `services`).
- Use cases as verb phrases (`CreateOrder`, `SyncPendingOrders`); events in past tense (`OrderPaid`, `StockAdjusted`); commands imperative (`CapturePayment`).
- ADR files: `docs/adr/0007-use-outbox-for-order-events.md`.
- Diagrams in Mermaid inside Markdown so they are versioned and reviewable.

## 5. Dependency Management

- New infrastructure (queue, cache, search engine, new database, new service) requires an ADR with: problem, options considered, decision, operational cost, failure modes, rollback plan.
- Shared libraries between modules/services contain only stable, generic code (no domain logic of one module).
- Avoid cyclic dependencies between modules; enforce with tooling where available (lint rules, Gradle module graph, import boundaries).

## 6. Error Handling

- Define an error model per layer: infrastructure errors → domain errors → transport representation (HTTP Problem Details / UI messages).
- Define failure behavior for every integration: timeout values, retry policy, fallback, what the user sees, how data is reconciled later.
- Dead-letter queues for messages that keep failing, with alerting and a replay procedure.

## 7. Testing Requirements

- Domain logic unit-tested without infrastructure.
- Integration tests at every boundary (DB, queue, external API via fakes/sandbox/contract tests).
- End-to-end tests for the critical business journeys.
- Architecture rules tested where tooling exists (forbidden imports, module dependency checks).
- Failure-mode tests for resilience logic (timeouts, retries, idempotent replays).

## 8. Security Requirements

- Trust boundaries drawn in `docs/architecture.md`; authentication at the edge, authorization inside each service/module for every object.
- Service-to-service calls authenticated (mTLS, signed tokens, or private network + credentials) — never "internal means trusted".
- Data classification drives storage, encryption, retention, and logging decisions.
- See `docs/agents/security/AGENTS.md`.

## 9. Performance Considerations

- Estimate load before designing (users, requests/s average and peak, data growth/year, read:write ratio) and record it in the ADR/design doc.
- Design for horizontal scaling: stateless services, shared session/cache store, object storage for files.
- Minimize round trips for mobile clients (aggregate/BFF endpoints, pagination, compression, delta sync).
- Define SLOs (e.g. 99.9% availability, p95 < 300 ms) and measure with p95/p99, not averages.

## 10. Anti-Patterns to Avoid

| Do not | Do instead | Why |
| --- | --- | --- |
| Microservices by default | Modular monolith first | Complexity without benefit |
| Shared database between services | Each service owns its data; integrate via APIs/events | Hidden coupling |
| Distributed transactions | Outbox + idempotent consumers / saga | Availability and complexity |
| God modules (`common`, `utils`) with business logic | Feature modules owning their rules | Coupling |
| Synchronous chains of many services per request | Async events, aggregation, caching | Latency and cascading failure |
| Designing only the happy path | Explicit failure modes | Production incidents |
| Undocumented decisions | ADRs | Lost reasoning |

## 11. Definition of Done

- [ ] Change fits the documented module boundaries (or the ADR that changes them is included)
- [ ] Contracts (OpenAPI/events) updated and backward compatible
- [ ] Failure modes, retries, timeouts, and idempotency defined for new integrations
- [ ] Observability added for new flows (logs, metrics, alerts)
- [ ] Architecture docs/diagrams updated
- [ ] Tests at the new boundaries pass

## 12. Code Review Checklist

- [ ] Does the dependency direction respect the domain-centric rule?
- [ ] Is the new component necessary now (evidence/estimate), and is there an ADR?
- [ ] Is data ownership clear (one owner per table/entity)?
- [ ] Are cross-boundary operations idempotent and eventually consistent where needed?
- [ ] What happens when each dependency is slow or down?
- [ ] Is the change observable and operable (alerts, runbook)?
- [ ] Can it be rolled back safely?
