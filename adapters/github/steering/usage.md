---
inclusion: on-demand
description: How to use the GitHub MCP adapter — branch naming, PR conventions, commit message format, merge blocking. Loaded when a sub-agent is about to call a GitHub tool.
---

# GitHub adapter — usage

## Branch naming

Pattern: `<type>/<ticket-key>-<short-description>`

- `feat/PROJ-401-add-saml-sso`
- `fix/PROJ-402-token-leak-in-headers`
- `refactor/PROJ-403-extract-auth-middleware`
- `chore/PROJ-404-bump-deps`
- `docs/PROJ-405-update-readme`

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`.

## Commit messages

Conventional Commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Examples:
```
feat(auth): add SAML SSO support

Implements PROJ-401 acceptance criteria 1-3.
Uses passport-saml under the hood.

Refs: PROJ-401
```

## PR conventions

- **Title**: same as the commit subject, no ticket key in title (it's auto-linked)
- **Body** template:
  ```
  ## Summary
  <one paragraph>

  ## Test plan
  - [ ] <how you tested>

  ## Validator
  <link to .forge/validator-report.md>
  ```
- **Labels**: `forge-sdlc`, plus any from the Jira adapter (e.g. `security-review-required`)
- **Reviewers**: at least one human; the deployer calls `github_request_review` after opening

## Merge is blocked

`github_merge_pr` is in the manifest with `stages: []` — **the deployer cannot call it.** The hook layer enforces this. The user must click the merge button in the GitHub UI.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | GITHUB_TOKEN expired or missing scope | Surface to user, ask them to rotate or add the missing scope. |
| `403 Forbidden` on `github_push_files` | Branch protection rule on `main` | Expected. Use `github_create_branch` first to make a feature branch. |
| `422 Unprocessable` on `github_open_pr` | PR already exists for the branch | Use `github_get_pr` to find the existing PR, surface its URL. |
| `409 Conflict` | Branch name already exists | Append a suffix like `-v2` or use the ticket's comment count. |

## Security

- Never log the GITHUB_TOKEN.
- The token must come from `${env:GITHUB_TOKEN}` — the install script refuses to enable the adapter if the value is inlined.
- Use a fine-grained token with the minimum scopes. Classic PATs with `repo` scope are too broad.
