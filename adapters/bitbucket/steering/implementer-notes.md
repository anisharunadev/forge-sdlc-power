---
inclusion: on-demand
description: Implementer-stage notes for the Bitbucket adapter. Loaded when the implementer is about to create a branch or push files.
---

# Bitbucket — implementer stage notes

Same as GitHub. Branch first, push commits, do not open the PR. The deployer does that.

Key difference: Bitbucket Pipelines runs on push. After your last `bitbucket_push_files`, the pipeline will start automatically. Don't trigger a manual run — the deployer checks pipeline status via `bitbucket_get_pr`.

```
VERDICT: PASS
ARTIFACT: <branch name>, <commit SHA>
NEXT: deployer opens PR
```
