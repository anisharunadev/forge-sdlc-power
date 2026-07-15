> Adapted for Kiro Power: this file is loaded as an Always-mode steering rule. References to "Claude Code" can be read as "Kiro".
> 
> Origin: ECC (https://github.com/affaan-m/ecc)
> License: MIT
> Path in source: rules/php/README.md

# PHP rules

This directory contains PHP-specific extensions to the common governance layer, adapted from [affaan-m/ecc](https://github.com/affaan-m/ecc) (MIT).

## Files

- `coding-style.md` — PSR-12, `declare(strict_types=1)`, type hints, PHP-CS-Fixer / Laravel Pint, PHPStan / Psalm
- `patterns.md` — thin controllers + explicit services, DTOs / value objects, dependency injection, ORM/SDK boundaries
- `testing.md` — PHPUnit (default) / Pest, coverage via pcov / Xdebug, Inertia.js testing
- `README.md` — this file

## How this extends common/

Each file in this directory explicitly references and extends its `common/` counterpart:

| PHP file | Extends |
|---|---|
| `coding-style.md` | `../common/coding-style.md` |
| `patterns.md` | `../common/patterns.md` |
| `testing.md` | `../common/testing.md` |

Read the common file first. The PHP file adds the language-specific overrides (PSR-12 instead of generic style, PHPUnit instead of generic test framework, etc.).

## Wiring it into a Kiro Power

```bash
mkdir -p steering/rules/php
cp ../../rules/php/coding-style.md steering/rules/php/
cp ../../rules/php/patterns.md      steering/rules/php/
cp ../../rules/php/testing.md       steering/rules/php/

# Prepend `inclusion: always` to each
for f in steering/rules/php/*.md; do
  if ! head -1 "$f" | grep -q "^---$"; then
    { echo "---"; echo "inclusion: always"; echo "---"; cat "$f"; } > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done
```

## PHP-specific hook additions (recommended)

The base hook layer (`hooks/`) already blocks edits to `*.lock` and `.env*`. For PHP Powers, extend the lockfile list to include `composer.lock` (currently `**/*.lock` matches it, so this is already covered). If you also use Laravel Sail or other framework-specific config, add those paths to the `deniedPaths` list on the implementer agent.

## Origin and license

Adapted from [affaan-m/ecc](https://github.com/affaan-m/ecc) under MIT. See individual file headers for source paths.
