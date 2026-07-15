# Web research layer

The architect stage should write ADRs grounded in **current** API docs, not training data. For libraries released after the model's training cutoff, training-data citations are wrong. This layer gives the architect a structured way to fetch up-to-date references and cite them in the ADR.

## Usage

```bash
node enterprise/research/research.js "react" "next.js" "pydantic"
node enterprise/research/research.js --json "react" "next.js"
```

The architect sub-agent calls this once per library that appears in the new design, then cites the source URL in the ADR.

## How backends are picked

The script tries, in order:

1. **context7** (if enabled) — best for library-specific docs
2. **parallel-search** (if enabled) — LLM-optimized web search
3. **exa-web-search** (if enabled) — general web search
4. **Fallback** — emits a warning, the architect must flag uncertainty in the ADR

Enable the backend you want:

```bash
node adapters/install.js --enable context7
# or
node adapters/install.js --enable parallel-search
# or
node adapters/install.js --enable exa-web-search
```

## What the architect does with the result

For each library in the new design:

1. The architect calls `research.js --json "<library>"`.
2. The result contains either:
   - A `directive` (an MCP tool call the orchestrator should make)
   - A `fallback` (no backend enabled, flag in ADR)
3. If `directive`: orchestrator makes the MCP call, returns the excerpts to the architect.
4. The architect cites the source URL in the ADR's "References" section.

## Why this exists

Two failure modes the research layer prevents:

1. **"This worked in my head"** — the architect writes code against an API that doesn't exist or has changed. CI fails. User debugging wastes hours.
2. **Outdated best practices** — the architect recommends a pattern the library explicitly deprecated. Same outcome.

The research layer makes the architect's claims verifiable. The validator can then check "are the cited URLs real and current?" as a deterministic check.

## Honest scope

This is a **facade**. The actual MCP calls are made by the orchestrator. The research script emits a structured directive that the orchestrator can act on. Wiring this fully into the architect agent's runtime requires the orchestrator to be running in an MCP-capable environment.

For now: the research script works in the dev environment (where you can run the MCP server manually and inspect the directive), and the ADR template includes a "References" section where the architect pastes the cited URLs.
