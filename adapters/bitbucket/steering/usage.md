---
inclusion: on-demand
description: How to use the Bitbucket Cloud MCP adapter. Loaded when a sub-agent is about to call a Bitbucket tool.
---

# Bitbucket adapter — usage

Same shape as the GitHub adapter, with these Bitbucket-specific differences:

## Branch and PR conventions

- Branch names: same `<type>/<KEY>-<desc>` pattern
- PR titles: same conventional commits format
- Default branch: usually `main` or `master`. Always read `mainbranch` from `bitbucket_get_repo` first.

## Differences from GitHub

| Thing | GitHub | Bitbucket |
|---|---|---|
| Auth | Personal access token / fine-grained | App password (basic auth) |
| Branch protection | Branch protection rules | Branch permissions |
| PR approval | Reviews + required reviewers | Same, but in "Pull requests" section |
| Build status | GitHub Actions checks | Bitbucket Pipelines / connected Jenkins |
| Default review flow | Squash merge by default | Merge commit by default |

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | App password wrong or revoked | Ask user to regenerate at id.atlassian.com |
| `403 Forbidden` on push | Branch permission denies direct push | Expected. Use a feature branch. |
| `409 Conflict` on PR | PR already exists | Fetch existing, surface its URL. |
| Build status not appearing | Pipelines not configured | Surface to user — they need to enable Bitbucket Pipelines on the repo. |

## Security

- App password is secret. Same rules as GITHUB_TOKEN: env var only, no inline values, no logs.
- Use minimum scopes. `repository:write` + `pullrequest:write` is the default. Don't add `account:write` unless needed.
