#!/usr/bin/env node
// runtime/integration.test.js
// End-to-end happy-path test of the orchestrator integration.
// Runs the full preflight → CI generation → queue + dispatch flow
// against a fresh tmp directory and verifies the wiring is correct.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-integ-'));
  exec('git', ['init', '-q', '-b', 'main'], tmp);
  exec('git', ['config', 'user.email', 'bot@test.com'], tmp);
  exec('git', ['config', 'user.name', 'Bot'], tmp);
  // Minimal forge-sdlc structure
  fs.writeFileSync(path.join(tmp, 'POWER.md'), '# p\n');
  fs.mkdirSync(path.join(tmp, '.kiro/agents'), { recursive: true });
  fs.copyFileSync(path.join(REPO, '.kiro/agents/orchestrator.json'), path.join(tmp, '.kiro/agents/orchestrator.json'));
  fs.copyFileSync(path.join(REPO, '.kiro/agents/planner.json'), path.join(tmp, '.kiro/agents/planner.json'));
  fs.copyFileSync(path.join(REPO, '.kiro/agents/architect.json'), path.join(tmp, '.kiro/agents/architect.json'));
  fs.copyFileSync(path.join(REPO, '.kiro/agents/implementer.json'), path.join(tmp, '.kiro/agents/implementer.json'));
  fs.copyFileSync(path.join(REPO, '.kiro/agents/validator.json'), path.join(tmp, '.kiro/agents/validator.json'));
  fs.copyFileSync(path.join(REPO, '.kiro/agents/deployer.json'), path.join(tmp, '.kiro/agents/deployer.json'));
  fs.mkdirSync(path.join(tmp, 'hooks'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'hooks/hooks.json'), path.join(tmp, 'hooks/hooks.json'));
  fs.mkdirSync(path.join(tmp, 'adapters'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'adapters/registry.json'), path.join(tmp, 'adapters/registry.json'));
  // Initial commit so the repo is in a clean state
  exec('git', ['add', '.'], tmp);
  exec('git', ['commit', '-q', '-m', 'init'], tmp);
  // Switch to a feature branch
  exec('git', ['checkout', '-q', '-b', 'feature/test'], tmp);
  return tmp;
}

function exec(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8' });
}

function run(scriptPath, args, cwd, env) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, ...(env || {}) },
  });
}

