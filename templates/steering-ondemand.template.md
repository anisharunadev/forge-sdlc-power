---
inclusion: <on-demand|fileMatch>
<fileMatchPattern: "**/*.{ts,tsx,py}">  <-- only if fileMatch mode
description: <one-line description used by the harness for semantic routing. Keep under 30 words.>
---

# <Title> — <scope>

This file is loaded on-demand by the harness. The `description` field above is what the harness matches against the current context — keep it specific and short.

## When this loads

- **on-demand mode**: when the LLM-judged current task semantically matches the `description`
- **fileMatch mode**: when the active diff touches files matching `fileMatchPattern`

## Content

<The actual knowledge content for this steering file.>

## Conventions

<Any specific patterns, anti-patterns, or examples that this stage needs.>

## Anti-patterns

<What NOT to do, with examples.>

## Cross-references

<Link to other steering files, rules files, or ADRs that this one depends on.>
