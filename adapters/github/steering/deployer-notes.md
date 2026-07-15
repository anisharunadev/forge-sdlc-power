---
inclusion: on-demand
description: Deployer-stage notes for the GitHub adapter. Loaded when the deployer is about to open a PR.
---

# GitHub — deployer stage notes

When you (the deployer) are about to use a GitHub tool:

1. **Verify CI is green** with `github_get_pr(pr_number)` before opening anything new (you open it, so this is a sanity check on the existing state if the PR exists, or just confirms branch is pushed).
2. **Open the PR** with `github_open_pr`. Use the PR body template from `pr-conventions.md`.
3. **Request review** from at least one human with `github_request_review`. Default reviewer: the user who opened the ticket.
4. **You do NOT merge.** The hook layer blocks `github_merge_pr`. The user does that.
5. **Surface the PR URL** in your verdict line — the user clicks it to review.

## Verdict format

```
VERDICT: PASS
PR_URL: <github pr url>
NEXT: <human review and merge>
```
