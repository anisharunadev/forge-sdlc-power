# forge-sdlc — standard-pattern Kiro Power template

A reusable template for building Kiro Powers. Built and battle-tested across the FORGE SDLC pilot (M25) and the security-audit example.

The template gives you:
- An **orchestrator sub-agent** that coordinates, never executes
- **Focused sub-agents per stage**, each with a narrow `allowedTools` bundle
- **On-demand steering** for knowledge injection (load only when relevant)
- **Hooks for cross-cutting policy** (block destructive ops, capture audit trail, persist session state)
- the **standard `rules/` layer** integrated as `Always`-mode governance that every sub-agent inherits

## What this is, what this isn't

**This is:** the structural skeleton of a Kiro Power — file layout, agent JSON shapes, hook wiring, steering conventions, and the meta-skill that documents the pattern. You copy the structure, write the content for your domain.

**This isn't:** a finished Power for a specific domain. The `forge-sdlc` Power at the repo root is the canonical example (5-stage SDLC pipeline); `examples/security-audit/` is the small-end example (3-stage audit). Both are working examples, not the template.

## Quick orientation

| If you want to… | Read this |
|---|---|
| Understand the pattern in detail | [`skills/build-kiro-power/SKILL.md`](skills/build-kiro-power/SKILL.md) |
| See the canonical (large) example | [`POWER.md`](POWER.md) + [`.kiro/agents/`](.kiro/agents/) + [`steering/`](steering/) |
| See the small example | [`examples/security-audit/`](examples/security-audit/) |
| Build a new Power from this template | Copy a templates file, follow SKILL.md step by step |
| Add a new external integration (Jira, GitHub, Bitbucket, ClickUp, anything) | [`adapters/`](adapters/) + [`skills/build-adapter/SKILL.md`](skills/build-adapter/SKILL.md) |
| Adopt the governance rules | [`rules/`](rules/) — copy what you need into `steering/rules/` with `inclusion: always` |
| See the full lifecycle flow (start → ticket → status updates → PR) | [`POWER.md`](POWER.md) § "Lifecycle entry points" + [`steering/05-requirements-stage.md`](steering/05-requirements-stage.md) |
| See how the orchestrator posts humanized status updates | [`adapters/jira/steering/humanized-status.md`](adapters/jira/steering/humanized-status.md) + [`hooks/post-stage-cmd.js`](hooks/post-stage-cmd.js) |

## File layout

```
forge-sdlc-power/
├── POWER.md                           # canonical example frontmatter
├── mcp.json                           # MCP server wiring (Jira, GitHub) — populated by adapters/install.js
├── adapters/                          # pluggable external integrations
│   ├── README.md                     # adapter system overview
│   ├── adapter.schema.json           # JSON schema for adapter.json manifests
│   ├── registry.json                 # enabled/disabled state for each adapter
│   ├── install.js                    # merges per-adapter mcp.json, updates agent allowedTools
│   ├── install.test.js               # 5 install-script tests
│   ├── jira/                         # reference adapter #1
│   ├── github/                       # reference adapter #2
│   ├── bitbucket/                    # reference adapter #3
│   ├── clickup/                      # reference adapter #4
│   └── custom-template/              # scaffold for new adapters
├── steering/                          # SKILL.md equivalent — on-demand knowledge
│   ├── 00-governance.md              # Always mode
│   ├── 01-stage-patterns.md          # fileMatch — source files
│   ├── 02-tooling-conventions.md     # fileMatch — build files
│   ├── 03-quality-gates.md           # fileMatch — test files
│   └── 04-security-baseline.md       # fileMatch — diffs touching any file
├── rules/                             # always-on governance layer
│   ├── README.md
│   ├── common/                       # language-agnostic
│   ├── typescript/                   # TS/JS extensions
│   ├── python/                       # Python extensions
│   └── php/                          # PHP extensions (PSR-12, PHPUnit/Pest)
├── .kiro/agents/                      # sub-agents — tool-bundle-per-stage
│   ├── orchestrator.json             # team lead
│   ├── planner.json
│   ├── architect.json
│   ├── implementer.json
│   ├── validator.json                # INDEPENDENT — different model
│   └── deployer.json
├── hooks/                             # PreToolUse, PostToolUse, SessionStart, etc.
│   ├── hooks.json
│   ├── pre-tool-block-destructive.js
│   ├── post-tool-capture-diff.js
│   ├── session-start-load-context.js
│   ├── pre-compact-flush-state.js
│   ├── session-end-snapshot.js
│   └── __tests__/                     # 26 unit tests for hook logic
├── examples/
│   └── security-audit/                # small-end example Power
├── skills/
│   └── build-kiro-power/             # meta-skill (SKILL.md)
└── templates/                         # scaffolds to copy
    ├── power.template.md
    ├── orchestrator.template.json
    ├── agent.template.json
    ├── steering-always.template.md
    ├── steering-ondemand.template.md
    └── hook.template.json
```

