# adapters/ — pluggable external integration layer

Powers in this template integrate with external services (Jira, GitHub, Bitbucket, ClickUp, …) through **adapters**. Each adapter:

- Wraps one or more **MCP servers** (the protocol boundary)
- Declares its **tools** (what the orchestrator's sub-agents can call)
- Provides **per-adapter steering** so sub-agents know how to use its tools correctly
- Specifies **stage routing** (which sub-agents in the pipeline are allowed to call which tools)
- Has a **manifest** (`adapter.json`) that the registry reads to wire everything together

Adding a new integration = adding a new directory under `adapters/`. No core code changes.

## The five-second tour

```
adapters/
├── README.md                          # this file
├── adapter.schema.json                # JSON schema for adapter.json
├── registry.json                      # enabled/disabled state for every adapter
├── install.js                         # merges per-adapter mcp.json into root mcp.json
├── jira/                              # reference adapter #1
│   ├── adapter.json                   # manifest
│   ├── mcp.json                       # MCP server config (merged at install)
│   └── steering/
│       └── usage.md                   # on-demand knowledge for using Jira tools
├── github/                            # reference adapter #2
├── bitbucket/                         # reference adapter #3
├── clickup/                           # reference adapter #4
└── custom-template/                   # scaffold for new adapters
    ├── adapter.json.template
    ├── mcp.json.template
    └── steering/usage.md.template
```

## The adapter contract

Every adapter must provide:

| File | Purpose |
|---|---|
| `adapter.json` | Manifest: name, version, MCP server(s), tools, stage routing, env vars |
| `mcp.json` | One or more MCP server entries. Merged into the root `mcp.json` at install time. |
| `steering/usage.md` | On-demand knowledge loaded into the sub-agent that uses this adapter's tools. |

Optional:
- `steering/<topic>.md` — additional on-demand knowledge (e.g. `jql-reference.md`, `webhook-events.md`)
- `hooks/` — adapter-specific hook scripts (e.g. log Jira comments to a Slack channel)
- `tests/` — adapter self-tests

The manifest schema lives at `adapter.schema.json`. Reference manifests are at `jira/adapter.json` and the others.

## The manifest shape

```json
{
  "name": "<adapter-name>",
  "version": "1.0.0",
  "description": "What this adapter integrates with",
  "mcpServers": ["<key-1>", "<key-2>"],
  "tools": [
    {
      "name": "<mcp-tool-name>",
      "description": "<one sentence>",
      "stages": ["<planner|architect|implementer|validator|deployer|*>"],
      "readOnly": true
    }
  ],
  "envVars": [
    {
      "name": "<ENV_VAR_NAME>",
      "required": true,
      "description": "<where to get this>",
      "secret": true
    }
  ],
  "steering": ["steering/usage.md"],
  "stage": {
    "<stage-name>": {
      "systemPromptAdditions": "steering/<stage>-notes.md"
    }
  }
}
```

- `tools[i].stages` is the **access control list**. A sub-agent can only call a tool if its stage is in the list. `["*"]` means any stage.
- `tools[i].readOnly` is informational — the hook layer uses it for the audit log. Read-only tools can be called from the validator too.
- `envVars[i].secret: true` triggers the install script to require an env-var indirection (no inline values in `mcp.json`).

## The registry and toggling

`registry.json` lists every available adapter and whether it is enabled:

```json
{
  "version": 1,
  "adapters": {
    "jira":      { "enabled": true,  "installedAt": "2026-07-15T18:46:00Z" },
    "github":    { "enabled": true,  "installedAt": "2026-07-15T18:46:00Z" },
    "bitbucket": { "enabled": false, "reason": "Not used in this project" },
    "clickup":   { "enabled": false, "reason": "Customer uses Jira, not ClickUp" }
  }
}
```

Toggle with:

```bash
# Enable
node adapters/install.js --enable jira

# Disable
node adapters/install.js --disable bitbucket

# Show current state
node adapters/install.js --status
```

`install.js` reads `registry.json`, then for each enabled adapter:
1. Reads its `mcp.json`
2. Merges the entries into the root `mcp.json` (the `mcpServers` object)
3. Updates the relevant sub-agent's `allowedTools` to include the adapter's tools (per the stage routing in `adapter.json`)
4. Symlinks the adapter's `steering/` into the root `steering/adapters/<name>/` for inclusion discovery

After install, run `node adapters/install.js --verify` to confirm everything is wired.

## Stage routing

The pattern's tool-bundle-per-stage principle is preserved by routing adapter tools through the same `allowedTools` mechanism. The install script reads each adapter's `tools[i].stages` and adds the tool name to the corresponding agent's `allowedTools` list in `.kiro/agents/<stage>.json`.

Example: `jira/adapter.json` declares `jira_get_ticket` is available to `["planner", "architect", "validator"]`. After install, the `planner.json`, `architect.json`, and `validator.json` files all get `"jira_get_ticket"` added to their `allowedTools`. The `implementer.json` and `deployer.json` do **not** get it — even if the tool exists, the agent cannot call it.

This is the security boundary. An adapter author cannot grant themselves access to a stage that should not have it.

## Per-adapter steering

`steering/usage.md` is the adapter's on-demand knowledge. It is loaded into the sub-agent's context when that sub-agent is using the adapter. The orchestrator wires this in via the `contextSteering` field on the relevant agent JSONs.

For example, the Jira adapter's `usage.md` covers:
- JQL syntax for ticket lookup
- Status transitions
- Comment formatting conventions
- Rate-limit handling

The harness routes on the `description:` frontmatter, so the file is only loaded when the agent is actually about to use a Jira tool.

## Adding a new adapter

Three steps:

1. **Copy the scaffold**: `cp -r adapters/custom-template adapters/<my-adapter>`
2. **Fill in the manifest**: edit `<my-adapter>/adapter.json` — name, MCP server, tools, stage routing, env vars
3. **Wire the MCP server**: edit `<my-adapter>/mcp.json` with the server command and args

Then `node adapters/install.js --enable <my-adapter>` to enable it. Done.

For a guided walkthrough see `skills/build-adapter/SKILL.md`.

## Why this lives in `adapters/` and not `mcp.json` directly

A flat `mcp.json` works for one project. The moment you have **N integrations × M projects × optional enable/disable**, you need a registry. The adapter pattern is what lets a single Power install cleanly into projects that use Jira, projects that use GitHub Projects, projects that use ClickUp, and projects that use a custom internal tracker — without forking the Power each time.

The cost is a small amount of indirection (manifest + install script). The benefit is that adding "support for Linear" is a 3-file change, not a 1-day refactor.

## Origin and pattern reference

This pattern is the **adapter layer** for multi-tool Kiro Powers. Related prior art:
- [agentic-sdlc-development](https://github.com/topics/sdlc-automation) — pluggable capability packs via plugin manifests
- [Atlassian Forge MCP server](https://developer.atlassian.com/platform/forge/ai-development-toolkit/forge-mcp/) — remote MCP for Atlassian tooling
- [SDLC Workflow Skills](https://lobehub.com/mcp/fancybread-com-sdlc-workflow-skills) — skills format + MCP wiring

The adapter pattern is what makes this Power **vendor-neutral** across Jira, GitHub, Bitbucket, ClickUp, Linear, Azure DevOps, and any future tool that exposes an MCP server.
