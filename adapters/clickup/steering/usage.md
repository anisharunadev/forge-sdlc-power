---
inclusion: on-demand
description: How to use the ClickUp MCP adapter. Loaded when a sub-agent is about to call a ClickUp tool.
---

# ClickUp adapter — usage

ClickUp has a different mental model than Jira — Tasks live in Lists, Lists live in Spaces, Spaces live in Folders (optional), and the whole tree hangs off a Workspace (Team).

## Tool semantics

### `clickup_get_task(task_id)`
- Returns: `{ id, name, description, status, assignees, custom_fields[], checklist[], comments[] }`
- `task_id` is the ClickUp task ID (e.g. `abc123`), not a human-readable key like Jira's `PROJ-401`
- Use the custom field `forge_ticket_key` if your workspace has one set, to map human keys to IDs

### `clickup_search_tasks(filters)`
- Filters: `list_id`, `space_id`, `statuses[]`, `assignees[]`, `tags[]`
- Returns task IDs and summaries
- Always set `limit` (default 100, max 100 per page — use pagination for more)

### `clickup_update_status(task_id, status_name)`
- Status names are workspace-defined. Common: `to do`, `in progress`, `in review`, `complete`, `blocked`
- The tool returns available statuses if the name doesn't match
- Idempotent: yes

### `clickup_add_comment(task_id, body)`
- Body is plain text or ClickUp-flavored markdown (their variant supports most common formatting)
- Use for PR URL, validator verdict, and blocker notes
- Comments are visible to anyone with access to the task

### `clickup_set_custom_field(task_id, field_id, value)`
- `field_id` is the custom field's UUID (not its name). Find via `clickup_get_task` first
- Common use: link to PR by setting a `github_pr_url` field, or flag with a `needs_security_review` dropdown
- Idempotent: yes

## Conventions

- **Map human keys to task IDs at the start of plan stage.** Use a custom field or a local `.forge/clickup-map.json` to avoid re-searching.
- **Never transition to `complete`.** The user does that after merge.
- **Comment style**: lead with what happened, then the artifact. Same as Jira.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | API token wrong or revoked | Surface to user, ask them to rotate. |
| `404 Not Found` | Wrong task ID or insufficient access | Verify with `clickup_search_tasks`, then ask user. |
| `429 Too Many Requests` | Rate-limited (ClickUp is 100 req/min) | Back off 30s, retry once. If still failing, surface. |
| Custom field not found | Field doesn't exist or wrong ID | Call `clickup_get_task` to list actual fields, then use the right ID. |

## Security

- API token is secret. Env var only, no inline values, no logs.
- The token grants the user's full access — use a service account, not a personal account.
- Custom fields may contain sensitive data (customer names, etc.). Don't echo them back in validator reports.
