---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx,js,jsx,py,go,rs,yaml,yml,json}"
description: What the audit covers and what it skips. Loaded when the scanner or analyzer is active.
---

# Audit scope

The scanner sub-agent reads this to know what to scan. The analyzer reads it to know how to scope deduplication.

## In scope

- Source code in `src/`, `app/`, `lib/`, `packages/*/src/`
- Test files in `tests/`, `test/`, `__tests__/`
- Configuration: `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `tsconfig.json`
- CI/CD: `.github/workflows/*`, `.gitlab-ci.yml`
- IaC: `terraform/`, `infra/`, `k8s/`
- Container: `Dockerfile`, `docker-compose*.yml`

## Out of scope

- `node_modules/`, `__pycache__/`, `target/`, `dist/`, `build/`
- `*.lock`, `*.lockb` files (lockfile contents are derivable from manifests)
- `.env*` files (we do not read secrets even to audit them)
- `.git/`
- Binary files (`.png`, `.jpg`, `.pdf`, etc.)

## Severity scoring

| Severity | Examples | Default floor |
|---|---|---|
| `critical` | RCE, hardcoded production secrets, unauthenticated admin endpoints | FAIL |
| `high` | SQL injection, SSRF, IDOR, broken auth | FAIL |
| `medium` | XSS, CSRF, missing rate limiting, dependency vuln with fix available | FAIL |
| `low` | Info disclosure in error messages, missing security headers | warn (PASS at default floor) |
| `info` | Style nits, "consider adding" suggestions | skip |

## Tool mapping

| Tool | What it catches | When to run |
|---|---|---|
| `semgrep` | Multi-language SAST (custom ruleset in `.semgrep.yml`) | always |
| `detect-secrets` | Hardcoded secrets in source | always |
| `npm audit` / `pip-audit` | Known-vulnerable dependencies | always |
| `gitleaks` | Secret patterns in git history | `--full` flag only |
| `trivy` | IaC + container scan | if Dockerfile or k8s manifests present |

The scanner picks tools based on what's installed (`command -v semgrep` etc.) — never assumes a tool is present.
