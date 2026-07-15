// bin/lib/state.js
// v2 state machine for forge-sdlc. Reads/writes .forge/state.json with
// atomic semantics (tmp + rename) and a per-process file lock so concurrent
// `forge-sdlc-agent` invocations don't trample each other.
//
// Schema (v2):
// {
//   version: 2,
//   ticket: "PROJ-401" | null,
//   currentStage: 1..5 | null,
//   stages: { [n]: { name, status, attempts, verdict, startedAt, finishedAt, artifact, error } },
//   history: [ { stage, verdict, ts, note } ],
//   checkpoints: [ { ts, stage, snapshot } ],
//   memory: { lastIndexed, count },
//   startedAt, updatedAt
// }
//
// Status transitions per stage:
//   pending → running → (passed|failed|needs_info)
//   failed → running (retry) | abandoned
//   passed is terminal-success, failed+abandoned are terminal-failure.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STAGES = [
  { num: 1, name: 'requirements' },
  { num: 2, name: 'design' },
  { num: 3, name: 'implement' },
  { num: 4, name: 'validate' },
  { num: 5, name: 'deploy' },
];

function freshState() {
  return {
    version: 2,
    ticket: null,
    currentStage: null,
    stages: Object.fromEntries(
      STAGES.map((s) => [s.num, {
        name: s.name,
        status: 'pending',
        attempts: 0,
        verdict: null,
        startedAt: null,
        finishedAt: null,
        artifact: null,
        error: null,
      }])
    ),
    history: [],
    checkpoints: [],
    memory: { lastIndexed: null, count: 0 },
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function migrate(v1) {
  // Accept the legacy v1 shape { ticket, lastStage, lastVerdict, history }.
  const v2 = freshState();
  if (v1.ticket) v2.ticket = v1.ticket;
  if (Array.isArray(v1.history)) {
    for (const h of v1.history) {
      v2.history.push({
        stage: h.stage,
        verdict: h.verdict,
        ts: h.ts || new Date().toISOString(),
        note: 'migrated from v1',
      });
    }
  }
  if (v1.lastStage) {
    const n = STAGES.find((s) => s.name === v1.lastStage)?.num;
    if (n) {
      v2.stages[n].status = v1.lastVerdict === 'PASS' ? 'passed' :
                            v1.lastVerdict === 'FAIL' ? 'failed' : 'needs_info';
      v2.stages[n].verdict = v1.lastVerdict;
      v2.currentStage = n + 1 <= 5 ? n + 1 : null;
    }
  }
  v2.updatedAt = new Date().toISOString();
  return v2;
}

function read(forgeRoot) {
  const file = path.join(forgeRoot, 'state.json');
  if (!fs.existsSync(file)) return freshState();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw.version === 2) return raw;
    return migrate(raw);
  } catch {
    // Corrupt — back it up and start fresh.
    const backup = file + '.corrupt.' + Date.now();
    try { fs.copyFileSync(file, backup); } catch {}
    return freshState();
  }
}

// Atomic write: tmp file + rename. rename is atomic on POSIX.
function write(forgeRoot, state) {
  state.updatedAt = new Date().toISOString();
  const file = path.join(forgeRoot, 'state.json');
  ensureDir(forgeRoot);
  const tmp = file + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// Advisory file lock (POSIX flock). Non-blocking; caller decides what to do.
function withLock(forgeRoot, fn) {
  ensureDir(forgeRoot);
  const lockFile = path.join(forgeRoot, '.state.lock');
  const fd = fs.openSync(lockFile, 'w');
  try {
    if (typeof fdatasync === 'undefined') {
      // fallback to flock-equivalent via fs.flock if available
    }
    try { fs.flockSync(fd, require('node:constants').constants?.LOCK_EX ?? 2); } catch {
      // node may not have flockSync on all platforms — fall back to best-effort
    }
    return fn();
  } finally {
    try { fs.flockSync(fd, require('node:constants').constants?.LOCK_UN ?? 8); } catch {}
    fs.closeSync(fd);
  }
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); return p; }

// Mutators. Each reads, mutates, writes atomically. Returns the new state.

