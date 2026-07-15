'use strict';
// Unit tests for the 4 session-state hooks. Each hook is a standalone script that
// reads/writes .forge/ files relative to cwd, so we run them as subprocesses in a
// throwaway temp dir. This exercises real behavior including exit codes.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.join(__dirname, '..');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
}

// Run a hook script in `cwd`, feeding `stdin` (for stdin-reading hooks).
function run(script, cwd, stdin = '') {
  return spawnSync(process.execPath, [path.join(HOOKS, script)], {
    cwd,
    input: stdin,
    encoding: 'utf8',
  });
}

function writeState(cwd, obj) {
  const dir = path.join(cwd, '.forge');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// session-start-load-context.js
// ---------------------------------------------------------------------------
test('load-context: missing state.json → no-op exit 0', () => {
  const cwd = tmpProject();
  const r = run('session-start-load-context.js', cwd);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /New session/);
});

test('load-context: valid state.json is read and surfaced', () => {
  const cwd = tmpProject();
  writeState(cwd, { ticket: 'ABC-1', lastStage: 'spec', lastVerdict: 'PASS', history: [{ stage: 'spec', verdict: 'PASS' }] });
  const r = run('session-start-load-context.js', cwd);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Resuming prior session/);
  assert.match(r.stdout, /ABC-1/);
  assert.match(r.stdout, /spec:PASS/);
});

test('load-context: invalid JSON fails open (exit 0, no crash)', () => {
  const cwd = tmpProject();
  writeState(cwd, '{ not json');
  const r = run('session-start-load-context.js', cwd);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /starting fresh/);
});

// ---------------------------------------------------------------------------
// session-start-pick-ticket-system.js
// ---------------------------------------------------------------------------
function writeTicketSystem(cwd, obj) {
  const dir = path.join(cwd, '.forge');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ticket-system.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));
}

test('pick-ticket-system: missing config → no-op exit 0', () => {
  const cwd = tmpProject();
  const r = run('session-start-pick-ticket-system.js', cwd);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /No ticket system configured/);
});

test('pick-ticket-system: valid config with system is surfaced', () => {
  const cwd = tmpProject();
  writeTicketSystem(cwd, { system: 'jira' });
  const r = run('session-start-pick-ticket-system.js', cwd);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Ticket system: jira/);
});

test('pick-ticket-system: config without system → not enabled message', () => {
  const cwd = tmpProject();
  writeTicketSystem(cwd, {});
  const r = run('session-start-pick-ticket-system.js', cwd);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /not enabled/);
});

test('pick-ticket-system: invalid JSON fails open (exit 0, no crash)', () => {
  const cwd = tmpProject();
  writeTicketSystem(cwd, '{ broken');
  const r = run('session-start-pick-ticket-system.js', cwd);
  assert.strictEqual(r.status, 0);
});

// ---------------------------------------------------------------------------
// pre-compact-flush-state.js
// ---------------------------------------------------------------------------
function readState(cwd) {
  return JSON.parse(fs.readFileSync(path.join(cwd, '.forge', 'state.json'), 'utf8'));
}

test('pre-compact: no .forge → creates state.json exit 0', () => {
  const cwd = tmpProject();
  const r = run('pre-compact-flush-state.js', cwd, JSON.stringify({ reason: 'auto' }));
  assert.strictEqual(r.status, 0);
  const state = readState(cwd);
  assert.strictEqual(state.compactionReason, 'auto');
  assert.ok(state.lastCompaction);
});

test('pre-compact: existing state preserved and verdict appended to history', () => {
  const cwd = tmpProject();
  writeState(cwd, { ticket: 'X-9', lastStage: 'build', history: [] });
  const r = run('pre-compact-flush-state.js', cwd, JSON.stringify({ context: 'VERDICT: PASS', reason: 'manual' }));
  assert.strictEqual(r.status, 0);
  const state = readState(cwd);
  assert.strictEqual(state.ticket, 'X-9');
  assert.strictEqual(state.history.length, 1);
  assert.deepStrictEqual({ stage: state.history[0].stage, verdict: state.history[0].verdict }, { stage: 'build', verdict: 'PASS' });
});

test('pre-compact: invalid existing state.json fails open, still writes', () => {
  const cwd = tmpProject();
  writeState(cwd, '{ corrupt');
  const r = run('pre-compact-flush-state.js', cwd, JSON.stringify({ reason: 'auto' }));
  assert.strictEqual(r.status, 0);
  const state = readState(cwd);
  assert.strictEqual(state.compactionReason, 'auto');
});

test('pre-compact: invalid stdin JSON is best-effort no-op exit 0', () => {
  const cwd = tmpProject();
  const r = run('pre-compact-flush-state.js', cwd, 'not json at all');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(fs.existsSync(path.join(cwd, '.forge', 'state.json')), false);
});

// ---------------------------------------------------------------------------
// session-end-snapshot.js
// ---------------------------------------------------------------------------
function readSummary(cwd) {
  return fs.readFileSync(path.join(cwd, '.forge', 'last-session.md'), 'utf8');
}

test('session-end: no state → writes last-session.md with n/a placeholders', () => {
  const cwd = tmpProject();
  const r = run('session-end-snapshot.js', cwd);
  assert.strictEqual(r.status, 0);
  const md = readSummary(cwd);
  assert.match(md, /ticket: n\/a/);
  assert.match(md, /<ticket>/);
});

test('session-end: valid state → summary reflects state values', () => {
  const cwd = tmpProject();
  writeState(cwd, { ticket: 'T-42', lastStage: 'verify', lastVerdict: 'FAIL', history: [{ stage: 'verify', verdict: 'FAIL' }] });
  const r = run('session-end-snapshot.js', cwd);
  assert.strictEqual(r.status, 0);
  const md = readSummary(cwd);
  assert.match(md, /ticket: T-42/);
  assert.match(md, /verify:FAIL/);
  assert.match(md, /resume --ticket T-42/);
});

test('session-end: invalid state.json fails open, still writes summary', () => {
  const cwd = tmpProject();
  writeState(cwd, '{ nope');
  const r = run('session-end-snapshot.js', cwd);
  assert.strictEqual(r.status, 0);
  const md = readSummary(cwd);
  assert.match(md, /ticket: n\/a/);
});
