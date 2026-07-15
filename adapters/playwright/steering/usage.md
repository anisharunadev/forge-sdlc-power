---
inclusion: on-demand
description: How to use the Playwright MCP adapter. Loaded when the validator is about to call a Playwright tool for E2E checks.
---

# Playwright adapter — usage

Playwright is the validator's E2E tool. Use it to verify the preview deployment matches the acceptance criteria the planner captured.

## Tool semantics

- `playwright_navigate(url)` — opens a URL in a headless Chrome.
- `playwright_screenshot(name)` — saves a screenshot to `.forge/screenshots/<name>.png`. Include in the validator report.
- `playwright_assert_text(selector, expected)` — fails the assertion if `selector` does not contain `expected` text.
- `playwright_click(selector)` — clicks a CSS selector. Useful for triggering flows.
- `playwright_fill(selector, value)` — fills an input.

## Conventions

- **Always navigate first.** Tools operate on the current page; if you call `assert_text` before `navigate`, the assertion runs against `about:blank`.
- **Use unique CSS selectors.** The validator can run on a real preview deployment, so avoid IDs that change between runs.
- **Capture screenshots as evidence.** For any non-trivial assertion, take a screenshot and reference it in the validator report.
- **Prefer `assert_text` over `screenshot` for pass/fail.** Screenshots are evidence, not assertions. The actual verdict is based on the assertion.
- **Wait for page load.** Playwright's `navigate` waits for `load` by default. For SPAs, use `waitForSelector` patterns via `assert_text` retries (built into the tool).

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `playwright_navigate` times out | Preview deploy not up, or URL wrong | Check the deployer passed the right preview URL. Re-run after the deploy is `READY`. |
| `playwright_assert_text` fails with "element not found" | Selector wrong, or page not loaded | Take a screenshot to see the current state, fix the selector. |
| `playwright_click` does nothing | Element is behind a modal or off-screen | Screenshot first, then refine the selector or scroll the element into view. |

## Security

- The Playwright MCP runs a real browser. Don't navigate to URLs you wouldn't visit yourself.
- No secrets, no tokens. Read-only by design.
