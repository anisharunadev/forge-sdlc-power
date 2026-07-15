# Runtime integration

The glue that wires the 7 enterprise scripts into the orchestrator's runtime. After this commit, the orchestrator no longer needs the user to type `node enterprise/X/Y.js` — the integration runs the right script at the right time, automatically.

## What this layer does

| Trigger | Calls | Where it's wired |
|---|---|---|
| Before stage 1's Task spawn | `preflight/check.js` | `hooks/pre-stage-gate.js` (PreToolUse on Task) |
| User says `forge continue <KEY>` | `resume/continue.js` | `steering/06-runtime-integration.md` (orchestrator consults) |
| Stage 2 (design) | `research/research.js` | `steering/06-runtime-integration.md` |
| Stage 4 (validate) — tests | `tests/collect.js` | `hooks/post-validator-collect.js` (PostToolUse on Task) |
| Stage 4 (validate) — monorepo | `monorepo/check-per-repo.js` per repo | `steering/06-runtime-integration.md` |
| Adapter install / toggle | `ci/generate.js` | `adapters/install.js` `generateCI()` |
| Long-lived (separate process) | `backlog/dispatcher.js` | `runtime/launch-backlog.js` |
| After every sub-agent Task | (existing) `post-stage-cmd.js` | `hooks/post-stage-cmd.js` |

## The pre-stage gate

The first time the orchestrator spawns a sub-agent Task, this hook fires:

```bash
# Pseudocode
if (FORGE_FIRST_INVOCATION === '1' && !FORGE_SKIP_PREFLIGHT) {
  run enterprise/preflight/check.js --json
  if (NOT_READY) {
    block Task spawn, surface issues to user
  }
}
```

After the first invocation, `FORGE_FIRST_INVOCATION` is unset, so the hook is a no-op for subsequent Task spawns. To bypass: `FORGE_SKIP_PREFLIGHT=1` in the orchestrator's env.

The "first invocation only" pattern is what makes this safe. The hook doesn't run on every Task — only on the one that starts the pipeline. Subsequent Tasks are past the preflight gate.

## The post-validator collection

When the validator sub-agent finishes, this hook runs `tests/collect.js` and writes the result to `.forge/test-diff.json`. The orchestrator reads this file on its next turn and includes the diff (new failures, resolved failures, pass/fail deltas) in the humanized status update.

## The orchestrator steering

`steering/06-runtime-integration.md` is the orchestrator's operating manual for the integration. It's loaded on-demand (fileMatch on orchestrator's context) and tells the orchestrator which script to call on which trigger.

This is how the orchestrator "knows" to call research for libraries, monorepo fanout for multi-repo, etc. Without the steering file, the orchestrator would have to guess.

## The backlog launcher

`runtime/launch-backlog.js` is a separate entry point for the long-lived dispatcher. The user (or a separate process manager) calls it once per session:

```bash
node runtime/launch-backlog.js --max-parallel 3 --loop 30
node runtime/launch-backlog.js --status
node runtime/launch-backlog.js --stop
```

The launcher writes the PID to `.forge/backlog.pid`, the dispatcher's stdout/stderr to `.forge/backlog.log`, and detaches the child. The orchestrator doesn't manage this — it's the user's responsibility (or a systemd unit, or a Kubernetes deployment, or a separate process manager).

## The runtime config block

`.kiro/agents/orchestrator.json` now has a `runtime` block that mirrors the table above. The host environment reads this to know:
- Which scripts the orchestrator is allowed to invoke
- When each script fires
- What to do on error (abort, retry, fallback)

This is the "allowlist-by-script" exception to the orchestrator's general Bash-deny policy. The orchestrator's host grants Bash access for the specific scripts listed in `runtime.*.command`, even though the manifest denies it broadly.

## Tests

7 integration tests in `runtime/integration.test.js` cover:
- Full happy path: preflight → CI → queue → resume
- Preflight catches missing env vars
- Monorepo per-repo check works
- Research emits a directive (no real MCP call)
- Pre-stage gate hook blocks the first Task when NOT_READY
- Pre-stage gate allows when SKIP is set
- Install.js regenerates CI on every apply

All 67 tests pass (60 existing + 7 new).

## What's NOT integrated

The runtime integration covers 7 of the 7 enterprise features. The remaining work is:

- **Web UI for backlog status** — separate effort, not on the integration path
- **Concurrency budget** — track tokens per stream, fail-fast on budget exceeded
- **Retry policy** — auto-retry on transient failures
- **Per-repo RAG** — the conventions file is a placeholder until RAG is built

These are features, not integrations. The integration layer is complete.

## How to verify the integration

```bash
# Run the integration test
node --test runtime/integration.test.js

# Or simulate the full flow by hand
mkdir -p /tmp/forge-test && cd /tmp/forge-test
git init -b main
# ... copy minimal structure from this repo
node enterprise/preflight/check.js --json    # should say NOT_READY
node enterprise/ci/generate.js -o .github/workflows/forge-validate.yml
node enterprise/backlog/queue.js add PROJ-401 --priority high
node enterprise/backlog/dispatcher.js --max-parallel 1 --once
```

The integration is observable: each script prints to stdout, the orchestrator's hooks log to stderr, and the `.forge/` directory accumulates state you can inspect.
