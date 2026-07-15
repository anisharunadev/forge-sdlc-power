// Unit tests for the PreToolUse runtime-allowlist hook.
// Run with: node --test hooks/__tests__/pre-tool-allowlist-runtime.test.js

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'pre-tool-allowlist-runtime.js');

function runHook(invocation) {
  return spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(invocation),
    encoding: 'utf8',
    timeout: 5000,
  });
}

function allowsCmd(command) {
  return runHook({ tool_name: 'Bash', tool_input: { command } });
}

// The 7 runtime scripts from orchestrator.json, bare and with flags/args.
const ALLOWED = [
  'node enterprise/preflight/check.js',
  'node enterprise/resume/continue.js',
  'node enterprise/research/research.js',
  'node enterprise/tests/collect.js',
  'node enterprise/monorepo/check-per-repo.js',
  'node enterprise/ci/generate.js',
  'node enterprise/backlog/dispatcher.js',
];

for (const script of ALLOWED) {
  test(`allows ${script} (bare)`, () => {
    const r = allowsCmd(script);
    assert.strictEqual(r.status, 0, `expected allow, got ${r.status}: ${r.stderr}`);
  });
  test(`allows ${script} (with flags/args)`, () => {
    const r = allowsCmd(`${script} --json FOO-123 --diff`);
    assert.strictEqual(r.status, 0, `expected allow, got ${r.status}: ${r.stderr}`);
  });
}

test('denies bare ls', () => {
  const r = allowsCmd('ls -la');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /BLOCKED: bash command not in orchestrator runtime allowlist/);
});

test('denies cat', () => {
  const r = allowsCmd('cat /etc/passwd');
  assert.strictEqual(r.status, 2);
});

test('denies rm', () => {
  const r = allowsCmd('rm -rf .forge');
  assert.strictEqual(r.status, 2);
});

test('denies node running a non-allowlisted script', () => {
  const r = allowsCmd('node hooks/something-else.js');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /Allowed:/);
});

test('ignores non-Bash tools (exit 0)', () => {
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: 'src/x.ts', content: 'x' } });
  assert.strictEqual(r.status, 0);
});

test('fails open on unparseable input', () => {
  const r = spawnSync(process.execPath, [SCRIPT], {
    input: 'not json',
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.strictEqual(r.status, 0, 'should fail open on parse error');
});

test('allows leading whitespace before an allowed script', () => {
  const r = allowsCmd('  node enterprise/ci/generate.js --target github');
  assert.strictEqual(r.status, 0);
});
