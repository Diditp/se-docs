# AGENTS.md — Docker, CI/CD & Deployment Rules

> Domain rules for containers, pipelines, environments, releases, and operations. Load together with the global
> `/AGENTS.md` and `docs/agents/security/AGENTS.md` (secrets).

## Scope

Applies to `Dockerfile*`, `.dockerignore`, `docker-compose*.yml`/`compose*.yaml`, `.github/workflows/`, `infra/`,
`scripts/deploy*`, `fastlane/`, environment templates (`.env.example`), and release configuration.

## 1. Coding Standards

- **MUST** keep pipelines and scripts declarative, idempotent (safe to re-run), and readable; comment non-obvious steps.
- **MUST** use `set -euo pipefail` in bash scripts and fail on errors in PowerShell (`$ErrorActionPreference = 'Stop'`). *Why:* silent failures deploy broken builds.
- **MUST** make the commands in CI identical to the commands documented in `AGENTS.md`/README. *Why:* "works locally" equals "works in CI".
- **MUST** configure applications only through environment variables (12-factor); build artifacts are environment-agnostic.

## 2. Project Structure

```
Dockerfile                 # multi-stage, per deployable service (or services/<name>/Dockerfile)
.dockerignore
compose.yaml               # local development stack (app + db + cache)
.env.example               # every variable documented, no real values
.github/workflows/
  ci.yml                   # PR: lint, typecheck/analyze, test, build
  cd.yml                   # main/tag: build image, deploy staging → production
infra/                     # IaC or server/deploy scripts
docs/runbooks/             # deploy, rollback, incident procedures
```

## 3. Architecture & Design Principles

- **Build once, deploy many:** build an immutable artifact (image tagged with commit SHA / app bundle with version) once and promote the same artifact dev → staging → production. *Why:* what was tested is what runs.
- **Environments:** dev, staging (production-like), production — separate secrets, databases, and config; staging gets every change first.
- **Progressive delivery:** rolling/blue-green/canary deploys with health checks; feature flags for incomplete features.
- **Database changes deploy separately and first**, backward compatible (expand/contract) so the previous app version still works during rollback.
- **Observability by default:** structured logs to stdout, metrics (latency p95/p99, error rate, saturation), health endpoints (`/health` liveness, `/ready` readiness), alerts on SLOs.
- **Rollback is a first-class path:** redeploy the previous artifact tag; documented in `docs/runbooks/rollback.md`.
- **Migrations run as a separate step/job before rollout**, never automatically on every instance startup. *Why:* concurrent instances race and a failed migration should stop the deploy, not crash-loop the service.
- **Observability:** every service exposes RED metrics (route pattern labels only; never user/order IDs or raw URLs as labels), structured logs with request/trace IDs, and alerts based on SLO burn rate with a linked runbook. `/metrics` and admin/debug endpoints are not public.
- **Network exposure:** only the reverse proxy/load balancer publishes ports; databases, Redis, and queues are private (`127.0.0.1` binds or internal networks).
- **Non-production data:** staging uses synthetic or anonymized data and sandbox credentials; real emails/SMS/push are disabled or redirected.

### Dockerfile rules

- **MUST** use multi-stage builds; final image contains only runtime artifacts.
- **MUST** pin base images to a specific version (digest for production); slim/distroless variants preferred.
- **MUST** order layers from least to most frequently changing (`COPY` lockfile → install → `COPY` source).
- **MUST** run as a non-root user, use exec-form `CMD`, include `HEALTHCHECK` or orchestrator probes, and handle `SIGTERM` gracefully.
- **MUST NOT** copy `.env`, keys, or credentials into images; use runtime secrets or BuildKit `--mount=type=secret`.

### CI/CD rules

- **MUST** set least-privilege `permissions:` (default `contents: read`) per workflow.
- **MUST** pin third-party actions to a full commit SHA; first-party actions to a major version at minimum.
- **MUST** use `concurrency` to cancel superseded runs; cache dependencies keyed by lockfile hash.
- **MUST** gate production deploys with a protected environment (required reviewers) and keep production secrets scoped to it.
- **SHOULD** use OIDC federation to cloud providers instead of long-lived keys.
- **Mobile:** CI runs format/analyze/test on PRs; release builds (AAB/IPA) are built on tags with signing material from secrets, obfuscation enabled, and symbol files archived.
- **Mobile release safety:** build numbers **MUST** come from CI (monotonic run number); production releases **MUST** use staged rollout / phased release with a documented halt threshold (crash-free users, ANR rate); symbol files (Dart `--split-debug-info`, R8 `mapping.txt`, iOS dSYM) **MUST** be uploaded to crash reporting for every release build; breaking API changes **MUST NOT** ship until a `min_supported_version` gate covers older app versions. *Why:* a mobile release cannot be rolled back on users' devices, so detection and gradual exposure are the only fast safety net.

