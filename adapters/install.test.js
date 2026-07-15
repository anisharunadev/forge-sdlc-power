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
