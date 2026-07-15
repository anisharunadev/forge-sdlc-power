#!/usr/bin/env node
// enterprise/ci/run-validator.js
// The deterministic-only CI runner for the validator sub-agent.
// Runs the checks from steering/03-quality-gates.md without LLM judgment.
// Writes the verdict to .forge/verdict.txt and prints to stdout.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.cwd();
const STACK = {
  "language": "unknown",
  "packageManager": "npm",
  "test": null,
  "lint": null,
  "typecheck": null,
  "format": null
};

function run(cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe' });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: e.stdout || e.message };
  }
}

const checks = [
  { name: 'typecheck', cmd: STACK.typecheck },
  { name: 'lint', cmd: STACK.lint },
  { name: 'test', cmd: STACK.test },
  { name: 'format', cmd: STACK.format },
];

const results = [];
let verdict = 'PASS';
for (const c of checks) {
  if (!c.cmd) continue;
  const r = run(c.cmd);
  results.push({ name: c.name, ok: r.ok, output: r.out.slice(-2000) });
  if (!r.ok) verdict = 'FAIL';
}

const report = {
  ts: new Date().toISOString(),
  stack: STACK,
  results,
  verdict,
};

fs.mkdirSync(path.join(ROOT, '.forge'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.forge', 'verdict.txt'), verdict);
fs.writeFileSync(path.join(ROOT, '.forge', 'ci-validator-report.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
process.exit(verdict === 'PASS' ? 0 : 1);
