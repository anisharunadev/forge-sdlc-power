#!/usr/bin/env node
// PreCompact hook — snapshot current session state to .forge/state.json
// Runs before context compaction so the next session can resume.

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(input);
    const dir = path.join(process.cwd(), '.forge');
    fs.mkdirSync(dir, { recursive: true });

    // Load existing state if present (preserve history)
    const stateFile = path.join(dir, 'state.json');
    let state = {};
    if (fs.existsSync(stateFile)) {
      try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = {}; }
    }

    const verdictLine = (evt.context || '').match(/VERDICT:\s*(PASS|FAIL|NEEDS_INFO)/);
    if (verdictLine && state.lastStage) {
      state.history = state.history || [];
      state.history.push({ stage: state.lastStage, verdict: verdictLine[1], ts: new Date().toISOString() });
    }

    state.lastCompaction = new Date().toISOString();
    state.compactionReason = evt.reason || 'manual';
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch {
    // Best-effort
  }
});
