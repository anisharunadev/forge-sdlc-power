# security-audit — example Power

Fresh-domain example. Same primitives as `forge-sdlc`, applied to security auditing instead of a multi-stage SDLC pipeline.

## Why this exists

The `forge-sdlc` Power has 5 stages, 6 steering files, and a full SDLC pipeline. That's the **upper bound** of what the pattern supports. This Power has 3 stages, 2 steering files, and a single-pass audit. That's the **lower bound** — proof the pattern scales down.

## File layout

```
security-audit/
├── POWER.md                       # Power frontmatter + activation
├── README.md                      # this file
├── steering/
│   ├── 00-governance.md          # Always-on
│   └── 01-audit-scope.md         # On-demand
├── .kiro/agents/
│   ├── orchestrator.json         # 3 stages, no retry loop
│   ├── scanner.json              # runs SAST tools
│   ├── analyzer.json             # tightest allowedTools in the pattern
│   └── reporter.json             # pure formatter
└── hooks/
    └── hooks.json                # same as forge-sdlc, copy-paste
```

## What the pattern teaches here

1. **Tool-bundle-per-stage still holds** — the analyzer literally cannot read source code. That's a feature, not a bug: deduplication is a data operation, not a code review.
2. **The orchestrator still coordinates only** — same `deniedTools: [Write, Edit, Bash, MultiEdit]` as forge-sdlc.
3. **The hooks layer is identical** — `PreToolUse` blocks writes to source files, `*.lock`, `.env*`. Same enforcement, different domain.
4. **The rules/ layer is shared** — `../../rules/common/security.md` becomes `steering/rules/security.md` with `inclusion: always`, and the scanner reads it as its contract.

## Run it

Drop this directory into your Kiro Power catalog. From any chat:

```
audit this repo
```

The orchestrator spawns scanner → analyzer → reporter. The report lands at `.forge/audit-report.md`.

## Next: try building your own

Pick a workflow you actually need (incident response, schema migration, dependency upgrade). Copy this directory. Replace the steering content, replace the agent JSONs, keep the structure. The pattern is the part you copy; the content is what you write.
