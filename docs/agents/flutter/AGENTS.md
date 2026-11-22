# AGENTS.md — Flutter & Dart Rules

> Domain rules for Dart/Flutter code. Load together with the global `/AGENTS.md`.
> Target: Flutter 3.x stable, Dart 3.x (null safety, records, patterns, sealed classes).
> Default stack assumed below: `flutter_bloc`, `dio`, `drift`, `get_it`, `go_router`. If the project uses a different
> library for the same job, keep the **rule** and replace the library name — do not introduce a second library.

## Scope

Applies to `lib/`, `test/`, `integration_test/`, `pubspec.yaml`, `analysis_options.yaml`, and platform folders only when
they are edited for Flutter integration. Native Android rules: `docs/agents/android/AGENTS.md`.

## Commands

| Purpose | Command |
| --- | --- |
| Install | `flutter pub get` |
| Code generation | `dart run build_runner build --delete-conflicting-outputs` |
| Format (check) | `dart format --output=none --set-exit-if-changed .` |
| Analyze | `flutter analyze --fatal-infos` (must report 0 issues) |
| Tests | `flutter test` · single file: `flutter test test/path/to/file_test.dart` |
| Coverage | `flutter test --coverage` |
| Run (flavor) | `flutter run --flavor dev -t lib/main_dev.dart` |

**MUST NOT** run `flutter upgrade`, `flutter pub upgrade --major-versions`, or `flutter clean` unless asked. *Why:* they change the toolchain or lockfile for everyone.

## 1. Coding Standards

- **MUST** keep `analysis_options.yaml` strict (`flutter_lints` or stricter) and fix warnings instead of ignoring them. Use `// ignore:` only with a reason comment.
- **MUST** use `const` constructors wherever possible. *Why:* const subtrees are skipped on rebuild.
- **MUST** split widgets larger than ~150 lines into widget **classes**, not `_buildX()` methods. *Why:* classes can be const, rebuild independently, and be tested alone.
- **MUST** model state with sealed classes or `freezed` and handle it with exhaustive `switch`. *Why:* the compiler forces handling of loading/error states.
- **MUST** never use `!` on values that can legitimately be null; handle null explicitly. *Why:* `!` turns logic errors into runtime crashes.
- **MUST** get colors, typography, and spacing from `Theme`/design tokens in `core/theme/`; user-facing strings from localization (`AppLocalizations`). *Why:* theming, dark mode, and translation in one place.
- **MUST** represent money as `int` minor units (or `Decimal`) with its currency, never `double`; keep each calculation (tax, discount, service charge, rounding) in one tested calculator and format currency only in the UI. *Why:* floating point drifts and duplicated formulas make totals disagree with the backend. See `/fundamentals/money-financial-calculations/`.
- **SHOULD** prefer composition and small widgets over deep inheritance.

## 2. Project Structure

```
lib/
  main_dev.dart, main_prod.dart        # flavor entry points → bootstrap()
  app/                                  # App widget, router, bootstrap, flavor config
  core/                                 # cross-feature: di/, network/, database/, error/, theme/, l10n/, utils/
  features/<feature>/
    domain/       entities/ repositories/ (abstract) usecases/      ← pure Dart
    data/         models/ (DTO) datasources/ (remote, local) repositories/ (impl) mappers/
    presentation/ bloc/ (or cubit/) pages/ widgets/
test/                                   # mirrors lib/ (test/features/<feature>/...)
integration_test/                       # end-to-end flows on device/emulator
```

- **MUST** put new features under `lib/features/<feature>/` with the three layers. *Why:* feature-first keeps related code together and lets features be deleted or moved as a unit.
- **MUST NOT** import another feature's internal files directly; share through `core/` or an agreed shared domain module.

## 3. Architecture & Design Principles

- **MUST** follow the dependency rule: `presentation → domain ← data`.
  - `domain/` **MUST NOT** import `package:flutter`, `dio`, `drift`, `get_it`, or anything from `data/`/`presentation/`.
  - `presentation/` **MUST NOT** import `data/` or networking/database packages.
  - *Why:* the domain stays pure, fast to test, and independent of frameworks.
