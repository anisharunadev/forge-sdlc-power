#!/usr/bin/env node
// PostToolUse hook — runs after each sub-agent Task completes.
// Reads the stage verdict, formats a humanized status update, and writes it
// to .forge/post-stage-prompt.json. The orchestrator picks this up on its
// next turn and calls jira_post_status_update (or clickup_post_status_update)
// with the formatted content.
//
// Trigger: PostToolUse on Task (sub-agent completion).
// Best-effort: never blocks. If formatting fails, the orchestrator can still
// post a plain message from the verdict it parses.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FORGE_DIR = path.join(ROOT, '.forge');
const PROMPT_FILE = path.join(FORGE_DIR, 'post-stage-prompt.json');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(input);

    // Only act on Task completions (sub-agents)
    if (evt.tool_name !== 'Task') return;

    // The sub-agent's last response goes into tool_result.content
    const output = evt.tool_result?.content || evt.tool_result?.output || '';
    if (typeof output !== 'string') return;

    // Find the stage number from the most recent .forge/stage<N>-* artifact
    const stage = inferStage(FORGE_DIR);
    if (!stage) return;

    // Parse the verdict from the output
    const verdict = parseVerdict(output);
    if (!verdict) return;

    // Read the ticket system + next-stage command from install-time config
    const ticketSystem = readTicketSystem();
    if (!ticketSystem) return;

    // Format the humanized message
    const nextCommand = nextCommandFor(stage.num);
    const summary = extractSummary(output) || defaultSummary(stage, verdict);

    const prompt = {
      ts: new Date().toISOString(),
      ticket_system: ticketSystem,                  // 'jira' | 'clickup'
      tool_name: ticketSystem === 'jira'
        ? 'jira_post_status_update'
        : 'clickup_post_status_update',
      arguments: {
        ticket_id: readTicketId(FORGE_DIR),         // the current ticket key/id
        stage: stage.name,
        verdict: verdict,
        next_command: nextCommand,
        summary: summary,
      },
    };

    fs.mkdirSync(FORGE_DIR, { recursive: true });
    fs.writeFileSync(PROMPT_FILE, JSON.stringify(prompt, null, 2) + '\n');
  } catch {
    // Best-effort: never block on hook errors
  }
});

// ---------- helpers ----------

function inferStage(forgeDir) {
  if (!fs.existsSync(forgeDir)) return null;
  // Read stage numbers from filenames like stage1-plan.md, stage2-adr.md, etc.
  // Pick the highest number that exists, since stages are sequential.
  const stages = {
    1: 'requirements',
    2: 'design',
    3: 'implement',
    4: 'validate',
    5: 'deploy',
  };
  let found = null;
  for (const [num, name] of Object.entries(stages)) {
    const prefix = `stage${num}-`;
    const matches = fs.readdirSync(forgeDir).filter((f) => f.startsWith(prefix));
    if (matches.length > 0) found = { num: Number(num), name, files: matches };
  }
  return found;
}

function parseVerdict(output) {
  const m = output.match(/VERDICT:\s*(PASS|FAIL|NEEDS_INFO|STARTED)/);
  return m ? m[1] : null;
}

function readTicketSystem() {
  const f = path.join(FORGE_DIR, 'ticket-system.json');
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')).system || null;
  } catch {
    return null;
  }
}

function readTicketId(forgeDir) {
  const f = path.join(forgeDir, 'ticket-id.txt');
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8').trim();
}

function nextCommandFor(stageNum) {
  // The orchestrator's next-command template. Reads from .forge/next-commands.json
  // if install.js wrote it, otherwise falls back to a sensible default.
  const f = path.join(FORGE_DIR, 'next-commands.json');
  let map = {};
  if (fs.existsSync(f)) {
    try { map = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { map = {}; }
  }
  return map[String(stageNum)] || defaultNextCommand(stageNum);
}

function defaultNextCommand(stageNum) {
  const next = {
    1: '/forge design <KEY>',
    2: '/forge implement <KEY>',
    3: '/forge validate <KEY>',
    4: '/forge deploy <KEY>',
    5: 'review and merge',
  }[stageNum];
  return next || '/forge status';
}

function extractSummary(output) {
  // Try to pull a "summary" line that sub-agents may write above the verdict
  // Format: SUMMARY: <one sentence>
  const m = output.match(/SUMMARY:\s*([^\n]+)/);
  return m ? m[1].trim() : null;
}

function defaultSummary(stage, verdict) {
  const map = {
    'requirements': {
      STARTED: 'Kicked off the work. Scoping requirements now.',
      PASS: 'Requirements locked in. Acceptance criteria captured.',
      FAIL: 'Requirements need rework before proceeding.',
      NEEDS_INFO: 'Need more information to finalize the requirements.',
    },
    'design': {
      STARTED: 'Designing the architecture.',
      PASS: 'Architecture decided. ADR written.',
      FAIL: 'Design needs another pass.',
      NEEDS_INFO: 'Need input on a design decision before proceeding.',
    },
    'implement': {
      STARTED: 'Writing the code.',
      PASS: 'Implementation complete. Tests passing locally.',
      FAIL: 'Implementation hit a blocker.',
      NEEDS_INFO: 'Implementation needs direction.',
    },
    'validate': {
      STARTED: 'Running validation.',
      PASS: 'All checks green. Validator report attached.',
      FAIL: 'Validation failed. Sending back to implementer.',
      NEEDS_INFO: 'Validation needs more info.',
    },
    'deploy': {
      STARTED: 'Opening the PR.',
      PASS: 'PR open and CI green. Awaiting review.',
      FAIL: 'Deploy failed.',
      NEEDS_INFO: 'Deploy needs a decision.',
    },
  };
  return (map[stage.name] && map[stage.name][verdict]) || `${stage.name} — ${verdict}`;
}
