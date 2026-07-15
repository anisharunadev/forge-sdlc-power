---
name: build-adapter
description: Add a new external-integration adapter to a forge-sdlc Power. Walks through manifest authoring, MCP server config, steering, and the install script wiring. Use this whenever you need a Power to talk to a tool that isn't already covered (Linear, GitLab, Azure DevOps, Slack, custom internal APIs, etc.).
metadata:
  origin: forge-sdlc adapters layer
---

# Build an adapter for forge-sdlc

The adapter system lets you add new external integrations to a forge-sdlc Power without touching the core orchestrator or agent JSONs. This skill walks you through the four-file change.

## When to use

- You need the Power to talk to a tool that isn't in `adapters/` (Linear, GitLab, Azure DevOps, Slack, Sentry, Datadog, PagerDuty, custom internal APIs, etc.)
- You want to swap one vendor for another (e.g. switch from ClickUp to Linear)
- You're forking a reference adapter to fit your tenant (e.g. Jira Server instead of Jira Cloud)

## When NOT to use

- The tool has no MCP server. The adapter system wraps MCP servers. If the tool only has REST/GraphQL/gRPC, you need to first build an MCP server for it, then add the adapter. (Use a tool like [MCP.so](https://mcp.so) or write a thin stdio wrapper.)
- The integration is so simple it doesn't need an adapter. If it's just a URL, env var, and a curl, you can hardcode it in a hook script and skip the adapter.

## The four files

Every adapter is four files:

| File | Purpose |
|---|---|
| `adapters/<name>/adapter.json` | Manifest — name, version, MCP servers, tools, stage routing, env vars |
| `adapters/<name>/mcp.json` | MCP server configuration. Gets merged into the root `mcp.json` at install time. |
| `adapters/<name>/steering/usage.md` | On-demand knowledge for the sub-agent that's using the tools |
| (optional) `adapters/<name>/steering/<topic>.md` | Additional on-demand knowledge — e.g. JQL reference, webhook events |
| (optional) `adapters/<name>/steering/<stage>-notes.md` | Per-stage system-prompt additions — referenced from `adapter.json`'s `stage` block |

Plus one registry update:

| File | Edit |
|---|---|
| `adapters/registry.json` | Add an entry for the new adapter. Set `enabled: false` until env vars are set. |

That's it. The install script (`adapters/install.js`) does the wiring: merges the MCP server, updates the relevant agent's `allowedTools` per the stage routing, and symlinks the steering.

## Step 1 — Copy the template

```bash
cp -r adapters/custom-template adapters/<my-adapter>
cd adapters/<my-adapter>
mv adapter.json.template adapter.json
mv mcp.json.template mcp.json
mv steering/usage.md.template steering/usage.md
```

## Step 2 — Fill the manifest

Edit `adapter.json`. The schema lives at `adapters/adapter.schema.json`. Key fields:

### `name`
- Lowercase, kebab-case, must match the directory name
- Example: `linear`, `gitlab`, `azure-devops`, `slack`

### `mcpServers`
- The keys of MCP server entries in your `mcp.json`
- Most adapters have one server. Composite adapters (e.g. one tool needs both a REST API and a webhook receiver) can list multiple.

### `tools[]`
- The most important field. For each tool the MCP server exposes:
  - `name`: the exact tool name as the server exposes it
  - `stages`: which sub-agents can call this tool. `["*"]` means any stage.
  - `readOnly`: `true` if the tool only reads state. The validator can call read-only tools even if not in its `stages` list.
  - `idempotent`: `true` if the tool is safe to retry. The hook layer may auto-retry on transient failures.

The stage routing is the security boundary. If you put `["implementer", "deployer"]` and the planner tries to call it, the call fails.

**Don't grant `["*"]` unless the tool is genuinely read-only and harmless.** A read-only tool like `linear_get_issue` is fine. A mutating tool like `linear_update_status` should be limited to the stages that should be doing mutations.

### `envVars[]`
- For each env var the adapter needs:
  - `name`: UPPER_SNAKE_CASE
  - `required`: `true` if the install script should refuse to enable the adapter without it
  - `secret`: `true` if the value must come from `${env:...}` indirection (not inline)
  - `description`: where the user gets this credential

The install script will refuse to enable the adapter if any `required: true` env var is unset.

### `steering[]`
- Paths to on-demand knowledge files. Path is relative to the adapter directory.
- Convention: `steering/usage.md` is the main one. Add `steering/<topic>.md` for specific knowledge (JQL, RQL, JQL-equivalent for your tool).
- The `description:` frontmatter on these files is what the harness uses for routing. Keep it under 30 words.

### `stage[]`
- Per-stage system-prompt additions. Use this for stage-specific reminders that don't belong in the main `usage.md`.
- Example: the Jira adapter's `implementer-notes.md` reminds the implementer to transition to `In Progress` at the start of its work.

## Step 3 — Wire the MCP server

Edit `mcp.json`. The shape is:

```json
{
  "mcpServers": {
    "<key>": {
      "command": "<how to launch>",
      "args": ["<arg-1>", "<arg-2>"],
      "env": {
        "<ENV_VAR>": "${env:<ENV_VAR>}"
      },
      "description": "<what this server does>"
    }
  }
}
```

- `command`: usually `npx -y <package>` for npm-published MCP servers, or the path to a stdio binary
- `args`: passed to the command. The MCP convention is to expose tools via stdio JSON-RPC
- `env`: every secret MUST be `${env:NAME}`. The install script will throw if a value marked `secret: true` in the manifest is inlined.

If your tool doesn't have an MCP server, you have two options:
1. **Use an existing MCP wrapper** (search [mcp.so](https://mcp.so), the official `@modelcontextprotocol/server-*` packages, or community servers)
2. **Build a thin MCP server** — a 50-line stdio JSON-RPC wrapper around the tool's REST API. The `examples/` in the official MCP SDKs have scaffolds.

## Step 4 — Write the steering

Edit `steering/usage.md`. The harness routes on the `description:` field, so the frontmatter is load-bearing.

Sections to include (in this order):

1. **Tool semantics** — for each tool, one paragraph: what it does, what it returns, when to use it
2. **Conventions** — how the sub-agent should use the tools in this Power's flow
3. **Common failures** — table of `Symptom | Cause | Fix`
4. **Security** — env var rules, what not to log, what not to echo in comments

Keep the file under 300 lines. If you have more, split it into `usage.md` (essentials) + `<topic>.md` (deep reference, e.g. a query language reference).

## Step 5 — Add to the registry

Edit `adapters/registry.json`:

```json
{
  "adapters": {
    "<my-adapter>": {
      "enabled": false,
      "version": "0.1.0",
      "reason": "Set <ENV_VAR> and run: node adapters/install.js --enable <my-adapter>"
    }
  }
}
```

Start with `enabled: false` — the user enables it explicitly after setting the env vars.

## Step 6 — Enable and verify

```bash
# Set the env vars
export <ENV_VAR>=...

# Validate the manifest
node -e "JSON.parse(require('fs').readFileSync('adapters/<my-adapter>/adapter.json'))"

# Enable
node adapters/install.js --enable <my-adapter>

# Verify the wiring
node adapters/install.js --verify

# Show the current state
node adapters/install.js --status
```

`--verify` checks:
- All required env vars are set
- The MCP server entry landed in the root `mcp.json`
- Each tool in the manifest is in the corresponding agent's `allowedTools`
- Symlinks for the steering are in place

## Verification checklist before merging

- [ ] Manifest validates against `adapter.schema.json`
- [ ] Every tool in `tools[]` has at least one stage in `stages` (or `["*"]` with `readOnly: true`)
- [ ] No mutating tool has `stages: ["*"]`
- [ ] Every `envVar` with `secret: true` uses `${env:...}` indirection in `mcp.json`
- [ ] `steering/usage.md` has a valid frontmatter with `inclusion: on-demand` and a `description:` ≤ 30 words
- [ ] `node adapters/install.js --verify` passes after enable
- [ ] At least one test case: a sub-agent in the right stage can call a tool from this adapter and produce a sensible result

## Anti-patterns

- **Wildcard stages on mutating tools.** `stages: ["*"]` is only OK for `readOnly: true` tools. Never for transitions, comments, or updates.
- **Inlined secrets in `mcp.json`.** The install script will catch this for `secret: true` env vars, but be careful with non-secret values too (workspace IDs, team IDs are not secrets but should still come from env).
- **Vague descriptions on steering files.** "How to use the tool" is not a description. "Linear issue read/write, JQL-equivalent filter syntax, status transitions" is.
- **Massive steering files.** 300 lines is a soft cap. If you're past 500, split into `usage.md` + topic-specific files.
- **Skipping the registry.** If you don't add the entry to `registry.json`, the install script won't see your adapter.

## Origin and pattern reference

The adapter system is the integration layer for forge-sdlc Powers. Related prior art:
- [MCP.so](https://mcp.so) — community registry of MCP servers
- [Atlassian Forge MCP server](https://developer.atlassian.com/platform/forge/ai-development-toolkit/forge-mcp/) — the reference for remote-MCP integration
- [agentic-sdlc-development](https://github.com/topics/sdlc-automation) — pluggable capability packs via plugin manifests

The pattern is what makes a forge-sdlc Power **vendor-neutral** — adding "support for Linear" is a 4-file change, not a 1-week refactor.