- **MUST** define repository interfaces in `domain/repositories/` and implement them in `data/repositories/`.
- **MUST** return a `Result<T>` (`Ok`/`Err(Failure)`) or throw only domain `Failure`s from repositories; library exceptions (`DioException`, `SqliteException`) **MUST NOT** leave the data layer.
- **SHOULD** add a use case when there is business logic or orchestration of several repositories; skip pass-through use cases for trivial CRUD.
- **State management:** Bloc/Cubit live in `presentation/bloc/`. They receive use cases/repositories through the constructor, **MUST NOT** receive `BuildContext`, and **MUST NOT** call `Navigator`/`ScaffoldMessenger`. Side effects (navigation, snackbars) happen in `BlocListener`.
- **Concurrency of events:** use `bloc_concurrency` transformers (`restartable` for search, `droppable` for submit buttons). *Why:* prevents stale results and double submissions.
- **Offline-first (when the app works offline):** the local database is the source of truth for UI; writes go to the entity table **and** an `outbox` table in **one** transaction; IDs are client-generated UUIDs; sync is idempotent with exponential backoff. *Why:* no data loss and no duplicates on retry.
- **DI:** register in `core/di/` — use cases & blocs as factories, repositories/data sources/clients/database as lazy singletons. **MUST NOT** call the service locator inside domain/data classes; use constructor injection.

## 4. Naming Conventions

| Item | Convention | Example |
| --- | --- | --- |
| Files | `snake_case.dart` | `create_order.dart` |
| Types | `UpperCamelCase` | `OrderRepository`, `CheckoutCubit` |
| Members, variables | `lowerCamelCase` | `totalAmount`, `loadOrders()` |
| Constants | `lowerCamelCase` (Dart style) | `defaultTimeout` |
| Private | leading `_` | `_mapFailure` |
| Bloc events | past-tense or intent noun | `OrderSubmitted`, `SearchQueryChanged` |
| States | `<Feature>State` sealed + variants | `OrdersLoading`, `OrdersLoaded` |
| DTOs | `<Name>Dto` / `<Name>Model` | `OrderDto` |
| Tests | `<file>_test.dart`, `test('should … when …')` | `create_order_test.dart` |

## 5. Dependency Management

- **MUST** justify every new package (purpose, pub.dev score/likes, publisher, last release, platform support, license). *Why:* abandoned packages block Flutter upgrades.
- **MUST NOT** add a second package for a job already covered (another state management, HTTP client, or DB).
- **MUST** commit `pubspec.lock` for apps. Use caret constraints (`^x.y.z`) in `pubspec.yaml`.
- **MUST** run code generation after changing annotated models/tables and commit generated files only if the repo already does.
- **SHOULD** prefer first-party (`flutter.dev`, `dart.dev`) or verified-publisher packages.

## 6. Error Handling

- Data layer maps errors: timeout/connection → `NetworkFailure`; 401 → `UnauthorizedFailure` (triggers token refresh/logout); 4xx validation → `ValidationFailure` with field errors; 5xx → `ServerFailure`; DB errors → `StorageFailure`.
- Presentation shows localized, actionable messages from the failure type, never `e.toString()`.
- **MUST** set up global handlers in `bootstrap()`: `FlutterError.onError` and `PlatformDispatcher.instance.onError`, forwarding to the crash reporter in release. *Why:* uncaught async errors otherwise disappear.
- **MUST** check `if (!mounted) return;` after every `await` inside `State` before using `context` or `setState`.
- **MUST** set connect/receive timeouts on the HTTP client.

## 7. Testing Requirements

- Use case / domain logic: unit tests with fakes (no Flutter binding needed).
- Bloc/Cubit: `bloc_test` for every public event/method — at least loading→success and loading→failure.
- Repository implementation: verify error mapping using mocked data sources (`mocktail`).
- Widgets for critical flows (login, checkout, payment): widget tests for each state and the main interaction.
- Database: migration tests for every `schemaVersion` bump.
- Integration tests (`integration_test/`) for the top 1–3 business flows.
- Full rules: `docs/agents/testing/AGENTS.md`.

## 8. Security Requirements

