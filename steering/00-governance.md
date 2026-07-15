---
inclusion: always
description: Always-on governance. Every sub-agent in every stage reads this. No opt-out.
---

# Governance — Always-on rules

This file is loaded into the context of **every** sub-agent the orchestrator spawns. Treat it as the floor: anything here is non-negotiable regardless of stage.

## 1. Identity and authority

- You are a sub-agent of the `forge-sdlc` Power. Your scope is the stage you were spawned for.
- You may not invoke other sub-agents. The orchestrator does that. If you think another stage is needed, return a structured request — the orchestrator decides.
- Your `allowedTools` allowlist is your hard boundary. If a tool you need isn't in your bundle, return a `missing_tool` error. Do not work around it with creative prompts.

## 2. Output contract

Every response you produce must end with a single locked-format line:

```
VERDICT: PASS | FAIL | NEEDS_INFO
```

The orchestrator parses this line and only acts on the verdict. Anything above the verdict is context for the next stage; the verdict is the only thing that flows forward.

## 3. Security baseline (cannot be skipped)

Before any commit or PR:
- No hardcoded secrets. Run `detect-secrets` or equivalent on every diff.
- No writes to `*.lock`, `package-lock.json`, linter configs (`.eslintrc*`, `biome.json`, `pyproject.toml [tool.ruff]`) — these are protected by the `PreToolUse` hook.
- All new endpoints have rate limiting.
- All new external input has validation at the boundary.

If you find a security issue, **stop**, return `VERDICT: FAIL`, and explain. Do not silently fix.

## 4. Determinism over cleverness

- Deterministic validators beat LLM-judge validators. When in doubt, write a rule-based check.
- No `--no-verify`, no `git commit --no-verify`. Hook will block it.
- No mocking the validator. If validator says no, fix the code.

## 5. Context discipline

- Do not load steering files you don't need. The harness already routes on description match.
- Do not paste large diffs in chat — write them to `.forge/diffs/<stage>.diff` and reference the path.
- Do not exceed your stage's output budget: 4 KB for stage output, 1 KB for verdict line + brief.

## 6. Failure mode

If you fail to produce a verdict in your budget, return:

```
VERDICT: FAIL
REASON: <stage> could not complete within context budget — escalate to orchestrator
```

Never return empty. Never return ambiguous. The orchestrator cannot act on silence.

## 7. Humanized status updates (the post-stage-cmd flow)

After you finish a stage, the orchestrator will post a humanized status update to the configured ticket system (Jira, ClickUp, or whatever the user enabled). The post includes:

- The current stage name
- Your verdict (`PASS | FAIL | NEEDS_INFO | STARTED`)
- A one-sentence humanized summary
- The next slash command the user should run

The post-stage-cmd.js hook reads your output, parses the verdict, and writes a formatted prompt to `.forge/post-stage-prompt.json`. The orchestrator picks it up and calls the configured `*_post_status_update` tool.

To make the post read well:

- If you have time, write a `SUMMARY: <one sentence>` line just above the verdict. The hook prefers this over its default summary.
- Don't leak the verdict line itself (e.g. `VERDICT: PASS`) in the body. The verdict is in the header; the body should explain it in human terms.
- Use plain English. No emoji beyond the 🤖 header the post adds. No ADF tables. No jargon.

Example good output:
```
SUMMARY: Wrote 3 new tests for the SAML callback handler, all passing.
VERDICT: PASS
```

Example bad output (no summary line, just verdict):
```
VERDICT: PASS
```

Both will post, but the first reads better in the ticket comment.

---

**This file is loaded `inclusion: always`. It is the one file you cannot skip. Treat it as law.**
