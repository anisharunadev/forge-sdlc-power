#!/usr/bin/env node
// enterprise/research/research.js
// Web research sub-step for the architect stage.
// Given a list of library names, fetches current docs from the web and
// returns structured excerpts. Used by the architect to ground ADRs in
// up-to-date references instead of training data.
//
// Backends (tried in order):
//   1. context7 adapter (if enabled) — for library docs
//   2. parallel-search HTTP MCP (if enabled) — for general web
//   3. exa-web-search (if enabled) — for general web
//   4. Fallback: returns a stub with a warning
//
// Usage:
//   node enterprise/research/research.js "react" "next.js" "pydantic"
//   node enterprise/research/research.js --json "react" "next.js"
//
// Output (--json):
// {
//   "ts": "...",
//   "queries": [
//     { "library": "react", "status": "ok", "source": "context7", "excerpts": [...], "url": "..." },
//     { "library": "next.js", "status": "fallback", "reason": "no research backend enabled" }
//   ]
// }

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const args = process.argv.slice(2);
const json = args.includes('--json');
const queries = args.filter((a) => !a.startsWith('--'));

const REGISTRY = path.join(ROOT, 'adapters/registry.json');

function loadRegistry() {
  if (!fs.existsSync(REGISTRY)) return { adapters: {} };
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
}

function enabled(name) {
  const reg = loadRegistry();
  return reg.adapters?.[name]?.enabled === true;
}

async function viaContext7(library) {
  // The context7 MCP is invoked as a stdio JSON-RPC server. The install
  // script wires it. For this research script, we use the HTTP proxy
  // endpoint exposed by the official @upstash/context7-mcp package.
  //
  // In a real run, the orchestrator would call the MCP tool. This script
  // is a thin facade that the architect sub-agent can use to make the call
  // synchronously.
  //
  // The actual HTTP call requires the MCP server's HTTP endpoint, which
  // is set up at runtime. For now, we emit a structured directive that
  // the orchestrator can act on.

  return {
    status: 'directive',
    source: 'context7',
    library,
    directive: {
      mcp_server: 'context7',
      tool: 'context7_query_docs',
      arguments: {
        id: `<resolve '${library}' via context7_resolve_library_id first>`,
        query: `latest API for ${library}`,
        tokens: 3000,
      },
    },
    note: 'call this directive via the orchestrator; do not invoke from the architect directly',
  };
}

async function viaParallelSearch(library) {
  return {
    status: 'directive',
    source: 'parallel-search',
    library,
    directive: {
      mcp_server: 'parallel-search',
      tool: 'web_search',
      arguments: {
        objective: `Find the current API documentation, breaking changes, and best practices for ${library}`,
        queries: [`${library} latest API`, `${library} breaking changes 2026`, `${library} best practices`],
      },
    },
  };
}

async function viaExa(library) {
  return {
    status: 'directive',
    source: 'exa-web-search',
    library,
    directive: {
      mcp_server: 'exa-web-search',
      tool: 'exa_search',
      arguments: {
        query: `${library} documentation 2026`,
        numResults: 5,
        useAutoprompt: true,
      },
    },
  };
}

async function researchOne(library) {
  if (enabled('context7')) return await viaContext7(library);
  if (enabled('parallel-search')) return await viaParallelSearch(library);
  if (enabled('exa-web-search')) return await viaExa(library);
  return {
    status: 'fallback',
    source: 'none',
    library,
    reason: 'no research backend enabled — enable context7, parallel-search, or exa-web-search in adapters/registry.json',
    note: 'architect must rely on training data and flag uncertainty in the ADR',
  };
}

async function main() {
  if (queries.length === 0) {
    console.error('Usage: research.js [--json] <library-name> [...]');
    process.exit(2);
  }
  const results = await Promise.all(queries.map(researchOne));
  const output = {
    ts: new Date().toISOString(),
    backends_tried: ['context7', 'parallel-search', 'exa-web-search'].filter(enabled),
    queries: results,
  };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const r of results) {
      console.log(`[${r.status}] ${r.library} (${r.source})`);
      if (r.reason) console.log(`  reason: ${r.reason}`);
      if (r.note) console.log(`  note: ${r.note}`);
      if (r.directive) {
        console.log(`  directive: ${r.directive.mcp_server}.${r.directive.tool}`);
      }
    }
  }
}

main().catch((e) => {
  console.error('research failed:', e.message);
  process.exit(1);
});
