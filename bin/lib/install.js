// bin/lib/install.js
// Interactive installer. Asks project-wise vs global, then runs the
// existing adapters/install.js apply() and drops a config marker.
//
// Modes:
//   project — copies adapter / hook / agent wiring into the current project.
//             Standard `node adapters/install.js` behavior, but recorded.
//   global  — initializes ~/.forge-sdlc/, makes the repo files read-only
//             and points the user's projects at it via a symlink.
//             Project namespaces are stored under ~/.forge-sdlc/state/<hash>/.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ask, choose, confirm } = require('./prompts');
const {
  GLOBAL_HOME,
  GLOBAL_CONFIG,
  resolveMode,
  forgeDir,
  ensureDir,
  writeGlobalConfig,
} = require('./paths');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function installInteractive(argv) {
  // 1. Resolve mode — flag/env/config takes precedence; otherwise prompt.
  let resolved = resolveMode(argv);
  if (!resolved) {
    console.log('\nforge-sdlc-agent install — first-time setup\n');
    const mode = await choose('Where do you want forge-sdlc to live?', [
      { key: 'project', label: 'Project-wise', description: 'install into current directory (.forge/, symlinks, agent wiring)' },
      { key: 'global', label: 'Global',       description: `install once into ${GLOBAL_HOME}, share across all projects` },
    ]);
    resolved = { mode, root: mode === 'project' ? process.cwd() : GLOBAL_HOME, source: 'prompt' };
  }

  // 2. Persist the choice so future invocations skip the prompt.
  if (resolved.source === 'prompt' || resolved.source === 'flag') {
    writeGlobalConfig({ ...readGlobalConfigSafe(), mode: resolved.mode, updatedAt: new Date().toISOString() });
  }

  // 3. For project mode, drop a project-level config too (overrides global per-project).
  if (resolved.mode === 'project') {
    const projCfg = path.join(resolved.root, '.forge', 'config.json');
    ensureDir(path.dirname(projCfg));
    fs.writeFileSync(projCfg, JSON.stringify({ mode: 'project', installedAt: new Date().toISOString() }, null, 2) + '\n');
  }

  // 4. Run the canonical adapters/install.js apply.
  // Always run it from REPO_ROOT because install.js reads adapters/registry.json
  // relative to cwd. In project mode, the user has cloned or linked the repo
  // into their project (or is running the CLI from inside the repo); in global
  // mode, the repo IS the global home.
  console.log(`\n[install] mode=${resolved.mode} root=${resolved.root}`);
  const installCwd = resolved.mode === 'global' ? REPO_ROOT : REPO_ROOT;
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'adapters', 'install.js')], {
    stdio: 'inherit',
    cwd: installCwd,
  });
  if (r.status !== 0) {
    console.error(`[install] adapters/install.js exited ${r.status}`);
    process.exit(r.status || 1);
  }

  // 5. Initialize v2 state + memory scaffolding for the resolved forge dir.
  const forgeRoot = forgeDir(resolved);
  ensureDir(forgeRoot);
  initStateV2(forgeRoot);
  initMemoryV2(forgeRoot);

  // 6. Print next steps.
  console.log('\n[install] done. next steps:');
  if (resolved.mode === 'project') {
    console.log('  • forge-sdlc-agent status         # live state');
    console.log('  • forge-sdlc-agent start PROJ-1   # begin the 5-stage pipeline');
    console.log('  • forge-sdlc-agent continue       # resume the last run');
  } else {
    console.log(`  • namespace: ${path.basename(forgeRoot)} (cwd hash)`);
    console.log('  • forge-sdlc-agent status --global');
    console.log('  • forge-sdlc-agent --project      # override to project mode for this cwd');
  }
}

function readGlobalConfigSafe() {
  try { return JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf8')); } catch { return {}; }
}

function initStateV2(forgeRoot) {
  const stateFile = path.join(forgeRoot, 'state.json');
  if (fs.existsSync(stateFile)) return; // don't clobber an existing run
  const state = {
    version: 2,
    ticket: null,
    currentStage: null,
    stages: {
      1: blankStage('requirements'),
      2: blankStage('design'),
      3: blankStage('implement'),
      4: blankStage('validate'),
      5: blankStage('deploy'),
    },
    history: [],
    checkpoints: [],
    memory: { lastIndexed: null, count: 0 },
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
}

function blankStage(name) {
  return { name, status: 'pending', attempts: 0, verdict: null, startedAt: null, finishedAt: null, artifact: null, error: null };
}

function initMemoryV2(forgeRoot) {
  const memRoot = path.join(forgeRoot, 'memory');
  ensureDir(memRoot);
  const categories = ['decisions', 'patterns', 'learnings', 'errors', 'context'];
  for (const c of categories) ensureDir(path.join(memRoot, c));
  const indexFile = path.join(memRoot, 'index.json');
  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, JSON.stringify({ version: 2, entries: [] }, null, 2) + '\n');
  }
}

module.exports = { installInteractive };
