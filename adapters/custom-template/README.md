# Custom adapter template

Copy this directory to add a new adapter:

```bash
cp -r adapters/custom-template adapters/<my-adapter>
```

Then fill in the placeholders:

| File | Replace |
|---|---|
| `adapter.json.template` → `adapter.json` | `<adapter-name>`, `<key-1>`, `<mcp-tool-name-1>`, env var names, tool descriptions |
| `mcp.json.template` → `mcp.json` | `<key-1>`, the command + args to launch the MCP server, env var indirection |
| `steering/usage.md.template` → `steering/usage.md` | Tool semantics, conventions, failure modes, security |

Add an entry to `adapters/registry.json`:

```json
{
  "adapters": {
    "<my-adapter>": {
      "enabled": false,
      "version": "0.1.0",
      "reason": "Set required env vars, then run: node adapters/install.js --enable <my-adapter>"
    }
  }
}
```

Then enable:

```bash
# Set env vars
export <ENV_VAR_NAME>=...

# Validate manifest
node -e "JSON.parse(require('fs').readFileSync('adapters/<my-adapter>/adapter.json'))"

# Enable
node adapters/install.js --enable <my-adapter>

# Verify
node adapters/install.js --verify
```

For a guided walkthrough see `skills/build-adapter/SKILL.md`.
