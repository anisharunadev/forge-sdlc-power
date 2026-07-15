'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'research.js');

function makeProject({ context7 = false, parallel = false, exa = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-test-'));
  fs.mkdirSync(path.join(dir, 'adapters'), { recursive: true });
  const registry = { version: 1, adapters: {} };
  if (context7) registry.adapters['context7'] = { enabled: true };
  if (parallel) registry.adapters['parallel-search'] = { enabled: true };
  if (exa) registry.adapters['exa-web-search'] = { enabled: true };
  fs.writeFileSync(path.join(dir, 'adapters', 'registry.json'), JSON.stringify(registry));
  return dir;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

test('1. --json + library arg emits valid JSON directive', () => {
  const dir = makeProject({ context7: true });
  const r = run(['--json', 'react'], dir);
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.queries.length, 1);
  const q = out.queries[0];
  assert.equal(q.library, 'react');
  assert.equal(q.source, 'context7');
  assert.equal(q.status, 'directive');
  assert.ok(q.directive, 'must include directive');
});

test('2. unknown library falls back gracefully (not crash)', () => {
  // No backend enabled + unknown library → fallback directive with reason
  const dir = makeProject({});
  const r = run(['--json', 'no-such-lib-xyzzy'], dir);
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.queries.length, 1);
  const q = out.queries[0];
  assert.equal(q.status, 'fallback');
  assert.match(q.reason, /no research backend enabled/);
});

test('3. directive schema has required fields (library, source, action)', () => {
  const dir = makeProject({ context7: true });
  const r = run(['--json', 'next.js'], dir);
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
  const out = JSON.parse(r.stdout);
  for (const q of out.queries) {
    assert.ok('library' in q, 'missing library');
    assert.ok('source' in q, 'missing source');
    assert.ok('status' in q, 'missing action/status');
    // When a backend is enabled, directive must carry the MCP tool call shape
    assert.ok(q.directive, 'enabled backend must produce a directive');
    assert.ok(q.directive.mcp_server, 'directive.mcp_server required');
    assert.ok(q.directive.tool, 'directive.tool required');
    assert.ok(q.directive.arguments, 'directive.arguments required');
  }
});

test('4. backend unavailable (mocked) → graceful warning, exit 0', () => {
  // Simulate "backend unavailable": registry absent (no MCP server up).
  // Script should still exit cleanly with a fallback warning.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-test-'));
  // No adapters dir → loadRegistry returns {adapters:{}}, no backend enabled.
  const r = run(['--json', 'whatever'], dir);
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
  const out = JSON.parse(r.stdout);
  const q = out.queries[0];
  assert.equal(q.status, 'fallback');
  assert.ok(q.reason || q.note, 'fallback must include reason or note');
  // backends_tried should be empty since none enabled
  assert.deepEqual(out.backends_tried, []);
});
