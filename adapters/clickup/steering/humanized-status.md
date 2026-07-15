---
inclusion: on-demand
description: How to write humanized status updates for ClickUp via clickup_post_status_update. Mirrors the jira/humanized-status.md guide with ClickUp-specific formatting.
---

# Humanized status updates (ClickUp)

The forge-sdlc pipeline posts to ClickUp at every stage boundary. This is the style guide for those posts.

## The format

```
🤖 **<stage> — <verdict>**

<summary sentence>

**Next**: `<next slash command>`
```

Same as Jira — three lines, the third one is the load-bearing next command that makes the workflow resumable.

## ClickUp-specific notes

- **ClickUp supports the same Markdown subset as Jira for comments.** Plain text, bold, code spans, lists, and links all render. Don't bother with clickup-flavored extensions.
- **Status names are workspace-defined** in ClickUp. Common defaults: `to do`, `in progress`, `in review`, `complete`, `blocked`. Check the workspace before assuming.
- **Use a `forge_status` custom field** if the workspace has one. Set its value to the verdict (e.g. `PASS`, `FAIL`) so dashboards can group by outcome.
- **Use a `github_pr_url` custom field** if the workspace has one. The deployer sets it to the PR URL so the task is clickable from the PR and vice versa.

## Examples

(See `jira/steering/humanized-status.md` for the canonical examples. The format is the same; the only differences are status names and the optional custom-field writes.)

### implement — STARTED (with ClickUp custom field)
```
🤖 **implement — STARTED**

Branched `feat/PROJ-401-add-saml-sso`. First pass at the JWT middleware.

**Next**: `/forge validate PROJ-401`
```

Then call `clickup_set_custom_field(task_id, "github_branch_field", "feat/PROJ-401-add-saml-sso")` so the branch name is searchable.

### deploy — PASS (with PR URL custom field)
```
🤖 **deploy — PASS**

PR is open and CI is green: https://github.com/acme/api/pull/1234.

**Next**: review and merge
```

Then call `clickup_set_custom_field(task_id, "github_pr_url", "https://github.com/acme/api/pull/1234")`.
