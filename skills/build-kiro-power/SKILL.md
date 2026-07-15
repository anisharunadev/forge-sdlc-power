---
name: build-kiro-power
description: Build a Kiro Power using the ECC pattern — thin POWER.md intake, an orchestrator sub-agent that spawns focused sub-agents per stage, on-demand steering for knowledge, and hooks for cross-cutting policy. Use this when starting a new Kiro Power from scratch or refactoring an existing one.
metadata:
  origin: forge-sdlc ECC-pattern adaptation
  based-on: affaan-m/ecc
---

# Build a Kiro Power — ECC pattern

This is the meta-skill. Use it whenever you are about to build a new Kiro Power. Following this pattern is what makes a Power "ECC-compatible" — meaning it composes with other ECC-pattern Powers, inherits shared governance from `rules/`, and benefits from the same hook enforcement.

## When to use

- You are starting a new Kiro Power from scratch
- You are refactoring an existing Power that uses monolithic system prompts or unbounded sub-agents
- You want a new Power to inherit shared governance (security, coding-style, testing) automatically

## When NOT to use

- The Power is genuinely a single-shot tool (e.g. "format this file," "explain this error"). Use a plain Kiro command instead.
- You need a workflow with more than 7 stages. The pattern scales, but at that point you should split into multiple Powers that compose.
- You are building a Power that does not need cross-cutting policy enforcement. Without that, you don't need hooks.

## The pattern in one screen

```
<power-name>/
├── POWER.md                    # frontmatter + activation keywords + architecture diagram
├── mcp.json                    # external integrations (Jira, GitHub, etc.)
├── steering/                   # SKILL.md equivalent — on-demand knowledge
│   ├── 00-governance.md       # Always mode — every sub-agent sees this
│   ├── 01-...md               # On-demand (fileMatch or description match)
│   └── NN-...md
├── rules/                      # ECC rules layer (governance that all ECC Powers share)
│   ├── common/                # language-agnostic
│   ├── typescript/            # TS-specific extensions
│   └── python/                # Python-specific extensions
├── .kiro/agents/               # sub-agents — tool-bundle-per-stage
│   ├── orchestrator.json      # team lead — coordination only
│   ├── <stage1>.json          # narrow allowedTools
│   ├── <stage2>.json
│   └── ...
├── hooks/                      # PreToolUse, PostToolUse, SessionStart, PreCompact, SessionEnd
│   ├── hooks.json
│   └── *.js / *.sh
└── README.md
```

## Step 1 — POWER.md

The frontmatter is the user-facing surface. Get it right:

```yaml
---
name: <kebab-case>
description: <one sentence — what this Power does, NOT how>
keywords:
  - <activation-word-1>
  - <activation-word-2>
activation: keyword
version: 0.1.0
---
```

Rules:
- `description` is **one sentence, under 30 words**. The harness uses it for routing. Bloated descriptions = fires too often. ECC's own analysis: keep it short and specific.
- `keywords` are the activation handles. Pick 3–5 distinct ones, not 20.
- `name` must match the directory name. Kiro rejects mismatches.

After the frontmatter, write the architecture diagram and "When to activate" section. The user sees this when they read the Power.

## Step 2 — orchestrator.json

The orchestrator is the only sub-agent that always exists. It coordinates; it does not execute.

```json
{
  "name": "orchestrator",
  "model": "opus",
  "allowedTools": ["Read", "Glob", "Grep", "Task", "TodoWrite"],
  "deniedTools": ["Write", "Edit", "Bash", "MultiEdit"],
  "stages": [
    { "id": 1, "agent": "stage1-name", "gate": "always" },
    { "id": 2, "agent": "stage2-name", "gate": "stage1_verdict == PASS" }
  ],
  "maxCycles": 1
}
```

Rules:
- `deniedTools` must include `Write`, `Edit`, `Bash`, `MultiEdit`. The orchestrator coordinates via Task spawn; if it edits files, the workflow is wrong.
- `stages[i].gate` is a simple expression over prior `verdict` values. The orchestrator parses the `VERDICT:` line from each stage's output.
- `maxCycles` defaults to 1. Allow 2-3 only if you have a real retry loop (e.g. validator → implementer retry).

## Step 3 — sub-agent JSONs (one per stage)

For each stage, write `<stage-name>.json`:

```json
{
  "name": "<stage-name>",
  "description": "<one sentence — what this stage does>",
  "model": "sonnet",
  "allowedTools": ["Read", "Write", "Edit"],
  "deniedTools": ["Task"],
  "writablePaths": ["src/", ".forge/stage<N>-*"],
  "deniedPaths": ["**/*.lock", ".env*"],
  "systemPromptPath": "steering/00-governance.md",
  "contextSteering": ["steering/01-stage-patterns.md"],
  "outputBudgetKB": 4,
  "verdictFormat": "VERDICT: PASS | FAIL | NEEDS_INFO"
}
```

Rules (this is the heart of the pattern):
- **Tool-bundle-per-stage.** `allowedTools` is the **only** way the sub-agent can act. If it needs a tool, you must add it to the bundle. This is the security boundary.
- **`deniedTools` includes `Task` by default.** Sub-agents should not spawn other sub-agents. If they need to, the orchestrator is wrong — fix the orchestrator.
- **`writablePaths` is a positive list.** The hook layer enforces it. Default-deny is the principle.
- **`deniedPaths` is a backstop** for things you never want edited (`*.lock`, `.env*`, linter configs).
- **`outputBudgetKB` is real.** Don't exceed it. Stages that produce huge output are wrong; write the output to a file and reference the path.
- **`verdictFormat` is the contract.** The orchestrator parses the `VERDICT:` line. Be strict about format.

