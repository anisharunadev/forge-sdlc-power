---
inclusion: on-demand
description: How to use the Vercel MCP adapter (HTTP-based). Loaded when a sub-agent is about to call a Vercel tool.
---

# Vercel adapter — usage

Vercel MCP is HTTP-transport (`https://mcp.vercel.com`), not a local stdio process. The token is sent via Bearer auth automatically by the MCP client.

## Tool semantics

### Read-only

- `vercel_list_projects()` — projects in the team.
- `vercel_list_deployments(project, limit=10)` — recent deployments with status (`BUILDING | READY | ERROR | CANCELED`), branch, commit SHA, and URL.
- `vercel_get_deployment_logs(deployment_id)` — build and runtime logs. The validator calls this when a CI check fails to surface the actual error.

### Mutating

- `vercel_promote_to_production(deployment_id)` — promotes a preview to production. **The hook layer requires an explicit approval file** at `.forge/vercel-prod-approved` before this can run. The user must type the deployment ID and confirm in chat.
- `vercel_set_env(project, key, value, target)` — sets an env var. **If `key` contains `SECRET`, `TOKEN`, `KEY`, or `PASSWORD` (case-insensitive), the hook refuses the call.** The user must set these via Vercel dashboard or `vercel env add` themselves. The model can set non-sensitive env vars (e.g. `FEATURE_FLAG_X`, `LOG_LEVEL`).

## Conventions

- **Preview deploys are automatic on PR push.** The deployer doesn't need to call `vercel_list_deployments` to trigger one — it just watches.
- **Production promotion is a separate step** from PR merge. Even after a PR is merged to main and Vercel auto-deploys to production, the deployer should call `vercel_promote_to_production` only with explicit user approval.
- **Use `vercel_get_deployment_logs` for build failures** instead of running `vercel build` locally. The deployed build runs in Vercel's environment and may differ from yours.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | VERCEL_TOKEN invalid or expired | Surface to user. They need to rotate. |
| `404 Not Found` on `vercel_list_deployments` | Wrong project name or team ID | Check `vercel_list_projects`, surface the right name. |
| `vercel_promote_to_production` blocked by hook | Approval file missing | Ask the user to confirm, then `touch .forge/vercel-prod-approved`. After the promotion succeeds, `rm` the flag. |
| `vercel_set_env` blocked for `*_SECRET` | Hook layer enforces user-only secret writes | User must set the env var themselves via Vercel dashboard. |
| Build fails with `Module not found` | Missing dep in package.json | Add it locally, commit, push — the next preview deploy will retry. |

## Security

- `VERCEL_TOKEN` is secret. Env var only, never inline.
- Production promotion requires explicit user approval. The hook enforces this; do not work around it.
- Secrets are user-only. The model can never write a `*_SECRET`, `*_TOKEN`, `*_KEY`, or `*_PASSWORD` env var.