## The three principles

1. **Tool-bundle-per-stage.** Every sub-agent's `allowedTools` is a positive allowlist. The orchestrator cannot Edit. The implementer cannot deploy. The validator cannot modify code it validates. This is your security boundary.

2. **Steering as Markdown, loaded on demand.** `00-governance.md` is `inclusion: always` (every sub-agent sees it). The rest are `inclusion: fileMatch` or `on-demand` — the harness matches the file pattern or the description to current context and only injects relevant content. Context cost is paid only for what matters.

3. **Hooks for policy, not knowledge.** `PreToolUse` exit 2 blocks destructive operations at the tool layer — the orchestrator physically cannot bypass them. `PostToolUse` captures audit trails. `SessionStart` / `PreCompact` / `SessionEnd` manage state across the session lifecycle.

## The orchestrator pattern

The orchestrator sub-agent is the only one with `Task` in `allowedTools`. It reads `VERDICT:` lines from prior stages, decides which stage to spawn next, and chains them. It has `deniedTools: [Write, Edit, Bash, MultiEdit]` — coordination only, never execution.

```
USER TYPES "forge" or "pillar-1" or "jira-to-pr"
       │
       ▼
 ┌──────────────────┐
 │   orchestrator    │  ← knows the workflow, never does the work
 │  allowedTools:    │
 │  [Read, Glob,     │
 │   Grep, Task,     │
 │   TodoWrite]      │
 └────────┬─────────┘
          │ spawns (Task tool)
          ▼
 ┌────────────────────────────────────────────┐
 │  planner → architect → implementer          │
 │                              ↓              │
 │                         validator           │
 │                              ↓ (if PASS)    │
 │                          deployer           │
 └────────────────────────────────────────────┘
```

The validator uses a **different model than the implementer** (opus vs sonnet) and has no Edit/MultiEdit — this is the "independent validator" principle, and it's the one rule the pattern enforces strictly.

## Adopting the rules layer

The `rules/` directory contains the always-on governance rules, adapted with Kiro-compatible frontmatter pointers. To wire them into a Power:

```bash
# In your Power directory
mkdir -p steering/rules/{common,typescript,python,php}
cp ../../rules/common/security.md      steering/rules/common/
cp ../../rules/common/coding-style.md  steering/rules/common/
cp ../../rules/common/testing.md       steering/rules/common/
cp ../../rules/typescript/coding-style.md steering/rules/typescript/
cp ../../rules/python/coding-style.md  steering/rules/python/
cp ../../rules/php/coding-style.md     steering/rules/php/
# ... etc

# Prepend `inclusion: always` to each
for f in steering/rules/**/*.md; do
  if ! head -1 "$f" | grep -q "^---$"; then
    { echo "---"; echo "inclusion: always"; echo "---"; cat "$f"; } > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done
```

After this, every sub-agent in every stage automatically receives the security baseline, coding style, and testing rules. No stage can opt out.

## Verifying a new Power

Before shipping a Power built from this template, run through [`skills/build-kiro-power/SKILL.md` § "Verification before shipping"](skills/build-kiro-power/SKILL.md). The short version:

- [ ] `POWER.md` frontmatter validates (name matches dir, description ≤ 30 words)
- [ ] Every sub-agent has `deniedTools` including `Task` (except the orchestrator)
- [ ] Every sub-agent's `writablePaths` is a positive list
- [ ] `00-governance.md` is < 100 lines
- [ ] `hooks/hooks.json` is valid JSON with at least `PreToolUse` registered
- [ ] At least one rule from `rules/common/` is wired in
- [ ] The orchestrator cannot Edit/Write/Bash (test by trying)
- [ ] A test scenario actually flows through all stages to a verdict

## Origin and pattern reference

This template is MIT-licensed. The primitives map 1:1:

| Standard | Kiro Power |
|---|---|
| `SKILL.md` (on-demand by `description:`) | `steering/*.md` (on-demand / fileMatch) |
| `agents/*.md` (sub-agents) | `.kiro/agents/*.json` (custom agents) |
| `commands/*.md` (slash commands) | `POWER.md` activation keywords |
| `hooks/hooks.json` (PreToolUse etc.) | Kiro plugin hook system |
| `rules/` (always-follow) | `steering/rules/` with `inclusion: always` |

See [`skills/build-kiro-power/SKILL.md`](skills/build-kiro-power/SKILL.md) for the full pattern specification.

## License

The structure, code, and original content in this repo: MIT.
The `rules/` directory: see individual file headers for license.
