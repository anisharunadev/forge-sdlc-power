---
inclusion: on-demand
description: The requirements stage flow — what the planner does when the user provides free-form text instead of a ticket key. Loaded when the planner sub-agent is active and no ticket ID is set.
---

# Requirements stage

The planner handles both cases:

1. **User provided a ticket key** (e.g. `PROJ-401`): fetch it with `jira_get_ticket` and skip ticket creation.
2. **User provided free-form text** (e.g. "i have started working on auth"): create a new ticket first, then plan from the text.

## Detecting the case

The orchestrator tells you which case you're in via `.forge/ticket-id.txt`:

- File exists and is non-empty → case 1 (ticket already exists). Read it, fetch the ticket, plan from it.
- File does not exist or is empty → case 2 (no ticket). Create one.

## Case 2 — creating the ticket

1. Read the user's free-form text from the orchestrator's prompt (it's in the spawn message).
2. Compose a ticket summary (one line, ≤ 80 chars).
3. Compose the description (the full requirements, formatted in plain text or ADF).
4. Call `jira_create_ticket(project, summary, description, issueType)` (or `clickup_create_task(list_id, name, description)`).
5. The tool returns the new ticket's key/id.
6. Write it to `.forge/ticket-id.txt` so downstream stages can read it.
7. Then proceed with the normal planning flow: read the acceptance criteria (from the description you just wrote), build the plan, etc.

## Ticket defaults

- **Jira**: `project` defaults to `JIRA_DEFAULT_PROJECT` env var. `issueType` defaults to `JIRA_ISSUE_TYPE` env var or `Task`.
- **ClickUp**: `list_id` defaults to `CLICKUP_DEFAULT_LIST_ID` env var.

## When to ask the user

If `JIRA_DEFAULT_PROJECT` is unset and the user didn't specify a project, return:

```
VERDICT: NEEDS_INFO
REASON: JIRA_DEFAULT_PROJECT env var is not set. Please specify a project key (e.g. PROJ) when starting the work, or set the env var in your shell.
```

Same for ClickUp without `CLICKUP_DEFAULT_LIST_ID`.

## Verdict format

```
VERDICT: PASS | FAIL | NEEDS_INFO
TICKET_ID: <new-key>
ARTIFACT: .forge/stage1-plan.md
NEXT: design
```
