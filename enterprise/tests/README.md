# Test result integration

Runs the project's test suite, captures structured results, diffs against the prior run, and emits a report. The orchestrator posts the diff to the ticket — the user sees "5 new test failures, 2 in `auth.test.ts`" without having to read the full test log.

## Usage

```bash
node enterprise/tests/collect.js                  # auto-detect framework
node enterprise/tests/collect.js --framework jest
node enterprise/tests/collect.js --diff           # compare to last run
node enterprise/tests/collect.js --json           # machine-readable
```

## Framework support

| Framework | Command invoked | Output parser |
|---|---|---|
| jest | `npx jest --json --outputFile=.forge/jest-raw.json` | built-in JSON |
| vitest | `npx vitest run --reporter=json --outputFile=.forge/vitest-raw.json` | built-in JSON |
| pytest | `pytest --junit-xml=.forge/pytest-raw.xml` | minimal JUnit-XML parser |

Auto-detection reads `jest.config.*`, `vitest.config.*`, or `pyproject.toml`.

## Output shape (--json)

```json
{
  "framework": "jest",
  "passed": 47,
  "failed": 3,
  "total": 50,
  "failures": [
    { "name": "auth > login > rejects bad password", "file": "src/auth/login.test.ts", "message": "Expected 401, got 500" }
  ],
  "diff": {
    "newFailures": ["src/auth/login.test.ts::auth > login > rejects bad password"],
    "resolvedFailures": ["src/api/users.test.ts::users > list > returns empty"],
    "passDelta": 2,
    "failDelta": -1
  }
}
```

## What writes where

| File | Purpose |
|---|---|
| `.forge/test-results.json` | Current run, structured. Used by the validator. |
| `.forge/prior-results.json` | The "previous" run for diffing. Rotated on every run. |
| `.forge/jest-raw.json` / `vitest-raw.json` / `pytest-raw.xml` | Raw output from the test runner. |

## Integration with the orchestrator

The validator sub-agent calls `collect.js --json --diff` and includes the result in `.forge/validator-report.md`. The post-stage-cmd hook (existing) reads the report and surfaces the diff in the humanized status post.

## Why this exists

A forge run that says "tests pass" is half-useful. A forge run that says "3 tests regressed, 2 in auth" is actionable. The user opens the ticket, sees the diff, and can decide whether to fix now or move on.

The whole thing is one file. The diff logic is 20 lines. The user-facing win is the difference between "did anything break?" (manual) and "here's what broke" (automated).
