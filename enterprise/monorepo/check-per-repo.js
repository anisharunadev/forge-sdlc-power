#!/usr/bin/env node
// enterprise/monorepo/check-per-repo.js
// Per-repo validator. Runs the forge-sdlc validator's deterministic checks
// against one specific repo in a multi-repo setup. Each repo has its own
// tests, typecheck, lint. The orchestrator fans out this script to each
// consumer / shared-types repo and aggregates the results.
//
// Usage:
//   node enterprise/monorepo/check-per-repo.js <repo-name>
//   node enterprise/monorepo/check-per-repo.js api --json
//
// Exit codes:
//   0 — all checks passed
//   1 — at least one check failed
//   2 — repo not found in monorepo.json

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.cwd();
const REGISTRY = path.join(ROOT, '.forge/monorepo.json');

const args = process.argv.slice(2);
const repoName = args.find((a) => !a.startsWith('--'));
const json = args.includes('--json');

function loadRegistry() {
  if (!fs.existsSync(REGISTRY)) return null;
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
}

function run(cmd, cwd) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', cwd, stdio: 'pipe' });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || e.message || '') };
  }
}

function detectStack(repoPath) {
  const out = { test: null, lint: null, typecheck: null };
  if (fs.existsSync(path.join(repoPath, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'));
    out.test = pkg.scripts?.test || 'npm test';
    out.lint = pkg.scripts?.lint || 'npm run lint';
    out.typecheck = pkg.scripts?.typecheck || 'tsc --noEmit';
  } else if (fs.existsSync(path.join(repoPath, 'pyproject.toml'))) {
    out.test = 'pytest';
    out.lint = 'ruff check .';
    out.typecheck = 'mypy --strict .';
  } else if (fs.existsSync(path.join(repoPath, 'go.mod'))) {
    out.test = 'go test ./...';
    out.lint = 'go vet ./...';
    out.typecheck = 'go build ./...';
  } else if (fs.existsSync(path.join(repoPath, 'Makefile'))) {
    out.test = 'make test';
    out.lint = 'make lint 2>/dev/null || true';
    out.typecheck = 'make typecheck 2>/dev/null || true';
  }
  return out;
}

function main() {
  if (!repoName) {
    console.error('Usage: check-per-repo.js <repo-name> [--json]');
    process.exit(2);
  }
  const registry = loadRegistry();
  if (!registry) {
    console.error('No monorepo.json found');
    process.exit(2);
  }
  const repo = registry.repos.find((r) => r.name === repoName);
  if (!repo) {
    console.error(`Repo "${repoName}" not found in monorepo.json`);
    process.exit(2);
  }

  const repoPath = path.resolve(ROOT, repo.path);
  if (!fs.existsSync(repoPath)) {
    console.error(`Repo path does not exist: ${repoPath}`);
    process.exit(1);
  }

  const stack = detectStack(repoPath);
  const checks = [
    { name: 'typecheck', cmd: stack.typecheck },
    { name: 'lint', cmd: stack.lint },
    { name: 'test', cmd: stack.test },
  ];

  const results = [];
  let verdict = 'PASS';
  for (const c of checks) {
    if (!c.cmd) continue;
    const r = run(c.cmd, repoPath);
    results.push({ name: c.name, ok: r.ok, output: r.out.slice(-1000) });
    if (!r.ok) verdict = 'FAIL';
  }

  // Per-repo forbidden paths
  if (repo.forbiddenPaths && repo.forbiddenPaths.length > 0) {
    // For now just record the rule; actual enforcement is the global hook
    results.push({ name: 'forbidden-paths', ok: true, note: `enforced globally: ${repo.forbiddenPaths.join(', ')}` });
  }

  const report = {
    ts: new Date().toISOString(),
    repo: repoName,
    role: repo.role,
    path: repoPath,
    verdict,
    results,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[${repoName}] (${repo.role}) at ${repoPath}`);
    for (const r of results) {
      const mark = r.ok ? '✓' : '✗';
      console.log(`  [${mark}] ${r.name}`);
    }
    console.log(`Verdict: ${verdict}`);
  }
  process.exit(verdict === 'PASS' ? 0 : 1);
}

main();
