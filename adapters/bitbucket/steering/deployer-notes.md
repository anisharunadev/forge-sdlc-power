---
inclusion: on-demand
description: Deployer-stage notes for the Bitbucket adapter. Loaded when the deployer is about to open a PR.
---

# Bitbucket — deployer stage notes

Same as GitHub: open the PR, request review, do not merge.

Bitbucket-specific: PR title format supports `[<KEY>] <title>` and Bitbucket will auto-link the key if the project is configured for it. Use this if your Bitbucket project links to Jira.

```
VERDICT: PASS
PR_URL: <bitbucket pr url>
NEXT: <human review and merge>
```
