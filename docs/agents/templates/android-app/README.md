# Template — Kotlin Android Application

**Use when:** building a native Android app with Kotlin, Jetpack Compose, Hilt, Room, and WorkManager, organized as
`app` + `core:*` + `feature:*` Gradle modules (or the same packages in a single module for small apps).

## Files in this template

| File | Copy to |
| --- | --- |
| `templates/android-app/AGENTS.md` | `AGENTS.md` (root) |
| `/AGENTS.md` (global) | `docs/agents/global/AGENTS.md` |
| `android/`, `database/`, `security/`, `testing/`, `architecture/` rule files | `docs/agents/<same>/AGENTS.md` |
| `devops/AGENTS.md` (if CI/release is here) | `docs/agents/devops/AGENTS.md` |
| shims | `CLAUDE.md`, `.github/copilot-instructions.md` |

## Resulting structure

```
my-android-app/
├── AGENTS.md · CLAUDE.md · .github/copilot-instructions.md
├── docs/agents/{global,android,database,security,testing,architecture}/AGENTS.md
├── app/ · core/{designsystem,network,database,common,testing}/ · feature/<name>/
├── gradle/libs.versions.toml
└── settings.gradle.kts · build.gradle.kts
```

## Setup (PowerShell)

```powershell
$kb = 'D:\projects\se-docs'; $p = 'D:\projects\my-android-app'
Copy-Item "$kb\docs\agents\templates\android-app\AGENTS.md" "$p\AGENTS.md"
New-Item -ItemType Directory -Force "$p\docs\agents\global" | Out-Null
Copy-Item "$kb\AGENTS.md" "$p\docs\agents\global\AGENTS.md"
foreach ($d in 'android','database','security','testing','architecture') {
  New-Item -ItemType Directory -Force "$p\docs\agents\$d" | Out-Null
  Copy-Item "$kb\docs\agents\$d\AGENTS.md" "$p\docs\agents\$d\AGENTS.md"
}
Copy-Item "$kb\docs\agents\shims\CLAUDE.md" "$p\CLAUDE.md"
New-Item -ItemType Directory -Force "$p\.github" | Out-Null
Copy-Item "$kb\docs\agents\shims\copilot-instructions.md" "$p\.github\copilot-instructions.md"
```

## First prompt to try

> Read AGENTS.md and the routed rule files. Add `feature:workorder` with a list screen backed by Room (Flow) and a
> refresh from the API, a ViewModel exposing `StateFlow<WorkOrderUiState>`, Hilt bindings, ViewModel tests with Turbine,
> and a Room DAO test. Plan first, then implement and run the Definition of Done commands.
