---
inclusion: on-demand
description: How to write humanized status updates for the jira_post_status_update tool. Loaded when the orchestrator or any stage is about to call post_status_update.
---

# Humanized status updates

The forge-sdlc pipeline posts to the configured ticket system at every stage boundary. The posts should read like a human wrote them, not like a machine. This file is the style guide.

## The format

```
🤖 **<stage> — <verdict>**

<summary sentence>

**Next**: `<next slash command>`
```

Three lines:
1. **Header**: `🤖 <stage> — <verdict>`. The emoji signals "this is bot-posted," the stage is human-readable (`requirements`, `design`, `implement`, `validate`, `deploy`), the verdict is `STARTED | PASS | FAIL | NEEDS_INFO`.
2. **Summary**: one sentence, plain English. Lead with the actor and the outcome. Examples below.
3. **Next command**: a slash command the user can copy-paste. This is what makes the workflow resumable — the user reads the comment, copies the command, runs it.

## Examples by stage and verdict

### requirements — STARTED
```
🤖 **requirements — STARTED**

Kicked off the auth-module work. Scoping the requirements now.

**Next**: `/forge requirements "user auth + SAML SSO"`
```

### requirements — PASS
```
🤖 **requirements — PASS**

Requirements locked in. 5 acceptance criteria captured, 2 open questions for the team to weigh in on.

**Next**: `/forge design PROJ-401`
```

### design — PASS
```
🤖 **design — PASS**

Wrote the architecture decision: REST + JWT in front, Postgres for session storage, with rate-limiting at the edge. ADR at `docs/adr/0007-auth.md`.

**Next**: `/forge implement PROJ-401`
```

### implement — STARTED
```
🤖 **implement — STARTED**

Branched `feat/PROJ-401-add-saml-sso`. First pass at the JWT middleware and the SAML callback. ~6 files, 240 lines so far.

**Next**: `/forge validate PROJ-401`
```

### validate — PASS
```
🤖 **validate — PASS**

Typecheck, lint, and tests are green. 12/12 deterministic checks passed, no security findings. Validator report at `.forge/validator-report.md`.

**Next**: `/forge deploy PROJ-401`
```

### validate — FAIL
```
🤖 **validate — FAIL**

Two of the deterministic checks failed: `eslint` flagged 3 warnings above the threshold, and `mypy` found 2 type errors. Pushing the fixes back to the implementer.

**Next**: `/forge implement PROJ-401` (with the validator's fixes)
```

### deploy — PASS
```
🤖 **deploy — PASS**

PR is open and CI is green: https://github.com/acme/api/pull/1234. Validator report attached. Awaiting your review.

**Next**: review and merge
```

### deploy — NEEDS\_INFO
```
🤖 **deploy — NEEDS_INFO**

PR couldn't be opened: the base branch has merge conflicts with `feat/PROJ-401-add-saml-sso`. A rebase is needed before this can move forward.

**Next**: rebase `feat/PROJ-401-add-saml-sso` onto `main`, then `/forge deploy PROJ-401`
```

## What NOT to do

- **No emojis beyond the 🤖 header.** Status posts should be readable in a Jira notification email; emoji spam looks unprofessional.
- **No ADF tables or panels.** Plain Markdown renders fine in Jira's comment view and is much easier to author.
- **No "I" first-person.** The bot doesn't have a name in the post. Lead with the actor (`Alex`, `the team`, `forge-sdlc`) or the action (`scoped`, `implemented`, `validated`).
- **No more than 3 sentences** in the summary. The post should be skimmable.
- **No verdict jargon in the body.** The verdict is in the header. The body should explain it in human terms, not repeat it.
- **No leaking the verdict line itself** (e.g. `VERDICT: PASS`). That's for the orchestrator's internal parser, not the user.

## The next command is load-bearing

The `Next:` line is what makes the workflow **resumable** across sessions. The user can be off for a day, come back, open the ticket, and the last comment tells them exactly what to do next. Don't omit it, don't bury it in prose, don't be clever.

Format: a real slash command the user types in chat. Not a URL. Not a doc link. A command.
