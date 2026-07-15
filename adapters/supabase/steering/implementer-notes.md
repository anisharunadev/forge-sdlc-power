---
inclusion: on-demand
description: Implementer-stage notes for the Supabase adapter. Loaded when the implementer is about to call a Supabase mutating tool.
---

# Supabase — implementer stage notes

When you (the implementer) are about to use a mutating Supabase tool:

1. **Schema changes go through `supabase_apply_migration`.** Never `supabase_execute_sql` with a write.
2. **The hook layer requires an approval gate.** Before calling `supabase_apply_migration`, the user must explicitly approve the SQL in chat. After approval, write the approval flag:
   ```bash
   touch .forge/supabase-migration-approved
   ```
   Then call the tool. The hook will pass. After the migration succeeds, delete the flag:
   ```bash
   rm .forge/supabase-migration-approved
   ```
3. **After every migration, call `supabase_get_advisors`** to verify no new RLS gaps or missing indexes. If the advisors report a critical issue, surface to the user before continuing.
4. **Never edit an applied migration.** Append a new one. The Supabase MCP enforces this.
5. **Type generation goes in the same commit as the migration.** Call `supabase_generate_types` after the migration lands, then commit both.

## Verdict format

```
VERDICT: PASS | FAIL | NEEDS_INFO
MIGRATIONS_APPLIED: <count>
ADVISORS: <count of new findings>
NEXT: validator runs /forge validate <KEY>
```
