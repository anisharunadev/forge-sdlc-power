#!/usr/bin/env node
// hooks/post-validator-collect.js
// Runs as a PostToolUse hook on Task (after the validator sub-agent completes).
// Captures test results + diff vs. prior run by calling enterprise/tests/collect.js.
// Writes the result to .forge/test-diff.json for the orchestrator to include
// in the humanized status update.

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = process.cwd();
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(input);
    if (evt.tool_name !== 'Task') {
      process.exit(0);
    }
    const output = (evt.tool_result?.content || evt.tool_result?.output || '').toString();
    // Only run for validator stage
    if (!/validate/i.test(output) && !/validator/i.test(output)) {
      process.exit(0);
    }

    const COLLECT = path.join(ROOT, 'enterprise/tests/collect.js');
    const r = spawnSync(process.execPath, [COLLECT, '--json', '--diff'], {
      encoding: 'utf8',
      cwd: ROOT,
      timeout: 60000,
    });

    if (r.status === 0) {
      try {
        const json = JSON.parse(r.stdout);
        const forgeDir = path.join(ROOT, '.forge');
        fs.mkdirSync(forgeDir, { recursive: true });
        fs.writeFileSync(
          path.join(forgeDir, 'test-diff.json'),
          JSON.stringify(json, null, 2) + '\n'
        );
      } catch { /* best-effort */ }
    }
  } catch {
    // Best-effort: never block
  }
  process.exit(0);
});
