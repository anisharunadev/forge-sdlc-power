// bin/lib/paths.js
// Path resolution for project-wise vs global mode.
//
// Project mode: writes to <cwd>/.forge/, copies adapters/steering/etc into <cwd>.
// Global mode: writes to ~/.forge-sdlc/, treats the global dir as the "root" of the Power.
//
// The mode is stored in ~/.forge-sdlc/config.json so subsequent `npx forge-sdlc-agent`
// invocations from any directory remember the choice.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const GLOBAL_HOME = path.join(os.homedir(), '.forge-sdlc');
const GLOBAL_CONFIG = path.join(GLOBAL_HOME, 'config.json');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function readGlobalConfig() {
  if (!fs.existsSync(GLOBAL_CONFIG)) return {};
  try { return JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf8')); }
  catch { return {}; }
}

function writeGlobalConfig(cfg) {
  ensureDir(GLOBAL_HOME);
  fs.writeFileSync(GLOBAL_CONFIG, JSON.stringify(cfg, null, 2) + '\n');
}

// Resolve where forge-sdlc should operate for this invocation.
//
// Order of resolution:
//   1. --global / --project CLI flag (explicit)
//   2. FORGE_SDLC_MODE env var
//   3. .forge/config.json in cwd (per-project override)
//   4. ~/.forge-sdlc/config.json (user default)
//   5. null → caller must prompt
function resolveMode(argv = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  if (argv.includes('--global')) return { mode: 'global', root: GLOBAL_HOME, source: 'flag' };
  if (argv.includes('--project')) return { mode: 'project', root: cwd, source: 'flag' };
  if (env.FORGE_SDLC_MODE === 'global') return { mode: 'global', root: GLOBAL_HOME, source: 'env' };
  if (env.FORGE_SDLC_MODE === 'project') return { mode: 'project', root: cwd, source: 'env' };

  const projCfg = path.join(cwd, '.forge', 'config.json');
  if (fs.existsSync(projCfg)) {
    try {
      const c = JSON.parse(fs.readFileSync(projCfg, 'utf8'));
      if (c.mode === 'global') return { mode: 'global', root: GLOBAL_HOME, source: 'project-cfg' };
      if (c.mode === 'project') return { mode: 'project', root: cwd, source: 'project-cfg' };
    } catch {}
  }

  const glob = readGlobalConfig();
  if (glob.mode === 'global') return { mode: 'global', root: GLOBAL_HOME, source: 'global-cfg' };
  if (glob.mode === 'project') return { mode: 'project', root: cwd, source: 'global-cfg' };

  return null; // caller must prompt
}

// Returns the .forge directory for the resolved mode.
// In project mode → <root>/.forge
// In global mode → <root>/memory/<safe-name>  (one namespace per project, by cwd hash or name)
function forgeDir(resolved) {
  if (resolved.mode === 'project') return path.join(resolved.root, '.forge');
  return path.join(resolved.root, 'state', projectNamespace());
}

function projectNamespace() {
  // Stable namespace from cwd path (sanitized for fs).
  return require('node:crypto')
    .createHash('sha1')
    .update(process.cwd())
    .digest('hex')
    .slice(0, 12);
}

module.exports = {
  GLOBAL_HOME,
  GLOBAL_CONFIG,
  resolveMode,
  forgeDir,
  ensureDir,
  readGlobalConfig,
  writeGlobalConfig,
};
