// Unit tests for PostToolUse validator-collect hook
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', 'post-validator-collect.js');

function setupTmpWithCollector(collectorBody) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-vcollect-'));
  const colDir = path.join(tmp, 'enterprise', 'tests');
  fs.mkdirSync(colDir, { recursive: true });
  fs.writeFileSync(path.join(colDir, 'collect.js'), collectorBody, { mode: 0o644 });
  return tmp;
}

function runHook(invocation, cwd) {
  return spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(invocation),
    encoding: 'utf8',
    cwd,
    timeout: 10000,
  });
}

const VALIDATOR_TASK = {
  tool_name: 'Task',
  tool_input: { subagent_type: 'validator' },
  tool_result: {
    content: 'Validator completed. Running tests now...',
  },
};

test('validator Task completes -> writes .forge/test-diff.json with diff data', () => {
  const tmp = setupTmpWithCollector(`
    'use strict';
    process.stdout.write(JSON.stringify({
      framework: 'jest',
      summary: { passed: 12, failed: 1, total: 13 },
      diff: { newFailures: ['src/auth.test.ts::login'], fixed: ['src/util.test.ts::parse'] },
    }));
  `);
  try {
    const r = runHook(VALIDATOR_TASK, tmp);
    assert.strictEqual(r.status, 0);
    const out = path.join(tmp, '.forge', 'test-diff.json');
    assert.ok(fs.existsSync(out), 'test-diff.json should be written');
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.strictEqual(parsed.framework, 'jest');
    assert.strictEqual(parsed.summary.failed, 1);
    assert.deepStrictEqual(parsed.diff.newFailures, ['src/auth.test.ts::login']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('non-Task event -> no file written (early return)', () => {
  const tmp = setupTmpWithCollector(`
    'use strict';
    process.stdout.write('{"should":"not be written"}');
  `);
  try {
    const r = runHook(
      { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_result: { ok: true } },
      tmp
    );
    assert.strictEqual(r.status, 0);
    assert.ok(!fs.existsSync(path.join(tmp, '.forge', 'test-diff.json')),
      'no test-diff.json should be written for non-Task events');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('validator Task but missing test framework -> graceful degradation, no crash', () => {
  // collect.js exits non-zero (simulates no framework available); hook must
  // swallow it and exit 0 without writing the file.
  const tmp = setupTmpWithCollector(`
    'use strict';
    process.stderr.write('no test framework detected\\n');
    process.exit(2);
  `);
  try {
    const r = runHook(VALIDATOR_TASK, tmp);
    assert.strictEqual(r.status, 0, 'hook must never block');
    // No file written (spawnSync returned non-zero, hook skipped the write).
    // If collect.js happened to print parseable JSON it could write — verify
    // here that nothing parseable was emitted by ensuring the file is absent
    // or empty.
    const out = path.join(tmp, '.forge', 'test-diff.json');
    if (fs.existsSync(out)) {
      const stat = fs.statSync(out);
      assert.strictEqual(stat.size, 0, 'file should be empty when collector fails');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('failed test run -> diff captures failures', () => {
  const tmp = setupTmpWithCollector(`
    'use strict';
    process.stdout.write(JSON.stringify({
      framework: 'jest',
      summary: { passed: 8, failed: 3, total: 11 },
      diff: {
        newFailures: [
          'src/auth.test.ts::login',
          'src/auth.test.ts::logout',
          'src/api.test.ts::postHandler',
        ],
        fixed: [],
      },
    }));
  `);
  try {
    const r = runHook(VALIDATOR_TASK, tmp);
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(
      fs.readFileSync(path.join(tmp, '.forge', 'test-diff.json'), 'utf8')
    );
    assert.strictEqual(parsed.summary.failed, 3);
    assert.strictEqual(parsed.diff.newFailures.length, 3);
    assert.ok(parsed.diff.newFailures.every((f) => f.includes('.test.ts')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});