test('full happy path: preflight → CI → backlog', () => {
  const tmp = setup();
  try {
    // 1. Preflight: should pass on a clean setup with no enabled adapters
    // (skip enabled adapters that need env vars)
    const regPath = path.join(tmp, 'adapters/registry.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    for (const k of Object.keys(reg.adapters)) reg.adapters[k].enabled = false;
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));

    const preflight = run(path.join(REPO, 'enterprise/preflight/check.js'), ['--json'], tmp);
    const preflightJson = JSON.parse(preflight.stdout);
    // May have some not-ready issues (npm not in path on some envs etc.),
    // but the script must produce a parseable JSON.
    assert.ok(['READY', 'NOT_READY'].includes(preflightJson.verdict), `unexpected verdict: ${preflightJson.verdict}`);

    // 2. CI generation: should write a file
    const ciOutput = path.join(tmp, '.github/workflows/forge-validate.yml');
    const ci = run(path.join(REPO, 'enterprise/ci/generate.js'), ['--target', 'github', '-o', ciOutput], tmp);
    assert.strictEqual(ci.status, 0, `ci generation failed: ${ci.stderr}`);
    assert.ok(fs.existsSync(ciOutput), 'CI file should be created');
    const ciContent = fs.readFileSync(ciOutput, 'utf8');
    assert.match(ciContent, /forge-validate/);
    assert.match(ciContent, /on:\s*\n\s*pull_request/);

    // 3. Queue + status
    const add = run(path.join(REPO, 'enterprise/backlog/queue.js'), ['add', 'PROJ-401', '--priority', 'high'], tmp);
    assert.strictEqual(add.status, 0);
    const add2 = run(path.join(REPO, 'enterprise/backlog/queue.js'), ['add', 'PROJ-402', '--priority', 'low'], tmp);
    assert.strictEqual(add2.status, 0);
    const status = run(path.join(REPO, 'enterprise/backlog/queue.js'), ['status', '--json'], tmp);
    const statusJson = JSON.parse(status.stdout);
    assert.deepStrictEqual(statusJson.ready, ['PROJ-401', 'PROJ-402']);
    assert.strictEqual(Object.keys(statusJson.in_flight).length, 0);

    // 4. Next returns highest-priority
    const next = run(path.join(REPO, 'enterprise/backlog/queue.js'), ['next', '--json'], tmp);
    const nextJson = JSON.parse(next.stdout);
    assert.strictEqual(nextJson.next, 'PROJ-401');

    // 5. Resume integration: with a stage1 artifact + state, points to stage 2
    fs.writeFileSync(path.join(tmp, '.forge/stage1-plan.md'), '# Plan\n');
    fs.writeFileSync(path.join(tmp, '.forge/state.json'), JSON.stringify({ lastStage: 'requirements', verdict: 'PASS' }));
    const resume = run(path.join(REPO, 'enterprise/resume/continue.js'), ['PROJ-401', '--json'], tmp);
    assert.strictEqual(resume.status, 0);
    const resumeJson = JSON.parse(resume.stdout);
    assert.strictEqual(resumeJson.fromStage, 2);
    assert.strictEqual(resumeJson.stageName, 'design');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('preflight catches missing env vars when adapter is enabled', () => {
  const tmp = setup();
  try {
    const regPath = path.join(tmp, 'adapters/registry.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    reg.adapters.jira = { enabled: true };
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
    fs.mkdirSync(path.join(tmp, 'adapters/jira'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'adapters/jira/adapter.json'), JSON.stringify({
      name: 'jira',
      envVars: [{ name: 'JIRA_TOKEN', required: true }],
      tools: [],
      mcpServers: ['jira'],
    }));
    const preflight = run(path.join(REPO, 'enterprise/preflight/check.js'), ['--json'], tmp);
    const preflightJson = JSON.parse(preflight.stdout);
    assert.strictEqual(preflightJson.verdict, 'NOT_READY');
    const envCheck = preflightJson.checks.find((c) => c.name.startsWith('env-jira'));
    assert.ok(envCheck, 'should have env check for jira');
    assert.strictEqual(envCheck.ok, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('monorepo: per-repo check works with a valid monorepo.json', () => {
  const tmp = setup();
  try {
    fs.mkdirSync(path.join(tmp, '.forge'), { recursive: true });
    const fakeRepo = fs.mkdtempSync(path.join(tmp, 'fake-'));
    fs.writeFileSync(path.join(fakeRepo, 'Makefile'), 'test:\n\texit 0\n');
    fs.writeFileSync(path.join(tmp, '.forge/monorepo.json'), JSON.stringify({
      defaultBranch: 'main',
      repos: [{ name: 'fake', path: path.relative(tmp, fakeRepo), role: 'primary' }],
    }));
    const check = run(path.join(REPO, 'enterprise/monorepo/check-per-repo.js'), ['fake', '--json'], tmp);
    assert.strictEqual(check.status, 0);
    const j = JSON.parse(check.stdout);
    assert.strictEqual(j.verdict, 'PASS');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('research emits a directive (no real MCP call)', () => {
  const tmp = setup();
  try {
    // Disable all adapters so the fallback path is hit
    const regPath = path.join(tmp, 'adapters/registry.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    for (const k of Object.keys(reg.adapters)) reg.adapters[k].enabled = false;
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
    const r = run(path.join(REPO, 'enterprise/research/research.js'), ['--json', 'react'], tmp);
    assert.strictEqual(r.status, 0, `research failed: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.queries.length, 1);
    // No backend enabled → fallback
    assert.strictEqual(j.queries[0].status, 'fallback');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-stage gate hook blocks the first Task when preflight is NOT_READY', () => {
  const tmp = setup();
  try {
    // Force preflight to fail: add a dirty tracked file
    fs.writeFileSync(path.join(tmp, 'POWER.md'), '# dirty\n');
    exec('git', ['add', 'POWER.md'], tmp);

    // Simulate the hook with FORGE_FIRST_INVOCATION=1
    const r = run(path.join(REPO, 'hooks/pre-stage-gate.js'), [], tmp, {
      FORGE_FIRST_INVOCATION: '1',
    });
    assert.strictEqual(r.status, 2, `expected exit 2 (block), got ${r.status}`);
    assert.match(r.stderr, /NOT_READY/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-stage gate hook allows Task when FORGE_SKIP_PREFLIGHT=1', () => {
  const tmp = setup();
  try {
    fs.writeFileSync(path.join(tmp, 'POWER.md'), '# dirty\n');
    exec('git', ['add', 'POWER.md'], tmp);
    const r = run(path.join(REPO, 'hooks/pre-stage-gate.js'), [], tmp, {
      FORGE_FIRST_INVOCATION: '1',
      FORGE_SKIP_PREFLIGHT: '1',
    });
    assert.strictEqual(r.status, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install.js regenerates CI on every apply', () => {
  const tmp = setup();
  try {
    // Copy the CI generator so install can find it
    fs.mkdirSync(path.join(tmp, 'enterprise/ci'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'enterprise/ci/generate.js'), path.join(tmp, 'enterprise/ci/generate.js'));
    fs.copyFileSync(path.join(REPO, 'enterprise/ci/README.md'), path.join(tmp, 'enterprise/ci/README.md'));

    const ciOutput = path.join(tmp, '.github/workflows/forge-validate.yml');
    // Disable all adapters so install doesn't fail on missing JSONs
    const regPath = path.join(tmp, 'adapters/registry.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    for (const k of Object.keys(reg.adapters)) reg.adapters[k].enabled = false;
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));

    const install = run(path.join(REPO, 'adapters/install.js'), [], tmp, {});
    assert.strictEqual(install.status, 0, `install failed: ${install.stderr}`);
    assert.ok(fs.existsSync(ciOutput), 'CI file should be generated on install');
    const ciContent = fs.readFileSync(ciOutput, 'utf8');
    assert.match(ciContent, /forge-validate/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
