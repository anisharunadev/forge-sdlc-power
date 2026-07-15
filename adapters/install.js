#!/usr/bin/env node
// adapters/install.js
// Reads registry.json + each enabled adapter's manifest and:
//   1. Merges per-adapter mcp.json entries into the root mcp.json
//   2. Adds the adapter's tools to the relevant stage agent's allowedTools
//   3. Symlinks adapter steering/ into root steering/adapters/<name>/
//   4. Appends per-stage system-prompt-additions to the relevant agent JSONs
//
// Idempotent: re-running with no changes is a no-op.
//
// Usage:
//   node adapters/install.js                 # apply registry state
//   node adapters/install.js --enable jira   # enable one adapter
//   node adapters/install.js --disable jira  # disable one adapter
//   node adapters/install.js --status        # show current state
//   node adapters/install.js --verify        # confirm wiring is correct

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const ADAPTERS_DIR = path.join(ROOT, 'adapters');
const REGISTRY_FILE = path.join(ADAPTERS_DIR, 'registry.json');
const SCHEMA_FILE = path.join(ADAPTERS_DIR, 'adapter.schema.json');
// ponytail: PKG_ROOT holds the package source (where adapters/registry.json live);
// PROJECT_ROOT holds where the wired artifacts (mcp.json, .kiro/, steering/) land.
// In the simple case they're the same dir; --root lets npx-style installs target a
// different project dir without copy/symlink gymnastics.
const PKG_ROOT = ROOT;
const cmdRoot = (() => {
  const args = process.argv.slice(2);
  const i = args.indexOf('--root');
  return i >= 0 ? args[i + 1] : null;
})();
const PROJECT_ROOT = cmdRoot ? path.resolve(cmdRoot) : ROOT;
const ROOT_MCP = path.join(PROJECT_ROOT, 'mcp.json');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.kiro', 'agents');
const STEERING_DIR = path.join(PROJECT_ROOT, 'steering');
const ADAPTER_STEERING_LINK = path.join(STEERING_DIR, 'adapters');
const FORGE_DIR = path.join(PROJECT_ROOT, '.forge');

// ---------- arg parsing ----------

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const cmdEnable = arg('--enable');
const cmdDisable = arg('--disable');
const cmdStatus = args.includes('--status');
const cmdVerify = args.includes('--verify');
const cmdUserOnly = args.includes('--user-only');

// ---------- load registry ----------

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
}

function saveRegistry(reg) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2) + '\n');
}

// ---------- per-adapter manifest loader ----------

function loadAdapter(name) {
  const dir = path.join(ADAPTERS_DIR, name);
  const manifestPath = path.join(dir, 'adapter.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.name !== name) {
    throw new Error(`Adapter name mismatch in ${manifestPath}: expected "${name}", got "${manifest.name}"`);
  }
  return { dir, manifest };
}

function loadAdapterMcp(name) {
  const mcpFile = path.join(ADAPTERS_DIR, name, 'mcp.json');
  if (!fs.existsSync(mcpFile)) {
    throw new Error(`Adapter "${name}" missing mcp.json`);
  }
  return JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
}

// ---------- env var checks ----------

function checkEnvVars(manifest) {
  const missing = [];
  for (const ev of manifest.envVars || []) {
    if (!ev.required) continue;
    if (!process.env[ev.name]) missing.push(ev.name);
  }
  if (missing.length) {
    return { ok: false, missing };
  }
  return { ok: true };
}

// ---------- root mcp.json merge ----------

