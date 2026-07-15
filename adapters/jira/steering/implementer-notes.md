---
inclusion: on-demand
description: Implementer-stage notes for the Jira adapter. Loaded when the implementer is about to call jira_transition or jira_add_comment.
---

# Jira — implementer stage notes

When you (the implementer sub-agent) are about to use a Jira tool:

1. **At the start of your work**, call `jira_transition(key, "In Progress")`. Do not skip this — the user expects to see ticket movement.
2. **When you open a PR**, call `jira_add_comment(key, ...)` with the PR URL. The user uses this comment to track which tickets have a PR.
3. **Never transition to Done.** That is the user's call after merge.
4. **If you discover the ticket is impossible or wrong**, call `jira_add_comment(key, "Blocker: <reason>")` then `jira_transition(key, "Blocked")`. Do not silently fail.
5. **You are read-write on this adapter.** The implementer is the only stage that can transition to `In Progress` and add PR comments.

## Comments you write

Always include:
- What you did (one sentence)
- The PR URL (if one exists)
- The validator verdict (if known)

Example:
```
Implemented acceptance criteria 1-3.
PR: https://github.com/org/repo/pull/1234
Validator: PASS (3 deterministic checks, 0 findings)
```
