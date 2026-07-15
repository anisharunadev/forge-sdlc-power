#!/usr/bin/env node
// hooks/pre-stage-gate.js
// Runs as a PreToolUse hook on the very first Task spawn of a forge session.
// Calls the preflight check. If NOT_READY, blocks the Task spawn (exit 2)
// with the issues in stderr — the orchestrator surfaces them to the user.
//
// Trigger: PreToolUse on Task (first invocation only — see matchOnce pattern).
//
// The "matchOnce" pattern is enforced by the orchestrator: it passes
// `FORGE_FIRST_INVOCATION=1` in the env the first time, then unset. This
// hook only blocks the FIRST Task spawn, not subsequent ones (which are
// already past the preflight gate).

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = process.cwd();
const FORCE = process.env.FORGE_SKIP_PREFLIGHT === '1';
const FIRST = process.env.FORGE_FIRST_INVOCATION === '1';

if (FORCE || !FIRST) {
  // Allow the Task to proceed
  process.exit(0);
}

const PREFLIGHT = path.join(ROOT, 'enterprise/preflight/check.js');
const r = spawnSync(process.execPath, [PREFLIGHT, '--json'], {
  encoding: 'utf8',
  cwd: ROOT,
  timeout: 15000,
});

if (r.status !== 0) {
  let issues = [];
  try {
    const json = JSON.parse(r.stdout);
    issues = (json.checks || []).filter((c) => !c.ok).map((c) => c.fail);
  } catch {
    issues = [r.stdout || r.stderr || 'preflight failed with no output'];
  }
  process.stderr.write(
    `[forge-sdlc] pre-stage gate: NOT_READY (${issues.length} issue(s)):\n` +
    issues.map((i) => `  - ${i}`).join('\n') +
    `\n  Fix the issues above and re-run. To bypass: FORGE_SKIP_PREFLIGHT=1\n`
  );
  process.exit(2);
}

process.exit(0);
