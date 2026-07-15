// bin/lib/resume.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const resume = require('./resume');
const state = require('./state');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forge-resume-'));
}

test('resume with no ticket suggests start', () => {
  const dir = tmp();
  const r = resume.resume(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NO_TICKET');
});

test('resume after stage 1 pass → stage 2', () => {
  const dir = tmp();
  state.setTicket(dir, 'PROJ-1');
  state.beginStage(dir, 1);
  state.finishStage(dir, 1, { verdict: 'PASS' });
  const r = resume.resume(dir);
  assert.equal(r.ok, true);
  assert.equal(r.fromStage, 2);
  assert.equal(r.stageName, 'design');
});

test('resume refuses after FAIL without --force', () => {
  const dir = tmp();
  state.setTicket(dir, 'PROJ-2');
  state.beginStage(dir, 1); state.finishStage(dir, 1, { verdict: 'PASS' });
  state.beginStage(dir, 2); state.finishStage(dir, 2, { verdict: 'PASS' });
  state.beginStage(dir, 3); state.finishStage(dir, 3, { verdict: 'FAIL' });
  const r = resume.resume(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'LAST_FAILED');
  const r2 = resume.resume(dir, { force: true });
  assert.equal(r2.ok, true);
  assert.equal(r2.fromStage, 3); // rerun the failed stage
});

test('resume returns ALL_DONE when all stages passed', () => {
  const dir = tmp();
  state.setTicket(dir, 'PROJ-3');
  for (const n of [1, 2, 3, 4, 5]) {
    state.beginStage(dir, n);
    state.finishStage(dir, n, { verdict: 'PASS' });
  }
  const r = resume.resume(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ALL_DONE');
});

test('restart preserves ticket by default; --preserveMemory=false clears checkpoints', () => {
  const dir = tmp();
  state.setTicket(dir, 'PROJ-4');
  state.checkpoint(dir, 'will be wiped');
  const r = resume.restart(dir);
  assert.equal(r.before, 'PROJ-4');
  assert.equal(r.after, 'PROJ-4');
  const s = state.read(dir);
  assert.equal(s.checkpoints.length, 0);
});

test('status returns summary + history', () => {
  const dir = tmp();
  state.setTicket(dir, 'PROJ-5');
  state.beginStage(dir, 1);
  state.finishStage(dir, 1, { verdict: 'PASS' });
  const s = resume.status(dir);
  assert.equal(s.ticket, 'PROJ-5');
  assert.ok(s.summary.includes('requirements'));
  assert.equal(s.history.length, 1);
});

test('checkpoint returns incremented count', () => {
  const dir = tmp();
  const r = resume.checkpoint(dir, 'first');
  assert.equal(r.count, 1);
  const r2 = resume.checkpoint(dir, 'second');
  assert.equal(r2.count, 2);
  assert.equal(r2.last.label, 'second');
});