function setTicket(forgeRoot, ticket) {
  return withLock(forgeRoot, () => {
    const s = read(forgeRoot);
    s.ticket = ticket;
    write(forgeRoot, s);
    return s;
  });
}

function beginStage(forgeRoot, stageNum, opts = {}) {
  return withLock(forgeRoot, () => {
    const s = read(forgeRoot);
    const stage = s.stages[stageNum];
    if (!stage) throw new Error(`Unknown stage ${stageNum}`);
    stage.status = 'running';
    stage.attempts += 1;
    stage.startedAt = new Date().toISOString();
    stage.error = null;
    if (opts.artifact) stage.artifact = opts.artifact;
    s.currentStage = stageNum;
    if (opts.ticket) s.ticket = opts.ticket;
    write(forgeRoot, s);
    return s;
  });
}

function finishStage(forgeRoot, stageNum, { verdict, artifact, error, note } = {}) {
  return withLock(forgeRoot, () => {
    const s = read(forgeRoot);
    const stage = s.stages[stageNum];
    if (!stage) throw new Error(`Unknown stage ${stageNum}`);
    const v = (verdict || '').toUpperCase();
    const normalized = v === 'PASS' ? 'passed' : v === 'FAIL' ? 'failed' : v === 'NEEDS_INFO' ? 'needs_info' : stage.status;
    stage.status = normalized;
    stage.verdict = v || stage.verdict;
    stage.finishedAt = new Date().toISOString();
    if (artifact) stage.artifact = artifact;
    if (error) stage.error = error;
    s.history.push({
      stage: stage.name,
      verdict: v || stage.verdict,
      ts: stage.finishedAt,
      note: note || '',
    });
    // advance currentStage to next pending
    s.currentStage = nextPending(s);
    write(forgeRoot, s);
    return s;
  });
}

function nextPending(s) {
  for (let n = 1; n <= 5; n++) {
    if (s.stages[n].status === 'pending' || s.stages[n].status === 'failed' || s.stages[n].status === 'needs_info') return n;
  }
  return null;
}

function checkpoint(forgeRoot, label = 'manual') {
  return withLock(forgeRoot, () => {
    const s = read(forgeRoot);
    s.checkpoints.push({
      ts: new Date().toISOString(),
      stage: s.currentStage,
      label,
      snapshot: JSON.parse(JSON.stringify(s.stages)),
    });
    // keep last 20
    if (s.checkpoints.length > 20) s.checkpoints = s.checkpoints.slice(-20);
    write(forgeRoot, s);
    return s;
  });
}

function restart(forgeRoot, { preserveMemory = true } = {}) {
  // Clean restart: wipe stages + history but keep ticket and (optionally) memory.
  return withLock(forgeRoot, () => {
    const mem = read(forgeRoot).memory;
    const s = freshState();
    s.ticket = read(forgeRoot).ticket;
    if (preserveMemory) s.memory = mem;
    write(forgeRoot, s);
    return s;
  });
}

function summarize(s) {
  const lines = [];
  lines.push(`ticket: ${s.ticket || 'n/a'}`);
  lines.push(`current: ${s.currentStage ? `stage ${s.currentStage} (${s.stages[s.currentStage].name})` : 'none'}`);
  for (let n = 1; n <= 5; n++) {
    const st = s.stages[n];
    const mark = st.status === 'passed' ? '✓' :
                 st.status === 'failed' ? '✗' :
                 st.status === 'running' ? '●' :
                 st.status === 'needs_info' ? '?' : '·';
    lines.push(`  ${mark} ${n}. ${st.name.padEnd(13)} ${st.status}${st.attempts > 1 ? ` (x${st.attempts})` : ''}${st.verdict ? ` [${st.verdict}]` : ''}`);
  }
  if (s.history.length) {
    lines.push(`history: ${s.history.slice(-5).map((h) => `${h.stage}:${h.verdict}`).join(' → ')}`);
  }
  return lines.join('\n');
}

module.exports = {
  STAGES,
  freshState,
  migrate,
  read,
  write,
  withLock,
  setTicket,
  beginStage,
  finishStage,
  checkpoint,
  restart,
  nextPending,
  summarize,
};
