# AGENTS.md — <App Name> (Flutter)

> Root instructions for AI coding agents in this Flutter project. Replace every `<placeholder>`.
> Global standards: `docs/agents/global/AGENTS.md` (always read first). Domain rules are referenced per section below.

## Project Overview

- **Product:** <one sentence: what the app does and for whom>
- **Platforms:** Android (min SDK <24>) · iOS (<15>) · <web/desktop if any>
- **Stack:** Flutter <3.x> / Dart <3.x> · flutter_bloc · go_router · dio · drift · get_it · flutter_secure_storage
- **Backend:** <REST API base URL per flavor documented in `lib/app/flavors.dart`> · contract `docs/api/openapi.yaml`
- **Offline:** <yes: local DB is source of truth + outbox sync | no>
- **Language of UI:** <Bahasa Indonesia>; strings in `lib/core/l10n/`

## Commands

| Purpose | Command |
| --- | --- |
| Install | `flutter pub get` |
| Codegen | `dart run build_runner build --delete-conflicting-outputs` |
| Format check | `dart format --output=none --set-exit-if-changed .` |
| Analyze | `flutter analyze --fatal-infos` |
| Test | `flutter test` |
| Run dev | `flutter run --flavor dev -t lib/main_dev.dart` |
| Build release | `flutter build appbundle --flavor prod -t lib/main_prod.dart --obfuscate --split-debug-info=build/symbols` |

## Rule Routing (read only what the task needs)

| Task touches | Read |
| --- | --- |
| Any Dart/Flutter code | `docs/agents/flutter/AGENTS.md` |
| Android folder / platform channel (Kotlin) | `docs/agents/android/AGENTS.md` |
| Auth, tokens, secure storage, deep links, personal data | `docs/agents/security/AGENTS.md` |
| Tests | `docs/agents/testing/AGENTS.md` |
| New feature module, sync design, integration | `docs/agents/architecture/AGENTS.md` |
| CI workflows, signing, release | `docs/agents/devops/AGENTS.md` |
| Location/maps, WebSocket/real-time, push, background work | `docs/agents/flutter/AGENTS.md` §8–§9 + `docs/agents/security/AGENTS.md` |
| iOS folder (`Info.plist`, entitlements, `PrivacyInfo.xcprivacy`) | `docs/agents/flutter/AGENTS.md` §8 (platform configuration sync) |

## 1. Coding Standards

Follow `docs/agents/flutter/AGENTS.md` §1. Project specifics:
- Use `AppLogger` (`lib/core/logging/`) — never `print`.
- Currency formatting via `formatRupiah()` in `lib/core/utils/money.dart`; amounts are `int` rupiah.

## 2. Project Structure

```
lib/
  main_dev.dart · main_prod.dart
  app/            app.dart, router.dart, bootstrap.dart, flavors.dart
  core/           di/ network/ database/ error/ theme/ l10n/ logging/ utils/
  features/
    auth/         domain/ data/ presentation/
    <feature>/    domain/ data/ presentation/
test/             mirrors lib/
integration_test/ <critical_flow>_test.dart
docs/
  agents/         global/ flutter/ android/ security/ testing/ architecture/ devops/
  api/openapi.yaml
  adr/
```

## 3. Architecture & Design Principles

Clean Architecture, feature-first, as in `docs/agents/flutter/AGENTS.md` §3. Project decisions:
- State management: **Bloc/Cubit only**. Routing: **go_router** with auth redirect in `app/router.dart`.
- <Offline-first: entity + outbox written in one Drift transaction; `SyncService` in `core/sync/` is the only code that calls write endpoints.>

## 4. Naming Conventions

`docs/agents/flutter/AGENTS.md` §4. Feature folder names are singular business nouns (`order`, `product`, `customer`).

## 5. Dependency Management

`docs/agents/flutter/AGENTS.md` §5. Approved packages are those already in `pubspec.yaml`; anything new needs the justification block in the PR description.

## 6. Error Handling

`docs/agents/flutter/AGENTS.md` §6. Failure → message mapping lives in `lib/core/error/failure_message.dart` (localized).

## 7. Testing Requirements

`docs/agents/testing/AGENTS.md` + `docs/agents/flutter/AGENTS.md` §7. Critical flows with integration tests: <login, checkout, sync>.

## 8. Security Requirements

`docs/agents/security/AGENTS.md` + `docs/agents/flutter/AGENTS.md` §8. Tokens only through `SecureTokenStore` (`lib/core/auth/`).

## 9. Performance Considerations

`docs/agents/flutter/AGENTS.md` §9. Target devices: <low/mid Android phones with 3–4 GB RAM>; verify long lists and checkout in profile mode.

## 10. Anti-Patterns to Avoid

All tables in the referenced files apply. Project-specific: never call `dio` outside `data/`; never bypass `SyncService` for write requests.

## 11. Definition of Done

- [ ] Format, analyze (0 issues), and tests pass
- [ ] Codegen re-run if models/tables changed
- [ ] New strings localized; theme tokens used
- [ ] Domain layer free of Flutter/data imports
- [ ] Report: summary, files, how verified (device + flavor), risks

## 12. Code Review Checklist

Use `docs/agents/flutter/AGENTS.md` §12 and `docs/agents/security/AGENTS.md` §12, plus:
- [ ] Offline behavior and sync state shown correctly?
- [ ] Works on the smallest supported screen and in dark mode?
