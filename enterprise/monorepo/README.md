# Multi-repo / brownfield mode

Real orgs don't have one repo per feature. A single ticket often touches 3-5 repos: the API, the frontend that consumes the API, the shared types package, and the infra config. The forge-sdlc pattern adapts to this with three things:

1. **Repo registry** (`.forge/monorepo.json`) — declares which repos exist, their roles, and dependencies
2. **Dependency graph** (`graph.js`) — topologically sorts them, detects cycles
3. **Per-repo validator** (`check-per-repo.js`) — runs the deterministic checks against one specific repo

## Setup

```bash
mkdir -p .forge
cp enterprise/monorepo/registry.example.json .forge/monorepo.json
# Edit to match your repos
$EDITOR .forge/monorepo.json

# Verify the graph (no cycles, all deps resolve)
node enterprise/monorepo/graph.js --validate

# See the build order
node enterprise/monorepo/graph.js --order
```

## The four roles

| Role | Meaning | Validator behavior |
|---|---|---|
| `primary` | The repo where the main change lives. There should be exactly one. | Run the full validator. Open the primary PR. |
| `consumer` | Repos that import from the primary. May have type changes, API client updates, etc. | Run check-per-repo. Open consumer PRs. |
| `shared-types` | Type definitions shared across repos. Changes here cascade to all consumers. | Run check-per-repo with extra rigor (every consumer is re-validated). |
| `infra` | Deploy / CI / config. Rare to change. Heavily guarded. | check-per-repo with `forbiddenPaths` enforced. |

## The dependency graph

`graph.js` topologically sorts the repos. The build order is:

1. `shared-types` (no deps)
2. `primary` (depends on shared-types, if any)
3. `consumer` repos (depend on primary + shared-types)
4. `infra` (depends on primary, runs last)

The orchestrator uses this order to:
- Stage 3 (implement): branch the primary first, then consumers, then infra
- Stage 4 (validate): run per-repo checks in build order, fail fast on shared-types (so consumers don't waste time)
- Stage 5 (deploy): open PRs in build order, mark downstream PRs as "blocked by #N" if upstream is unmerged

## The per-repo validator

`check-per-repo.js <repo-name>` runs the deterministic subset of the validator (typecheck, lint, test) against one specific repo. The orchestrator fans this out:

```bash
# Primary
node enterprise/monorepo/check-per-repo.js api

# Each consumer
node enterprise/monorepo/check-per-repo.js web
node enterprise/monorepo/check-per-repo.js mobile
```

Per-repo `forbiddenPaths` are added to the hook's blocked list at install time.

## Per-repo conventions

Each repo can declare a `conventions` field — a path to a markdown file with that repo's local patterns. The architect reads these before designing changes that touch the repo:

```json
{
  "name": "web",
  "conventions": "./conventions/web.md"
}
```

The conventions file should cover:
- Local architecture rules (where components live, how state is managed)
- Local testing conventions (mock patterns, fixture strategy)
- Local lint rules beyond the global ones

## Why this exists

The single-repo model breaks the moment a feature touches more than one service. The per-repo validator + dependency graph means the orchestrator can confidently fan out work across repos, run deterministic checks per repo, and report aggregate verdicts back to the user. Without it, you're hand-coordinating PRs across repos by hand, which is exactly the SDLC chaos forge-sdlc is meant to eliminate.

## Honest scope

This is a **scaffolding**. The full multi-repo experience requires:
- A per-repo RAG (so the implementer knows the conventions in repo B without reading the whole codebase). For now: read the `conventions` file.
- Cross-repo type propagation (the orchestrator re-resolves types after shared-types changes). For now: hand-managed.
- A web UI to see all in-flight PRs across repos. The backlog mode (separate feature) is the foundation for this.

What this gives you today: the data model, the graph, the per-repo validator. The orchestration logic that ties them together goes in the orchestrator's stage 3-5 implementations.
