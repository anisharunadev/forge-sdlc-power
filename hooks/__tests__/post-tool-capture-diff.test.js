// Unit tests for PostToolUse capture-diff hook
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', 'post-tool-capture-diff.js');

function runHook(invocation, cwd) {
  return spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(invocation),
    encoding: 'utf8',
    cwd,
    timeout: 5000,
  });
}

test('appends Bash command to .forge/session-log.jsonl', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
  try {
    const r = runHook(
      { tool_name: 'Bash', tool_input: { command: 'ls -la' }, tool_result: { ok: true } },
      tmp
    );
    assert.strictEqual(r.status, 0);
    const logFile = path.join(tmp, '.forge', 'session-log.jsonl');
    assert.ok(fs.existsSync(logFile), 'session-log.jsonl should be created');
    const line = JSON.parse(fs.readFileSync(logFile, 'utf8').trim());
    assert.strictEqual(line.tool, 'Bash');
    assert.match(line.cmd, /ls -la/);
    assert.strictEqual(line.ok, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('appends Write path to .forge/session-log.jsonl', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
  try {
    const r = runHook(
      { tool_name: 'Write', tool_input: { file_path: 'src/x.ts' }, tool_result: { ok: true } },
      tmp
    );
    assert.strictEqual(r.status, 0);
    const logFile = path.join(tmp, '.forge', 'session-log.jsonl');
    const line = JSON.parse(fs.readFileSync(logFile, 'utf8').trim());
    assert.strictEqual(line.tool, 'Write');
    assert.strictEqual(line.path, 'src/x.ts');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('never blocks, even on bad input', () => {
  const r = spawnSync(process.execPath, [SCRIPT], {
    input: 'garbage',
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.strictEqual(r.status, 0, 'PostToolUse must never block');
});
