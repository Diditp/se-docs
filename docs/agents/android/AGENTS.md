# AGENTS.md — Kotlin & Android Native Rules

> Domain rules for Kotlin/Android code (standalone apps and the Android side of Flutter plugins/platform channels).
> Load together with the global `/AGENTS.md`. Target: Kotlin 2.x, Android Gradle Plugin 8.x, Jetpack Compose,
> single-activity, following the official Android app architecture guide (UI layer → optional domain layer → data layer).

## Scope

Applies to `app/`, `core/`, `feature/` Android modules, `android/` inside Flutter projects, `*.kt`, `*.gradle.kts`,
`gradle/libs.versions.toml`, and `AndroidManifest.xml`.

## Commands

| Purpose | Command |
| --- | --- |
| Build debug | `./gradlew :app:assembleDebug` |
| Unit tests | `./gradlew testDebugUnitTest` |
| Instrumented tests | `./gradlew connectedDebugAndroidTest` (emulator required) |
| Lint | `./gradlew lintDebug` |
| Static analysis / format | `./gradlew detekt ktlintCheck` · fix: `./gradlew ktlintFormat` |

On Windows use `gradlew.bat`. **MUST NOT** change AGP/Kotlin/Gradle wrapper versions or `libs.versions.toml` entries unrelated to the task.

## 1. Coding Standards

- **MUST** follow the official Kotlin coding conventions (enforced by ktlint/detekt).
- **MUST** prefer `val`, immutable collections, and `data class`/sealed interfaces for models and UI state. *Why:* immutability removes a class of concurrency bugs.
- **MUST NOT** use `!!` except in tests; handle nullability explicitly. *Why:* `!!` converts nullability bugs into crashes.
- **MUST** expose read-only types (`StateFlow`, `List`) and keep mutable ones private (`MutableStateFlow`, `MutableList`).
- **MUST** keep Composables small and stateless where possible (`FeatureScreen(state, onEvent)`), hoisting state to the caller.
- **MUST** put user-visible text in `strings.xml`, dimensions/colors in the design system module.

## 2. Project Structure

```
app/                         # Application, MainActivity, navigation graph, DI entry
core/
  designsystem/              # theme, components
  network/                   # Retrofit/OkHttp or Ktor setup, interceptors
  database/                  # Room database, DAOs, migrations
  common/                    # dispatchers, result types, utils
feature/<name>/
  ui/                        # <Name>Route.kt, <Name>Screen.kt, <Name>ViewModel.kt, <Name>UiState.kt
  domain/                    # use cases (optional), domain models
  data/                      # repository impl, local/, remote/, mappers
```

Single-module apps keep the same packages under `app/src/main/java/<pkg>/`. Tests mirror sources in `src/test` (JVM) and `src/androidTest` (device).

## 3. Architecture & Design Principles

- **MUST** use unidirectional data flow: UI sends events → ViewModel → use case/repository → `StateFlow<UiState>` → UI.
- **MUST NOT** hold `Context`, `Activity`, `View`, `Fragment`, or `NavController` in a ViewModel or repository (use `@ApplicationContext` only in data classes that truly need it). *Why:* memory leaks and lifecycle bugs.
- **MUST** make the repository the single source of truth; expose `Flow` for observed data and `suspend` functions for one-shot operations.
- **MUST** keep Room entities, network DTOs, and domain/UI models separate, converted by mappers. *Why:* API or schema changes must not ripple into UI.
- **MUST** collect flows in UI with `collectAsStateWithLifecycle()` (Compose) or `repeatOnLifecycle(STARTED)` (Views).
- **MUST** persist small UI input that must survive process death in `SavedStateHandle` / `rememberSaveable`.
- **MUST** use WorkManager (`CoroutineWorker`) for deferrable work that must complete (sync, upload) with network constraints and exponential backoff.
- **MUST** use a foreground service only for ongoing, user-visible work, declare the matching `android:foregroundServiceType` and its permission (Android 14+), and stop it when the work ends. *Why:* the platform rejects undeclared types and Play reviews FGS usage.
- **MUST** request runtime permissions in context (when the feature is used) via the Activity Result API, handle denial and permanent denial with a usable fallback, and prefer permission-free APIs (Photo Picker, system camera intent, approximate location). *Why:* least privilege and better grant rates.
- **Flutter integration:** platform channel handlers **MUST** move work off the main thread, validate arguments, and return typed errors (`result.error(code, message, details)`). Prefer `pigeon` for type-safe channels.

## 4. Naming Conventions

| Item | Convention | Example |
| --- | --- | --- |
| Classes/objects | `UpperCamelCase` | `OrderRepository` |
| Functions/properties | `lowerCamelCase` | `loadOrders()` |
| Constants | `SCREAMING_SNAKE_CASE` in `companion object`/top level `const val` | `MAX_RETRY` |
| Composables | `UpperCamelCase` nouns | `OrderList()` |
| Screen pieces | `<Feature>Route`, `<Feature>Screen`, `<Feature>ViewModel`, `<Feature>UiState` | `CheckoutScreen` |
| Resources | `snake_case` with type prefix | `ic_cart`, `checkout_title` |
| Packages | lowercase, no underscores | `com.example.pos.feature.checkout` |
| Tests | backtick names | `` `emits error when network fails`() `` |

