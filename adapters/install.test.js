#!/usr/bin/env node
// Unit tests for adapters/install.js
// Run: node --test adapters/install.test.js

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const INSTALL = path.join(__dirname, 'install.js');

function setupTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-adapter-'));
  // Copy the relevant files into tmp
  const copy = (rel) => {
    const src = path.join(REPO, rel);
    const dst = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  };
  copy('mcp.json');
  copy('.kiro/agents/planner.json');
  copy('.kiro/agents/architect.json');
  copy('.kiro/agents/implementer.json');
  copy('.kiro/agents/validator.json');
  copy('.kiro/agents/deployer.json');
  copy('.kiro/agents/orchestrator.json');
  copy('adapters/registry.json');
  copy('adapters/adapter.schema.json');
  // Copy only the test adapter
  fs.mkdirSync(path.join(tmp, 'adapters', 'jira'), { recursive: true });
  copy('adapters/jira/adapter.json');
  copy('adapters/jira/mcp.json');
  fs.mkdirSync(path.join(tmp, 'adapters', 'jira', 'steering'), { recursive: true });
  copy('adapters/jira/steering/usage.md');
  fs.mkdirSync(path.join(tmp, 'adapters', 'github'), { recursive: true });
  copy('adapters/github/adapter.json');
  copy('adapters/github/mcp.json');
  fs.mkdirSync(path.join(tmp, 'adapters', 'github', 'steering'), { recursive: true });
  copy('adapters/github/steering/usage.md');
  fs.mkdirSync(path.join(tmp, 'adapters', 'clickup'), { recursive: true });
  copy('adapters/clickup/adapter.json');
  copy('adapters/clickup/mcp.json');
  fs.mkdirSync(path.join(tmp, 'adapters', 'clickup', 'steering'), { recursive: true });
  copy('adapters/clickup/steering/usage.md');
  // Need steering dir
  fs.mkdirSync(path.join(tmp, 'steering'), { recursive: true });
  return tmp;
}

function run(args, cwd, env) {
  // If env is `null`, pass nothing (fully isolated).
  // If env is an object, use it as-is (no process.env spread) so tests can fully
  // control the child's environment. Tests that need process.env should pass
  // it explicitly.
  return spawnSync(process.execPath, [INSTALL, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10000,
    env: env === null ? { PATH: process.env.PATH, HOME: process.env.HOME } : env,
  });
}

