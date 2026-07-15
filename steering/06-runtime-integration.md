---
inclusion: on-demand
description: When and how the orchestrator calls the enterprise-mode runtime scripts (preflight, resume, research, tests, monorepo, ci, backlog). Loaded on every orchestrator turn.
---

# Runtime integration — when to call each enterprise script

This is your operating manual for the 7 enterprise features. On every turn, check which trigger applies and call the corresponding script.

## Decision table

| When you see... | Call this | What it does |
|---|---|---|
| The user invokes a forge command and stage 1 hasn't started | `node enterprise/preflight/check.js --json` | If `NOT_READY`, abort and surface the issues to the user. If `READY`, proceed. |
| The user says `forge continue <KEY>` (or `resume`, `pick up`) | `node enterprise/resume/continue.js <KEY> --json` | Reads the directive, calls `forge <stage> <KEY>` with the value of `command`. |
| The architect stage is about to write an ADR with a new library | `node enterprise/research/research.js --json "<library>"` | Emit the directive, include the source URL in the ADR's References section. |
| The validator stage is about to start | `node enterprise/tests/collect.js --json --framework auto` | Run the project's tests, capture results, diff vs. prior. Include the diff in the validator report. |
| The validator stage is about to start AND `.forge/monorepo.json` exists | for each repo: `node enterprise/monorepo/check-per-repo.js <repo> --json` | All repos must PASS. Aggregate verdict goes in the report. |
| The orchestrator is freshly installed or has just had adapters toggled | `node enterprise/ci/generate.js --target github -o .github/workflows/forge-validate.yml` | Regenerate the CI file from `stages[]`. Once. |
| The user is queueing many tickets at once | `node enterprise/backlog/queue.js add <KEY> --priority <p>` then `node enterprise/backlog/dispatcher.js --max-parallel 3 --loop 30 &` | The dispatcher is long-lived; the orchestrator does not invoke it per-turn. |

## The pre-stage gate (do this every time)

Before you spawn stage 1's sub-agent:

```bash
node enterprise/preflight/check.js --json
```

Parse the result:

- `verdict: "READY"` → proceed to spawn the planner sub-agent
- `verdict: "NOT_READY"` → abort, show the user the `checks[].fail` list, do NOT spawn the planner

This is the single most impactful change in the runtime integration. It eliminates the "stage 1 failed because JIRA_TOKEN is unset" class of bugs.

## The post-stage status (already wired)

The `hooks/post-stage-cmd.js` hook runs after every sub-agent Task completes. It writes `.forge/post-stage-prompt.json`. Your job on the next turn is to read that file and call the configured `*_post_status_update` tool on the ticket system.

## Per-stage runtime calls

### Stage 1 (requirements)

- Run preflight (above)
- If user provided free-form text (no ticket key), the planner calls `jira_create_ticket` (or `clickup_create_task`)
- The planner writes the new ticket key to `.forge/ticket-id.txt`
- If the user said `forge continue <KEY>`, run resume first

### Stage 2 (design)

- The architect reads the requirements
- For each library in the new design, run `enterprise/research/research.js --json "<library>"`
- Include the cited URLs in the ADR's References section

### Stage 3 (implement)

- (No enterprise integration. The implementer is the workhorse.)

### Stage 4 (validate)

- Run `enterprise/tests/collect.js --json --framework auto`
- If `.forge/monorepo.json` exists, run `enterprise/monorepo/check-per-repo.js <repo> --json` for each repo
- Aggregate results into the validator report at `.forge/validator-report.md`
- All checks must PASS for the validator's verdict to be PASS

### Stage 5 (deploy)

- (No enterprise integration. The deployer opens the PR.)

## Long-lived processes

The backlog dispatcher is a separate process. Don't try to run it per-ticket. The user (or a separate launcher) starts it once and it runs in the background:

```bash
node enterprise/backlog/dispatcher.js --max-parallel 3 --loop 30 &
```

If you see the dispatcher already running, leave it alone. If you see the queue growing, surface it to the user.

## How this composes with the rest of the pattern

The runtime integration is the **last layer** of the pattern. It assumes:

- The 7 enterprise scripts are installed (they are, in `enterprise/<feature>/`)
- The orchestrator's host environment can run Node.js (it must, for the hooks)
- The user has set the env vars the enabled adapters need (preflight catches this)

If any of these are missing, the integration degrades gracefully:

- preflight fails → user sees the issue, fixes it, re-runs
- resume finds no state → fallback to `forge start <KEY>`
- research finds no backend → falls back to a warning in the ADR
- tests fail to find a framework → emits an error, validator reports it
- monorepo.json doesn't exist → skip the fanout, run the single-repo validator
- ci generation fails → log, the user can run it manually
- backlog dispatcher not running → the queue still works, the user runs it manually

Every layer has a fallback. The user can adopt one feature at a time.
