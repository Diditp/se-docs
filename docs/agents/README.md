# AI Agent Instructions — Index

This folder is a reusable **rule library for AI coding agents**. Its purpose: when an agent builds or changes a project,
the result follows our engineering best practices **and** our own conventions, consistently, without repeating the same
instructions in every prompt.

- **Learning documentation** (the website's topic pages) explains concepts and reasoning for humans.
- **AGENTS.md files** (this folder) are short, enforceable rules for agents. They state what to do, what to avoid, and why.

## Structure

```
/AGENTS.md                              Global engineering standards (always loaded)
/docs/agents/
  README.md                             This index
  flutter/AGENTS.md                     Flutter & Dart rules
  android/AGENTS.md                     Kotlin & Android native rules
  backend/AGENTS.md                     Node.js & TypeScript backend rules
  database/AGENTS.md                    SQL, schema, migration, query rules
  devops/AGENTS.md                      Docker, CI/CD, deployment rules
  security/AGENTS.md                    Application security requirements (cross-cutting)
  testing/AGENTS.md                     Testing & QA rules (cross-cutting)
  architecture/AGENTS.md                Architecture & system design rules (cross-cutting)
  shims/                                Pointer files for tools with their own instruction file names
  templates/<project-type>/             Ready-to-use project setups (README + root AGENTS.md)
```

Every rule file has the same 12 sections so agents and humans always know where to look:

1. Coding Standards · 2. Project Structure · 3. Architecture & Design Principles · 4. Naming Conventions ·
5. Dependency Management · 6. Error Handling · 7. Testing Requirements · 8. Security Requirements ·
9. Performance Considerations · 10. Anti-Patterns to Avoid · 11. Definition of Done · 12. Code Review Checklist

## How agents load only the relevant rules

1. The agent always reads the project's **root `AGENTS.md`** (project facts, commands, and a routing table).
2. The routing table tells it which rule files to read for the task (e.g. Dart code → `docs/agents/flutter/AGENTS.md`;
   anything touching auth → also `docs/agents/security/AGENTS.md`).
3. In monorepos, a package-level `AGENTS.md` (e.g. `mobile/AGENTS.md`) is picked up automatically by agents that support
   nested instruction files when they edit files in that package.

This keeps context small (better rule-following) and avoids duplicating rules across files.

## Tool compatibility

All files are plain Markdown with no vendor-specific syntax.

| Tool | What it reads | What to do |
| --- | --- | --- |
| OpenAI Codex | `AGENTS.md` at repo root and in subdirectories | Nothing extra |
| Claude Code | `CLAUDE.md` (supports `@path` imports) | Add `shims/CLAUDE.md` to the repo root — it imports `AGENTS.md` |
| Claude (chat / Projects) | Files you attach or add to project knowledge | Add the root `AGENTS.md` + relevant rule files to the project |
| GitHub Copilot | `.github/copilot-instructions.md`; recent versions of the coding agent also read `AGENTS.md` | Add `shims/copilot-instructions.md` to `.github/` |
| Other agents | Usually a project-level Markdown file (name varies) | Point that file to `AGENTS.md` like the shims do |

Tool behavior changes over time — check each tool's documentation for the current file names and nesting support.

## Adopting the kit in a project

1. Pick a template in `templates/` that matches the project type and read its README.
2. Copy the template's `AGENTS.md` to the project root and fill every `<placeholder>`.
3. Copy `/AGENTS.md` (global) to `docs/agents/global/AGENTS.md` in the project, plus the domain rule folders the template lists.
4. Add the shims for the tools your team uses.
5. Make CI run the same commands listed in the root `AGENTS.md` (format, lint, tests).
6. Commit through a PR; treat rule changes like code changes.

## Maintenance rules

- When a new technology, architecture, or standard is added to the knowledge base, check whether a rule file needs a new
  or changed rule. Update the learning page and the rule file in the same change.
- When an agent repeats the same mistake twice, add a specific rule (with its *why*) to the most specific file.
- Remove rules that never apply. Keep each file focused; move long explanations to the learning documentation.
- Rules must be actionable and verifiable ("run X; must pass"), never vague ("write clean code").
