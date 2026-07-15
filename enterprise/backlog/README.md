# Backlog mode — queue + parallel streams

One ticket per forge run is fine for demos. Real PMs have 30-50 tickets in a sprint. A single stream is the bottleneck. Backlog mode is the foundation for "real" SDLC use.

## The three scripts

### `queue.js` — ticket queue

```bash
node enterprise/backlog/queue.js add PROJ-401 --priority high
node enterprise/backlog/queue.js add PROJ-402 --priority critical
node enterprise/backlog/queue.js status
node enterprise/backlog/queue.js start PROJ-401   # mark in flight
node enterprise/backlog/queue.js done PROJ-401 PASS
node enterprise/backlog/queue.js next            # top of priority queue
```

The queue is a JSON file at `.forge/backlog.json`. Tickets are sorted by priority (`critical < high < medium < low`). State is persistent — kill the process, restart, queue survives.

### `stream.js` — one ticket's full pipeline

```bash
node enterprise/backlog/stream.js PROJ-401
node enterprise/backlog/stream.js PROJ-401 --stage implement
node enterprise/backlog/stream.js PROJ-401 --resume
```

A stream runs the 5 stages in order. Each stream owns its own state directory at `.forge/stream/<KEY>/state.json` so multiple streams can run in parallel without colliding.

The actual sub-agent work is done by the orchestrator in the host environment. `stream.js` is the per-ticket scaffolding — it manages the state, the artifacts, the resume-from-stage logic, and the verdict persistence.

### `dispatcher.js` — the parallel-stream supervisor

```bash
node enterprise/backlog/dispatcher.js --max-parallel 3 --once
node enterprise/backlog/dispatcher.js --max-parallel 3 --loop 30
```

The dispatcher:
1. Reads the queue
2. Counts in-flight streams
3. If `in_flight < max-parallel`, pops the top-priority ticket and starts a stream
4. Loops every `--loop` seconds (or `--once` for one tick)

Bounded parallelism prevents blowing the model budget. `max-parallel=3` is a sensible default; tune per environment.

## State layout

```
.forge/
├── backlog.json                    # the queue + in_flight + history
└── stream/
    ├── PROJ-401/
    │   ├── state.json
    │   ├── requirements-verdict.txt
    │   ├── design-verdict.txt
    │   ├── implement-verdict.txt
    │   ├── validate-verdict.txt
    │   └── deploy-verdict.txt
    ├── PROJ-402/
    │   └── ...
```

Each stream is self-contained. You can delete `.forge/stream/PROJ-401/` to abandon a stream without affecting others.

## Integration with the orchestrator

In a real deployment, the orchestrator's first action is:

```bash
node enterprise/backlog/dispatcher.js --max-parallel 3 --loop 30 &
```

This is the long-running process that drives the queue. Streams spawn sub-agents via Task; each sub-agent runs in its own context and writes back to `.forge/stream/<KEY>/state.json`.

## Honest scope

This is the **scaffolding**, not the full experience. What's missing for production:

- **Web UI** to see the queue + in-flight streams at a glance
- **Concurrency budget** — track tokens spent per stream, fail-fast if a stream blows its budget
- **Per-stream model routing** — small tickets use a small model, big ones use a big one
- **Retry policy** — auto-retry on transient failures, escalate on persistent ones
- **Post-mortem capture** — when a stream fails, write a postmortem to the ticket

The data model and the dispatcher/stream/queue split are right. The orchestrator wiring is the next investment.

## Why this exists

PMs don't want to type `/forge PROJ-401` for every ticket. They want to add 10 tickets to a queue, walk away, and come back to 10 PRs. The dispatcher is the thing that turns forge-sdlc from a one-at-a-time tool into a parallel SDLC worker.
