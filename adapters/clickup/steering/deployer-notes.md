---
inclusion: on-demand
description: Deployer-stage notes for the ClickUp adapter. Loaded when the deployer is about to call clickup_update_status or clickup_add_comment.
---

# ClickUp — deployer stage notes

When you (the deployer) are about to use a ClickUp tool:

1. **After the PR is open**, call `clickup_update_status(task_id, "in review")`.
2. **Comment with the PR URL, validator report, and CI status.**
3. **If your workspace has a `github_pr_url` custom field**, call `clickup_set_custom_field(task_id, field_id, pr_url)` to make the link clickable in the ClickUp UI.
4. **Never transition to `complete`.** The user does that after merge.

```
VERDICT: PASS
PR_URL: <github pr url>
TASK_URL: <clickup task url>
NEXT: <human review and merge>
```