function mergeMcp() {
  const reg = loadRegistry();

  // Start from a clean slate — collect MCP servers ONLY from enabled adapters.
  // Disabled adapters have their servers removed.
  const merged = { mcpServers: {} };
  // ponytail: track whether mergeMcp mutated the registry (env-var auto-disable).
  // Saves once at end if anything flipped — avoids re-saving for every adapter.
  let registryDirty = false;

  for (const [name, entry] of Object.entries(reg.adapters)) {
    if (!entry.enabled) continue;
    const loaded = loadAdapter(name);
    if (!loaded) {
      console.warn(`[install] adapter "${name}" enabled in registry but no adapter.json found at ${path.join(ADAPTERS_DIR, name)} — skipping`);
      continue;
    }
    const { manifest } = loaded;
    const envCheck = checkEnvVars(manifest);
    if (!envCheck.ok) {
      // ponytail: registry was lying — flip it to disabled with a clear reason so
      // `doctor` and `--status` show reality. User re-enables via --enable after
      // exporting the missing env vars. Exit code stays 0 — this is a self-heal,
      // not a hard failure.
      console.error(`[install] adapter "${name}" enabled but env vars missing: ${envCheck.missing.join(', ')}`);
      console.error(`[install] auto-disabling "${name}" — export the env vars and re-run \`forge-sdlc-agent install --enable ${name}\``);
      reg.adapters[name].enabled = false;
      reg.adapters[name].reason = `missing env vars: ${envCheck.missing.join(', ')}`;
      delete reg.adapters[name].installedAt;
      registryDirty = true;
      continue;
    }
    const adapterMcp = loadAdapterMcp(name);
    for (const [serverKey, serverCfg] of Object.entries(adapterMcp.mcpServers || {})) {
      // Verify env-var indirection on secret fields
      for (const [k, v] of Object.entries(serverCfg.env || {})) {
        if (typeof v === 'string' && v.startsWith('${env:')) continue;
        // Some env values are not secrets (e.g. workspace slug) — only block if it's a known secret
        const ev = (manifest.envVars || []).find((e) => e.name === k);
        if (ev && ev.secret) {
          throw new Error(`Adapter "${name}" server "${serverKey}" env "${k}" must use \${env:...} indirection (it's marked secret in the manifest)`);
        }
      }
      merged.mcpServers[serverKey] = serverCfg;
    }
  }

  // Preserve any non-adapter servers that might be in root mcp.json (e.g. the user's
  // own ad-hoc MCP servers). Re-merge them on top, but only for keys that are NOT
  // owned by any adapter (enabled or disabled).
  if (fs.existsSync(ROOT_MCP)) {
    const existing = JSON.parse(fs.readFileSync(ROOT_MCP, 'utf8'));
    const adapterOwnedKeys = new Set();
    for (const [name, entry] of Object.entries(reg.adapters)) {
      const loaded = loadAdapter(name);
      if (!loaded) continue;
      for (const k of loaded.manifest.mcpServers || []) adapterOwnedKeys.add(k);
    }
    for (const [k, v] of Object.entries(existing.mcpServers || {})) {
      if (adapterOwnedKeys.has(k)) continue; // adapter-owned: we manage it above
      merged.mcpServers[k] = v;
    }
  }

  fs.writeFileSync(ROOT_MCP, JSON.stringify(merged, null, 2) + '\n');
  if (registryDirty) saveRegistry(reg);
  console.log(`[install] wrote ${ROOT_MCP} with ${Object.keys(merged.mcpServers).length} MCP servers`);
  return merged;
}

// ponytail: --user-only skips ROOT_MCP write. Kept separate from mergeMcp so the
// happy path stays a single straight-line write. Reads the file if it exists
// (last install's result) so the user-level writer still has a non-empty view
// when CI has no prior install on the same machine.
function mergeMcpNoWrite() {
  if (fs.existsSync(ROOT_MCP)) {
    try {
      const existing = JSON.parse(fs.readFileSync(ROOT_MCP, 'utf8'));
      console.log(`[install] --user-only: skipped ROOT_MCP write; reusing ${Object.keys(existing.mcpServers || {}).length} server(s) from existing file`);
      return existing;
    } catch (e) {
      console.warn(`[install] --user-only: could not read existing ROOT_MCP (${e.message}); user-level MCP will be empty`);
    }
  } else {
    console.log('[install] --user-only: no existing ROOT_MCP; user-level MCP will be empty');
  }
  return { mcpServers: {} };
}

// ---------- ~/.kiro/settings/mcp.json (power namespaced) ----------
//
// Kiro's user-level MCP config lives at ~/.kiro/settings/mcp.json. It groups
// servers under a top-level "powers" key, with each power keyed by its name.
// We deep-merge under "powers.<thisPowerName>" so the user's other powers
// and other top-level keys are preserved.

const POWER_NAME = 'forge-sdlc';
const USER_KIRO_DIR = path.join(os.homedir(), '.kiro', 'settings');
const USER_MCP = path.join(USER_KIRO_DIR, 'mcp.json');
const USER_SERVER_KEY_PREFIX = `power-${POWER_NAME}-`;

