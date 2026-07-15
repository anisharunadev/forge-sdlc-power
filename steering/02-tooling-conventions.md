---
inclusion: fileMatch
fileMatchPattern: "**/{package.json,pyproject.toml,go.mod,Cargo.toml,*.lock}"
description: Tooling and dependency conventions. Loaded when the active stage touches build files or lockfiles.
---

# Tooling conventions

Loaded when a stage touches build files or lockfiles. The orchestrator routes this on `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, or any `*.lock` file appearing in the active diff.

## Forbidden by hook (PreToolUse exit 2)

- Editing `*.lock` files directly — regenerate from manifest
- Editing `.eslintrc*`, `biome.json`, `.ruff.toml`, `[tool.ruff]` in `pyproject.toml` — these are policy files, fix the code not the config
- Editing `.env*` — secrets are environment-scoped, never repo-scoped
- Running `git commit --no-verify` — bypasses the validator
- Running `git push --force` to `main` or `master`
- Writing to any file under `.forge/` that doesn't match the current stage (e.g. implementer writing to `stage4-validator-report.md`)

## Conventions

### TypeScript
- `package.json` is the source of truth. `pnpm-lock.yaml` is regenerated, not hand-edited.
- `tsconfig.json` `strict: true` is non-negotiable. Don't soften it.
- New deps go in `dependencies` if imported at runtime, `devDependencies` otherwise.

### Python
- `pyproject.toml` is the source of truth. `uv.lock` or `poetry.lock` is regenerated.
- `ruff` for lint+format. `mypy --strict` for type checking. Don't replace with flake8/black.
- Type hints required on all new public functions.

### Go
- `go.mod` is the source of truth. Tidy after every change.
- `go vet` and `staticcheck` are the floor.

### Rust
- `Cargo.toml` is the source of truth. `Cargo.lock` regenerated.
- `cargo clippy -- -D warnings` is the floor.

## Why this exists

Tooling files are the policy surface. If a sub-agent silently "fixes" a lint config to make errors go away, the whole SDLC collapses — the validator was the one thing we could trust, and the fix bypassed it. The hook blocks the edit so the implementer has to fix the actual code.
