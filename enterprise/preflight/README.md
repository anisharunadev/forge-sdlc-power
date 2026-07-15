# Pre-flight checks

Single round-trip verification that the repo is ready to be forged. Runs before stage 1 of the forge-sdlc pipeline. Catches the 9 most common "stage 1 failed because X" issues in one pass.

## Usage

```bash
node enterprise/preflight/check.js             # human-readable
node enterprise/preflight/check.js --json      # machine-readable
```

## Output

- **READY** — all 9 checks passed
- **NOT_READY: N issues:** — followed by the failure list

## Checks (9)

| Check | What it catches |
|---|---|
| `git-repo` | Not a git repository |
| `working-tree-clean` | Uncommitted changes (allows untracked) |
| `not-on-protected-branch` | Currently on `main`, `master`, `production`, `release` |
| `remote-configured` | No `origin` remote |
| `tool-{node,git,npm}-version` | Missing CLI or wrong version |
| `env-{adapter}-{var}` | Required env vars not set or still placeholder values |
| `no-secrets-staged` | `.env`, `secrets.json`, `credentials.json` staged for commit |
| `prior-failure-acknowledged` | A prior forge run failed and wasn't acknowledged |
| `forge-structure` | `POWER.md`, `.kiro/agents/orchestrator.json`, `hooks/hooks.json`, `adapters/registry.json` exist |

## Integration

The orchestrator's pre-stage hook should call this before stage 1:

```bash
node enterprise/preflight/check.js --json || exit 1
```

The output is also machine-readable so the orchestrator can surface specific issues to the user.

## Why this exists

A forge run that fails at stage 1 because `JIRA_TOKEN` is unset wastes 3 minutes. A forge run that fails because the user is on `main` and the implementer tries to push to a protected branch wastes 30 minutes. This check is the gate that prevents both.

The pre-flight check is a 1-second operation. The cost of running it is negligible. The cost of skipping it is, regularly, the difference between "I trust this tool" and "I keep getting burned by it."
