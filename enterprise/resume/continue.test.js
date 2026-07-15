// Tests for enterprise/resume/continue.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'continue.js');

function setupTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-resume-'));
  fs.mkdirSync(path.join(tmp, '.forge'), { recursive: true });
  return tmp;
}

function writeStage(tmp, n, name) {
  fs.writeFileSync(path.join(tmp, '.forge', `stage${n}-${name}.md`), `# Stage ${n}\n`);
}

function writeState(tmp, opts) {
  fs.writeFileSync(path.join(tmp, '.forge', 'state.json'), JSON.stringify(opts));
}

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
  });
}

test('NO_STATE when .forge/ does not exist', () => {
  const tmp = setupTmp();
  fs.rmSync(path.join(tmp, '.forge'), { recursive: true, force: true });
  const r = run([], tmp);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /No prior forge state/);
});

test('NO_STATE when no stage artifacts', () => {
  const tmp = setupTmp();
  const r = run([], tmp);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /No prior forge state/);
});

test('RESUME to stage 2 after stage 1 PASS', () => {
  const tmp = setupTmp();
  writeStage(tmp, 1, 'plan');
  writeState(tmp, { lastStage: 'requirements', verdict: 'PASS' });
  const r = run(['PROJ-401'], tmp);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Resuming from stage 2/);
  assert.match(r.stdout, /\/forge design PROJ-401/);
});

test('LAST_FAILED when last verdict is FAIL and --force not passed', () => {
  const tmp = setupTmp();
  writeStage(tmp, 3, 'diff');
  writeState(tmp, { lastStage: 'implement', verdict: 'FAIL' });
  const r = run([], tmp);
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout, /failed at stage/);
  assert.match(r.stdout, /--force/);
});

test('RESUME to stage 3 (re-run) with --force after FAIL', () => {
  const tmp = setupTmp();
  writeStage(tmp, 3, 'diff');
  writeState(tmp, { lastStage: 'implement', verdict: 'FAIL' });
  const r = run(['--force'], tmp);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Resuming from stage 3/);
});

test('ALL_DONE when stage 5 passed and state is fully complete', () => {
  const tmp = setupTmp();
  writeStage(tmp, 5, 'pr');
  writeState(tmp, { lastStage: 'deploy', verdict: 'PASS' });
  const r = run([], tmp);
  // The script only marks ALL_DONE when fromStage > 5, which happens
  // when lastVerdict was PASS and maxStage was 5.
  // After PASS at stage 5, fromStage = 5 + 1 = 6 → all_stages_done.
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /All stages complete/);
});

test('--fresh starts at stage 1 even with state present', () => {
  const tmp = setupTmp();
  writeStage(tmp, 4, 'report');
  writeState(tmp, { lastStage: 'validate', verdict: 'PASS' });
  const r = run(['--fresh', 'PROJ-401'], tmp);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Resuming from stage 1/);
  assert.match(r.stdout, /\/forge requirements PROJ-401/);
});

test('--json output is parseable', () => {
  const tmp = setupTmp();
  writeStage(tmp, 1, 'plan');
  writeState(tmp, { lastStage: 'requirements', verdict: 'PASS' });
  const r = run(['PROJ-401', '--json'], tmp);
  const json = JSON.parse(r.stdout);
  assert.strictEqual(json.status, 'RESUME');
  assert.strictEqual(json.fromStage, 2);
  assert.strictEqual(json.stageName, 'design');
  assert.strictEqual(json.agent, 'architect');
});
