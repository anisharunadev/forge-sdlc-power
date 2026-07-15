---
inclusion: on-demand
description: How to use the Jira MCP adapter — tool semantics, JQL patterns, status transitions, comment formatting. Loaded when a sub-agent is about to call a Jira tool.
---

# Jira adapter — usage

This file is loaded into the sub-agent's context when it is about to use a Jira tool. The `description` above is what triggers the harness to load it.

## Tool semantics

### `jira_get_ticket(key)`
- Returns: `{ key, summary, description, status, assignee, reporter, priority, acceptanceCriteria, comments[], attachments[] }`
- Use for: reading the spec at the start of plan/validate stages
- The `acceptanceCriteria` field is the validator's contract — read it first, build the validator report against it

### `jira_create_ticket(project, summary, description, issueType)`
- Creates a new ticket. Returns the new ticket's key.
- `project` is the project key (e.g. `PROJ`). Defaults to `JIRA_DEFAULT_PROJECT` env var.
- `summary` is one line, ≤ 80 chars.
- `description` is the full requirements text. Use Atlassian Document Format (ADF) or plain text — the tool wraps plain text for you.
- `issueType` defaults to `JIRA_ISSUE_TYPE` env var or `Task`.
- Use at the start of the requirements stage when the user has not provided a ticket key (e.g. they typed "i have started working on auth") — the orchestrator calls this to materialize a ticket before proceeding.

### `jira_search(jql, limit=20)`
- JQL examples: `project = PROJ AND status != Done`, `assignee = currentUser() AND sprint in openSprints()`, `key in (PROJ-401, PROJ-402)`
- Use for: finding related tickets, looking up the current sprint, finding blocked work
- Always set `limit` — Jira can return thousands of issues for broad queries

### `jira_transition(key, transition_name)`
- Standard transition names: `To Do`, `In Progress`, `In Review`, `Done`, `Blocked`
- Custom workflows may have different names. The tool returns a list of available transitions if the name doesn't match
- Idempotent: yes, calling it twice with the same target is safe
- Best practice: transition to `In Progress` at the start of implementer stage, `In Review` before opening the PR, `Done` after the user merges

### `jira_add_comment(key, body)`
- `body` is Atlassian Document Format (ADF), not Markdown
- Use `jira_add_comment` with a small ADF helper if you need formatting — see `jira-formatter.md` if present
- For plain-text comments, the tool accepts a single paragraph as a string and wraps it for you
- Include the PR URL in the comment when transitioning to `In Review`

### `jira_post_status_update(key, stage, verdict, next_command, summary)`
- Posts a humanized status update at every stage boundary.
- `stage`: current stage name (e.g. `requirements`, `design`, `implement`, `validate`, `deploy`)
- `verdict`: `PASS | FAIL | NEEDS_INFO | STARTED`
- `next_command`: the slash command the user should run next, e.g. `/forge design PROJ-401`
- `summary`: one-sentence humanized status (e.g. "Alex kicked off the work, requirements are being scoped")
- The tool formats the comment as:
  ```
  🤖 **<stage> — <verdict>**

  <summary>

  **Next**: `<next_command>`
  ```
  Then posts it as a Jira comment. Always include the next command — that's what the user clicks to advance the workflow.

### `jira_add_label(key, label)`
- Labels are plain strings, no spaces
- Use to flag: `security-review-required`, `needs-docs`, `breaking-change`, `flaky-test`
- Idempotent: yes

## Conventions

- **Always pass the ticket key as the first arg.** Don't fetch a list then re-fetch by ID — that's a wasted round-trip.
- **Cache aggressively within a stage.** If the planner reads PROJ-401, the architect should not re-read it — pass the data in the stage handoff file.
- **Comment style.** Lead with what happened, then link the artifact. Example: `Implemented ticket acceptance criteria 1-3. PR: https://github.com/org/repo/pull/1234. Validator: PASS.`
- **Never transition to Done yourself.** The user does that after merging. You can transition to `In Review`.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | JIRA_TOKEN expired or wrong | Surface to user, ask them to rotate. Don't try to use a different credential. |
| `404 Not Found` on `jira_get_ticket` | Wrong project key or insufficient permissions | Verify the key with `jira_search`, then ask user for access if confirmed correct. |
| Transition name not found | Custom workflow | Call `jira_get_transitions(key)` to list available transitions, then use the exact name. |
| `429 Too Many Requests` | Rate-limited | Back off 30 seconds, then retry once. If still failing, surface to user. |

## Security

- Never log the JIRA_TOKEN. The hook layer will block any Write that contains a secret pattern — be aware that pasting an error message with the token in it is a write.
- Comments are public to anyone with read access to the project. Do not include validator reports that leak secrets.
- `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_TOKEN` must come from environment variables. The install script refuses to enable the adapter if the value is inlined in `mcp.json`.