function writeUserMcp(merged) {
  if (!merged || !merged.mcpServers) return;
  fs.mkdirSync(USER_KIRO_DIR, { recursive: true });
  let existing = {};
  if (fs.existsSync(USER_MCP)) {
    try { existing = JSON.parse(fs.readFileSync(USER_MCP, 'utf8')) || {}; }
    catch { existing = {}; }
  }
  // ponytail: single server write here — no two writes share a path.
  const thisPowerServers = {};
  for (const [k, v] of Object.entries(merged.mcpServers)) {
    thisPowerServers[`${USER_SERVER_KEY_PREFIX}${k}`] = v;
  }
  // ponytail: shallow merge under powers[POWER_NAME]; top-level other powers + keys preserved.
  const next = {
    ...existing,
    powers: {
      ...(existing.powers || {}),
      [POWER_NAME]: thisPowerServers,
    },
  };
  fs.writeFileSync(USER_MCP, JSON.stringify(next, null, 2) + '\n');
  console.log(`[install] wrote ${USER_MCP} under powers.${POWER_NAME} (${Object.keys(thisPowerServers).length} servers)`);
}

// ---------- agent allowedTools update ----------

function updateAgentAllowedTools() {
  const reg = loadRegistry();
  const updates = new Map(); // agentName -> Set of new tools
  // ponytail: parallel tool->server map so we can emit the namespaced form later.
  const toolToServer = new Map(); // tool.name -> bare server key

  for (const [name, entry] of Object.entries(reg.adapters)) {
    if (!entry.enabled) continue;
    const loaded = loadAdapter(name);
    if (!loaded) continue;
    const { manifest } = loaded;
    // ponytail: manifest.mcpServers is an array of bare server keys; tools are
    // named <server>_<verb>, so prefix-matching gives the source server.
    const serverKeys = manifest.mcpServers || [];
    for (const tool of manifest.tools || []) {
      const sourceServer = serverKeys.find((s) => tool.name === s || tool.name.startsWith(`${s}_`));
      if (sourceServer) toolToServer.set(tool.name, sourceServer);
      for (const stage of tool.stages || []) {
        if (stage === '*') {
          // Wildcard: add to every agent that exists
          for (const agentFile of fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.json'))) {
            const agentName = path.basename(agentFile, '.json');
            if (!updates.has(agentName)) updates.set(agentName, new Set());
            updates.get(agentName).add(tool.name);
          }
        } else {
          if (!updates.has(stage)) updates.set(stage, new Set());
          updates.get(stage).add(tool.name);
        }
      }
    }
  }

  for (const [agentName, newTools] of updates.entries()) {
    const agentFile = path.join(AGENTS_DIR, `${agentName}.json`);
    if (!fs.existsSync(agentFile)) {
      console.warn(`[install] agent "${agentName}" not found at ${agentFile}, skipping tool update`);
      continue;
    }
    const agent = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
    const allowed = new Set(agent.allowedTools || []);
    let changed = false;
    let namespacedAdded = 0;
    for (const tool of newTools) {
      // ponytail: emit both the bare form (legacy agents) AND the namespaced form
      // mcp__<power-server>__<tool>. Kiro resolves MCP tools via the namespaced
      // form when the server is registered under power-* keys.
      const serverKey = toolToServer.get(tool);
      const namespaced = serverKey
        ? `mcp__${USER_SERVER_KEY_PREFIX}${serverKey}__${tool}`
        : null;
      if (!allowed.has(tool)) {
        allowed.add(tool);
        changed = true;
      }
      if (namespaced && !allowed.has(namespaced)) {
        allowed.add(namespaced);
        changed = true;
        namespacedAdded++;
      }
    }
    if (changed) {
      agent.allowedTools = [...allowed].sort();
      fs.writeFileSync(agentFile, JSON.stringify(agent, null, 2) + '\n');
      console.log(`[install] updated ${agentName}: added ${newTools.size} tool(s) (+${namespacedAdded} namespaced)`);
    }
  }
}

