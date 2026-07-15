---
inclusion: on-demand
description: Implementer-stage notes for the GitHub adapter. Loaded when the implementer is about to create a branch or push files.
---

# GitHub — implementer stage notes

When you (the implementer) are about to use a GitHub tool:

1. **First, check if a branch already exists** for this ticket with `github_list_branches(pattern="feat/<KEY>-*")`. If yes, reuse it — do not create a duplicate.
2. **Branch name**: `feat/<KEY>-<short-description>` (or `fix/`, `refactor/`, etc. — match the type)
3. **Push commits in logical chunks** — not one giant commit. Each commit should compile. The validator will read the diff anyway.
4. **You do NOT open the PR.** That is the deployer's job. Stop after the last `github_push_files`.
5. **You do NOT request review.** Deployer does that.

## What you write

After all files are pushed, return:
```
VERDICT: PASS
ARTIFACT: <branch name>, <commit SHA>
NEXT: deployer should open PR and request review
```
