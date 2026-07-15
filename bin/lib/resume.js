// bin/lib/resume.js
// Resume / restart helpers built on the v2 state machine.
// Uses the same .forge/state.json + .forge/memory/ as state.js.

'use strict';

const state = require('./state');

function resume(forgeRoot, { force = false } = {}) {
  const s = state.read(forgeRoot);
  if (!s.ticket) return { ok: false, reason: 'NO_TICKET', suggestion: 'Run: forge-sdlc-agent start <KEY>' };

  // Find the next runnable stage.
  const next = state.nextPending(s);
  if (!next) return { ok: true, status: 'ALL_DONE', ticket: s.ticket };

  // If the last finished stage failed and --force is not set, refuse.
  const lastFinished = [...Array(5)].map((_, i) => s.stages[i + 1]).filter((st) => st.status === 'failed' || st.status === 'needs_info').pop();
  if (lastFinished && lastFinished.status === 'failed' && !force) {
    return {
      ok: false,
      reason: 'LAST_FAILED',
      stage: lastFinished.name,
      suggestion: 'Run: forge-sdlc-agent continue --force',
    };
  }

  return {
    ok: true,
    status: 'RESUME',
    ticket: s.ticket,
    fromStage: next,
    stageName: s.stages[next].name,
    attempts: s.stages[next].attempts,
    command: `/forge ${s.stages[next].name} ${s.ticket}`,
  };
}

function restart(forgeRoot, opts = {}) {
  const before = state.read(forgeRoot);
  const after = state.restart(forgeRoot, opts);
  return { before: before.ticket, after: after.ticket, preservedMemory: opts.preserveMemory !== false };
}

function status(forgeRoot) {
  const s = state.read(forgeRoot);
  return {
    ticket: s.ticket,
    currentStage: s.currentStage,
    summary: state.summarize(s),
    history: s.history.slice(-10),
    checkpoints: s.checkpoints.length,
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
  };
}

function checkpoint(forgeRoot, label) {
  const s = state.checkpoint(forgeRoot, label);
  return { ok: true, count: s.checkpoints.length, last: s.checkpoints[s.checkpoints.length - 1] };
}

module.exports = { resume, restart, status, checkpoint };
