---
inclusion: fileMatch
fileMatchPattern: "**/*.{test,spec}.{ts,tsx,js,jsx,py}"
description: Quality gates — what the validator must check. Loaded only during stage 4 (validator).
---

# Quality gates (validator contract)

This file is the **validator's contract**. The orchestrator loads it into the validator sub-agent's context. Every check listed here is required. If the validator returns `VERDICT: PASS` without running every check, the orchestrator should reject the report and re-spawn the validator.

## Deterministic checks (must run, must pass)

These are run as commands; the validator collects exit codes:

```bash
# TypeScript
tsc --noEmit                              # type errors → FAIL
pnpm test                                 # test failures → FAIL
pnpm exec eslint . --max-warnings 0       # lint warnings → FAIL

# Python
mypy --strict .                           # type errors → FAIL
pytest -x                                 # test failures → FAIL
ruff check .                              # lint → FAIL
ruff format --check .                     # format → FAIL

# Universal
detect-secrets scan                       # secrets → FAIL
git diff --stat | wc -l                   # > 800 lines changed → escalate
```

## Static analysis rules (must check, must cite)

| Rule | What it catches | How to check |
|---|---|---|
| `no-eval` | `eval()`, `new Function(...)`, bare `Function('...')` | Regex + AST scan |
| `no-hardcoded-secrets` | `sk-...`, `ghp_...`, `AKIA...` patterns | detect-secrets |
| `no-protected-file-edits` | Writes to linter configs, lockfiles, `.env*` | git diff + path match |
| `no-force-push-main` | `--force` to protected branches | shell history parse |
| `test-coverage-floor` | Coverage dropped below project floor | `coverage report` |

## Subjective checks (only when no deterministic check exists)

If you must use LLM judgment (e.g. "is the error message user-friendly?"), use this format:

```markdown
## Subjective check: <name>
**Criteria**: <one sentence>
**Evidence**: <quote from code or test output>
**Verdict**: PASS | FAIL
**Confidence**: high | medium | low
```

Subjective checks with `Confidence: low` are reported as `SKIP` — they don't block, but they show up in the report for human review.

## Verdict rules

- **PASS**: every deterministic check passed AND every subjective check is PASS or SKIP AND no `FAIL` subjective checks
- **FAIL**: any deterministic check failed OR any subjective check failed
- **NEEDS_INFO**: cannot complete validation (test environment broken, dependencies missing, etc.)

## Report format

The validator writes to `.forge/validator-report.md`:

```markdown
# Validator report — <ticket-id> — <timestamp>

## Deterministic checks
- [x] tsc --noEmit → 0 errors
- [x] pnpm test → 47/47 passed
- [ ] pnpm exec eslint . → 3 warnings (FAIL)

## Static analysis
- [x] no-eval → no matches
- [x] no-hardcoded-secrets → no matches
- [x] no-protected-file-edits → no matches

## Subjective checks
(none)

## Verdict
VERDICT: FAIL
REASON: eslint warnings exceed threshold
```

The orchestrator reads only the verdict line at the end. The full report is for humans.
