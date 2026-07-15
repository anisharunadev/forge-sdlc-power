#!/usr/bin/env node
// enterprise/backlog/dispatcher.js
// Spawns parallel streams for in-flight tickets. Bounded by a max-parallel
// setting (default 3) so we don't blow the model budget. Each stream is
// independent; the dispatcher watches for completions and starts the next
// from the queue.
//
// Usage:
//   node enterprise/backlog/dispatcher.js --max-parallel 3
//   node enterprise/backlog/dispatcher.js --once          # one tick, exit
//   node enterprise/backlog/dispatcher.js --loop 30       # tick every 30s

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const FORGE_DIR = path.join(ROOT, '.forge');
const QUEUE_FILE = path.join(FORGE_DIR, 'backlog.json');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const maxParallel = Number(arg('--max-parallel') || 3);
const once = args.includes('--once');
const loopSec = Number(arg('--loop') || 0);

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return null;
  return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
}

function tick() {
  const state = loadQueue();
  if (!state) {
    console.log('No backlog.json — nothing to dispatch');
    return 0;
  }
  const inFlightCount = Object.keys(state.in_flight).length;
  const slots = Math.max(0, maxParallel - inFlightCount);
  if (slots === 0 || state.queue.length === 0) {
    return 0;
  }
  let started = 0;
  for (let i = 0; i < Math.min(slots, state.queue.length); i++) {
    const next = state.queue[i];
    if (state.in_flight[next.key]) continue;
    // Mark as in-flight
    state.in_flight[next.key] = {
      key: next.key,
      startedAt: new Date().toISOString(),
      stage: 'requirements',
    };
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(state, null, 2));
    // Run the stream (one-tick mode so the dispatcher can supervise)
    const stream = spawnSync(process.execPath, [
      path.join(ROOT, 'enterprise/backlog/stream.js'),
      next.key,
    ], { encoding: 'utf8', timeout: 60000 });
    if (stream.status === 0) {
      // Stream ran; update lastStage
      const streamStateFile = path.join(FORGE_DIR, 'stream', next.key, 'state.json');
      if (fs.existsSync(streamStateFile)) {
        const s = JSON.parse(fs.readFileSync(streamStateFile, 'utf8'));
        if (s.lastStage) state.in_flight[next.key].stage = s.lastStage;
        if (s.lastVerdict) state.in_flight[next.key].verdict = s.lastVerdict;
      }
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(state, null, 2));
    }
    started++;
  }
  return started;
}

function main() {
  if (once) {
    const n = tick();
    console.log(`Dispatched ${n} stream(s)`);
    return;
  }
  if (loopSec > 0) {
    console.log(`Dispatcher running every ${loopSec}s, max-parallel=${maxParallel}. Ctrl+C to stop.`);
    setInterval(() => {
      const n = tick();
      if (n > 0) console.log(`[${new Date().toISOString()}] dispatched ${n}`);
    }, loopSec * 1000);
    return;
  }
  // Default: one tick
  const n = tick();
  console.log(`Dispatched ${n} stream(s)`);
}

main();
