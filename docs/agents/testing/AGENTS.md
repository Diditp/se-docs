# AGENTS.md — Testing & Quality Assurance Rules

> Rules for writing, organizing, and running tests across Flutter, Android, and Node.js. Load together with the global
> `/AGENTS.md` whenever a task adds or changes behavior (which is almost always) or touches test tooling.

## Scope

All test code (`test/`, `integration_test/`, `src/test`, `src/androidTest`, `tests/`), test utilities, fixtures,
factories, coverage configuration, and CI test steps.

## 1. Coding Standards

- **MUST** follow Arrange–Act–Assert (Given–When–Then) with one behavior per test. *Why:* failures point to one cause.
- **MUST** name tests by behavior: `should <outcome> when <condition>` (Dart/TS) or backticked sentences (Kotlin).
- **MUST** assert observable behavior (returned values, emitted states, persisted data, HTTP responses), not private implementation details. *Why:* tests should survive refactoring.
- **MUST** keep tests deterministic: inject clock, UUID generator, random, and dispatchers/schedulers; no sleeps — use fake timers/virtual time.
- **MUST** keep tests independent: no shared mutable state, no reliance on execution order; each test creates its own data.
- **SHOULD** use builders/factories for test data with sensible defaults (`anOrder(total: 5000)`).

## 2. Project Structure

```
Flutter:  test/<mirror of lib>/…_test.dart · integration_test/<flow>_test.dart · test/helpers/ (fakes, builders)
Android:  src/test/… (JVM unit) · src/androidTest/… (instrumented/Compose UI) · testing/ module for shared fakes
Node.js:  tests/unit/<module>/… · tests/integration/<module>/… · tests/factories/ · tests/setup/
```

Test files mirror the source path so the test for any file is easy to find.

## 3. Architecture & Design Principles

- **Test pyramid:** many fast unit tests, fewer integration tests (real DB/HTTP boundaries), few end-to-end tests for critical journeys. *Why:* fast feedback with high confidence and low flakiness.
- **Test at the right seam:** domain/use cases and services with fakes; repositories against a real engine (PostgreSQL in Docker, Room in-memory, Drift in-memory); UI states with widget/Compose tests; critical flows end-to-end.
- **Prefer fakes over mocks** for repositories and data sources (in-memory implementations); use mocks to verify important interactions (an email is sent, a payment client is called once).
- **Contract tests** keep client and server in sync (OpenAPI schemas, generated clients).
- **Every bug gets a regression test** reproducing it before the fix.

## 4. Naming Conventions

| Stack | File | Test name |
| --- | --- | --- |
| Dart/Flutter | `create_order_test.dart` | `test('should return ValidationFailure when cart is empty', …)` |
| Kotlin | `CheckoutViewModelTest.kt` | ``fun `emits Error when payment fails`()`` |
| TypeScript | `orders.service.test.ts` / `orders.routes.int.test.ts` | `it('returns 404 when order belongs to another outlet')` |

Fakes: `Fake<Interface>`; builders: `a<Entity>()`/`build<Entity>()`; fixtures: `<entity>.fixture.json`.

## 5. Dependency Management

- Use the project's established tools; do not add another framework for the same purpose.
  - Flutter: `flutter_test`, `bloc_test`, `mocktail`, `integration_test`.
  - Android: JUnit, `kotlinx-coroutines-test`, Turbine, MockK or fakes, Room testing, Compose UI test.
  - Node.js: Vitest or Jest (whichever exists), supertest, Testcontainers or Docker Compose service DB.
- Test-only dependencies stay in dev/test scopes.

## 6. Error Handling

- Every error path that the code handles explicitly has at least one test (network failure, validation error, conflict, unauthorized).
- Tests that expect exceptions assert the specific type/code and message key, not just "throws".
- Unexpected failures in tests must fail the test; never wrap test bodies in try/catch that swallows assertion errors.

## 7. Testing Requirements

Minimum per change type:

