# AGENTS.md — <App Name> (Android, Kotlin)

> Root instructions for AI coding agents in this Android project. Replace every `<placeholder>`.
> Global standards: `docs/agents/global/AGENTS.md` (always read first).

## Project Overview

- **Product:** <one sentence>
- **minSdk / targetSdk:** <24> / <latest required by Google Play>
- **Stack:** Kotlin <2.x> · Jetpack Compose · Navigation Compose · Hilt · Coroutines/Flow · Room · Retrofit + OkHttp (or Ktor) · WorkManager
- **Modules:** `app`, `core:*`, `feature:*` (see structure)
- **Offline:** <Room is source of truth; sync via WorkManager | online only>

## Commands

| Purpose | Command (Windows: `gradlew.bat`) |
| --- | --- |
| Build | `./gradlew :app:assembleDebug` |
| Unit tests | `./gradlew testDebugUnitTest` |
| UI tests | `./gradlew connectedDebugAndroidTest` |
| Quality | `./gradlew ktlintCheck detekt lintDebug` |
| Release | `./gradlew :app:bundleRelease` (CI only; signing from secrets) |

## Rule Routing

| Task touches | Read |
| --- | --- |
| Kotlin/Compose/Gradle | `docs/agents/android/AGENTS.md` |
| Room schema, queries | `docs/agents/database/AGENTS.md` (migration & query rules) |
| Auth, storage of secrets, exported components | `docs/agents/security/AGENTS.md` |
| Tests | `docs/agents/testing/AGENTS.md` |
| New feature module / sync / integration | `docs/agents/architecture/AGENTS.md` |
| CI, signing, release | `docs/agents/devops/AGENTS.md` |

## 1. Coding Standards

`docs/agents/android/AGENTS.md` §1. Project specifics: logging only via `Timber` (debug tree in debug builds only).

## 2. Project Structure

```
app/                           MainActivity, AppNavHost, Application (@HiltAndroidApp)
core/designsystem/ core/network/ core/database/ core/common/ core/testing/
feature/<name>/                ui/ domain/ data/   (one Gradle module per feature)
gradle/libs.versions.toml
docs/agents/{global,android,database,security,testing,architecture,devops}/AGENTS.md
docs/adr/
```

## 3. Architecture & Design Principles

`docs/agents/android/AGENTS.md` §3. Project decisions: Compose only (no new XML layouts); one `UiState` per screen; feature modules depend on `core:*`, never on other features.

## 4. Naming Conventions

`docs/agents/android/AGENTS.md` §4. Package root: `<com.company.app>`; feature packages `<root>.feature.<name>`.

## 5. Dependency Management

Version catalog only; new libraries need justification in the PR. Approved: libraries already in `libs.versions.toml`.

## 6. Error Handling

`docs/agents/android/AGENTS.md` §6. User messages from `core/common/ErrorMessages.kt` (string resources).

## 7. Testing Requirements

`docs/agents/testing/AGENTS.md` + `docs/agents/android/AGENTS.md` §7. Shared fakes in `core:testing`.

## 8. Security Requirements

`docs/agents/security/AGENTS.md` + `docs/agents/android/AGENTS.md` §8. Token storage only via `core/network/TokenStore.kt`.

## 9. Performance Considerations

`docs/agents/android/AGENTS.md` §9. Baseline Profile module: `<baselineprofile>`; verify startup after adding initializers.

## 10. Anti-Patterns to Avoid

Referenced tables apply. Project-specific: no feature-to-feature module dependency; no direct Retrofit usage in ViewModels.

## 11. Definition of Done

- [ ] `./gradlew ktlintCheck detekt lintDebug testDebugUnitTest` passes
- [ ] Room migration + test when schema changes
- [ ] Screen verified for rotation, dark mode, and process death
- [ ] Report with device/API level and manual steps

## 12. Code Review Checklist

`docs/agents/android/AGENTS.md` §12 + `docs/agents/security/AGENTS.md` §12, plus: module dependency graph unchanged or justified?