// ---------- orchestrator ticket-system tool swap ----------
//
// A ticket-system adapter is any adapter exposing a tool whose name ends in
// `_post_status_update` (jira_post_status_update, clickup_post_status_update, …).
// The orchestrator may only ever hold the post_status_update tool of ENABLED
// ticket systems. updateAgentAllowedTools() is additive-only, so without this
// a swap (enable clickup, disable jira) leaves the stale jira tool behind and
// never removes it. This function reconciles: add for enabled, remove for
// disabled.

const POST_STATUS_RE = /_post_status_update$/;

// Returns [{ name, tool, enabled }] for every adapter that has a post_status_update tool.
function ticketSystemAdapters(reg) {
  const out = [];
  for (const [name, entry] of Object.entries(reg.adapters)) {
    const loaded = loadAdapter(name);
    if (!loaded) continue;
    const statusTool = (loaded.manifest.tools || []).find((t) => POST_STATUS_RE.test(t.name));
    if (!statusTool) continue;
    out.push({ name, tool: statusTool, enabled: !!entry.enabled, manifest: loaded.manifest });
  }
  return out;
}

function updateOrchestratorTicketTool() {
  const reg = loadRegistry();
  const orchFile = path.join(AGENTS_DIR, 'orchestrator.json');
  if (!fs.existsSync(orchFile)) return;
  const orch = JSON.parse(fs.readFileSync(orchFile, 'utf8'));
  const allowed = new Set(orch.allowedTools || []);
  let changed = false;

  for (const { name, tool, enabled, manifest } of ticketSystemAdapters(reg)) {
    if (enabled) {
      if (!allowed.has(tool.name)) { allowed.add(tool.name); changed = true; }
    } else {
      if (allowed.has(tool.name)) { allowed.delete(tool.name); changed = true; }
      // ponytail: only manage the post_status_update tool; warn (don't touch) if a
      // disabled ticket system left other tools on the orchestrator.
      const stale = (manifest.tools || [])
        .filter((t) => t.name !== tool.name && allowed.has(t.name));
      if (stale.length) {
        console.warn(`[install] disabled ticket-system "${name}" still has non-status tools in orchestrator allowedTools: ${stale.map((t) => t.name).join(', ')} — leaving them (only post_status_update is managed here)`);
      }
    }
  }

  if (changed) {
    orch.allowedTools = [...allowed].sort();
    fs.writeFileSync(orchFile, JSON.stringify(orch, null, 2) + '\n');
    console.log('[install] reconciled orchestrator ticket-system tool(s)');
  }
}

// ---------- steering symlink ----------

function linkAdapterSteering() {
  fs.mkdirSync(ADAPTER_STEERING_LINK, { recursive: true });
  const reg = loadRegistry();
  for (const [name, entry] of Object.entries(reg.adapters)) {
    if (!entry.enabled) continue;
    const src = path.join(ADAPTERS_DIR, name, 'steering');
    const dst = path.join(ADAPTER_STEERING_LINK, name);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dst)) {
      try { fs.rmSync(dst, { recursive: true, force: true }); } catch {}
    }
    fs.symlinkSync(path.relative(path.dirname(dst), src), dst);
    console.log(`[install] linked steering/${name} -> ${src}`);
  }
}

// ---------- stage systemPromptAdditions ----------

function applyStageAdditions() {
  const reg = loadRegistry();
  for (const [name, entry] of Object.entries(reg.adapters)) {
    if (!entry.enabled) continue;
    const loaded = loadAdapter(name);
    if (!loaded) continue;
    const { manifest } = loaded;
    if (!manifest.stage) continue;

    for (const [stage, cfg] of Object.entries(manifest.stage)) {
      if (!cfg.systemPromptAdditions) continue;
      const agentFile = path.join(AGENTS_DIR, `${stage}.json`);
      if (!fs.existsSync(agentFile)) continue;
      const agent = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
      const list = agent.contextSteering || [];
      const relPath = path.relative(STEERING_DIR, path.join(ADAPTERS_DIR, name, cfg.systemPromptAdditions));
      if (!list.includes(relPath)) {
        list.push(relPath);
        agent.contextSteering = list;
        fs.writeFileSync(agentFile, JSON.stringify(agent, null, 2) + '\n');
        console.log(`[install] ${stage}: appended ${relPath} to contextSteering`);
      }
    }
  }
}

// ---------- commands ----------

