# Template — Flutter Application

**Use when:** building or maintaining a Flutter mobile app (single package) with Clean Architecture, feature-first
folders, Bloc, REST API, and optionally offline-first storage.

## Files in this template

| File | Copy to (in your project) |
| --- | --- |
| `templates/flutter-app/AGENTS.md` | `AGENTS.md` (root) — fill all placeholders |
| `/AGENTS.md` (global) | `docs/agents/global/AGENTS.md` |
| `flutter/AGENTS.md` | `docs/agents/flutter/AGENTS.md` |
| `security/AGENTS.md`, `testing/AGENTS.md`, `architecture/AGENTS.md` | `docs/agents/<same>/AGENTS.md` |
| `android/AGENTS.md` (only if you write Kotlin/platform channels) | `docs/agents/android/AGENTS.md` |
| `devops/AGENTS.md` (if CI/release is in the repo) | `docs/agents/devops/AGENTS.md` |
| `shims/CLAUDE.md` / `shims/copilot-instructions.md` | `CLAUDE.md` / `.github/copilot-instructions.md` |

## Resulting structure

```
my_app/
├── AGENTS.md
├── CLAUDE.md
├── .github/copilot-instructions.md
├── docs/agents/{global,flutter,security,testing,architecture}/AGENTS.md
├── lib/{app,core,features}/
├── test/ · integration_test/
└── pubspec.yaml · analysis_options.yaml
```

## Setup (PowerShell)

```powershell
$kb = 'D:\Dev\Projects\software-engineer-docs'   # path to this knowledge base
$p  = 'D:\Dev\Projects\my_app'                   # your project
Copy-Item "$kb\docs\agents\templates\flutter-app\AGENTS.md" "$p\AGENTS.md"
New-Item -ItemType Directory -Force "$p\docs\agents\global" | Out-Null
Copy-Item "$kb\AGENTS.md" "$p\docs\agents\global\AGENTS.md"
foreach ($d in 'flutter','security','testing','architecture') {
  New-Item -ItemType Directory -Force "$p\docs\agents\$d" | Out-Null
  Copy-Item "$kb\docs\agents\$d\AGENTS.md" "$p\docs\agents\$d\AGENTS.md"
}
Copy-Item "$kb\docs\agents\shims\CLAUDE.md" "$p\CLAUDE.md"
New-Item -ItemType Directory -Force "$p\.github" | Out-Null
Copy-Item "$kb\docs\agents\shims\copilot-instructions.md" "$p\.github\copilot-instructions.md"
```

## Setup (bash)

```bash
KB=~/software-engineer-docs; P=~/projects/my_app
cp "$KB/docs/agents/templates/flutter-app/AGENTS.md" "$P/AGENTS.md"
mkdir -p "$P/docs/agents/global" && cp "$KB/AGENTS.md" "$P/docs/agents/global/AGENTS.md"
for d in flutter security testing architecture; do mkdir -p "$P/docs/agents/$d"; cp "$KB/docs/agents/$d/AGENTS.md" "$P/docs/agents/$d/"; done
cp "$KB/docs/agents/shims/CLAUDE.md" "$P/CLAUDE.md"
mkdir -p "$P/.github" && cp "$KB/docs/agents/shims/copilot-instructions.md" "$P/.github/"
```

## First prompt to try

> Read AGENTS.md and the rule files it routes to. Create the `customer` feature (list + detail) following the project
> structure, with repository interface in domain, Dio data source, Cubit with sealed states, widget tests for each
> state, and run the Definition of Done commands. Show the plan before writing code.
