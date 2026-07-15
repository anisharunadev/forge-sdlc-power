#!/usr/bin/env node
// enterprise/backlog/stream.js
// A single stream. Runs the full forge-sdlc pipeline for one ticket.
// Streams are spawned in parallel by the dispatcher; each owns its own
// .forge/stream/<KEY>/ working directory.
//
// Usage:
//   node enterprise/backlog/stream.js <KEY>           # run full pipeline
//   node enterprise/backlog/stream.js <KEY> --stage requirements
//   node enterprise/backlog/stream.js <KEY> --resume  # continue from state

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const STREAM_DIR = path.join(ROOT, '.forge/stream');
const STAGES = [
  { num: 1, name: 'requirements', agent: 'planner' },
  { num: 2, name: 'design', agent: 'architect' },
  { num: 3, name: 'implement', agent: 'implementer' },
  { num: 4, name: 'validate', agent: 'validator' },
  { num: 5, name: 'deploy', agent: 'deployer' },
];

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const key = args.find((a) => !a.startsWith('--'));
const stage = arg('--stage') || null;
const resume = args.includes('--resume');

if (!key) {
  console.error('Usage: stream.js <KEY> [--stage <name>] [--resume]');
  process.exit(2);
}

function streamDir(key) {
  return path.join(STREAM_DIR, key);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeState(dir, state) {
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
}

function readState(dir) {
  const f = path.join(dir, 'state.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function emitVerdict(dir, stageName, verdict, summary) {
  const line = `VERDICT: ${verdict}\nSUMMARY: ${summary}\n`;
  fs.writeFileSync(path.join(dir, `${stageName}-verdict.txt`), line);
  return line;
}

function main() {
  const dir = streamDir(key);
  ensureDir(dir);

  let state = readState(dir) || {
    ticketKey: key,
    startedAt: new Date().toISOString(),
    history: [],
  };

  let fromStage = 1;
  if (resume || stage) {
    const resumeScript = path.join(ROOT, 'enterprise/resume/continue.js');
    const r = spawnSync(process.execPath, [resumeScript, key, '--json'], { encoding: 'utf8', cwd: dir });
    try {
      const d = JSON.parse(r.stdout);
      if (d.fromStage) fromStage = d.fromStage;
    } catch { /* fallback to fromStage=1 */ }
  }

  // Run each stage (mock — actual run would invoke the sub-agent via Task)
  for (const s of STAGES) {
    if (s.num < fromStage) continue;
    console.log(`[${key}] stage ${s.num} (${s.name}) — running...`);
    state.history.push({ stage: s.name, agent: s.agent, startedAt: new Date().toISOString() });
    writeState(dir, state);

    // In a real run, the orchestrator spawns the sub-agent. In this stream
    // script, we record the intent and move on. The actual sub-agent work
    // is done by the orchestrator in the host environment.

    // Emit a placeholder verdict for the dispatcher to consume
    emitVerdict(dir, s.name, 'DEFERRED', `stage ${s.name} would run here — actual work by sub-agent`);
    state.history[state.history.length - 1].completedAt = new Date().toISOString();
    state.lastStage = s.name;
    state.lastVerdict = 'DEFERRED';
    writeState(dir, state);
  }

  console.log(`[${key}] stream complete. State at .forge/stream/${key}/state.json`);
}

main();