| Change | Required tests |
| --- | --- |
| New domain logic / use case / service | Unit: success + each failure/edge case |
| New state holder (Bloc/Cubit/ViewModel) | State transitions: loading → success, loading → failure, plus user actions |
| New/changed endpoint | Integration: 2xx, 400/422, 401, 403, cross-tenant 404, idempotent retry when applicable |
| Repository / query | Integration against a real engine; concurrency test for stock/balance logic |
| Schema migration | Apply from scratch + migration test with representative data |
| Critical UI flow | Widget/Compose test for states; E2E for checkout/login/payment journeys |
| Money, tax, rounding or other calculation rules | Write the test first (TDD) from cases agreed with the business/backend; integer minor units; explicit rounding rule |
| Bug fix | Regression test that fails before the fix |
| Widget/screen owning controllers, subscriptions, timers | `dispose`/`cancel` verified (leak tracking in widget tests where the project enables it) |
| Performance change | Before/after numbers measured in profile/release mode on a real (preferably low-end) device or with a load test |

Coverage: aim for ≥ 80% on domain/service layers; coverage is a signal for untested areas, not a goal to game.

## 8. Security Requirements

- **MUST NOT** use real credentials, production data, or real personal data in tests or fixtures; use synthetic data.
- **MUST NOT** call real third-party services (payments, SMS, email) from tests; use fakes, sandboxes, or recorded contracts.
- Include authorization and validation tests as listed in `docs/agents/security/AGENTS.md`.

## 9. Performance Considerations

- Unit test suite should run in seconds; mark slow integration/E2E tests and run them in separate CI jobs.
- Reuse expensive resources safely (one DB container per suite, transaction rollback or truncation between tests).
- Performance-sensitive code gets benchmarks or load tests (k6/autocannon) run on demand, not in every PR.
- Load test scripts **MUST** declare thresholds (e.g. p95 latency, error rate) so results are pass/fail, and use realistic mixed scenarios with think time.
- Use virtual time (`fakeAsync`, `runTest`, fake timers) instead of real delays; keep E2E to critical journeys and run the device matrix on a schedule.

## 10. Anti-Patterns to Avoid

| Do not | Do instead | Why |
| --- | --- | --- |
| `sleep`/`Future.delayed` waiting for async | Fake timers, `pumpAndSettle`, virtual time | Slow and flaky |
| Asserting private calls/internal state | Assert outputs and effects | Brittle tests |
| One giant test for a whole feature | Focused tests per behavior | Clear failures |
| Skipping/deleting failing tests | Fix, or quarantine with an issue link | Hidden regressions |
| SQLite standing in for PostgreSQL | Same engine as production | Dialect differences |
| Snapshot tests for everything | Targeted assertions; snapshots for stable UI only | Noise |
| E2E selectors by visible/translated text or position | `Key`/semantics label/`testTag` | Copy and layout changes break tests |
| E2E against an uncontrolled shared staging account | Dedicated test accounts, seeded/reset data, or a deterministic fake server | Flaky, order-dependent results |
| Performance claims measured in debug mode or on an emulator | Profile/release mode on a real device; report p50/p95 | Debug/JIT numbers are not representative |
| Load tests against production or real third-party services | Staging sized like production, sandboxes/mocks for payments/SMS | Outages, cost, and accidental real transactions |

## 11. Definition of Done

- [ ] Required tests from the table above added/updated
- [ ] All test commands pass locally and in CI (no skipped tests added)
- [ ] Tests are deterministic (ran twice with the same result) and independent
- [ ] No real secrets/data/services used in tests
- [ ] Report lists what was tested automatically and what was verified manually
- [ ] Coverage reports exclude generated code (`*.g.dart`, `*.freezed.dart`, Hilt/Dagger factories) and new code meets the project's diff-coverage threshold

## 12. Code Review Checklist

- [ ] Do tests fail if the behavior breaks (would a wrong implementation pass)?
- [ ] Are failure and edge cases covered, not only the happy path?
- [ ] Are tests readable as documentation of the behavior?
- [ ] Any time, randomness, network, or order dependence?
- [ ] Is the right layer tested with the right tool (fake vs real engine)?
- [ ] Is test data minimal and built via factories?
