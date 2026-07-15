# CI pipeline generation

Generates CI pipeline config from the orchestrator's `stages[]` definition. The validator runs in CI; pipeline failure = no merge. The same pattern that runs locally as sub-agents runs in CI as a single deterministic script.

## Usage

```bash
node enterprise/ci/generate.js --target github                  # to stdout
node enterprise/ci/generate.js --target github -o .github/workflows/forge-validate.yml
node enterprise/ci/generate.js --target gitlab -o .gitlab-ci.yml
node enterprise/ci/generate.js --target jenkins -o Jenkinsfile
```

If `-o` is omitted, the YAML writes to stdout. The validator script (`enterprise/ci/run-validator.js`) is always written, regardless of `-o`.

## Targets

| Target | Output | Notes |
|---|---|---|
| `github` | `.github/workflows/forge-validate.yml` | Default. |
| `gitlab` | `.gitlab-ci.yml` | |
| `jenkins` | `Jenkinsfile` | |

## What the validator does in CI

The local orchestrator's `validator` sub-agent has two kinds of checks:

1. **Deterministic** (typecheck, lint, test, format) — runs in CI.
2. **LLM-judge** (subjective quality checks) — does NOT run in CI. They're not reproducible.

The CI runner (`enterprise/ci/run-validator.js`) is the deterministic subset only. It writes the verdict to `.forge/verdict.txt` and exits with 0 (PASS) or 1 (FAIL). The pipeline uses the exit code to gate the merge.

## How the generated pipeline runs

For GitHub Actions:

```yaml
on:
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]
```

The job:
1. Detects the stack (Node, Python, Go, Rust) from the project files
2. Installs dependencies with the right package manager
3. Runs typecheck, lint, test, format checks
4. Runs the secret scan
5. Runs `enterprise/ci/run-validator.js`
6. Posts a PR comment with the verdict

## Stack detection

`generate.js` reads `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` and produces the right commands. Override by editing the generated file directly — but be aware the next `generate.js` run will overwrite (unless you add `--force`).

## Why this exists

The orchestrator's `validator` sub-agent is great when a human is reading the output. It's not great as a merge gate — it's slow, non-deterministic, and burns tokens. The CI version is fast (under 2 minutes), deterministic, and free. The same checks, different runtime.

This is the codification step. The forge-sdlc pattern becomes:
- Local: orchestrator + sub-agents + LLM judgment
- CI: deterministic subset of the same checks

Same source of truth (`.kiro/agents/validator.json` + `steering/03-quality-gates.md`), different execution model. The pattern holds across both.
