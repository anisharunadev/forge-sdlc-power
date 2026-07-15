---
inclusion: always
description: Always-on governance for the security-audit Power. Inherits from forge-sdlc/00-governance.md with audit-specific additions.
---

# Governance — security-audit

Same baseline as `forge-sdlc/00-governance.md` (read that first), plus:

## Audit-specific output contract

Every sub-agent ends with a `VERDICT:` line, but for audits the verdict has one extra field:

```
VERDICT: PASS | FAIL | NEEDS_INFO
FINDINGS: <count>
SEVERITY: <none|low|medium|high|critical>
```

- `PASS` = no findings above the configured severity floor
- `FAIL` = at least one finding at or above the severity floor
- `NEEDS_INFO` = scanner could not run (missing tool, missing access)

## Read-only principle

This Power is read-only by design. **No sub-agent may write to source files.** Only the reporter may write to `.forge/audit-report.md`. The hook layer enforces this via `deniedPaths` on every agent and a `PreToolUse` check on source file paths.

If a fix is needed, the user is told to invoke `forge-sdlc` on the resulting Jira ticket, not this Power.

## Severity floor

The orchestrator's default severity floor is `medium`. A repo with only `low` findings is reported as `PASS`. A repo with any `high` or `critical` finding is `FAIL`.

Override per-invocation: `forge-audit --severity high` raises the floor (more permissive). `forge-audit --severity low` lowers it (stricter).
