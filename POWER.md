---
name: forge-sdlc
description: Five-stage SDLC workflow — requirements, design, implement, validate, deploy. Start from a free-form requirement or a Jira/ClickUp ticket; the orchestrator materializes a ticket, spawns focused sub-agents per stage, posts humanized status updates to the configured ticket system, and gates each transition on a deterministic validator.
keywords:
  - forge
  - pillar-1
  - sdlc
  - jira-to-pr
  - plan-design-build
  - i have started working
  - let's build
  - let's ship
  - take this to PR
activation: keyword + natural-language
version: 2.1.0
origin: ECC-pattern adaptation
---

# forge-sdlc — ECC-pattern SDLC Power

This Power implements a five-stage SDLC workflow using the ECC pattern: thin command intake, an orchestrator that spawns focused sub-agents per stage, on-demand steering for knowledge injection, and hooks for cross-cutting policy enforcement.

## When to activate

Activate this Power when the user signals any of:
- A keyword: "forge", "pillar-1", "sdlc", "jira-to-pr", "plan-design-build", "take this to PR"
- A natural-language opener: "i have started working on X", "let's build X", "let's ship X", "let's get X to a PR"
- A Jira/ClickUp identifier with intent: `PROJ-401`, `task abc123`, etc.
- A free-form requirement that should go through the full pipeline

Do **not** activate for single-shot tasks (debugging, one-line edits, isolated questions). Use plain Kiro for those.

## Architecture (read this once)

```
USER TYPES KEYWORD or natural-language opener
       │
       ▼
 ┌─────────────────────────────────────────────┐
 │              orchestrator                   │
 │  ← knows the workflow, never does the work  │
 │  ← reads .forge/ticket-system.json         │
 │  ← reads .forge/post-stage-prompt.json     │
 │  ← calls <system>_post_status_update       │
 │        on every stage boundary              │
 └────────┬────────────────────────────────────┘
          │ spawns
          ▼
 ┌───────────────────────────────────────────────────────┐
 │  requirements → design → implement → validate → deploy│
 │              ↑                          ↑      ↓      │
 │              │                          └── retry     │
 │              └── if no ticket provided:                │
 │                  planner calls jira_create_ticket      │
 │                  (or clickup_create_task)              │
 └───────────────────────────────────────────────────────┘
          │
          ▼
 ┌─────────────────────────────────────────┐
 │  configured ticket system (jira/clickup) │
 │  ← every stage posts a humanized update  │
 │  ← every stage posts the next slash cmd  │
 └─────────────────────────────────────────┘
```

Each sub-agent has a **narrow `allowedTools` allowlist** (tool-bundle-per-stage). The validator cannot write code. The implementer cannot deploy. The orchestrator cannot do work itself. The deployer cannot merge PRs.

## Lifecycle entry points

The pipeline accepts two entry shapes:

| User says | What happens |
|---|---|
| `forge PROJ-401` | Orchestrator sets `.forge/ticket-id.txt = PROJ-401`, planner fetches the ticket, proceeds. |
| `i have started working on auth` | Orchestrator sets `.forge/ticket-id.txt = (empty)`, planner calls `jira_create_ticket(...)` (or `clickup_create_task(...)`), writes the new ticket id to `.forge/ticket-id.txt`, then proceeds. |

In both cases the rest of the lifecycle is identical: design → implement → validate → deploy, with a humanized status post to the configured ticket system at every stage boundary.

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
