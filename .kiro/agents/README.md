# Custom agents — forge-sdlc-power

These six agents implement the forge-sdlc pipeline (orchestrator + 5 stages).
They are **valid kiro.dev custom-agent configs** with intentional extensions
for SDLC orchestration.

Reference: <https://kiro.dev/llms.txt> (Agent configuration reference).

## Mapping to kiro.dev fields

| kiro.dev field | Used here as | Notes |
|---|---|---|
| `name` | ✓ | Derived from filename; kept explicit for readability. |
| `description` | ✓ | One-sentence role + boundaries. |
| `prompt` | ✓ | `file://./steering/00-governance.md` — the shared system prompt. |
| `resources` | ✓ | `file://...` URIs to stage-specific steering files. |
| `allowedTools` | ✓ | The source of truth for what the agent may use. |
| `toolsSettings.write.allowedPaths` | ✓ | Replaces the older top-level `writablePaths`. |
| `toolsSettings.write.deniedPaths` | ✓ | Replaces the older top-level `deniedPaths`. |
| `toolsSettings.shell.deniedCommands` | ✓ | Replaces the older top-level `blockedCommands`. |
| `model` | ✓ | `sonnet` or `opus` per stage. |
| `includeMcpJson` | ✓ | `true` — agents inherit MCP servers from `mcp.json`. |
| `mcpServers` | ✗ | Not set per-agent; all MCP wiring is centralized in `mcp.json`. |
| `toolAliases` | ✗ | Not needed — no naming collisions. |
| `hooks` | ✗ | Pipeline-level hooks live in `.kiro/hooks/*.json`, not per-agent. |
| `keyboardShortcut` | ✗ | Not used (orchestrator is the only one typically switched to). |
| `welcomeMessage` | ✗ | Not used. |

## Intentional extensions (not in the kiro.dev reference)

These fields are pipeline-specific and live alongside the documented ones.
They are preserved as project-local extensions, not forked back into upstream:

- `stages[]` — orchestrator-only. Defines the SDLC DAG: `{ id, name, agent, gate }`.
- `postStageActions` — orchestrator-only. Hooks that fire after each stage.
- `ticketSystem.configFile` — orchestrator-only. Path to the auto-detected ticket-system adapter config.
- `maxCycles` — orchestrator-only. Max planner→architect→implementer→validator→deployer loops per ticket.
- `runtime.*` — orchestrator-only. PreToolUse allowlist of node scripts the orchestrator may invoke (security pattern).
- `outputBudgetKB` — stage agents. Soft cap on stage-handoff artifact size; enforced by the runtime host.
- `verdictFormat` — stage agents. Format of the pass/fail line the orchestrator parses.
- `notes` — every agent. Free-form documentation; ignored by the host.

## Removed legacy fields

- `deniedTools` — removed from all 6 agents. The kiro model is **allowlist-only**; anything not in `allowedTools` is implicitly denied. Keeping `deniedTools` was redundant and risked drift if `allowedTools` ever listed a denied tool.
- `systemPromptPath` — replaced by `prompt` (file URI).
- `contextSteering` — replaced by `resources` (file URIs).
- `writablePaths` / `deniedPaths` / `blockedCommands` — moved under `toolsSettings.{write,shell}`.

## Verifying conformance

```bash
# 1. JSON validity
for f in .kiro/agents/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "OK $f"; done

# 2. Every file:// URI resolves
node -e "const fs=require('fs'),path=require('path');
for (const f of fs.readdirSync('.kiro/agents').filter(x=>x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync('.kiro/agents/'+f,'utf8'));
  const base = path.resolve('.kiro/agents');
  const uris = [j.prompt, ...(j.resources||[])].filter(u=>u && u.startsWith('file://'));
  for (const u of uris) {
    const rel = u.replace(/^file:\/\/+/, '').replace(/^\.\//, '').replace(/^\.\.\//, '../');
    const p = path.resolve(base, rel);
    if (!fs.existsSync(p)) console.log('MISSING', f, '→', p);
  }
}"
```

Both should print only OK lines and zero MISSING lines.

## Adding a new stage agent

1. Copy `templates/agent.template.json`.
2. Set `name`, `description`, `model`, `prompt`, `resources`.
3. List tools in `allowedTools` (and bare + `mcp__...__`-prefixed names if MCP).
4. Add `toolsSettings.write.allowedPaths` for the artifacts this stage produces.
5. Add `includeMcpJson: true` if the stage uses MCP tools.
6. Wire the stage into `orchestrator.json` `stages[]`.