## 5. Dependency Management

- **MUST** declare versions in `gradle/libs.versions.toml` (version catalog) and use BOMs (Compose, Firebase, OkHttp) where available.
- **MUST** justify new libraries (purpose, maintenance, size impact, license). Prefer AndroidX/Jetpack.
- **MUST** use Hilt (or the project's existing DI) with constructor injection; bind interfaces with `@Binds`.
- **MUST NOT** add dynamic versions (`1.+`). *Why:* non-reproducible builds.

## 6. Error Handling

- Repositories return `Result<T>`/sealed results or throw domain exceptions; map `IOException`, `HttpException`, `SQLiteException` at the data boundary.
- **MUST NOT** catch `CancellationException` without rethrowing (beware `runCatching` in coroutines). *Why:* breaks structured concurrency.
- ViewModels convert failures into `UiState.Error` with a string resource id, never raw exception messages.
- **MUST** set timeouts on OkHttp/Ktor clients and handle 401 with a single synchronized token refresh.

## 7. Testing Requirements

- ViewModel: JVM unit tests with `runTest`, a `MainDispatcherRule`, fake repositories, and Turbine to assert `StateFlow` emissions.
- Repository: mapping and error handling tests; DAOs tested with in-memory Room.
- Room migrations: `MigrationTestHelper` test for every version bump.
- Compose UI tests for Loading/Success/Error states of important screens.
- Inject `CoroutineDispatcher`s (qualifiers) so tests can use `StandardTestDispatcher`.

## 8. Security Requirements

- **MUST** store tokens encrypted with Android Keystore-backed keys; **MUST NOT** use plain `SharedPreferences` for secrets. Do not add new usages of the deprecated `androidx.security:security-crypto` (EncryptedSharedPreferences); use Keystore + AES-GCM (e.g. Tink) with DataStore or a maintained wrapper. *Why:* deprecated libraries stop receiving security fixes.
- **MUST** declare `android:exported` explicitly; validate all `Intent` extras and deep-link data; use explicit intents for internal components.
- **MUST** keep `usesCleartextTraffic="false"`; use Network Security Config for pinning only with a rotation plan.
- **MUST** apply `FLAG_SECURE` to screens showing sensitive data (PIN, balances, personal data).
- **MUST** enable R8 minification in release; keep rules minimal and commented.
- **MUST NOT** log personal data or tokens in release builds (plant only a debug logging tree).
- **SHOULD** disable or restrict `android:allowBackup` / define backup rules for sensitive data.

## 9. Performance Considerations

- **MUST NOT** use `runBlocking` or blocking I/O on the main thread; inject `@IoDispatcher` for blocking work.
- **MUST** use stable keys in `LazyColumn`/`LazyRow` (`key = { it.id }`) and avoid allocating in composition (use `remember`, `derivedStateOf`).
- **SHOULD** defer non-essential initialization at app start (App Startup, lazy injection) and ship Baseline Profiles for production apps.
- **SHOULD** check for leaks with LeakCanary in debug builds.

## 10. Anti-Patterns to Avoid

| Do not | Do instead | Why |
| --- | --- | --- |
| `GlobalScope.launch` | `viewModelScope`/`lifecycleScope` | Leaks, no cancellation |
| Logic in Activity/Fragment/Composable | ViewModel + use case | Testability |
| `SharedFlow` without replay for UI state | `StateFlow` | State lost on rotation |
| `fallbackToDestructiveMigration()` in release | Real migrations + tests | Silent user data loss |
| Static reference to Context/Activity | Application context or DI | Memory leaks |
| Hardcoded `Dispatchers.IO` in testable classes | Injected dispatcher | Deterministic tests |

## 11. Definition of Done

- [ ] `./gradlew ktlintCheck detekt lintDebug testDebugUnitTest` passes
- [ ] No new lint errors; no `!!`, `GlobalScope`, or `runBlocking` added in production code
- [ ] Room schema change has migration + migration test
- [ ] Screen changes verified for rotation and process death ("Don't keep activities")
- [ ] Report includes manual test steps and device/API level used

## 12. Code Review Checklist

- [ ] Unidirectional data flow respected; no Context in ViewModel?
- [ ] Flows collected lifecycle-aware; dispatchers injected?
- [ ] Errors mapped at the data boundary; cancellation not swallowed?
- [ ] Exported components, intents, and deep links validated?
- [ ] Sensitive storage, logging, and `FLAG_SECURE` handled?
- [ ] Lists keyed; no heavy work in composition or on main thread?
- [ ] Tests cover state transitions and migrations?
