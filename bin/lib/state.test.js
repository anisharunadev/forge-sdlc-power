// bin/lib/state.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const state = require('./state');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forge-state-'));
}

test('freshState has v2 shape with 5 blank stages', () => {
  const s = state.freshState();
  assert.equal(s.version, 2);
  assert.equal(s.ticket, null);
  assert.equal(Object.keys(s.stages).length, 5);
  for (const n of [1, 2, 3, 4, 5]) {
    assert.equal(s.stages[n].status, 'pending');
    assert.equal(s.stages[n].attempts, 0);
  }
});

test('migrate v1 → v2 preserves ticket and last verdict', () => {
  const v1 = {
    ticket: 'PROJ-9',
    lastStage: 'implement',
    lastVerdict: 'PASS',
    history: [{ stage: 'design', verdict: 'PASS', ts: '2026-01-01T00:00:00Z' }],
  };
  const v2 = state.migrate(v1);
  assert.equal(v2.version, 2);
  assert.equal(v2.ticket, 'PROJ-9');
  assert.equal(v2.stages[3].status, 'passed');
  assert.equal(v2.currentStage, 4);
  assert.equal(v2.history.length, 1);
  assert.equal(v2.history[0].note, 'migrated from v1');
});

test('setTicket persists to disk atomically', () => {
  const dir = tmp();
  state.setTicket(dir, 'PROJ-1');
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(onDisk.ticket, 'PROJ-1');
  assert.equal(onDisk.version, 2);
});

test('beginStage → finishStage transitions through full happy path', () => {
  const dir = tmp();
  state.setTicket(dir, 'PROJ-2');
  for (const n of [1, 2, 3, 4, 5]) {
    state.beginStage(dir, n);
    let s = state.read(dir);
    assert.equal(s.stages[n].status, 'running');
    assert.equal(s.stages[n].attempts, 1);
    state.finishStage(dir, n, { verdict: 'PASS', artifact: `stage${n}-out.md` });
  }
  const s = state.read(dir);
  assert.equal(s.currentStage, null);
  for (const n of [1, 2, 3, 4, 5]) {
    assert.equal(s.stages[n].status, 'passed');
    assert.equal(s.stages[n].artifact, `stage${n}-out.md`);
  }
});

test('finishStage FAIL marks failed; nextPending resumes same stage when earlier stages done', () => {
  const dir = tmp();
  // Pretend stages 1-2 already passed; stage 3 just failed.
  state.beginStage(dir, 1); state.finishStage(dir, 1, { verdict: 'PASS' });
  state.beginStage(dir, 2); state.finishStage(dir, 2, { verdict: 'PASS' });
  state.beginStage(dir, 3); state.finishStage(dir, 3, { verdict: 'FAIL', error: 'tests broken' });
  const s = state.read(dir);
  assert.equal(s.stages[3].status, 'failed');
  assert.equal(s.stages[3].error, 'tests broken');
  assert.equal(state.nextPending(s), 3); // failed is resumable
});

test('beginStage increments attempts on retry', () => {
  const dir = tmp();
  state.beginStage(dir, 4);
  state.beginStage(dir, 4);
  state.beginStage(dir, 4);
  const s = state.read(dir);
  assert.equal(s.stages[4].attempts, 3);
});

test('checkpoint stores last 20', () => {
  const dir = tmp();
  for (let i = 0; i < 25; i++) state.checkpoint(dir, `cp-${i}`);
  const s = state.read(dir);
  assert.equal(s.checkpoints.length, 20);
  assert.equal(s.checkpoints[s.checkpoints.length - 1].label, 'cp-24');
});

test('restart wipes stages, keeps ticket and memory', () => {
  const dir = tmp();
  state.setTicket(dir, 'PROJ-3');
  state.beginStage(dir, 1);
  state.finishStage(dir, 1, { verdict: 'PASS' });
  state.checkpoint(dir, 'pre-restart');
  state.restart(dir);
  const s = state.read(dir);
  assert.equal(s.ticket, 'PROJ-3');
  assert.equal(s.stages[1].status, 'pending');
  assert.equal(s.checkpoints.length, 0);
});

test('read of corrupt state backs up and returns fresh', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'state.json'), '{ this is not json');
  const s = state.read(dir);
  assert.equal(s.version, 2);
  const backups = fs.readdirSync(dir).filter((f) => f.includes('.corrupt.'));
  assert.equal(backups.length, 1);
});

test('nextPending walks stages in order', () => {
  const s = state.freshState();
  assert.equal(state.nextPending(s), 1);
  s.stages[1].status = 'passed';
  assert.equal(state.nextPending(s), 2);
  s.stages[2].status = 'passed';
  s.stages[3].status = 'failed';
  assert.equal(state.nextPending(s), 3); // failed is resumable
});
