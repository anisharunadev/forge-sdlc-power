#!/usr/bin/env node
// SessionEnd hook — final state snapshot and verdict summary

const fs = require('fs');
const path = require('path');

const dir = path.join(process.cwd(), '.forge');
fs.mkdirSync(dir, { recursive: true });

let state = {};
const stateFile = path.join(dir, 'state.json');
if (fs.existsSync(stateFile)) {
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = {}; }
}

const summary = [
  `# Last forge-sdlc session — ${new Date().toISOString()}`,
  ``,
  `- ticket: ${state.ticket || 'n/a'}`,
  `- last stage: ${state.lastStage || 'n/a'} → ${state.lastVerdict || 'n/a'}`,
  `- verdict history: ${(state.history || []).map((h) => `${h.stage}:${h.verdict}`).join(' → ') || 'n/a'}`,
  ``,
  `## Resume command`,
  ``,
  `forge-sdlc resume --ticket ${state.ticket || '<ticket>'}`,
].join('\n');

fs.writeFileSync(path.join(dir, 'last-session.md'), summary);
