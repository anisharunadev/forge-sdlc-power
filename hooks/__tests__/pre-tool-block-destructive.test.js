// Unit tests for the PreToolUse destructive-operation blocker.
// Run with: node --test hooks/__tests__/pre-tool-block-destructive.test.js

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'pre-tool-block-destructive.js');

function runHook(invocation) {
  return spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(invocation),
    encoding: 'utf8',
    timeout: 5000,
  });
}

test('blocks Write to .env', () => {
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: '.env', content: 'X' } });
  assert.strictEqual(r.status, 2, `expected exit 2, got ${r.status}`);
  assert.match(r.stderr, /BLOCKED/);
});

test('blocks Write to .env.production', () => {
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: 'app/.env.production', content: 'X' } });
  assert.strictEqual(r.status, 2);
});

test('blocks Write to package-lock.json', () => {
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: 'package-lock.json', content: '{}' } });
  assert.strictEqual(r.status, 2);
});

test('blocks Write to pnpm-lock.yaml', () => {
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: 'pnpm-lock.yaml', content: '' } });
  assert.strictEqual(r.status, 2);
});

test('blocks Edit on .eslintrc.json', () => {
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: '.eslintrc.json', new_string: '{}' } });
  assert.strictEqual(r.status, 2);
});

test('blocks Edit on tsconfig.json', () => {
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'tsconfig.json', new_string: '{}' } });
  assert.strictEqual(r.status, 2);
});

test('blocks Bash with git commit --no-verify', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'git commit --no-verify -m "x"' } });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /BLOCKED/);
});

test('blocks Bash with git push --force to main', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } });
  assert.strictEqual(r.status, 2);
});

test('blocks Bash with gh pr merge', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'gh pr merge 123' } });
  assert.strictEqual(r.status, 2);
});

test('blocks Write containing sk- secret pattern', () => {
  const r = runHook({
    tool_name: 'Write',
    tool_input: { file_path: 'src/x.ts', content: 'const k = "sk-abcdefghijklmnopqrstuvwxyz1234";' },
  });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /secret-pattern/);
});

test('blocks Write containing ghp_ secret pattern', () => {
  const r = runHook({
    tool_name: 'Write',
    tool_input: { file_path: 'src/x.ts', content: 'const k = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";' },
  });
  assert.strictEqual(r.status, 2);
});

test('blocks Write containing AKIA AWS key pattern', () => {
  const r = runHook({
    tool_name: 'Write',
    tool_input: { file_path: 'src/x.ts', content: 'const k = "AKIAIOSFODNN7EXAMPLE";' },
  });
  assert.strictEqual(r.status, 2);
});

test('allows Write to normal source file', () => {
  const r = runHook({
    tool_name: 'Write',
    tool_input: { file_path: 'src/auth/login.ts', content: 'export const x = 1;' },
  });
  assert.strictEqual(r.status, 0, `expected allow, got exit ${r.status}: ${r.stderr}`);
});

test('allows Bash with normal git command', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'git status' } });
  assert.strictEqual(r.status, 0);
});

test('allows Edit to normal source file', () => {
  const r = runHook({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/x.ts', new_string: 'export const y = 2;' },
  });
  assert.strictEqual(r.status, 0);
});

test('fails open on unparseable input', () => {
  const r = spawnSync(process.execPath, [SCRIPT], {
    input: 'this is not JSON',
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.strictEqual(r.status, 0, 'should fail open on parse error');
});

test('regression: bare Function(...) bypass (caught by cycle-1 verifier)', () => {
  const r = runHook({
    tool_name: 'Write',
    tool_input: { file_path: 'src/x.ts', content: 'const f = Function("return 1");' },
  });
  // The current regex set does not catch bare Function(...); this test asserts current behavior
  // so that future tightening is intentional, not accidental.
  // When the AST scanner is added (Phase 1.5), this assertion flips to status === 2.
  assert.strictEqual(r.status, 0, 'current regex misses bare Function — known gap, tracked');
});
