---
inclusion: on-demand
description: Data boundary and failure behavior for the CodeScene MCP adapter. Loaded when the user is considering enabling codescene.
---

# CodeScene data boundaries

Before enabling this adapter, understand what leaves your machine.

## What is sent to CodeScene

When the validator calls `codescene_health_check(path)` or `codescene_code_review(diff)`:

- **File contents** for any file in the call
- **Unified diffs** for any review call
- **File paths** (these can leak project structure)

What is **not** sent:
- Git history
- Commit messages (unless they're in the diff)
- File names *not* in the call
- Environment variables, secrets, or .env contents (the hook layer blocks these from any tool call anyway)

## When NOT to enable this adapter

- The repo contains customer PII in source files (CodeScene Cloud is SOC2-compliant but you may have stricter requirements)
- The repo is under export-control review
- You're not sure your security team has approved CodeScene as a sub-processor

## Failure behavior

If CodeScene is unavailable or returns an error, the validator should:

1. Log the failure in `.forge/validator-report.md` under a new "Optional checks" section
2. Treat the failure as `SKIP`, not `FAIL`
3. Continue with the rest of the validator's deterministic checks

The point: CodeScene is advisory. A CodeScene outage must not block the SDLC pipeline.

## Disabling

Once enabled, you can disable with:

```bash
node adapters/install.js --disable codescene
```

This removes the MCP server and the validator's `codescene_*` tools from `allowedTools`. The validator stops calling them automatically.
