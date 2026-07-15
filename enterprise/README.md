# Enterprise mode

The seven features that turn forge-sdlc from a single-repo, one-ticket-at-a-time tool into something that scales to real SDLC work.

## What's in here

| Directory | What it does | Effort | Value |
|---|---|---|---|
| [`preflight/`](preflight/) | Single round-trip "is the repo ready to forge?" check (9 sub-checks) | 3 days | Eliminates a whole class of debugging |
| [`resume/`](resume/) | `forge continue <KEY>` — picks up from where the prior run left off | 1 week | 5x for daily users |
| [`ci/`](ci/) | Generates GitHub Actions / GitLab CI / Jenkinsfile from `stages[]` config | 1 week | Codifies the pattern for the rest of the org |
| [`research/`](research/) | Web research sub-step for the architect stage (context7, parallel-search, exa) | 1 week | Stops the "this worked in my head" failure mode |
| [`tests/`](tests/) | Test result collection + diff vs. prior run + structured output | 3 days | High for QA-heavy teams |
| [`monorepo/`](monorepo/) | Multi-repo registry, dependency graph, per-repo validator | 4-6 weeks | Unlocks enterprise |
| [`backlog/`](backlog/) | Ticket queue + parallel streams + dispatcher with bounded concurrency | 3-4 weeks | Unlocks "real" SDLC use |

Total: ~11-16 weeks of work to fully integrate. Each directory is independently shippable.

## The shape of each feature

Every feature follows the same shape:

1. **One or two core scripts** (Node.js, no deps) — the actual logic
2. **A `*.test.js` file** — unit tests using `node:test` (zero deps)
3. **A `README.md`** — usage, integration, "honest scope" section
4. **No magic** — every script is a CLI you can run by hand

## Integration with the orchestrator

Each feature plugs into a specific stage of the orchestrator:

| Stage | New behavior |
|---|---|
| Before stage 1 | `preflight/check.js` — refuse to start if NOT_READY |
| Stage 1 (requirements) | `resume/continue.js` — pick up from prior state if --resume |
| Stage 2 (design) | `research/research.js` — fetch current docs for each library |
| Stage 3 (implement) | `monorepo/check-per-repo.js <repo>` — per-repo check, multi-repo only |
| Stage 4 (validate) | `tests/collect.js --diff` — test result diff |
| Stage 5 (deploy) | `ci/generate.js` — generated CI runs the validator's deterministic subset |
| Cross-stage | `backlog/queue.js` + `backlog/dispatcher.js` — the parallel-stream supervisor |

## Running the tests

```bash
node --test enterprise/preflight/check.test.js
node --test enterprise/resume/continue.test.js
node --test enterprise/monorepo/graph.test.js
node --test enterprise/monorepo/check-per-repo.test.js
node --test enterprise/backlog/queue.test.js

# All at once
node --test enterprise/**/*.test.js
```

## Order of integration

If you can only ship one at a time, in this order:

1. **preflight** — fastest, highest ROI for daily users
2. **resume** — pairs naturally with preflight
3. **tests** — independent, drops in anywhere
4. **ci** — codifies the pattern for the rest of the org
5. **research** — meaningful once you have a stable research backend
6. **monorepo** — when a customer asks for brownfield
7. **backlog** — when you have multiple PMs hitting the queue

## Honest scope

These are the **scaffolding** — the data model, the scripts, the tests. The full integration into the orchestrator's runtime (so all of this is automatic, not "type this command first") is a follow-up. The orchestrator's existing `stages[]` config is the integration point; the runtime needs:

- `preflight` called before stage 1's Task spawn
- `resume` consulted when `forge continue` is invoked
- `tests --diff` called by the validator sub-agent at stage 4
- `ci/generate.js` called once at Power install (writes the CI file, doesn't run per-stage)
- `research` called by the architect for each library in the new design
- `monorepo` per-repo checks called by the validator when `monorepo.json` is present
- `backlog` dispatcher running as a long-lived process

Each of these is a small change to the orchestrator's runtime. The data and the scripts are ready.
