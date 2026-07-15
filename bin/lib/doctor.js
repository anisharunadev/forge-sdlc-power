// bin/lib/doctor.js
// Health check. Verifies state.json, memory index, adapter registry, env vars.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const state = require('./state');
const mem = require('./memory');

function doctor(forgeRoot, { repoRoot = path.resolve(__dirname, '..', '..') } = {}) {
  const checks = [];

  // 1. .forge/state.json readable + v2
  try {
    const s = state.read(forgeRoot);
    checks.push({ ok: s.version === 2, label: 'state.json v2', detail: `version=${s.version} ticket=${s.ticket || 'none'}` });
  } catch (e) {
    checks.push({ ok: false, label: 'state.json v2', detail: e.message });
  }

  // 2. memory/ scaffolded
  try {
    const m = mem.ensureMemory(forgeRoot);
    const stats = mem.stats(forgeRoot);
    checks.push({ ok: true, label: 'memory v2', detail: `${stats.total} entries (${Object.entries(stats.byType).map(([k, v]) => `${k}:${v}`).join(', ')})` });
  } catch (e) {
    checks.push({ ok: false, label: 'memory v2', detail: e.message });
  }

  // 3. adapter registry present
  const regFile = path.join(repoRoot, 'adapters', 'registry.json');
  if (fs.existsSync(regFile)) {
    try {
      const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
      const enabled = Object.entries(reg.adapters).filter(([, e]) => e.enabled).map(([n]) => n);
      checks.push({ ok: true, label: 'adapters', detail: `enabled: ${enabled.join(', ') || 'none'}` });
    } catch (e) {
      checks.push({ ok: false, label: 'adapters', detail: e.message });
    }
  } else {
    checks.push({ ok: false, label: 'adapters', detail: 'registry.json missing' });
  }

  // 4. mcp.json present + valid JSON
  const mcpFile = path.join(repoRoot, 'mcp.json');
  if (fs.existsSync(mcpFile)) {
    try {
      const m = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
      const servers = Object.keys(m.mcpServers || {});
      checks.push({ ok: true, label: 'mcp.json', detail: `servers: ${servers.join(', ') || 'none'}` });
    } catch (e) {
      checks.push({ ok: false, label: 'mcp.json', detail: e.message });
    }
  } else {
    checks.push({ ok: false, label: 'mcp.json', detail: 'missing — run install' });
  }

  const allOk = checks.every((c) => c.ok);
  return { ok: allOk, checks };
}

module.exports = { doctor };