function cmdEnableAdapter(name) {
  const reg = loadRegistry();
  if (!reg.adapters[name]) throw new Error(`Unknown adapter: ${name}`);
  if (reg.adapters[name].enabled) {
    console.log(`[install] ${name} already enabled`);
    return;
  }
  const { manifest } = loadAdapter(name);
  const envCheck = checkEnvVars(manifest);
  if (!envCheck.ok) {
    console.error(`[install] cannot enable "${name}" — env vars missing: ${envCheck.missing.join(', ')}`);
    console.error(`[install] set them in your shell or .env, then re-run.`);
    process.exit(2);
  }
  reg.adapters[name].enabled = true;
  reg.adapters[name].installedAt = new Date().toISOString();
  delete reg.adapters[name].reason;
  saveRegistry(reg);
  console.log(`[install] enabled ${name}`);
  apply();
}

function cmdDisableAdapter(name) {
  const reg = loadRegistry();
  if (!reg.adapters[name]) throw new Error(`Unknown adapter: ${name}`);
  if (!reg.adapters[name].enabled) {
    console.log(`[install] ${name} already disabled`);
    return;
  }
  reg.adapters[name].enabled = false;
  reg.adapters[name].reason = 'Disabled by user';
  delete reg.adapters[name].installedAt;
  saveRegistry(reg);
  console.log(`[install] disabled ${name}`);
  apply();
}

function cmdShowStatus() {
  const reg = loadRegistry();
  console.log('Adapter registry:');
  for (const [name, entry] of Object.entries(reg.adapters)) {
    const mark = entry.enabled ? '✓' : '✗';
    const reason = entry.reason ? ` (${entry.reason})` : '';
    console.log(`  [${mark}] ${name}${reason}`);
  }
}

function cmdVerifyAll() {
  const reg = loadRegistry();
  let ok = true;
  for (const [name, entry] of Object.entries(reg.adapters)) {
    if (!entry.enabled) continue;
    const { manifest } = loadAdapter(name);
    const envCheck = checkEnvVars(manifest);
    if (!envCheck.ok) {
      console.error(`  [${name}] MISSING env: ${envCheck.missing.join(', ')}`);
      ok = false;
      continue;
    }
    // Verify MCP server is in root mcp.json
    const rootMcp = JSON.parse(fs.readFileSync(ROOT_MCP, 'utf8'));
    for (const serverKey of manifest.mcpServers || []) {
      if (!rootMcp.mcpServers[serverKey]) {
        console.error(`  [${name}] MCP server "${serverKey}" not in root mcp.json`);
        ok = false;
        continue;
      }
    }
    // Verify each tool is in the right agent's allowedTools
    for (const tool of manifest.tools || []) {
      for (const stage of tool.stages || []) {
        if (stage === '*') continue;
        const agentFile = path.join(AGENTS_DIR, `${stage}.json`);
        if (!fs.existsSync(agentFile)) continue;
        const agent = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
        if (!(agent.allowedTools || []).includes(tool.name)) {
          console.error(`  [${name}] tool "${tool.name}" not in ${stage}.json allowedTools`);
          ok = false;
        }
      }
    }
    console.log(`  [${name}] OK`);
  }
  if (ok) console.log('All enabled adapters are correctly wired.');
  else {
    console.error('Some adapters are misconfigured. Run `node adapters/install.js` to fix.');
    process.exit(1);
  }
}

function apply() {
  // ponytail: --user-only skips writing the repo-root mcp.json (e.g. read-only
  // CI filesystem). Repo still runs all other apply steps; only the ROOT_MCP
  // write is suppressed. The user-level file is always written.
  const merged = cmdUserOnly ? mergeMcpNoWrite() : mergeMcp();
  writeUserMcp(merged);
  updateAgentAllowedTools();
  updateOrchestratorTicketTool();
  linkAdapterSteering();
  applyStageAdditions();
  writeTicketSystemConfig();
  writeNextCommandsConfig();
  generateCI();
  printSummaryTable();
}

// ---------- CI generation ----------
//
// After every install/apply, regenerate the CI pipeline from the
// orchestrator's stages[] config. Default target: GitHub Actions.
// Override with --ci-target (github|gitlab|jenkins) and --ci-output PATH.

