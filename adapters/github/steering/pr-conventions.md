---
inclusion: on-demand
description: Pull request body templates and review checklist for the GitHub adapter. Loaded when the implementer or deployer is about to open a PR.
---

# PR conventions

## PR body template

```markdown
## Summary
<one paragraph explaining the change>

## Test plan
- [ ] <unit tests added/updated>
- [ ] <integration tests if applicable>
- [ ] <manual verification steps>

## Validator
[.forge/validator-report.md](../../blob/<branch>/.forge/validator-report.md)

## Risk
- [ ] No production data changes
- [ ] No new external API surface
- [ ] No new env vars
- [ ] Migration runbook: <link or N/A>

Closes <TICKET-KEY>
```

## Review checklist (for the validator sub-agent)

When the validator looks at a PR via `github_get_pr`:

1. **CI status**: all checks green. If red, return `VERDICT: FAIL` with the failing check name.
2. **Mergeable**: no conflicts. If conflicts, return `VERDICT: NEEDS_INFO` with `REASON: merge conflicts — rebase required`.
3. **Review state**: ignored. The validator does not gate on human review — that's the user's job.
4. **File count vs. diff size**: more than 800 lines changed → escalate with `REASON: large diff — human review recommended`.
5. **Labels present**: `forge-sdlc` should be on the PR. If missing, add it.

## PR size guidance

| Lines changed | Action |
|---|---|
| 0-200 | Normal. No special action. |
| 201-500 | Validator may flag with `info` finding: "consider splitting." |
| 501-800 | Validator flags with `low` finding. |
| 800+ | Validator returns `VERDICT: NEEDS_INFO` and the orchestrator escalates to the user. |
