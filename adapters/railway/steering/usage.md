---
inclusion: on-demand
description: How to use the Railway MCP adapter. Loaded when a sub-agent is about to call a Railway tool.
---

# Railway adapter — usage

Same shape as the Vercel adapter, with these Railway-specific differences.

## Tool semantics

- `railway_list_services(project)` — services in a project. A project can have multiple services (web, worker, postgres, redis, etc.).
- `railway_list_deployments(service)` — recent deploys with `BUILDING | SUCCESS | FAILED | CRASHED` status.
- `railway_redeploy(service)` — triggers a new deploy. Use after env-var changes or to retry a failed build.
- `railway_set_env(service, key, value)` — same secret-guard hook as Vercel: `*_SECRET`, `*_TOKEN`, `*_KEY`, `*_PASSWORD` are user-only.

## Conventions

- **Railway auto-deploys on push to the connected branch.** The deployer doesn't need to trigger manually unless re-deploying after a config change.
- **Use `railway_get_deployment_logs` for build failures** — Railway's build runs in a Nix-based environment that may differ from your local machine.
- **Multi-service projects**: an env var change on the `web` service doesn't propagate to the `worker` service. Set on each one explicitly.
- **No production-promotion step** like Vercel. Railway auto-deploys main to production once you connect a branch.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | RAILWAY_TOKEN invalid | Surface to user, ask them to rotate. |
| `railway_redeploy` shows `CRASHED` | App boots then exits | Check the runtime logs (not build logs) — usually a missing env var or unhandled startup error. |
| `railway_set_env` blocked for `*_SECRET` | Hook layer enforces user-only secret writes | User must set via `railway variables` CLI or dashboard. |

## Security

Same rules as Vercel. Token is secret, secrets are user-only.
