---
inclusion: on-demand
description: Deployer-stage notes for the Jira adapter. Loaded when the deployer is about to call jira_transition or jira_add_comment.
---

# Jira — deployer stage notes

When you (the deployer sub-agent) are about to use a Jira tool:

1. **After the PR is open and CI is green**, call `jira_transition(key, "In Review")`. This signals the user that the PR is ready for human review.
2. **In the same call, post a comment** with the PR URL, the validator's full report link, and the list of files changed. The user uses this comment to decide whether to merge.
3. **Never transition to Done.** The user does that after merging.
4. **If the PR is closed without merging** (user clicked "close" rather than "merge"), call `jira_transition(key, "To Do")` so the ticket goes back to the queue.

## Comment template for deployer

```
PR ready for review: <PR_URL>

Validator report: <path to .forge/validator-report.md>
Files changed: <count> files, +<insertions>/-<deletions>
CI: <status>

Transitioning to In Review.
```
