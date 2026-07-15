# Session continuity — `forge continue`

Picks up a forge run from where the prior session left off. No more starting over because a stage failed or context got compacted.

## Usage

```bash
node enterprise/resume/continue.js [KEY]              # human-readable
node enterprise/resume/continue.js [KEY] --json       # machine-readable
node enterprise/resume/continue.js --force            # ignore prior failure
node enterprise/resume/continue.js --fresh            # ignore state, start over
```

## How it works

1. Reads `.forge/state.json` to find the last stage + verdict
2. Lists `.forge/stage<N>-*` artifacts to find the highest stage with output
3. Determines the resume point:
   - Last verdict was `PASS` → next stage
   - Last verdict was `FAIL` → refuse (or rerun with `--force`)
   - Last verdict was `NEEDS_INFO` → next stage
4. Emits a structured directive the orchestrator can act on

## Output shapes

### `--json` resume directive

```json
{
  "status": "RESUME",
  "ticketKey": "PROJ-401",
  "fromStage": 3,
  "stageName": "implement",
  "agent": "implementer",
  "lastStage": "design",
  "lastVerdict": "PASS",
  "lastArtifact": "stage2-adr.md",
  "reason": "resume",
  "command": "/forge implement PROJ-401"
}
```

### Failure modes

| Status | Exit | Meaning |
|---|---|---|
| `RESUME` | 0 | Ready to resume. Emit `command` field. |
| `NO_STATE` | 1 | No `.forge/` or no stage artifacts. Run `forge start <KEY>`. |
| `LAST_FAILED` | 2 | Last run failed. Re-run with `--force` to retry the failed stage. |
| `ALL_DONE` | 0 | All 5 stages complete. Nothing to do. |

## Integration

The orchestrator's first action on a `forge continue <KEY>` invocation should be:

```bash
node enterprise/resume/continue.js <KEY> --json
```

Parse the directive's `command` field and run that stage. The orchestrator's `Task` spawn picks up the rest of the lifecycle from there.

## Why this exists

A 4-hour forge run that fails at stage 4 with "test failed" and forces the user to start over wastes 4 hours. `forge continue` reads the artifacts, knows stage 1-3 succeeded, and jumps straight to fixing stage 4. Average recovery time: 5 minutes.

The state machine that powers this is a 100-line script. The user-facing win is enormous.
