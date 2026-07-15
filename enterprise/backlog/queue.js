#!/usr/bin/env node
// enterprise/backlog/queue.js
// The ticket queue. Reads from the configured ticket system (Jira/ClickUp),
// drains the queue into .forge/backlog.json, and tracks in-flight streams.
//
// Usage:
//   node enterprise/backlog/queue.js add <KEY>           # add to queue
//   node enterprise/backlog/queue.js add <KEY> --priority high
//   node enterprise/backlog/queue.js status             # show queue + streams
//   node enterprise/backlog/queue.js next               # pop next ready
//   node enterprise/backlog/queue.js start <KEY>        # mark as in-flight
//   node enterprise/backlog/queue.js done <KEY> [verdict]
//   node enterprise/backlog/queue.js --json status

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FORGE_DIR = path.join(ROOT, '.forge');
const QUEUE_FILE = path.join(FORGE_DIR, 'backlog.json');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const json = args.includes('--json');
const cmd = args.find((a) => !a.startsWith('--')) || null;
const key = arg('add') || (cmd === 'add' ? args.find((a, i) => i > 0 && !a.startsWith('--') && a !== 'add') : null) || (cmd === 'start' || cmd === 'done' ? args.find((a, i) => i > 0 && !a.startsWith('--') && a !== cmd) : null);

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function load() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { version: 1, queue: [], in_flight: {}, history: [] };
  }
  return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
}

function save(state) {
  fs.mkdirSync(FORGE_DIR, { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(state, null, 2));
}

function add(state, ticketKey, priority) {
  if (!ticketKey) {
    console.error('Usage: queue.js add <KEY> [--priority critical|high|medium|low]');
    process.exit(2);
  }
  if (state.queue.find((q) => q.key === ticketKey) || state.in_flight[ticketKey]) {
    console.error(`Ticket ${ticketKey} is already in the queue or in flight`);
    process.exit(1);
  }
  state.queue.push({
    key: ticketKey,
    priority: priority || 'medium',
    addedAt: new Date().toISOString(),
  });
  // Sort by priority
  state.queue.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
  save(state);
  console.log(`Added ${ticketKey} (priority: ${priority || 'medium'})`);
}

function status(state) {
  const inFlight = Object.values(state.in_flight);
  const ready = state.queue;
  if (json) {
    console.log(JSON.stringify({
      ready: ready.map((q) => q.key),
      in_flight: inFlight,
      history_count: state.history.length,
    }, null, 2));
    return;
  }
  console.log(`Backlog: ${ready.length} ready, ${inFlight.length} in flight, ${state.history.length} completed`);
  if (ready.length > 0) {
    console.log('Ready (in priority order):');
    for (const q of ready) {
      console.log(`  - ${q.key} (${q.priority}) — added ${q.addedAt}`);
    }
  }
  if (inFlight.length > 0) {
    console.log('In flight:');
    for (const f of inFlight) {
      console.log(`  - ${f.key} — ${f.stage} (started ${f.startedAt})`);
    }
  }
}

function next(state) {
  if (state.queue.length === 0) {
    if (json) console.log(JSON.stringify({ next: null }));
    else console.log('Queue is empty');
    process.exit(0);
  }
  const top = state.queue[0];
  if (json) console.log(JSON.stringify({ next: top.key, priority: top.priority, addedAt: top.addedAt }, null, 2));
  else console.log(`Next: ${top.key} (${top.priority})`);
}

function start(state, ticketKey) {
  if (!ticketKey) {
    console.error('Usage: queue.js start <KEY>');
    process.exit(2);
  }
  const idx = state.queue.findIndex((q) => q.key === ticketKey);
  if (idx === -1) {
    console.error(`${ticketKey} is not in the queue`);
    process.exit(1);
  }
  if (state.in_flight[ticketKey]) {
    console.error(`${ticketKey} is already in flight`);
    process.exit(1);
  }
  state.queue.splice(idx, 1);
  state.in_flight[ticketKey] = {
    key: ticketKey,
    startedAt: new Date().toISOString(),
    stage: 'requirements',
  };
  save(state);
  console.log(`Started ${ticketKey}`);
}

function done(state, ticketKey, verdict) {
  if (!ticketKey) {
    console.error('Usage: queue.js done <KEY> [verdict]');
    process.exit(2);
  }
  const inFlight = state.in_flight[ticketKey];
  if (!inFlight) {
    console.error(`${ticketKey} is not in flight`);
    process.exit(1);
  }
  state.history.unshift({
    key: ticketKey,
    startedAt: inFlight.startedAt,
    completedAt: new Date().toISOString(),
    verdict: verdict || 'PASS',
  });
  delete state.in_flight[ticketKey];
  save(state);
  console.log(`Completed ${ticketKey} (verdict: ${verdict || 'PASS'})`);
}

function main() {
  const state = load();
  const priority = arg('--priority') || 'medium';
  switch (cmd) {
    case 'add': return add(state, args.find((a, i) => i > 0 && !a.startsWith('--') && a !== 'add'), priority);
    case 'status': return status(state);
    case 'next': return next(state);
    case 'start': return start(state, args.find((a, i) => i > 0 && !a.startsWith('--') && a !== 'start'));
    case 'done': return done(state, args.find((a, i) => i > 0 && !a.startsWith('--') && a !== 'done'), args.find((a, i) => i > 2));
    default:
      console.error('Usage: queue.js {add|status|next|start|done} [args]');
      process.exit(2);
  }
}

main();
