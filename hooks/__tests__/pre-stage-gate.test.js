// Unit tests for hooks/pre-stage-gate.js
// Run with: node --test hooks/__tests__/pre-stage-gate.test.js

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', 'pre-stage-gate.js');

// Build a temp cwd that contains a stub enterprise/preflight/check.js so the
// hook invokes our fixture instead of the real preflight script.
function withPreflightStub(behavior, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-preflight-'));
  const dir = path.join(root, 'enterprise', 'preflight');
  fs.mkdirSync(dir, { recursive: true });

  let body;
  if (behavior === 'NOT_READY') {
    // Hook contract: preflight returns non-zero on NOT_READY. Exit 1 with the
    // issue list as JSON on stdout — hook parses .checks[].fail into stderr.
    body = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  status: 'NOT_READY',
  checks: [
    { name: 'githooks', ok: false, fail: 'githooks not installed' },
    { name: 'secrets', ok: false, fail: 'missing AWS credentials' },
  ],
}));
process.exit(1);
`;
  } else if (behavior === 'READY') {
    body = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  status: 'READY',
  checks: [{ name: 'all', ok: true }],
}));
`;
  } else if (behavior === 'BROKEN') {
    body = `#!/usr/bin/env node
process.stdout.write('not json');
process.exit(1);
`;
  } else {
    throw new Error(`unknown behavior: ${behavior}`);
  }

  fs.writeFileSync(path.join(dir, 'check.js'), body, { mode: 0o755 });
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runHook(opts = {}) {
  const { cwd, env = {} } = opts;
  return spawnSync(process.execPath, [SCRIPT], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10000,
  });
}

test('FIRST=1 + preflight NOT_READY → exits 2 with NOT_READY on stderr', () => {
  withPreflightStub('NOT_READY', (root) => {
    const r = runHook({
      cwd: root,
      env: { FORGE_FIRST_INVOCATION: '1', FORGE_SKIP_PREFLIGHT: '' },
    });
    assert.strictEqual(r.status, 2, `expected exit 2, got ${r.status}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /NOT_READY/);
  });
});

test('FIRST=1 + preflight READY → exits 0', () => {
  withPreflightStub('READY', (root) => {
    const r = runHook({
      cwd: root,
      env: { FORGE_FIRST_INVOCATION: '1', FORGE_SKIP_PREFLIGHT: '' },
    });
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  });
});

test('FIRST not set → exits 0 (no-op for subsequent Task calls)', () => {
  // No stub needed — hook should short-circuit before touching preflight.
  const r = runHook({ env: { FORGE_FIRST_INVOCATION: '', FORGE_SKIP_PREFLIGHT: '' } });
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}`);
});

test('SKIP_PREFLIGHT=1 + preflight NOT_READY → exits 0 (bypass wins)', () => {
  // Even with a stub that would report NOT_READY, FORGE_SKIP_PREFLIGHT short-circuits.
  withPreflightStub('NOT_READY', (root) => {
    const r = runHook({
      cwd: root,
      env: { FORGE_FIRST_INVOCATION: '1', FORGE_SKIP_PREFLIGHT: '1' },
    });
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  });
});

test('non-Task-style invocation → exits 0 (hook is env-gated, not event-gated)', () => {
  // The hook itself doesn't inspect tool_name / event — only env vars.
  // The orchestrator is responsible for wiring this hook ONLY to Task events.
  // This test pins that contract: no env vars set, hook no-ops.
  const r = runHook({ env: { FORGE_FIRST_INVOCATION: '', FORGE_SKIP_PREFLIGHT: '' } });
  assert.strictEqual(r.status, 0);
});
