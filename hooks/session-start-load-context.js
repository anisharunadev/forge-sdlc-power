#!/usr/bin/env node
// SessionStart hook — load prior state from .forge/state.json if present
// Surfaces prior session context to the orchestrator on startup.

const fs = require('fs');
const path = require('path');

const stateFile = path.join(process.cwd(), '.forge', 'state.json');

if (fs.existsSync(stateFile)) {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    process.stdout.write(
      `\n[forge-sdlc] Resuming prior session.\n` +
      `  ticket: ${state.ticket || 'n/a'}\n` +
      `  last stage: ${state.lastStage || 'n/a'} → ${state.lastVerdict || 'n/a'}\n` +
      `  verdict history: ${(state.history || []).map((h) => `${h.stage}:${h.verdict}`).join(' → ') || 'n/a'}\n\n`
    );
  } catch {
    // Corrupt state file — start fresh
    process.stdout.write('[forge-sdlc] State file present but unreadable; starting fresh.\n');
  }
} else {
  process.stdout.write('[forge-sdlc] New session.\n');
}
