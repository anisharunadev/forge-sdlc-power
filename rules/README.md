# rules/ — always-on governance layer

This directory contains the always-on governance rules shipped with the template.

## Layering

- `common/` — language-agnostic principles (coding style, security, testing, git, performance, patterns, hooks, agents)
- `typescript/` — TypeScript / JavaScript-specific extensions of common
- `python/` — Python-specific extensions of common
- `php/` — PHP-specific extensions of common (PSR-12, PHPUnit/Pest, etc.)

Each language-specific file references its common counterpart and overrides defaults where idioms differ.

## Available languages (and how to add more)

Currently staged:

| Language | Files | Status |
|---|---|---|
| common | 8 | always available |
| typescript | 4 | staged |
| python | 4 | staged |
| php | 4 | staged |

Upstream has 20+ more language directories (golang, rust, java, kotlin, swift, ruby, react, vue, angular, nuxt, react-native, web, cpp, csharp, dart, fsharp, perl, arkts). To add one, fetch from the upstream rules registry and stage under `rules/<language>/` with the `> Adapted for Kiro Power` header.

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

See individual file headers for license.
