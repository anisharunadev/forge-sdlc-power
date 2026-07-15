---
name: <power-name>
description: <one sentence — what this Power does, NOT how. Under 30 words.>
keywords:
  - <activation-word-1>
  - <activation-word-2>
activation: keyword
version: 0.1.0
---

# <Power Title> — ECC-pattern Power

This Power follows the [ECC pattern](../../skills/build-kiro-power/SKILL.md). It uses:
- An orchestrator sub-agent that coordinates, never executes
- Focused sub-agents per stage, each with a narrow `allowedTools` bundle
- On-demand steering for knowledge injection
- Hooks for cross-cutting policy enforcement

## When to activate

Activate this Power when the user signals any of:
- "<activation-word-1>", "<activation-word-2>"

Do **not** activate for single-shot tasks. Use plain Kiro for those.

## Architecture

```
USER TYPES KEYWORD
       │
       ▼
 ┌─────────────────┐
 │   orchestrator   │  ← knows the workflow, never does the work
 └────────┬────────┘
          │ spawns
          ▼
 ┌──────────────────────────────────┐
 │  stage1 → stage2 → stage3        │
 └──────────────────────────────────┘
```

## Steering layout

| File | Mode | Loaded when |
|---|---|---|
| `steering/00-governance.md` | Always | Every sub-agent, every stage |
| `steering/01-...md` | On-demand | When relevant |

## Hooks

`hooks/hooks.json` wires five event handlers: PreToolUse, PostToolUse, SessionStart, PreCompact, SessionEnd.

## Quick start

1. Drop this directory into a Kiro Power catalog
2. Copy the rules you need from `rules/` into `steering/rules/` with `inclusion: always`
3. Activate with one of the keywords above

## Customizing

- **Add a stage**: edit `orchestrator.json` and add the new agent JSON under `.kiro/agents/`
- **Swap a stage model**: change the `model` field in the agent JSON
- **Add a hook**: append to `hooks/hooks.json` and drop the script in `hooks/`

## Origin and pattern reference

Built on the [affaan-m/ecc](https://github.com/affaan-m/ecc) pattern via [skills/build-kiro-power/SKILL.md](../../skills/build-kiro-power/SKILL.md).
