---
inclusion: on-demand
description: Implementer-stage notes for the ClickUp adapter. Loaded when the implementer is about to call clickup_update_status or clickup_add_comment.
---

# ClickUp — implementer stage notes

When you (the implementer) are about to use a ClickUp tool:

1. **At the start of your work**, call `clickup_update_status(task_id, "in progress")`.
2. **When you push the branch**, call `clickup_add_comment(task_id, ...)` with the branch name and last commit SHA.
3. **Never transition to `complete`.** That's the user's call.
4. **If blocked**, call `clickup_add_comment(task_id, "Blocker: <reason>")` then `clickup_update_status(task_id, "blocked")`.

```
VERDICT: PASS
ARTIFACT: <branch>, <commit SHA>
NEXT: deployer opens PR
```
