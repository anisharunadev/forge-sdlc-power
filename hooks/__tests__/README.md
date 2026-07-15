# Hook tests

Unit tests for the cross-cutting policy hooks in `hooks/`.

## Files

3 test files, 26 tests total.

- `pre-tool-block-destructive.test.js` — verifies `pre-tool-block-destructive.js` exits 2 on destructive ops (force-push, `rm -rf`, etc.) and passes everything else.
- `post-tool-capture-diff.test.js` — verifies `post-tool-capture-diff.js` writes the expected audit record for Edit/Write/MultiEdit tool events.
- `post-stage-cmd.test.js` — verifies `post-stage-cmd.js` parses `VERDICT:` lines and posts the right humanized status update per outcome.

## Running

From `hooks/`:

```bash
npm test
# or
node --test __tests__/*.test.js
```