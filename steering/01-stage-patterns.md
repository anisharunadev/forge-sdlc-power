---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx,js,jsx,py,go,rs}"
description: Stage-specific patterns — how each stage of the SDLC reads and writes code. Loaded when the active stage touches source files.
---

# Stage-specific code patterns

Each SDLC stage has a different relationship to the codebase. This file is loaded only when a stage's work actually touches source files (TypeScript, Python, Go, Rust).

## Stage 1 — planner

- **Read-only.** The planner may read files, search the repo, and write to `.forge/stage1-plan.md`. No code edits.
- Output: a structured plan with explicit success criteria the validator can check.
- Anti-pattern: vague plans like "implement feature X." Each criterion must be testable.

## Stage 2 — architect

- **Read + write design docs.** May update `ARCHITECTURE.md`, `docs/adr/*`, or create new ADRs.
- Output: an ADR with `Status: Proposed`, `Context`, `Decision`, `Consequences`.
- Anti-pattern: designing in chat. Write the ADR. The orchestrator will read it.

## Stage 3 — implementer

- **Read + write source.** May edit `src/`, `tests/`, `app/`, etc. May NOT touch `*.lock`, linter configs, `.env*`, or anything under `.forge/`.
- Output: a clean diff with passing tests.
- Anti-pattern: drive-by refactors. If you see a smell outside your scope, file it in `.forge/tech-debt.md` and move on.

## Stage 4 — validator (independent)

- **Read source + run deterministic checks.** No code edits. No file writes (except to `.forge/validator-report.md`).
- Output: a verifier report with each check marked `PASS | FAIL | SKIP`. End with `VERDICT: PASS | FAIL`.
- Anti-pattern: subjective LLM judgment. Every check must be either a deterministic rule or a citation of a specific test result.

## Stage 5 — deployer

- **Read + execute release commands.** May run `git push`, open a PR, tag a release. May NOT merge to main without explicit user approval.
- Output: PR URL + deployment status.
- Anti-pattern: silent deploys. The user must see the PR link before merge.

## Cross-stage: handoff format

Every stage-to-stage handoff must include:
1. A pointer to the stage's output artifact (`.forge/stage<N>-*.md`)
2. The verdict line
3. Any context the next stage MUST know that isn't in the artifact

If context is missing, the next stage returns `NEEDS_INFO` rather than guessing.
