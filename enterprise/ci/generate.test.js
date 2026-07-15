'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(__dirname, 'generate.js');
const ORCH = path.join(ROOT, '.kiro/agents/orchestrator.json');

function run(args, cwd) {
  return spawnSync('node', [SCRIPT, ...args], {
    cwd: cwd || ROOT,
    encoding: 'utf8',
  });
}

test('generates valid YAML for GitHub Actions', () => {
  const tmp = path.join(os.tmpdir(), `forge-gh-${Date.now()}.yml`);
  const r = run(['--target', 'github', '-o', tmp]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(tmp));
  const out = fs.readFileSync(tmp, 'utf8');
  assert.match(out, /^name: forge-validate/m);
  assert.match(out, /on:\s*\n\s+pull_request:/m);
  assert.match(out, /jobs:\s*\n\s+forge-validate:/m);
  assert.match(out, /runs-on: ubuntu-latest/);
  fs.unlinkSync(tmp);
});

test('includes all 5 stages from orchestrator.json', () => {
  const orch = JSON.parse(fs.readFileSync(ORCH, 'utf8'));
  const names = orch.stages.map((s) => s.name);
  assert.deepStrictEqual(names, ['requirements', 'design', 'implement', 'validate', 'deploy']);

  const tmp = path.join(os.tmpdir(), `forge-stages-${Date.now()}.yml`);
  const r = run(['--target', 'github', '-o', tmp]);
  assert.strictEqual(r.status, 0, r.stderr);
  const out = fs.readFileSync(tmp, 'utf8');
  assert.match(out, /# Stages: requirements → design → implement → validate → deploy/);
  fs.unlinkSync(tmp);
});

test('missing orchestrator.json fails with clear error', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-empty-'));
  const r = run([], tmpDir);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /orchestrator\.json not found/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('custom --target gitlab is respected', () => {
  const tmp = path.join(os.tmpdir(), `forge-gl-${Date.now()}.yml`);
  const r = run(['--target', 'gitlab', '-o', tmp]);
  assert.strictEqual(r.status, 0, r.stderr);
  const out = fs.readFileSync(tmp, 'utf8');
  assert.match(out, /^stages:/m);
  assert.match(out, /forge-validate:/);
  assert.match(out, /image: node:20/);
  assert.doesNotMatch(out, /runs-on: ubuntu-latest/);
  fs.unlinkSync(tmp);
});

test('output file is created at the specified -o path', () => {
  const tmp = path.join(os.tmpdir(), `forge-out-${Date.now()}.yml`);
  assert.ok(!fs.existsSync(tmp));
  const r = run(['--target', 'github', '-o', tmp]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(tmp));
  const stat = fs.statSync(tmp);
  assert.ok(stat.size > 0);
  fs.unlinkSync(tmp);
});