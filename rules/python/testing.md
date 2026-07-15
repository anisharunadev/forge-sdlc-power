---
paths:
  - "**/*.py"
  - "**/*.pyi"
---

> Origin: ECC (https://github.com/affaan-m/ecc)
> License: Same as upstream (MIT per ECC repo)
> Adapted for Kiro Power: this file is loaded as an Always-mode steering rule. References to "Claude Code" can be read as "Kiro".

# Python Testing

> This file extends [common/testing.md](../common/testing.md) with Python specific content.

## Framework

Use **pytest** as the testing framework.

## Coverage

```bash
pytest --cov=src --cov-report=term-missing
```

## Test Organization

Use `pytest.mark` for test categorization:

```python
import pytest

@pytest.mark.unit
def test_calculate_total():
    ...

@pytest.mark.integration
def test_database_connection():
    ...
```

## Reference

See skill: `python-testing` for detailed pytest patterns and fixtures.
