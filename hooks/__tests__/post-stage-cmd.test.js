// Unit tests for hooks/post-stage-cmd.js
// Run: node --test hooks/__tests__/post-stage-cmd.test.js

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'post-stage-cmd.js');

function setupTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-stage-'));
  fs.mkdirSync(path.join(tmp, '.forge'), { recursive: true });
  return tmp;
}

function runHook(invocation, cwd) {
  return spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(invocation),
    encoding: 'utf8',
    cwd,
    timeout: 5000,
  });
}

test('writes a prompt when a sub-agent Task completes with a verdict', () => {
  const tmp = setupTmp();
  try {
    // Stage 1 artifact + ticket system + ticket id
    fs.writeFileSync(path.join(tmp, '.forge', 'stage1-plan.md'), '# Plan\n\nDone.');
    fs.writeFileSync(
      path.join(tmp, '.forge', 'ticket-system.json'),
      JSON.stringify({ system: 'jira' })
    );
    fs.writeFileSync(path.join(tmp, '.forge', 'ticket-id.txt'), 'PROJ-401');

    const invocation = {
      tool_name: 'Task',
      tool_result: {
        content: 'SUMMARY: Wrote the plan.\nVERDICT: PASS',
      },
    };
    const r = runHook(invocation, tmp);
    assert.strictEqual(r.status, 0);

    const promptFile = path.join(tmp, '.forge', 'post-stage-prompt.json');
    assert.ok(fs.existsSync(promptFile), 'post-stage-prompt.json should be created');
    const prompt = JSON.parse(fs.readFileSync(promptFile, 'utf8'));
    assert.strictEqual(prompt.ticket_system, 'jira');
    assert.strictEqual(prompt.tool_name, 'jira_post_status_update');
    assert.strictEqual(prompt.arguments.ticket_id, 'PROJ-401');
    assert.strictEqual(prompt.arguments.stage, 'requirements');
    assert.strictEqual(prompt.arguments.verdict, 'PASS');
    assert.match(prompt.arguments.next_command, /\/forge design/);
    assert.match(prompt.arguments.summary, /Wrote the plan/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('uses clickup tool name when ticket system is clickup', () => {
  const tmp = setupTmp();
  try {
    fs.writeFileSync(path.join(tmp, '.forge', 'stage2-adr.md'), '# ADR');
    fs.writeFileSync(
      path.join(tmp, '.forge', 'ticket-system.json'),
      JSON.stringify({ system: 'clickup' })
    );
    fs.writeFileSync(path.join(tmp, '.forge', 'ticket-id.txt'), 'task-abc');

    const invocation = {
      tool_name: 'Task',
      tool_result: { content: 'VERDICT: PASS' },
    };
    const r = runHook(invocation, tmp);
    assert.strictEqual(r.status, 0);

    const prompt = JSON.parse(
      fs.readFileSync(path.join(tmp, '.forge', 'post-stage-prompt.json'), 'utf8')
    );
    assert.strictEqual(prompt.tool_name, 'clickup_post_status_update');
    assert.strictEqual(prompt.arguments.stage, 'design');
    assert.strictEqual(prompt.arguments.next_command, '/forge implement <KEY>');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('uses default summary when no SUMMARY line in output', () => {
  const tmp = setupTmp();
  try {
    fs.writeFileSync(path.join(tmp, '.forge', 'stage3-diff.diff'), '...');
    fs.writeFileSync(
      path.join(tmp, '.forge', 'ticket-system.json'),
      JSON.stringify({ system: 'jira' })
    );

    const invocation = {
      tool_name: 'Task',
      tool_result: { content: 'VERDICT: FAIL\nREASON: tests failing' },
    };
    const r = runHook(invocation, tmp);
    assert.strictEqual(r.status, 0);

    const prompt = JSON.parse(
      fs.readFileSync(path.join(tmp, '.forge', 'post-stage-prompt.json'), 'utf8')
    );
    assert.strictEqual(prompt.arguments.verdict, 'FAIL');
    assert.match(prompt.arguments.summary, /Implementation hit a blocker|Implementation needs/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('does nothing when no ticket system is configured', () => {
  const tmp = setupTmp();
  try {
    fs.writeFileSync(path.join(tmp, '.forge', 'stage1-plan.md'), '...');
    // No ticket-system.json

    const invocation = {
      tool_name: 'Task',
      tool_result: { content: 'VERDICT: PASS' },
    };
    const r = runHook(invocation, tmp);
    assert.strictEqual(r.status, 0);
    assert.ok(
      !fs.existsSync(path.join(tmp, '.forge', 'post-stage-prompt.json')),
      'should not write prompt when no ticket system'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('ignores non-Task tool events', () => {
  const tmp = setupTmp();
  try {
    fs.writeFileSync(path.join(tmp, '.forge', 'stage1-plan.md'), '...');
    fs.writeFileSync(
      path.join(tmp, '.forge', 'ticket-system.json'),
      JSON.stringify({ system: 'jira' })
    );

    const invocation = {
      tool_name: 'Write', // not Task
      tool_result: { content: 'VERDICT: PASS' },
    };
    const r = runHook(invocation, tmp);
    assert.strictEqual(r.status, 0);
    assert.ok(
      !fs.existsSync(path.join(tmp, '.forge', 'post-stage-prompt.json')),
      'should not write prompt for non-Task tools'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('parses all four verdict values', () => {
  for (const v of ['PASS', 'FAIL', 'NEEDS_INFO', 'STARTED']) {
    const tmp = setupTmp();
    try {
      fs.writeFileSync(path.join(tmp, '.forge', 'stage1-plan.md'), '...');
      fs.writeFileSync(
        path.join(tmp, '.forge', 'ticket-system.json'),
        JSON.stringify({ system: 'jira' })
      );
      const r = runHook(
        { tool_name: 'Task', tool_result: { content: `VERDICT: ${v}` } },
        tmp
      );
      assert.strictEqual(r.status, 0);
      const prompt = JSON.parse(
        fs.readFileSync(path.join(tmp, '.forge', 'post-stage-prompt.json'), 'utf8')
      );
      assert.strictEqual(prompt.arguments.verdict, v);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
});
