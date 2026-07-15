---
inclusion: on-demand
description: JQL (Jira Query Language) reference for the jira_search tool. Loaded when the planner or architect is about to call jira_search.
---

# JQL reference

Quick reference for the JQL subset that comes up in the forge-sdlc flow. The full grammar is in the [Atlassian JQL docs](https://support.atlassian.com/jira-service-management-cloud/what-is-advanced-search-in-jira-cloud/).

## Common queries

```jql
# My current sprint, ordered by rank
project = PROJ AND sprint in openSprints() AND assignee = currentUser() ORDER BY Rank

# Anything in code review (In Review or PR open)
project = PROJ AND status = "In Review"

# Recently created, not yet started
project = PROJ AND created >= -7d AND status = "To Do"

# Blocked tickets
project = PROJ AND status = Blocked OR labels = blocked

# All work on a component
component = "auth-service" AND status != Done

# Tickets that touched a specific file
project = PROJ AND comment ~ "src/auth/login.ts"
```

## Operators

| Operator | Meaning | Example |
|---|---|---|
| `=`, `!=` | Equals / not equals | `status = Open` |
| `IN`, `NOT IN` | Set membership | `key IN (PROJ-1, PROJ-2)` |
| `~`, `!~` | Contains / not contains (text fields) | `summary ~ "auth"` |
| `>`, `>=`, `<`, `<=` | Comparison | `priority >= High` |
| `WAS`, `WAS IN`, `WAS NOT` | Historical state | `status WAS "In Progress"` |
| `CHANGED` | Field changed | `CHANGED BY currentUser()` |

## Functions

- `currentUser()` — the authenticated user
- `now()`, `startOfDay()`, `startOfWeek()`, `endOfMonth()` — time
- `-1d`, `-7d`, `-30d` — relative durations (used with `created >= -7d`)
- `openSprints()`, `closedSprints()` — sprint membership
- `membersOf("group")` — group membership

## Reserved characters

If your query contains a reserved character (`+`, `-`, `&`, `|`, `!`, `(`, `)`, `{`, `}`, `[`, `]`, `^`, `~`, `*`, `?`, `\`, `$`), wrap the value in quotes:

```jql
# BAD:  summary ~ auth-service
# GOOD: summary ~ "auth-service"
```

## Performance

- Always include a `project =` clause — Jira Cloud is fast on a single project, slow on global queries.
- Avoid `ORDER BY` on text fields. Order by `Rank`, `priority`, `created`, or `updated`.
- Set `limit` to the smallest number that gets the job done. `jira_search(limit=5)` is faster than `jira_search(limit=100)`.
- Watch for `comment ~` queries — they scan the comments table and can be slow on large projects.
