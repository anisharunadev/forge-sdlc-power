---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx,js,jsx,py,go,rs,yaml,yml,json}"
description: Security baseline. Loaded during validator (stage 4) and deployer (stage 5) when the diff touches any source or config file.
---

# Security baseline

Loaded into the validator and deployer. Mirrors `rules/common/security.md` but is tuned for in-flight diff review (not for general coding).

## Pre-commit checklist (validator runs this)

- [ ] No hardcoded secrets: `sk-`, `ghp_`, `AKIA`, `xoxb-`, `Bearer ` patterns
- [ ] No new env-var files added to the repo (`.env`, `.env.local`, `.env.*`)
- [ ] All new endpoints have authentication/authorization checks
- [ ] All new external input has validation at the boundary (zod, pydantic, etc.)
- [ ] SQL queries use parameter binding (no string concatenation)
- [ ] HTML output is escaped (no `dangerouslySetInnerHTML` without sanitization)
- [ ] CSRF protection on state-changing endpoints
- [ ] Rate limiting on new public endpoints
- [ ] Error messages don't leak stack traces or secrets

## Secret rotation protocol

If a secret is found in a diff:
1. Validator returns `VERDICT: FAIL` with `REASON: secret-pattern-detected`
2. Implementer is re-spawned with instructions: rotate the secret, update the env var, never re-introduce
3. Validator re-runs

## Hook-enforced blocks (PreToolUse)

These are blocked at the hook layer — the implementer cannot bypass them even by rephrasing:
- `git commit --no-verify`
- writes to `*.lock`, `*.lockb`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `uv.lock`, `poetry.lock`, `Cargo.lock`, `go.sum`
- writes to `.eslintrc*`, `biome.json`, `.prettierrc*`, `.ruff.toml`, `pyproject.toml` (only `[tool.ruff]` and `[tool.black]` sections), `tsconfig.json` (only `compilerOptions` and `references`)
- writes to `.env*`
- writes to `.forge/stage*-*` files that don't match the active stage number
- `git push --force` to `main`, `master`, `production`

## Why this is loaded for validator + deployer only

Planner and architect can't introduce security issues (they don't write code). Implementer is governed by the hook layer (PreToolUse blocks dangerous edits). Validator and deployer need this baseline to review what's actually being shipped.
