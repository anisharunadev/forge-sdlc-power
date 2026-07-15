#!/usr/bin/env node
// bin/forge-sdlc-agent.js — main CLI entry.
// Wired via package.json "bin" field so `npx forge-sdlc-agent` and
// `forge-sdlc-agent` (after global install) both work.
//
// Subcommands:
//   install                   first-time setup (asks project-wise vs global)
//   start <KEY>               begin a new run for ticket KEY
//   continue [--force]        resume from last checkpoint
//   restart [--fresh-memory]  clean restart, optionally wipe memory
//   status                    live state summary
//   checkpoint [label]        manual state snapshot
//   memory <add|list|get|search|stats>  memory v2 ops
//   doctor                    health check
//   --global | --project      override mode for this invocation

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const paths = require('./lib/paths');
const { installInteractive } = require('./lib/install');
const state = require('./lib/state');
const mem = require('./lib/memory');
const resumeMod = require('./lib/resume');
const { doctor } = require('./lib/doctor');

const USAGE = `forge-sdlc-agent — control plane for the FORGE SDLC Power

usage:
  forge-sdlc-agent install                       interactive setup (project-wise or global)
  forge-sdlc-agent start <KEY>                   begin a 5-stage run for ticket KEY
  forge-sdlc-agent continue [--force]            resume the last run
  forge-sdlc-agent restart [--fresh-memory]      clean restart (preserves memory by default)
  forge-sdlc-agent status                        show live state
  forge-sdlc-agent checkpoint [label]            snapshot current state
  forge-sdlc-agent memory <add|list|get|search|stats|gc> [--type ...] [--tag ...]
  forge-sdlc-agent doctor                        health check
  forge-sdlc-agent --global | --project          override install mode for this invocation

examples:
  npx forge-sdlc-agent install
  npx forge-sdlc-agent start PROJ-401
  npx forge-sdlc-agent continue
  npx forge-sdlc-agent memory add --type decision --body "Use bun for scripts" --tags perf,scripts
  npx forge-sdlc-agent memory search "rate limit"
  npx forge-sdlc-agent doctor
`;

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(USAGE);
    return;
  }

  // Resolve mode-aware forge dir once.
  const resolved = paths.resolveMode(argv) || { mode: 'project', root: process.cwd(), source: 'fallback' };
  const forgeRoot = paths.forgeDir(resolved);

  if (cmd === 'install') {
    return installInteractive(argv);
  }

  // All non-install commands need a valid .forge/. If absent, prompt for install.
  if (!fs.existsSync(forgeRoot)) {
    console.error(`[forge-sdlc-agent] no .forge/ at ${forgeRoot}`);
    console.error(`[forge-sdlc-agent] run: forge-sdlc-agent install (mode=${resolved.mode})`);
    process.exit(1);
  }

  switch (cmd) {
    case 'start':
      return cmdStart(forgeRoot, argv.slice(1));
    case 'continue':
      return cmdContinue(forgeRoot, argv.slice(1));
    case 'restart':
      return cmdRestart(forgeRoot, argv.slice(1));
    case 'status':
      return cmdStatus(forgeRoot);
    case 'checkpoint':
      return cmdCheckpoint(forgeRoot, argv.slice(1));
    case 'memory':
      return cmdMemory(forgeRoot, argv.slice(1));
    case 'doctor':
      return cmdDoctor(forgeRoot);
    default:
      console.error(`Unknown command: ${cmd}\n`);
      process.stdout.write(USAGE);
      process.exit(2);
  }
}

function cmdStart(forgeRoot, args) {
  const key = args.find((a) => !a.startsWith('--'));
  if (!key) {
    console.error('Usage: forge-sdlc-agent start <KEY>');
    process.exit(2);
  }
  const s = state.setTicket(forgeRoot, key);
  // Mark stage 1 as running so the orchestrator picks it up next.
  state.beginStage(forgeRoot, 1, { ticket: key });
  console.log(`[start] ticket=${key}`);
  console.log(`[start] state written to ${path.join(forgeRoot, 'state.json')}`);
  console.log(`[start] next: \`forge-sdlc-agent continue\` or invoke /forge ${s.stages[1].name} ${key}`);
}

function cmdContinue(forgeRoot, args) {
  const force = args.includes('--force');
  const r = resumeMod.resume(forgeRoot, { force });
  if (!r.ok) {
    console.error(`[continue] ${r.reason}: ${r.suggestion}`);
    process.exit(r.reason === 'LAST_FAILED' ? 2 : 1);
  }
  if (r.status === 'ALL_DONE') {
    console.log(`[continue] all stages complete for ticket ${r.ticket}`);
    return;
  }
  console.log(`[continue] resuming at stage ${r.fromStage} (${r.stageName})${r.attempts > 1 ? `, attempts=${r.attempts}` : ''}`);
  console.log(`[continue] next command: ${r.command}`);
}

