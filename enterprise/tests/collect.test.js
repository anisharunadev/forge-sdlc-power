'use strict';

// Tests for collect.js. The script runs main() on require and shells out to
// npx/pytest, so we drive it as a subprocess in a throwaway cwd with fake
// `npx`/`pytest`/`mkdir` shims on PATH that emit canned output. No real tests run.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'collect.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'collect-'));
}

// Write a fake executable onto a bin dir prepended to PATH.
function fakeBin(binDir, name, script) {
  const p = path.join(binDir, name);
  fs.writeFileSync(p, script, { mode: 0o755 });
  fs.chmodSync(p, 0o755);
}

// Run collect.js in `cwd`. `bins` = { name: shellScript } placed on PATH.
function run(cwd, args = [], bins = {}) {
  const binDir = path.join(cwd, '__bin');
  fs.mkdirSync(binDir, { recursive: true });
  for (const [name, script] of Object.entries(bins)) fakeBin(binDir, name, script);
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}` };
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], { cwd, env, encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// A fake `npx` that pretends to be jest/vitest: writes a canned JSON report to
// the --outputFile path and exits per requested failure count.
function fakeNpx(report) {
  return `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const i = args.indexOf('--outputFile');
const out = i >= 0 ? args[i + 1] : args.find(a => a.startsWith('--outputFile=')).split('=')[1];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ${JSON.stringify(JSON.stringify(report))});
process.exit(${report.numFailedTests > 0 ? 1 : 0});
`;
}

const JEST_REPORT = {
  numPassedTests: 3,
  numFailedTests: 1,
  numTotalTests: 4,
  testResults: [
    {
      name: 'auth.test.js',
      assertionResults: [
        { status: 'passed', title: 'ok1', fullName: 'ok1' },
        { status: 'failed', title: 'boom', fullName: 'auth boom', failureMessages: ['Expected true'] },
      ],
    },
  ],
};

function readResults(cwd) {
  return JSON.parse(fs.readFileSync(path.join(cwd, '.forge', 'test-results.json'), 'utf8'));
}

test('detects jest from jest.config.js and captures pass/fail counts', () => {
  const cwd = mkTmp();
  fs.writeFileSync(path.join(cwd, 'jest.config.js'), 'module.exports = {};');
  const r = run(cwd, [], { npx: fakeNpx(JEST_REPORT) });
  assert.equal(r.code, 0, r.stderr);

  const res = readResults(cwd);
  assert.equal(res.framework, 'jest');
  assert.equal(res.passed, 3);
  assert.equal(res.failed, 1);
  assert.equal(res.total, 4);
  assert.equal(res.failures.length, 1);
  assert.equal(res.failures[0].name, 'auth boom');
  assert.match(r.stdout, /3 passed, 1 failed, 4 total/);
});

test('detects pytest from pyproject.toml and parses junit xml counts', () => {
  const cwd = mkTmp();
  fs.writeFileSync(path.join(cwd, 'pyproject.toml'), '[tool.pytest.ini_options]\n');
  const xml = `<testsuite name="pytest" tests="5" failures="2" errors="0">
<testcase name="test_ok" classname="mod"></testcase>
<testcase name="test_bad" classname="mod"><failure message="x">assert 0</failure></testcase>
</testsuite>`;
  // fake pytest writes the xml to --junit-xml=<path>; fake mkdir is harmless.
  const pytest = `#!/usr/bin/env node
const fs=require('fs');
const a=process.argv.slice(2).find(x=>x.startsWith('--junit-xml='));
fs.writeFileSync(a.split('=')[1], ${JSON.stringify(xml)});
process.exit(1);
`;
  const r = run(cwd, [], { pytest });
  assert.equal(r.code, 0, r.stderr);
  const res = readResults(cwd);
  assert.equal(res.framework, 'pytest');
  assert.equal(res.total, 5);
  assert.equal(res.failed, 2);
  assert.equal(res.passed, 3);
  assert.equal(res.failures.length, 1);
  assert.equal(res.failures[0].file, 'mod');
});

test('--diff compares against prior .forge results', () => {
  const cwd = mkTmp();
  fs.writeFileSync(path.join(cwd, 'jest.config.js'), 'module.exports = {};');
  fs.mkdirSync(path.join(cwd, '.forge'), { recursive: true });
  // prior run: 1 passed, 2 failed, with a failure that is now resolved.
  const prior = {
    framework: 'jest',
    passed: 1,
    failed: 2,
    total: 3,
    failures: [
      { name: 'auth boom', file: 'auth.test.js', message: '' },
      { name: 'old gone', file: 'old.test.js', message: '' },
    ],
  };
  fs.writeFileSync(path.join(cwd, '.forge', 'prior-results.json'), JSON.stringify(prior));

  const r = run(cwd, ['--diff', '--json'], { npx: fakeNpx(JEST_REPORT) });
  assert.equal(r.code, 0, r.stderr);
  // Note: collect.js writes test-results.json BEFORE attaching the diff, so the
  // diff only lands in prior-results.json (and stdout via --json).
  const res = JSON.parse(fs.readFileSync(path.join(cwd, '.forge', 'prior-results.json'), 'utf8'));
  assert.ok(res.diff, 'diff block present');
  assert.deepEqual(res.diff.newFailures, []); // auth boom already failing
  assert.deepEqual(res.diff.resolvedFailures, ['old.test.js::old gone']);
  assert.equal(res.diff.passDelta, 2); // 3 - 1
  assert.equal(res.diff.failDelta, -1); // 1 - 2
});

test('missing framework emits clear error and exits non-zero', () => {
  const cwd = mkTmp();
  fs.writeFileSync(path.join(cwd, 'jest.config.js'), 'module.exports = {};');
  // Force the unknown-framework branch via explicit --framework.
  const r = run(cwd, ['--framework', 'nope']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Unknown framework: nope/);
});