## 4. Naming Conventions

| Item | Convention | Example |
| --- | --- | --- |
| Image | `registry/org/service:<git-sha>` + semver tag on release | `ghcr.io/acme/pos-api:3f2c1ab`, `:1.8.0` |
| Workflows | purpose-based kebab-case | `backend-ci.yml`, `mobile-release.yml` |
| Jobs | verb-noun | `test`, `build-image`, `deploy-staging` |
| Env vars | `SCREAMING_SNAKE_CASE`, prefixed per service if shared | `API_DATABASE_URL` |
| Git tags | `v<semver>` / `<app>-v<semver>` | `mobile-v1.8.0` |
| Branches | `feat/…`, `fix/…`, `release/x.y`, `hotfix/x.y.z` | `release/1.8` |

## 5. Dependency Management

- Base images, actions, and tools pinned; updated through Dependabot/Renovate PRs that run the full pipeline.
- Lockfiles committed; CI uses `npm ci` / `flutter pub get` (with committed lockfile) / Gradle wrapper with checksum.
- Container images scanned (Trivy/Docker Scout) in CI; high/critical findings block release unless an exception is documented.

## 6. Error Handling

- Pipelines fail fast and surface the failing step clearly; no `continue-on-error` on quality gates.
- Deploy scripts verify health after rollout (retrying health checks with a timeout) and trigger/announce rollback on failure.
- Long-running jobs have timeouts (`timeout-minutes`).
- Notify the team channel on failed deploys with run link, commit, and environment.

## 7. Testing Requirements

- PR pipeline: format, lint, type check/analyze, unit tests, integration tests with service containers (DB/cache), build.
- Post-deploy: smoke test critical endpoints/flows on staging; production health check after every deploy.
- Pipeline changes are tested in a branch/PR before merging; scripts support a dry-run mode where practical.
- Full rules: `docs/agents/testing/AGENTS.md`.

## 8. Security Requirements

- **MUST NOT** print secrets (`echo $TOKEN`, `set -x` around secret usage) or write them to artifacts/caches.
- **MUST NOT** run untrusted fork code with secrets (`pull_request_target` + checkout of PR head) without explicit review.
- Secrets in the CI secret store / cloud secret manager; rotated on a schedule and immediately after exposure.
- Network: only load balancer/ingress is public; databases and caches in private networks; SSH restricted (keys, allowlist, or bastion).
- TLS everywhere; HSTS for web; certificates auto-renewed.
- Keep signing keys (Android keystore, iOS certificates) out of the repo; back them up securely.

## 9. Performance Considerations

- Pipelines: cache dependencies and Docker layers, run independent jobs in parallel, path filters in monorepos; target < 10 minutes for PR CI.
- Images: small final images (faster pull/start); set container CPU/memory requests and limits and tune runtime memory to them (e.g. Node `--max-old-space-size`).
- Autoscaling based on CPU/latency/queue depth; load test before major launches.

## 10. Anti-Patterns to Avoid

| Do not | Do instead | Why |
| --- | --- | --- |
| Deploy from a laptop | CI/CD pipeline | Reproducible, audited |
| `latest` tags | Pinned versions / SHA tags | Reproducible rollback |
| Rebuild the image for production | Promote the tested image | Tested == deployed |
| Secrets baked into images or repo | Runtime secret injection | Leakage |
| Flaky tests re-run until green | Fix or quarantine with an issue | Trust in CI |
| DB migration coupled to destructive change | Expand/contract | Safe rollback |
| Database container on a single VM as "production" | Managed/HA database with backups | Data durability |

## 11. Definition of Done

- [ ] Pipeline passes on the PR; required checks unchanged or stricter
- [ ] Dockerfile builds, runs as non-root, image scanned
- [ ] `.env.example` and docs updated for new variables
- [ ] Deploy path includes health check and documented rollback
- [ ] No secrets in diff, logs, or artifacts
- [ ] Runbook updated for operational changes

## 12. Code Review Checklist

- [ ] Least-privilege permissions and pinned actions/images?
- [ ] Same artifact promoted across environments?
- [ ] Secrets scoped, never echoed; fork PRs safe?
- [ ] Health checks, timeouts, and rollback present?
- [ ] Caching correct (keyed by lockfile) and not caching secrets?
- [ ] Migrations ordered before app rollout and backward compatible?
- [ ] Observability (logs/metrics/alerts) covers the change?