## Step 4 — steering/

Steering files are the on-demand knowledge layer. Three modes:

| Mode | Frontmatter | When to load |
|---|---|---|
| Always | `inclusion: always` | Every sub-agent, every stage. Use for governance. |
| File-match | `inclusion: fileMatch` + `fileMatchPattern: "**/*.{ts,py}"` | When the active diff touches matching files. |
| Description | `inclusion: on-demand` + rich `description:` | The harness matches the description to current context semantically. |

Rules:
- **Keep `00-governance.md` short.** Every sub-agent pays the context cost. Aim for <100 lines.
- **One steering file per concept, not per stage.** Stage-specific guidance goes in the stage agent's `contextSteering`, not in a steering file.
- **Description-based routing depends on the `description` field being clear.** ECC's analysis: ≤30 words, specific triggers, no vague verbs.

## Step 5 — rules/

Copy the relevant `rules/` files into `steering/rules/` with `inclusion: always`. The rules layer is the shared governance that all ECC-pattern Powers inherit.

Minimum viable rules for a new Power:
- `rules/common/security.md` (always)
- `rules/common/coding-style.md` (if the Power writes code)
- `rules/common/testing.md` (if the Power writes code with tests)
- `rules/<language>/coding-style.md` + `patterns.md` (language-specific)

Wire them up by symlinking or copying:

```bash
mkdir -p steering/rules/{common,typescript}
cp ../../rules/common/security.md steering/rules/common/
cp ../../rules/common/coding-style.md steering/rules/common/
# ...
```

Each file needs an `inclusion: always` frontmatter prepended.

## Step 6 — hooks/

Five event types are worth wiring:

| Event | What to do | When |
|---|---|---|
| `PreToolUse` | Block destructive ops (lockfiles, `--no-verify`, secret patterns) | Always |
| `PostToolUse` | Append to `.forge/session-log.jsonl` | Always |
| `SessionStart` | Load prior state from `.forge/state.json` | Always |
| `PreCompact` | Snapshot state before context compaction | Always |
| `SessionEnd` | Final state summary | Always |

`PreToolUse` exit code **2** = block. `stderr` message goes to the model.
`PreToolUse` exit code **0** = allow.
`PostToolUse` cannot block — it sees results, not the call.

`hooks/hooks.json` is the registration. Drop handler scripts in the same directory. Keep them pure Node stdlib (no deps) so the Power is portable.

## Step 7 — mcp.json

If the Power needs external integrations (Jira, GitHub, Slack, etc.), wire them here. Keep the env var indirection (`${env:JIRA_TOKEN}`) so secrets stay out of the repo.

## Step 8 — README

One file. Sections:
- What the Power does (1 paragraph)
- When to activate (list of keywords / scenarios)
- Architecture diagram (the same one from POWER.md, optionally simplified)
- File layout tree
- "How to customize" with 2-3 concrete examples
- Origin and pattern reference (link to this SKILL.md)

## Verification before shipping

A new Power is ready when:
- [ ] `POWER.md` frontmatter validates (name matches dir, description ≤ 30 words)
- [ ] Every sub-agent has `deniedTools` including `Task` (except orchestrator)
- [ ] Every sub-agent's `writablePaths` is a positive list (not "all except X")
- [ ] `00-governance.md` is < 100 lines
- [ ] `hooks/hooks.json` is valid JSON with at least `PreToolUse` registered
- [ ] At least one rule from `rules/common/` is wired in
- [ ] The Power can be loaded by Kiro without errors (dry-run if your harness supports it)
- [ ] The orchestrator cannot Edit/Write/Bash (test by trying)
- [ ] A test scenario actually flows through all stages to a verdict

## Anti-patterns to avoid

- **The "do everything" orchestrator.** If the orchestrator has `Bash` or `Write`, the stages are wrong. Fix the stages.
- **The "smart validator."** Validators must be deterministic. Subjective checks belong in a human review, not a sub-agent.
- **The "always-on" everything.** If every steering file is `inclusion: always`, you have no on-demand loading. Context cost balloons.
- **The "no hooks" Power.** If you skip hooks, you have no policy enforcement. Every Power needs `PreToolUse` at minimum.
- **The "monolithic system prompt."** If one steering file is >500 lines, split it. The pattern is about granularity.
- **The "stage has all tools" agent.** `allowedTools` is your security boundary. If a stage can do anything, the boundary is meaningless.

## Pattern provenance

This skill is the meta-skill of the `forge-sdlc` Power, which is itself a Kiro-Power adaptation of the [affaan-m/ecc](https://github.com/affaan-m/ecc) pattern. The primitives map 1:1:

| ECC | Kiro Power |
|---|---|
| `SKILL.md` (on-demand by `description:`) | `steering/*.md` (on-demand / fileMatch) |
| `agents/*.md` (sub-agents) | `.kiro/agents/*.json` (custom agents) |
| `commands/*.md` (slash commands) | `POWER.md` activation keywords |
| `hooks/hooks.json` (PreToolUse etc.) | Kiro plugin hook system |
| `rules/` (always-follow) | `steering/rules/` with `inclusion: always` |

The orchestrator + sub-agents + narrow tool bundles + on-demand steering + hook-enforced policy is the pattern. The content of each Power is what you write; the structure is what you copy.