test('mergeMcp adds jira and github servers to root mcp.json', () => {
  const tmp = setupTmp();
  try {
    // Set required env vars
    const env = {
      JIRA_HOST: 'test.atlassian.net',
      JIRA_EMAIL: 'bot@test.com',
      JIRA_TOKEN: 'token',
      GITHUB_TOKEN: 'ghp_test',
    };
    const r = run([], tmp, env);
    assert.strictEqual(r.status, 0, `install failed: ${r.stderr}`);
    const rootMcp = JSON.parse(fs.readFileSync(path.join(tmp, 'mcp.json'), 'utf8'));
    assert.ok(rootMcp.mcpServers.jira, 'jira server should be merged');
    assert.ok(rootMcp.mcpServers.github, 'github server should be merged');
    // Verify env indirection
    assert.strictEqual(rootMcp.mcpServers.jira.env.JIRA_HOST, '${env:JIRA_HOST}');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('updateAgentAllowedTools adds jira tools to planner', () => {
  const tmp = setupTmp();
  try {
    const env = {
      JIRA_HOST: 'test.atlassian.net',
      JIRA_EMAIL: 'bot@test.com',
      JIRA_TOKEN: 'token',
      GITHUB_TOKEN: 'ghp_test',
    };
    const r = run([], tmp, env);
    assert.strictEqual(r.status, 0, `install failed: ${r.stderr}`);
    const planner = JSON.parse(fs.readFileSync(path.join(tmp, '.kiro/agents/planner.json'), 'utf8'));
    assert.ok(planner.allowedTools.includes('jira_get_ticket'), 'planner should have jira_get_ticket');
    assert.ok(planner.allowedTools.includes('jira_search'), 'planner should have jira_search');
    // Implementer should have jira_transition but NOT jira_get_ticket
    const implementer = JSON.parse(fs.readFileSync(path.join(tmp, '.kiro/agents/implementer.json'), 'utf8'));
    assert.ok(implementer.allowedTools.includes('jira_transition'), 'implementer should have jira_transition');
    assert.ok(!implementer.allowedTools.includes('jira_get_ticket'), 'implementer should NOT have jira_get_ticket (stage routing)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('--disable removes tool from agent allowedTools and MCP server from root', () => {
  const tmp = setupTmp();
  try {
    const env = {
      JIRA_HOST: 'test.atlassian.net',
      JIRA_EMAIL: 'bot@test.com',
      JIRA_TOKEN: 'token',
      GITHUB_TOKEN: 'ghp_test',
    };
    // First apply
    run([], tmp, env);
    // Then disable github
    const r = run(['--disable', 'github'], tmp, env);
    assert.strictEqual(r.status, 0);
    const rootMcp = JSON.parse(fs.readFileSync(path.join(tmp, 'mcp.json'), 'utf8'));
    assert.ok(!rootMcp.mcpServers.github, 'github should be removed after disable');
    assert.ok(rootMcp.mcpServers.jira, 'jira should still be there');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('refuses to enable adapter when env vars missing', () => {
  const tmp = setupTmp();
  try {
    // Disable jira first to test fresh enable
    const regPath = path.join(tmp, 'adapters/registry.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    reg.adapters.jira.enabled = false;
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
    // Explicitly clear jira env vars
    const r = run(['--enable', 'jira'], tmp, null);
    assert.notStrictEqual(r.status, 0, `should fail when env vars missing, got status ${r.status}: ${r.stderr}`);
    assert.match(r.stderr, /env vars missing/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('orchestrator post_status_update tool swaps with enabled ticket system', () => {
  const tmp = setupTmp();
  try {
    const orchPath = path.join(tmp, '.kiro/agents/orchestrator.json');
    const orchTools = () => new Set(JSON.parse(fs.readFileSync(orchPath, 'utf8')).allowedTools);
    // Env for every adapter that may be enabled during this test.
    const env = {
      JIRA_HOST: 'test.atlassian.net',
      JIRA_EMAIL: 'bot@test.com',
      JIRA_TOKEN: 'token',
      GITHUB_TOKEN: 'ghp_test',
      CLICKUP_API_TOKEN: 'ck_test',
      CLICKUP_TEAM_ID: '123',
    };

    // 1. Initial: jira only → jira tool present, clickup absent
    assert.strictEqual(run([], tmp, env).status, 0);
    let tools = orchTools();
    assert.ok(tools.has('jira_post_status_update'), 'jira tool present initially');
    assert.ok(!tools.has('clickup_post_status_update'), 'clickup tool absent initially');

    // 2. Enable clickup → both present
    assert.strictEqual(run(['--enable', 'clickup'], tmp, env).status, 0);
    tools = orchTools();
    assert.ok(tools.has('jira_post_status_update'), 'jira tool still present');
    assert.ok(tools.has('clickup_post_status_update'), 'clickup tool added');

    // 3. Disable jira → only clickup
    assert.strictEqual(run(['--disable', 'jira'], tmp, env).status, 0);
    tools = orchTools();
    assert.ok(!tools.has('jira_post_status_update'), 'jira tool removed');
    assert.ok(tools.has('clickup_post_status_update'), 'clickup tool remains');

    // 4. Disable both → neither
    assert.strictEqual(run(['--disable', 'clickup'], tmp, env).status, 0);
    tools = orchTools();
    assert.ok(!tools.has('jira_post_status_update'), 'jira tool absent');
    assert.ok(!tools.has('clickup_post_status_update'), 'clickup tool absent');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('--status shows registry state', () => {
  const tmp = setupTmp();
  try {
    const r = run(['--status'], tmp, {});
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /jira/);
    assert.match(r.stdout, /github/);
    assert.match(r.stdout, /bitbucket/);
    assert.match(r.stdout, /clickup/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ponytail: Bug A regression — apply() with missing env vars should auto-disable
// the adapter (not silently skip). The registry must reflect reality so doctor /
// --status don't lie about which adapters are wired.
test('apply() auto-disables adapter when required env vars are missing', () => {
  const tmp = setupTmp();
  try {
    // GitHub env is missing → expect github to be auto-disabled.
    const env = {
      JIRA_HOST: 'test.atlassian.net',
      JIRA_EMAIL: 'bot@test.com',
      JIRA_TOKEN: 'token',
      // GITHUB_TOKEN deliberately omitted
    };
    const r = run([], tmp, env);
    assert.strictEqual(r.status, 0, `apply should self-heal (exit 0), got ${r.status}: ${r.stderr}`);

    // Registry should now show github disabled with a reason.
    const reg = JSON.parse(fs.readFileSync(path.join(tmp, 'adapters/registry.json'), 'utf8'));
    assert.strictEqual(reg.adapters.github.enabled, false, 'github should be auto-disabled');
    assert.match(reg.adapters.github.reason, /missing env vars.*GITHUB_TOKEN/);
    assert.strictEqual(reg.adapters.github.installedAt, undefined, 'installedAt cleared on disable');

    // MCP merge should drop github from mcp.json; jira stays.
    const rootMcp = JSON.parse(fs.readFileSync(path.join(tmp, 'mcp.json'), 'utf8'));
    assert.ok(!rootMcp.mcpServers.github, 'github server should NOT be in merged mcp.json');
    assert.ok(rootMcp.mcpServers.jira, 'jira server should still be in merged mcp.json');

    // Stderr should mention the auto-disable path.
    assert.match(r.stderr, /auto-disabling "github"/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('--root writes project artifacts to a different directory', () => {
  const tmp = setupTmp();
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-proj-'));
  try {
    const env = {
      JIRA_HOST: 'test.atlassian.net',
      JIRA_EMAIL: 'bot@test.com',
      JIRA_TOKEN: 'token',
      GITHUB_TOKEN: 'ghp_test',
    };
    // --root=proj needs the project-side scaffolds to exist (install reads them).
    // Mirror the agent files + steering dir into proj so install can find them.
    const copyFromTmp = (rel) => {
      const src = path.join(tmp, rel);
      const dst = path.join(proj, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
      } else {
        fs.copyFileSync(src, dst);
      }
    };
    for (const f of ['mcp.json', '.kiro/agents/orchestrator.json', 'steering']) {
      copyFromTmp(f);
    }
    // Each stage agent so the tool-update loop has targets.
    for (const stage of ['planner', 'architect', 'implementer', 'validator', 'deployer']) {
      copyFromTmp(`.kiro/agents/${stage}.json`);
    }

    const r = run(['--root', proj], tmp, env);
    assert.strictEqual(r.status, 0, `install failed: ${r.stderr}`);

    // Project-side files should be in proj.
    assert.ok(fs.existsSync(path.join(proj, 'mcp.json')), 'mcp.json should land in --root');
    assert.ok(fs.existsSync(path.join(proj, '.kiro/agents/orchestrator.json')), 'agents should land in --root');

    // Package-side artifacts (registry.json, adapters/) still live in tmp.
    assert.ok(fs.existsSync(path.join(tmp, 'adapters/registry.json')));

    // The merged mcp.json (in --root) should have both servers — confirms install
    // wrote to --root, not cwd. The orchestrator.json in proj should also be a
    // valid JSON with allowedTools updated to include the ticket-system tool.
    const rootMcp = JSON.parse(fs.readFileSync(path.join(proj, 'mcp.json'), 'utf8'));
    assert.ok(rootMcp.mcpServers.jira, 'jira should be in --root mcp.json');
    assert.ok(rootMcp.mcpServers.github, 'github should be in --root mcp.json');
    const orch = JSON.parse(fs.readFileSync(path.join(proj, '.kiro/agents/orchestrator.json'), 'utf8'));
    assert.ok(orch.allowedTools.includes('jira_post_status_update'), 'orchestrator should be updated in --root');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  }
});

// ponytail: regression — install on a fresh project without .kiro/agents/ should
// skip CI generation with a clear log, not surface the generator's uncaught throw.
test('apply() skips CI generation when orchestrator.json is missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-noagents-'));
  try {
    // Copy everything an install needs EXCEPT .kiro/agents/.
    const copy = (rel) => {
      const src = path.join(REPO, rel);
      const dst = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    };
    copy('mcp.json');
    copy('adapters/registry.json');
    copy('adapters/adapter.schema.json');
    // Mirror the real bug scenario: package ships with enterprise/ci/generate.js
    // (it's in npm cache for npx installs) but the target project has no
    // .kiro/agents/. Copy just the generator entry point.
    fs.mkdirSync(path.join(tmp, 'enterprise', 'ci'), { recursive: true });
    copy('enterprise/ci/generate.js');
    for (const a of ['jira', 'github']) {
      fs.mkdirSync(path.join(tmp, 'adapters', a), { recursive: true });
      copy(`adapters/${a}/adapter.json`);
      copy(`adapters/${a}/mcp.json`);
      fs.mkdirSync(path.join(tmp, 'adapters', a, 'steering'), { recursive: true });
      copy(`adapters/${a}/steering/usage.md`);
    }
    fs.mkdirSync(path.join(tmp, 'steering'), { recursive: true });

    const env = {
      JIRA_HOST: 'test.atlassian.net',
      JIRA_EMAIL: 'bot@test.com',
      JIRA_TOKEN: 'token',
      GITHUB_TOKEN: 'ghp_test',
    };
    const r = run([], tmp, env);
    assert.strictEqual(r.status, 0, `install should self-heal, got ${r.status}: ${r.stderr}`);

    // Should mention CI skip, NOT the generator's uncaught throw.
    assert.match(r.stdout + r.stderr, /CI skipped/);
    // Stack-trace markers from generate.js's throw — `at loadOrchestrator` and
    // `generate.js:NN` only appear when the generator ran and threw.
    assert.ok(!/at loadOrchestrator/.test(r.stdout + r.stderr),
      'should not surface generator stack trace');
    assert.ok(!/enterprise\/ci\/generate\.js:\d+/.test(r.stdout + r.stderr),
      'should not surface generator stack trace');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
