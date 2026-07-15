---
inclusion: on-demand
description: How to use the context7 documentation-lookup MCP adapter. Loaded when a sub-agent is about to call a context7 tool.
---

# Context7 adapter — usage

Context7 returns **live upstream documentation** instead of relying on the model's training data. Use it whenever you're about to write code against a library whose API may have changed since training.

## Tool semantics

### `context7_resolve_library_id(name)`
- Resolves a human-readable name to a context7 ID.
- Input: `"next.js"`, `"react"`, `"@modelcontextprotocol/sdk"`, `"pydantic"`.
- Output: `{ id, name, description, totalSnippets, trustScore }`.
- Call this first. Don't guess the ID.

### `context7_query_docs(id, query, tokens=5000)`
- Fetches documentation snippets relevant to a query.
- `id` is from `resolve_library_id`.
- `query` is what you want to know, in natural language. Example: `"How do I create a server-side route handler in Next.js 15?"`
- `tokens` caps the response size. Default 5000. Lower for fast lookups, higher for deep dives.

## When to use

| Situation | Use context7? |
|---|---|
| Writing code against a library whose API may have changed | **Yes** |
| Implementing a feature using a library you know well | Maybe — quick sanity check on edge cases |
| Reading a project's own source code | **No** — use the Read tool |
| Generic CS questions (algorithms, patterns) | **No** — use model knowledge |
| The library is brand-new (released after the model's training cutoff) | **Yes — required** |

## Conventions

- **Resolve first, query second.** Don't try to query with a human name — context7 expects the resolved ID.
- **Quote the snippet back in your work.** When you use a code sample from context7, include the snippet source so the user can verify.
- **Don't blindly trust `totalSnippets` or `trustScore`.** They're hints, not guarantees. If a snippet looks wrong, fall back to the model's training knowledge and flag the uncertainty.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `Library not found` | Misspelling or library not in context7's index | Try a different name, or fall back to model knowledge. |
| Empty response on `query_docs` | Query too narrow or library has thin docs | Broaden the query, increase `tokens`. |
| Snippet looks wrong / outdated | context7's index may be stale | Cross-check with the library's actual docs URL (search via web_fetch if needed). |

## Security

No secrets, no tokens. Context7 is read-only public documentation.