- **MUST** store refresh tokens/PIN only in `flutter_secure_storage`; access tokens in memory. **MUST NOT** use `SharedPreferences` for secrets. *Why:* SharedPreferences is plain text on disk.
- **MUST NOT** embed API secrets in Dart code or assets — everything in the app binary can be extracted.
- **MUST** use HTTPS; certificate pinning only with a documented pin-rotation plan.
- **MUST** build release with `--obfuscate --split-debug-info=<dir>` and keep symbol files for crash de-obfuscation.
- **MUST** validate deep link parameters and data received through platform channels.
- **MUST** clear session data (tokens, cached user data, local DB if required) on logout.
- **SHOULD** encrypt local databases containing personal/financial data (SQLCipher) with a key from secure storage.
- **MUST** keep platform configuration in sync when adding a capability: Android manifest permissions/components **and** iOS `Info.plist` usage descriptions, entitlements/capabilities, and `PrivacyInfo.xcprivacy`. *Why:* a missing iOS usage description crashes the app when the API is called and fails App Review.
- **MUST NOT** enable `NSAllowsArbitraryLoads` (iOS ATS) or global cleartext traffic (Android); scope any exception to a named local host with a comment explaining why.
- **MUST** choose the iOS Keychain accessibility explicitly (`first_unlock_this_device` only when background code needs the secret, otherwise `unlocked_this_device`) and clear stale Keychain items on a fresh install. *Why:* Keychain items can survive uninstall.
- **Location:** request when-in-use first, right before the feature needs it and after an explanation; request background location only for a core feature with a visible notification/indicator, and stop location streams when the feature ends. Handle service-off, denied, denied-forever, and approximate-location results with a usable fallback. **MUST NOT** trust device location alone for attendance/payments; the server validates. Restrict map API keys by package/SHA-1 and bundle id.
- **MUST NOT** design features that require periodic background execution on iOS; background work is opportunistic there — sync on launch/resume and show pending state. *Why:* iOS suspends apps quickly and does not guarantee scheduled tasks.
- **MUST NOT** ship API keys for paid third-party services (LLM/AI providers, SMS, email, payment server APIs) inside the app; call them through the backend, which enforces auth, quotas and input limits. *Why:* anything in the APK/IPA can be extracted. See `/ai-engineering/apps/ai-features-mobile/`.

## 9. Performance Considerations

- **MUST NOT** create Futures/Streams inside `build()`; create them in `initState` or state management.
- **MUST** use `ListView.builder`/slivers for long lists and `ValueKey(entity.id)` for stateful items.
- **MUST** move CPU work > ~16 ms (large JSON parse, image processing, encryption) to `Isolate.run`.
- **MUST** dispose `TextEditingController`, `AnimationController`, `ScrollController`, `FocusNode`, `StreamSubscription`, `Timer`.
- **MUST** close WebSocket connections when the app is paused, reconnect on resume with exponential backoff + jitter, and re-sync missed data via REST; push notifications cover the background case.
- **SHOULD** use `BlocSelector`/`context.select` to limit rebuilds; decode images at display size (`cacheWidth`/`cacheHeight`).
- Measure in **profile mode on a real device** with DevTools before and after optimizations.

## 10. Anti-Patterns to Avoid

| Do not | Do instead | Why |
| --- | --- | --- |
| HTTP/DB calls inside widgets | Repository → use case → bloc | Testability, separation |
| Multiple booleans `isLoading/isError` | Sealed state | Impossible states disappear |
| `setState` for app-wide state | Bloc/Cubit | Shared, testable state |
| `BuildContext` stored in fields/singletons | Pass callbacks/use listeners | Leaks and crashes |
| `GlobalKey` to reach other widgets' state | Lift state up / state management | Coupling, cost |
| `print()` for logging | `AppLogger` (debug only, redacted) | Leaks data in release |
| Editing `*.g.dart` / `*.freezed.dart` | Re-run build_runner | Overwritten on next build |
| Hardcoded strings/colors | l10n + theme tokens | i18n, dark mode |

## 11. Definition of Done

- [ ] `dart format --output=none --set-exit-if-changed .` passes
- [ ] `flutter analyze --fatal-infos` → 0 issues
- [ ] `flutter test` passes; new logic has tests (unit + bloc; widget test for critical UI)
- [ ] Code generation re-run when models/tables changed
- [ ] No `domain/` import of Flutter/data packages; no `presentation/` import of `data/`
- [ ] All controllers/subscriptions disposed; `mounted` checked after `await`
- [ ] Strings localized; theme tokens used
- [ ] Report includes manual test steps (device, flavor, flow)

## 12. Code Review Checklist

- [ ] Correct layer for each change? Repository interface in domain, implementation in data?
- [ ] Failures mapped and shown as friendly localized messages?
- [ ] Loading, empty, error, and offline states handled in UI?
- [ ] No rebuild hotspots (large widgets rebuilding on unrelated state)?
- [ ] Resource disposal and `mounted` checks present?
- [ ] Secrets/tokens handled per Security section; nothing sensitive logged?
- [ ] Offline/sync code: single transaction for entity + outbox, idempotent IDs?
- [ ] Tests assert behavior and are deterministic?
