---
inclusion: on-demand
description: How to use the Supabase MCP adapter. Loaded when a sub-agent is about to call a Supabase tool.
---

# Supabase adapter — usage

## Tool semantics

### Read-only (safe in any stage)

- `supabase_list_tables()` — all tables in `public`. Use at the start of plan/validate to understand the schema.
- `supabase_execute_sql(query)` — read-only SQL. The tool refuses to run `INSERT/UPDATE/DELETE/CREATE/DROP/ALTER`. For schema changes, use `supabase_apply_migration`.
- `supabase_get_advisors()` — runs Supabase's performance + security linter. The validator calls this after implementation; the result is a list of `security_definer_view`, `rls_disabled_in_public`, `unindexed_foreign_key`, etc. findings.

### Mutating (implementer / deployer only)

- `supabase_apply_migration(name, sql)` — creates a new migration file and applies it. The hook layer requires an explicit `.forge/supabase-migration-approved` flag file before this can run — see `implementer-notes.md`.
- `supabase_generate_types()` — writes TypeScript types to `src/types/database.ts` (or whatever the project's convention is). Idempotent.
- `supabase_deploy_edge_function(name)` — deploys a function from `supabase/functions/<name>/`. The deployer uses this after a function has been implemented and `supabase functions serve <name>` has been validated locally.

## Conventions

- **Migrations are append-only.** Never edit a migration that has been applied. Add a new one. The Supabase MCP enforces this; the hook layer enforces it again.
- **Always run `supabase_get_advisors()` after a migration** to catch RLS gaps. A migration that drops a policy is a security incident.
- **Use `supabase_execute_sql` for one-off data inspections.** For anything that needs to run repeatedly, write a migration.
- **Local first.** Run `supabase start` (via Supabase CLI) locally, validate, then apply to remote. Don't ship migrations you haven't tested.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | SUPABASE_ACCESS_TOKEN wrong or expired | Surface to user, ask them to rotate. |
| `403 Forbidden` on `supabase_apply_migration` | Migration gate not approved | Write `.forge/supabase-migration-approved` after the user confirms the SQL in chat. |
| `supabase_get_advisors` returns `rls_disabled_in_public` | A new table has no Row Level Security policies | Add an RLS policy in the same migration. Don't apply without it. |
| `supabase_deploy_edge_function` fails with "function not found" | Function not in `supabase/functions/<name>/index.ts` | Verify the function file exists, then retry. |
| `supabase_execute_sql` rejects a query | Read-only mode detected a write | Refactor as a migration via `supabase_apply_migration`. |

## Security

- `SUPABASE_ACCESS_TOKEN` is secret. Env var only, no inline.
- Migrations are visible in `supabase/migrations/` and reviewed in PRs. Don't apply a migration that hasn't been reviewed by a human.
- The hook layer requires an explicit approval file before destructive migrations. Do not bypass this; the user is the only one who can approve.
