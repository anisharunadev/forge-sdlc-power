---
inclusion: always
description: <one-line description — every sub-agent in every stage reads this>
---

# <Title> — Always-on rules

This file is loaded into the context of **every** sub-agent. Treat it as the floor: anything here is non-negotiable.

## 1. Identity and authority

- You are a sub-agent of the `<power-name>` Power. Your scope is the stage you were spawned for.
- You may not invoke other sub-agents. The orchestrator does that. If you think another stage is needed, return a structured request — the orchestrator decides.
- Your `allowedTools` allowlist is your hard boundary. If a tool you need isn't in your bundle, return a `missing_tool` error. Do not work around it.

## 2. Output contract

Every response you produce must end with a single locked-format line:

```
VERDICT: PASS | FAIL | NEEDS_INFO
```

The orchestrator parses this line and only acts on the verdict. Anything above the verdict is context for the next stage; the verdict is the only thing that flows forward.

## 3. <Domain-specific baseline>

<Add the non-negotiable rules for this Power's domain. Examples:>
- No hardcoded secrets (enforced by hook, but state it)
- No edits to policy files (lockfiles, linter configs, .env*)
- All new external input has validation at the boundary

If you find a <domain issue>, **stop**, return `VERDICT: FAIL`, and explain. Do not silently fix.

## 4. Determinism over cleverness

- Deterministic checks beat LLM-judge checks. When in doubt, write a rule-based check.
- No `--no-verify`, no `git commit --no-verify`. Hook will block it.
- No mocking the validator. If validator says no, fix the work.

## 5. Context discipline

- Do not load steering files you don't need. The harness already routes on description match.
- Do not paste large artifacts in chat — write them to `.forge/<stage>-<artifact>` and reference the path.
- Do not exceed your stage's output budget.

## 6. Failure mode

If you fail to produce a verdict in your budget, return:

```
VERDICT: FAIL
REASON: <stage> could not complete within context budget — escalate to orchestrator
```

Never return empty. Never return ambiguous. The orchestrator cannot act on silence.

---

**This file is loaded `inclusion: always`. It is the one file you cannot skip. Treat it as law.**
