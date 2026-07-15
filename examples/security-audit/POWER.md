---
name: security-audit
description: Three-stage security audit workflow — scan, analyze, report. The orchestrator spawns a scanner (runs SAST tools), an analyzer (deduplicates and prioritizes), and a reporter (writes the audit report). Every gate is gated by deterministic rules and the validator never modifies source.
keywords:
  - security-audit
  - audit
  - sec-scan
  - sast
activation: keyword
version: 1.0.0
based-on: forge-sdlc standard-pattern template
---

# security-audit — fresh-domain example

This Power proves the architecture generalizes beyond the SDLC pipeline. Same primitives — orchestrator, sub-agents, on-demand steering, hooks — but applied to a single-domain workflow: security auditing.

## When to activate

Activate when the user says:
- "security audit", "audit this repo", "sec-scan", "sast"
- Asks for a CVE check, dependency vulnerability scan, or "is this safe to ship"

## Architecture (smaller than forge-sdlc)

```
USER TYPES "audit" or "security-audit"
       │
       ▼
 ┌─────────────────┐
 │   orchestrator   │  ← 3 stages, not 5
 └────────┬────────┘
          │ spawns
          ▼
 ┌──────────────────────────────────┐
 │  scanner → analyzer → reporter   │
 └──────────────────────────────────┘
```

Three sub-agents, not five. Smaller is fine — the pattern scales down as well as it scales up.

## How it uses the rules/ layer

The orchestrator wires the `rules/common/security.md` and `rules/common/testing.md` files into `steering/rules/` with `inclusion: always`. The scanner agent reads the security rules to know what to look for; the analyzer reads them to know how to score findings; the reporter reads them to know how to format the report.

The hooks layer is identical to forge-sdlc (PreToolUse block on `*.lock`, `.env*`, etc.). Same enforcement, different domain.

## Run it

```
forge-audit                    # full repo
forge-audit --path src/auth/   # scope to a path
forge-audit --diff origin/main # only audit the diff
```

## Customizing

- **Add a scanner** (e.g. `gitleaks`, `trivy`): append to `scanner.json`'s `allowedTools` Bash allowlist and add the command to the scanner's system prompt.
- **Add a severity gate**: edit `orchestrator.json` to require `analyzer_verdict` to be `PASS` for `severity == "critical"` findings before `reporter` runs.
- **Wire a Slack notifier**: add a `PostToolUse` hook that posts the report URL when `reporter` finishes.

## Why this is an example, not a finished product

This Power is intentionally smaller than `forge-sdlc` to show the pattern fits any workflow, not just multi-stage pipelines. Use it as a starting point — the structure, not the content, is the point.
