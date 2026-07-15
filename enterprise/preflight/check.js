#!/usr/bin/env node
// enterprise/preflight/check.js
// Runs before stage 1 of the forge-sdlc pipeline. Single round-trip check
// that the repo is ready to be forged.
//
// Returns one of:
//   READY                          — proceed
//   NOT_READY: <reason>            — one specific reason
//   NOT_READY: <count> issues:\n  - <reason1>\n  - <reason2>\n  ...
//
// Each check is independent; the script collects all of them so the user
// gets a single actionable list, not a fix-one-resubmit loop.
//
// Usage:
//   node enterprise/preflight/check.js
//   node enterprise/preflight/check.js --json     # machine-readable

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.cwd();

// ---------- helpers ----------

function readEnv(name) {
  return process.env[name] || '';
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function gitStatusPorcelain() {
  try {
    return execSync('git status --porcelain', { encoding: 'utf8', cwd: ROOT });
  } catch {
    return '';
  }
}

function gitRemote() {
  try {
    return execSync('git remote get-url origin', { encoding: 'utf8', cwd: ROOT }).trim();
  } catch {
    return '';
  }
}

function gitCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: ROOT }).trim();
  } catch {
    return '';
  }
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

// ---------- checks ----------

const checks = [];

// 1. Git repo
checks.push({
  name: 'git-repo',
  ok: isGitRepo(),
  fail: 'not a git repository — run `git init` first',
});

// 2. Working tree clean (allow untracked)
if (isGitRepo()) {
  const porcelain = gitStatusPorcelain();
  const dirty = porcelain.split('\n').filter((l) => l && !l.startsWith('??'));
  checks.push({
    name: 'working-tree-clean',
    ok: dirty.length === 0,
    fail: dirty.length > 0
      ? `working tree has ${dirty.length} uncommitted change(s) — commit or stash them first`
      : '',
  });
}

// 3. Not on a protected branch
if (isGitRepo()) {
  const branch = gitCurrentBranch();
  const protectedBranches = ['main', 'master', 'production', 'release'];
  checks.push({
    name: 'not-on-protected-branch',
    ok: !protectedBranches.includes(branch),
    fail: protectedBranches.includes(branch)
      ? `current branch is "${branch}" — switch to a feature branch first`
      : '',
  });
}

// 4. Remote configured
if (isGitRepo()) {
  const remote = gitRemote();
  checks.push({
    name: 'remote-configured',
    ok: !!remote,
    fail: remote ? '' : 'no `origin` remote configured — `git remote add origin <url>`',
  });
}

// 5. Required tools
const REQUIRED_TOOLS = [
  { cmd: 'node', minMajor: 18, label: 'Node.js >= 18' },
  { cmd: 'git', label: 'git' },
  { cmd: 'npm', label: 'npm (or use pnpm/yarn)' },
];
for (const t of REQUIRED_TOOLS) {
  if (!commandExists(t.cmd)) {
    checks.push({
      name: `tool-${t.cmd}`,
      ok: false,
      fail: `${t.label} is not installed`,
    });
    continue;
  }
  if (t.minMajor) {
    try {
      const out = execSync(`${t.cmd} --version`, { encoding: 'utf8' });
      const m = out.match(/v?(\d+)\./);
      const major = m ? Number(m[1]) : 0;
      checks.push({
        name: `tool-${t.cmd}-version`,
        ok: major >= t.minMajor,
        fail: major < t.minMajor ? `${t.label} required, found v${major}` : '',
      });
    } catch { /* version check is best-effort */ }
  }
}

// 6. Required env vars for enabled adapters
// Reads registry.json if present
const registryFile = path.join(ROOT, 'adapters', 'registry.json');
if (exists(registryFile)) {
  try {
    const reg = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    for (const [name, entry] of Object.entries(reg.adapters || {})) {
      if (!entry.enabled) continue;
      const manifestFile = path.join(ROOT, 'adapters', name, 'adapter.json');
      if (!exists(manifestFile)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      for (const ev of manifest.envVars || []) {
        if (!ev.required) continue;
        const val = readEnv(ev.name);
        if (!val) {
          checks.push({
            name: `env-${name}-${ev.name}`,
            ok: false,
            fail: `env var ${ev.name} is not set (required by adapter "${name}")`,
          });
        } else if (val.includes('YOUR_') || val.endsWith('_HERE')) {
          checks.push({
            name: `env-${name}-${ev.name}-placeholder`,
            ok: false,
            fail: `env var ${ev.name} is still a placeholder ("${val.slice(0, 20)}...") — set the real value`,
          });
        }
      }
    }
  } catch { /* ignore registry parse errors */ }
}

// 7. No plaintext secrets staged for commit
if (isGitRepo()) {
  try {
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf8', cwd: ROOT });
    const files = staged.split('\n').filter(Boolean);
    const suspicious = files.filter((f) =>
      /(^|\/)\.env(\.|$)/i.test(f) ||
      /(^|\/)secrets?\.(json|ya?ml|toml)$/i.test(f) ||
      /(^|\/)credentials\.(json|ya?ml)$/i.test(f)
    );
    checks.push({
      name: 'no-secrets-staged',
      ok: suspicious.length === 0,
      fail: suspicious.length > 0
        ? `${suspicious.length} file(s) look like secrets staged for commit: ${suspicious.slice(0, 3).join(', ')}`
        : '',
    });
  } catch { /* not an error if no staged changes */ }
}

// 8. No pending forge state from a prior failed run
const stateFile = path.join(ROOT, '.forge', 'state.json');
if (exists(stateFile)) {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.lastVerdict === 'FAIL' && !state.userAcknowledged) {
      checks.push({
        name: 'prior-failure-acknowledged',
        ok: false,
        fail: 'prior forge run failed and was not acknowledged — use `forge continue <KEY>` to resume or set `.forge/state.json` userAcknowledged=true',
      });
    }
  } catch { /* ignore */ }
}

// 9. forge-sdlc structure present
const required = ['POWER.md', '.kiro/agents/orchestrator.json', 'hooks/hooks.json', 'adapters/registry.json'];
const missing = required.filter((p) => !exists(path.join(ROOT, p)));
checks.push({
  name: 'forge-structure',
  ok: missing.length === 0,
  fail: missing.length > 0 ? `missing forge-sdlc files: ${missing.join(', ')}` : '',
});

// ---------- result ----------

const failures = checks.filter((c) => !c.ok);

const result = {
  ts: new Date().toISOString(),
  root: ROOT,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  checks: checks.map((c) => ({ name: c.name, ok: c.ok, fail: c.fail || undefined })),
  verdict: failures.length === 0 ? 'READY' : 'NOT_READY',
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

// Human-readable
if (failures.length === 0) {
  console.log(`READY — all ${checks.length} checks passed.`);
  process.exit(0);
}

console.log(`NOT_READY: ${failures.length} issue(s):`);
for (const f of failures) {
  console.log(`  - [${f.name}] ${f.fail}`);
}
process.exit(1);