function generateCI() {
  const ciTarget = process.env.FORGE_CI_TARGET || 'github';
  const ciOutput = process.env.FORGE_CI_OUTPUT || (
    ciTarget === 'github' ? '.github/workflows/forge-validate.yml' :
    ciTarget === 'gitlab' ? '.gitlab-ci.yml' :
    'Jenkinsfile'
  );
  const GENERATOR = path.join(ROOT, 'enterprise/ci/generate.js');
  if (!fs.existsSync(GENERATOR)) return; // ci feature not installed
  const r = spawnSync(process.execPath, [GENERATOR, '--target', ciTarget, '-o', ciOutput], {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    timeout: 15000,
  });
  if (r.status === 0) {
    console.log(`[install] CI generated: ${ciOutput}`);
  } else {
    console.error(`[install] CI generation failed: ${r.stderr || r.stdout}`);
  }
}

// ---------- ticket-system + next-commands config writers ----------
//
// The post-stage-cmd.js hook needs to know:
//   1. Which ticket system is configured (jira | clickup | none)
//   2. The next-command template per stage
//
// These writers run after every apply() so the hook and orchestrator can
// read .forge/ticket-system.json and .forge/next-commands.json without
// having to re-parse the registry.

function writeTicketSystemConfig() {
  const reg = loadRegistry();
  // Priority order: jira > clickup > none
  // First match wins. If both are enabled, jira takes precedence (it's the
  // more common default in the standard ecosystem). The user can override by
  // disabling the higher-priority one.
  let system = null;
  if (reg.adapters.jira && reg.adapters.jira.enabled) system = 'jira';
  else if (reg.adapters.clickup && reg.adapters.clickup.enabled) system = 'clickup';
  else if (reg.adapters.linear && reg.adapters.linear.enabled) system = 'linear';

  const dir = FORGE_DIR;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'ticket-system.json'),
    JSON.stringify({ system, updatedAt: new Date().toISOString() }, null, 2) + '\n'
  );
  if (system) console.log(`[install] ticket system: ${system}`);
}

function writeNextCommandsConfig() {
  // The default next-command template. The orchestrator uses this after each
  // stage to know what slash command to put in the status update.
  const commands = {
    '1': '/forge design <KEY>',
    '2': '/forge implement <KEY>',
    '3': '/forge validate <KEY>',
    '4': '/forge deploy <KEY>',
    '5': 'review and merge',
  };
  const dir = FORGE_DIR;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'next-commands.json'),
    JSON.stringify(commands, null, 2) + '\n'
  );
}

// ---------- install summary table ----------
//
// After all writes complete, print a server -> tools audit so the user can
// verify namespacing at install time. Reads registry fresh — same source as
// every other step.

function printSummaryTable() {
  const reg = loadRegistry();
  const rows = [];
  for (const [name, entry] of Object.entries(reg.adapters)) {
    if (!entry.enabled) continue;
    const loaded = loadAdapter(name);
    if (!loaded) continue;
    const { manifest } = loaded;
    const serverKeys = manifest.mcpServers || [];
    const toolNames = (manifest.tools || []).map((t) => t.name);
    for (const sk of serverKeys) {
      const tools = toolNames.filter((t) => t === sk || t.startsWith(`${sk}_`));
      rows.push({ adapter: name, server: sk, namespaced: `${USER_SERVER_KEY_PREFIX}${sk}`, tools });
    }
  }
  if (!rows.length) {
    console.log('[install] summary: no enabled adapters');
    return;
  }
  // ponytail: fixed widths — no alignment lib; pad() once.
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  console.log('[install] MCP server -> tool mapping (audit):');
  console.log(`  ${pad('server', 22)} ${pad('kiro namespaced key', 32)} tools`);
  console.log(`  ${pad('-'.repeat(22), 22)} ${pad('-'.repeat(32), 32)} ${'-'.repeat(40)}`);
  for (const r of rows) {
    console.log(`  ${pad(r.server, 22)} ${pad(r.namespaced, 32)} ${r.tools.join(', ') || '(none)'}`);
  }
}

// ---------- main ----------

if (cmdEnable) {
  cmdEnableAdapter(cmdEnable);
} else if (cmdDisable) {
  cmdDisableAdapter(cmdDisable);
} else if (cmdStatus) {
  cmdShowStatus();
} else if (cmdVerify) {
  cmdVerifyAll();
} else {
  apply();
}
