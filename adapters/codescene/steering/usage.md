---
inclusion: on-demand
description: How to use the CodeScene MCP adapter. Loaded when the validator is about to run a Code Health check or code review.
---

# CodeScene adapter — usage

CodeScene scores code health and surfaces deep review findings that go beyond what a linter or typechecker can catch. Use it as a **second opinion** in the validator stage, not as the primary check.

## Tool semantics

- `codescene_health_check(path)` — returns a 0-10 health score per file, with hotspot identification. Files below 7.0 should be flagged.
- `codescene_code_review(diff)` — runs a code review on a unified diff. Returns findings categorized as `must-fix | should-fix | consider`.

## When to use

- For any non-trivial implementation (more than 100 lines changed), call `codescene_health_check` on the touched files.
- For any change to a high-complexity file (cyclomatic > 15), call `codescene_code_review` on the diff.
- For trivial changes (typo fixes, dep bumps), skip CodeScene — it's noise.

## Conventions

- **CodeScene findings are advisory.** A `must-fix` finding is a `WARN` to the validator, not a `FAIL`. Lint and typecheck remain the deterministic gate.
- **Surface the score, not the raw response.** The validator report should include the lowest health score and the number of `must-fix` findings, with links to the CodeScene UI for details.
- **Don't blindly apply CodeScene's suggestions.** CodeScene's reviewer can miss context. Use human judgment for "consider" findings.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | CS_ACCESS_TOKEN wrong or expired | Surface to user, ask them to rotate. |
| `codescene_health_check` times out | File too large or service busy | Skip the file, note it in the validator report. |
| `codescene_code_review` returns no findings | Diff is too small or trivial | Expected for small changes. Move on. |

## Security

- `CS_ACCESS_TOKEN` is secret. Env var only, no inline values.
- The diff you send to CodeScene leaves your machine. Review the data-boundaries doc before enabling this adapter in a high-security environment.
