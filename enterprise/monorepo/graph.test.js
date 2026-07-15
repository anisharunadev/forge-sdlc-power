// Tests for enterprise/monorepo/graph.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'graph.js');

function setup(reg) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-graph-'));
  fs.mkdirSync(path.join(tmp, '.forge'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.forge/monorepo.json'), JSON.stringify(reg));
  return tmp;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
  });
}

test('linear chain — types before api before web', () => {
  const tmp = setup({
    defaultBranch: 'main',
    repos: [
      { name: 'web', path: '../w', role: 'consumer', dependsOn: ['api'] },
      { name: 'api', path: '../a', role: 'primary', dependsOn: ['types'] },
      { name: 'types', path: '../t', role: 'shared-types' },
    ],
  });
  try {
    const r = run(['--order'], tmp);
    assert.strictEqual(r.status, 0);
    const lines = r.stdout.trim().split('\n');
    assert.deepStrictEqual(lines, ['types', 'api', 'web']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('cycle detection', () => {
  const tmp = setup({
    repos: [
      { name: 'a', path: '../a', dependsOn: ['b'] },
      { name: 'b', path: '../b', dependsOn: ['a'] },
    ],
  });
  try {
    const r = run(['--validate', '--json'], tmp);
    assert.strictEqual(r.status, 1);
    const j = JSON.parse(r.stdout);
    assert.match(j.error, /cycle detected/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('unknown dep reference', () => {
  const tmp = setup({
    repos: [
      { name: 'api', path: '../a', dependsOn: ['nonexistent'] },
    ],
  });
  try {
    const r = run(['--validate', '--json'], tmp);
    assert.strictEqual(r.status, 1);
    const j = JSON.parse(r.stdout);
    assert.match(j.error, /unknown repo "nonexistent"/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('--json output includes role categorization', () => {
  const tmp = setup({
    defaultBranch: 'main',
    repos: [
      { name: 'api', path: '../a', role: 'primary' },
      { name: 'types', path: '../t', role: 'shared-types' },
      { name: 'web', path: '../w', role: 'consumer' },
      { name: 'infra', path: '../i', role: 'infra' },
    ],
  });
  try {
    const r = run(['--json'], tmp);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.status, 'OK');
    assert.strictEqual(json.primary, 'api');
    assert.deepStrictEqual(json.sharedTypes, ['types']);
    assert.deepStrictEqual(json.consumers, ['web']);
    assert.deepStrictEqual(json.infra, ['infra']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