function cmdRestart(forgeRoot, args) {
  const freshMemory = args.includes('--fresh-memory');
  const r = resumeMod.restart(forgeRoot, { preserveMemory: !freshMemory });
  if (freshMemory) {
    // Wipe memory entries too.
    const root = mem.memoryRoot(forgeRoot);
    fs.rmSync(root, { recursive: true, force: true });
    mem.ensureMemory(forgeRoot);
  }
  console.log(`[restart] previous ticket: ${r.before || 'none'}`);
  console.log(`[restart] new ticket: ${r.after || 'none'}`);
  console.log(`[restart] memory: ${freshMemory ? 'wiped' : 'preserved'}`);
  console.log(`[restart] next: \`forge-sdlc-agent start <KEY>\``);
}

function cmdStatus(forgeRoot) {
  const s = resumeMod.status(forgeRoot);
  console.log(`forge-sdlc status — ${forgeRoot}\n`);
  console.log(s.summary);
  console.log(`\nstarted: ${s.startedAt}`);
  console.log(`updated: ${s.updatedAt}`);
  console.log(`checkpoints: ${s.checkpoints}`);
}

function cmdCheckpoint(forgeRoot, args) {
  const label = args.find((a) => !a.startsWith('--')) || 'manual';
  const r = resumeMod.checkpoint(forgeRoot, label);
  console.log(`[checkpoint] saved #${r.count} (label="${r.last.label}", stage=${r.last.stage})`);
}

function cmdMemory(forgeRoot, args) {
  const sub = args[0];
  const getFlag = (n) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : null;
  };
  switch (sub) {
    case 'add': {
      const type = getFlag('type');
      const body = getFlag('body');
      const tags = (getFlag('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);
      if (!type || !body) {
        console.error('Usage: forge-sdlc-agent memory add --type <category> --body "<text>" [--tags a,b,c]');
        process.exit(2);
      }
      const r = mem.addEntry(forgeRoot, { type, body, tags });
      console.log(`[memory] added ${r.type}/${r.id}`);
      break;
    }
    case 'list': {
      const type = getFlag('type');
      const tag = getFlag('tag');
      const entries = mem.listEntries(forgeRoot, { type, tag });
      if (!entries.length) { console.log('[memory] no entries'); break; }
      for (const e of entries) {
        console.log(`  ${e.type.padEnd(10)} ${e.id}  ${e.tags.map((t) => `#${t}`).join(' ')}  ${e.updatedAt}`);
      }
      break;
    }
    case 'get': {
      const id = args[1];
      if (!id) { console.error('Usage: forge-sdlc-agent memory get <id>'); process.exit(2); }
      const e = mem.getEntry(forgeRoot, id);
      if (!e) { console.error(`[memory] no entry with id=${id}`); process.exit(1); }
      console.log(`# ${e.type}/${e.id}\n\n${e.body}`);
      break;
    }
    case 'search': {
      const q = args.slice(1).filter((a) => !a.startsWith('--')).join(' ');
      if (!q) { console.error('Usage: forge-sdlc-agent memory search "<query>"'); process.exit(2); }
      const hits = mem.search(forgeRoot, q);
      if (!hits.length) { console.log('[memory] no hits'); break; }
      for (const h of hits) console.log(`  ${h.type}/${h.id}  ${h.snippet}`);
      break;
    }
    case 'stats': {
      const s = mem.stats(forgeRoot);
      console.log(`total: ${s.total}`);
      for (const [k, v] of Object.entries(s.byType)) console.log(`  ${k.padEnd(11)} ${v}`);
      break;
    }
    case 'gc': {
      const r = mem.gc(forgeRoot);
      console.log(`[memory] removed ${r.removed} orphan entries; ${r.remaining} remaining`);
      break;
    }
    default:
      console.error('memory subcommands: add | list | get | search | stats | gc');
      process.exit(2);
  }
}

function cmdDoctor(forgeRoot) {
  const r = doctor(forgeRoot);
  for (const c of r.checks) {
    const mark = c.ok ? '✓' : '✗';
    console.log(`  [${mark}] ${c.label.padEnd(14)} ${c.detail}`);
  }
  if (!r.ok) { console.error('\n[doctor] some checks failed. Run `forge-sdlc-agent install` to fix.'); process.exit(1); }
  console.log('\n[doctor] all checks passed.');
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
