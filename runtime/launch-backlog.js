#!/usr/bin/env node
// runtime/launch-backlog.js
// The launcher for the long-lived backlog dispatcher. The user (or
// orchestrator bootstrap) calls this once per session. It starts the
// dispatcher in the background, writes the PID to .forge/backlog.pid,
// and registers a cleanup on SIGINT/SIGTERM.
//
// Usage:
//   node runtime/launch-backlog.js              # start with defaults
//   node runtime/launch-backlog.js --max-parallel 5 --loop 60
//   node runtime/launch-backlog.js --status     # show PID + uptime
//   node runtime/launch-backlog.js --stop       # stop the running dispatcher

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');

const ROOT = process.cwd();
const FORGE_DIR = path.join(ROOT, '.forge');
const PID_FILE = path.join(FORGE_DIR, 'backlog.pid');
const LOG_FILE = path.join(FORGE_DIR, 'backlog.log');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const maxParallel = Number(arg('--max-parallel') || 3);
const loopSec = Number(arg('--loop') || 30);

function ensureDir() {
  fs.mkdirSync(FORGE_DIR, { recursive: true });
}

function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  try {
    return Number(fs.readFileSync(PID_FILE, 'utf8').trim());
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function status() {
  const pid = readPid();
  if (!pid) {
    console.log('Backlog dispatcher: not running');
    return;
  }
  if (!isAlive(pid)) {
    console.log(`Backlog dispatcher: PID ${pid} (stale, will be reaped on next start)`);
    return;
  }
  let uptime = 'unknown';
  try {
    const stat = fs.statSync(PID_FILE);
    uptime = `${Math.round((Date.now() - stat.mtimeMs) / 1000)}s`;
  } catch {}
  console.log(`Backlog dispatcher: running (PID ${pid}, uptime ${uptime})`);
  console.log(`  log: ${LOG_FILE}`);
  try {
    const tail = execSync(`tail -n 5 ${LOG_FILE}`, { encoding: 'utf8' });
    console.log(`  recent log:`);
    console.log(tail.split('\n').map((l) => `    ${l}`).join('\n'));
  } catch {}
}

function stop() {
  const pid = readPid();
  if (!pid) {
    console.log('No PID file; nothing to stop');
    return;
  }
  if (!isAlive(pid)) {
    console.log(`PID ${pid} is not alive; cleaning up`);
    fs.rmSync(PID_FILE, { force: true });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Sent SIGTERM to PID ${pid}`);
  } catch (e) {
    console.error(`Failed to stop: ${e.message}`);
  }
}

function start() {
  ensureDir();
  const existing = readPid();
  if (existing && isAlive(existing)) {
    console.log(`Backlog dispatcher already running (PID ${existing}). Use --stop to stop it.`);
    return;
  }
  if (existing) fs.rmSync(PID_FILE, { force: true });

  const DISPATCHER = path.join(ROOT, 'enterprise/backlog/dispatcher.js');
  if (!fs.existsSync(DISPATCHER)) {
    console.error(`Dispatcher not found at ${DISPATCHER}`);
    process.exit(1);
  }
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [DISPATCHER, '--max-parallel', String(maxParallel), '--loop', String(loopSec)], {
    detached: true,
    stdio: ['ignore', out, out],
    cwd: ROOT,
  });
  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();
  console.log(`Backlog dispatcher started: PID ${child.pid}`);
  console.log(`  max-parallel: ${maxParallel}, loop: ${loopSec}s`);
  console.log(`  log: ${LOG_FILE}`);
}

if (args.includes('--status')) {
  status();
} else if (args.includes('--stop')) {
  stop();
} else {
  start();
}
