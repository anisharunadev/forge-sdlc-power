# rules/ — ECC always-on governance layer

This directory contains the always-on governance rules inherited from ECC
(Everything Claude Code) by affaan-m.

## Layering

- `common/` — language-agnostic principles (coding style, security, testing, git, performance, patterns, hooks, agents)
- `typescript/` — TypeScript / JavaScript-specific extensions of common
- `python/` — Python-specific extensions of common

Each language-specific file references its common counterpart and overrides defaults where idioms differ.

## How Kiro loads them

These files are designed to live in `steering/` in `Always` mode so they auto-inject into every sub-agent's context.

To wire them up, copy the files you need into a Power's `steering/` directory at the path `steering/rules/<language>/<filename>` with the frontmatter:

```yaml
---
inclusion: always
---
```

This makes governance constant across every stage of the orchestrator's workflow — no stage can opt out of the security baseline or the coding style.

## Origin and license

Adapted from [affaan-m/ecc](https://github.com/affaan-m/ecc) (MIT).
