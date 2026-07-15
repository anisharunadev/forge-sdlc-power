---
name: forge-sdlc
description: Five-stage SDLC workflow — plan, design, implement, validate, ship. The orchestrator spawns focused sub-agents per stage, each with a narrow allowedTools bundle, gated by deterministic validators and enforced by ECC-pattern hooks.
keywords:
  - forge
  - pillar-1
  - sdlc
  - jira-to-pr
  - plan-design-build
activation: keyword
version: 2.0.0
origin: ECC-pattern adaptation
---

# forge-sdlc — ECC-pattern SDLC Power

This Power implements a five-stage SDLC workflow using the ECC pattern: thin command intake, an orchestrator that spawns focused sub-agents per stage, on-demand steering for knowledge injection, and hooks for cross-cutting policy enforcement.

## When to activate

Activate this Power when the user signals any of:
- "forge", "pillar-1", "sdlc" — start the full pipeline
- "jira-to-pr" — specific entry point: ticket → PR
- "plan-design-build" — explicit stage chain
- A Jira ticket key is mentioned (e.g. `PROJ-401`) and a workflow is implied

Do **not** activate for single-shot tasks (debugging, one-line edits, isolated questions). Use plain Kiro for those.

## Architecture (read this once)

```
USER TYPES KEYWORD
       │
       ▼
 ┌─────────────────┐
 │   orchestrator   │  ← knows the workflow, never does the work
 │   (allowedTools: │     { Task, Read, write_steering, read_steering }
 │    coordination) │
 └────────┬────────┘
          │ spawns
          ▼
 ┌─────────────────────────────────────────────────┐
 │  planner → architect → implementer → validator  │
 │                              ↑         ↓        │
 │                              └── retry ┘        │
 │  validator is INDEPENDENT — different prompt,   │
 │  different allowedTools, different model        │
 └─────────────────────────────────────────────────┘
          │
          ▼
 ┌─────────────────┐
 │     deployer     │  ← only fires if validator passes
 └─────────────────┘
```

Each sub-agent has a **narrow `allowedTools` allowlist** (tool-bundle-per-stage). The validator cannot write code. The implementer cannot deploy. The orchestrator cannot do work itself.

## Steering layout

| File | Mode | Loaded when |
|---|---|---|
| `steering/00-governance.md` | Always | Every sub-agent, every stage |
| `steering/01-stage-patterns.md` | On-demand | Stage-relevant context |
| `steering/02-tooling-conventions.md` | On-demand | When touching tooling |
| `steering/03-quality-gates.md` | On-demand | During validator stage |
| `steering/04-security-baseline.md` | On-demand | During validator + deployer |

## Hooks

`hooks/hooks.json` wires five event handlers:
- `PreToolUse` — block destructive ops (no `--no-verify`, no writes to linter configs, no secret patterns)
- `PostToolUse` — capture diffs to session log
- `SessionStart` — load prior context from `.forge/state.json`
- `PreCompact` — flush state before context compaction
- `SessionEnd` — final state snapshot

## Quick start

1. Drop this directory into a Kiro Power catalog
2. Symlink or copy the rules you need from `rules/` into `steering/rules/` with `inclusion: always` frontmatter
3. Run `/forge PROJ-401` or just say "forge on PROJ-401" in chat
4. The orchestrator walks the five stages, gating on the validator at stage 4

## Customizing

- **Add a stage**: edit `orchestrator.json` and add the new agent JSON under `.kiro/agents/`
- **Swap a stage model**: change the `model` field in the agent JSON
- **Change the validator rules**: edit `steering/03-quality-gates.md` — these are loaded as the validator's contract
- **Add a hook**: append to `hooks/hooks.json` and drop the script in `hooks/`

## Origin and pattern reference

This Power is built on the [affaan-m/ecc](https://github.com/affaan-m/ecc) pattern:
- Skills (here: steering) load on-demand by description match
- Sub-agents (here: `.kiro/agents/*.json`) get narrow tool bundles
- Hooks enforce policy, not knowledge
- Rules (here: `rules/`) live in `Always` mode governance

See `skills/build-kiro-power/SKILL.md` for the full pattern specification.
