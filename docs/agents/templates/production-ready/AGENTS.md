# AGENTS.md — Production Readiness Overlay

> Add this file's content to the root `AGENTS.md` of any project that runs in production with real users
> (or keep it as `docs/agents/production/AGENTS.md` and add a routing row). It raises the bar for reliability,
> security, observability, and release safety on top of the stack template.
> Replace every `<placeholder>`.

## Service Level & Operations Facts

- **SLOs:** availability <99.9%>/month · p95 latency <300 ms> for read APIs · crash-free users <≥ 99.5%> (mobile)
- **Data protection:** RPO <15 min> · RTO <1 h> · backups <daily full + PITR>, restore test <monthly>
- **On-call / owner:** <team/channel> · runbooks in `docs/runbooks/`
- **Release cadence:** backend <continuous with approval> · mobile <every 2 weeks, staged rollout>

## Rule Routing (in addition to the stack template)

| Task touches | Read |
| --- | --- |
| Deploy, CI/CD, infrastructure, config | `docs/agents/devops/AGENTS.md` |
| Anything user data / auth / payments | `docs/agents/security/AGENTS.md` |
| New integration, queue, cache, service | `docs/agents/architecture/AGENTS.md` |

## 1. Coding Standards

- **MUST** make every new behavior configurable or flag-guarded when it is risky or incomplete (`feature_flags`), defaulting to off in production. *Why:* decouples deploy from release; instant kill switch.
- **MUST** keep backward compatibility for stored data, APIs, and older mobile versions in every change.

## 2. Project Structure

Stack template structure plus:
```
docs/runbooks/{deploy,rollback,incident,restore-backup}.md
docs/slo.md · docs/architecture.md · docs/data-classification.md · docs/adr/
```

## 3. Architecture & Design Principles

- No single point of failure on the critical path (≥ 2 instances, managed DB with failover, backups tested).
- Timeouts, retries with backoff + jitter (idempotent only), circuit breakers on every external dependency.
- Graceful degradation: non-critical features fail without breaking checkout/login/core flows.
- Idempotency for all retryable writes; transactional outbox for events.

## 4. Naming Conventions

Metrics `<service>_<subject>_<unit>` (e.g. `api_http_request_duration_seconds`); log fields `snake_case`; alerts named `<Service><Symptom>` (e.g. `ApiHighErrorRate`).

## 5. Dependency Management

Production dependencies scanned in CI; high/critical vulnerabilities block release unless an exception with expiry is recorded; base images rebuilt at least monthly.

## 6. Error Handling

- Every error path observable: structured log with `request_id`, metric counter, and (for 5xx/crashes) error tracking (e.g. Sentry/Crashlytics) with release version.
- User-facing errors safe and actionable; support can find the case by `request_id`.

## 7. Testing Requirements

- Unit + integration + contract tests on every PR; E2E smoke on staging after each deploy; production health check after deploy.
- Load test critical endpoints before launches or major changes; record results in the PR/ADR.
- Backup restore drill per schedule.

## 8. Security Requirements

- `docs/agents/security/AGENTS.md` fully applies; SAST + dependency + secret scanning required checks.
- Production access least-privilege and audited; no shared accounts; MFA everywhere.
- Personal data handling follows applicable privacy law (e.g. Indonesia's UU PDP) — retention, consent, and deletion paths documented.

## 9. Performance Considerations

- Performance budgets in `docs/slo.md`; dashboards for latency p95/p99, error rate, saturation (CPU, memory, DB connections, queue depth).
- Mobile: startup time, frame rendering (jank), app size, crash-free rate tracked per release.

## 10. Anti-Patterns to Avoid

| Do not | Do instead | Why |
| --- | --- | --- |
| Big-bang releases | Staged rollout / canary + flags | Limit blast radius |
| Deploy without rollback plan | Documented, tested rollback | Fast recovery |
| Alert on everything | Alert on SLO symptoms | Avoid alert fatigue |
| Manual production changes | Pipeline + IaC + audit | Reproducibility |
| Untested backups | Scheduled restore drills | Backups you cannot restore are not backups |

## 11. Definition of Done (production)

- [ ] Stack DoD complete
- [ ] Feature flag / kill switch for risky changes
- [ ] Metrics, logs, alerts, and dashboard updated for new flows
- [ ] Runbook updated (deploy/rollback/incident) when operations change
- [ ] Rollback tested or explicitly reasoned in the PR
- [ ] Security and privacy review for changes touching personal or payment data
- [ ] Release notes / changelog entry

## 12. Code Review Checklist (production)

- [ ] What breaks for users if this fails, and how will we know (alert)?
- [ ] How do we turn it off or roll it back in minutes?
- [ ] Is it backward compatible with data, APIs, and older app versions?
- [ ] Are timeouts, retries, idempotency, and limits in place?
- [ ] Is personal/payment data handled per policy and law?
- [ ] Are dashboards/runbooks updated?
