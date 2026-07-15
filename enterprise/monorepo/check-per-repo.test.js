// Tests for enterprise/monorepo/check-per-repo.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'check-per-repo.js');

function setupMono() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-mono-'));
  fs.mkdirSync(path.join(tmp, '.forge'), { recursive: true });

  // Create two fake repos
  const api = fs.mkdtempSync(path.join(tmp, 'api-'));
  const web = fs.mkdtempSync(path.join(tmp, 'web-'));

  // api has a failing test, no package.json so we use a direct command
  // web passes
  // Use a Makefile-based test (no real tools needed in the test env).
  // The detectStack function checks package.json first, then pyproject,
  // then go.mod, then Makefile. We use only Makefile here.
  fs.writeFileSync(path.join(api, 'Makefile'), 'test:\n\texit 1\n');
  fs.writeFileSync(path.join(web, 'Makefile'), 'test:\n\texit 0\n');

  // monorepo.json with relative paths
  fs.writeFileSync(path.join(tmp, '.forge/monorepo.json'), JSON.stringify({
    defaultBranch: 'main',
    repos: [
      { name: 'api', path: path.relative(tmp, api), role: 'primary' },
      { name: 'web', path: path.relative(tmp, web), role: 'consumer', dependsOn: ['api'] },
    ],
  }));

  return tmp;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
  });
}

test('PASS for repo whose test passes', () => {
  const tmp = setupMono();
  try {
    const r = run(['web', '--json'], tmp);
    assert.strictEqual(r.status, 0);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.verdict, 'PASS');
    assert.strictEqual(json.repo, 'web');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('FAIL for repo whose test fails', () => {
  const tmp = setupMono();
  try {
    const r = run(['api', '--json'], tmp);
    assert.strictEqual(r.status, 1);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.verdict, 'FAIL');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Exit 2 for unknown repo', () => {
  const tmp = setupMono();
  try {
    const r = run(['unknown-repo'], tmp);
    assert.strictEqual(r.status, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Exit 2 with no args', () => {
  const tmp = setupMono();
  try {
    const r = run([], tmp);
    assert.strictEqual(r.status, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
