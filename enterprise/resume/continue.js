#!/usr/bin/env node
// enterprise/resume/continue.js
// `forge continue <KEY>` — picks up from where the prior run left off.
//
// Reads .forge/state.json + the most recent .forge/stage<N>-* artifact,
// figures out the next stage to run, and emits a structured resume
// directive that the orchestrator (or a human running forge by hand)
// can act on.
//
// Usage:
//   node enterprise/resume/continue.js [KEY]            # human-readable
//   node enterprise/resume/continue.js [KEY] --json     # machine-readable
//   node enterprise/resume/continue.js --force          # ignore prior failure
//   node enterprise/resume/continue.js --fresh          # ignore state, start over
//
// Exit codes:
//   0  — resume directive emitted
//   1  — no state to resume (suggest `forge start <KEY>`)
//   2  — last run failed AND --force not passed (suggest `forge continue --force`)

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FORGE_DIR = path.join(ROOT, '.forge');
const STATE_FILE = path.join(FORGE_DIR, 'state.json');
const STAGES = [
  { num: 1, name: 'requirements', agent: 'planner' },
  { num: 2, name: 'design', agent: 'architect' },
  { num: 3, name: 'implement', agent: 'implementer' },
  { num: 4, name: 'validate', agent: 'validator' },
  { num: 5, name: 'deploy', agent: 'deployer' },
];

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
// First positional arg is the ticket key
const key = args.find((a) => !a.startsWith('--')) || null;
const force = args.includes('--force');
const fresh = args.includes('--fresh');
const json = args.includes('--json');

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readState() {
  if (!exists(STATE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function listStageArtifacts() {
  if (!exists(FORGE_DIR)) return [];
  return fs.readdirSync(FORGE_DIR)
    .filter((f) => /^stage\d+-/.test(f))
    .map((f) => {
      const m = f.match(/^stage(\d+)-(.+)$/);
      return { stage: Number(m[1]), file: f, path: path.join(FORGE_DIR, f) };
    });
}

function findLatestArtifact(stage) {
  const all = listStageArtifacts();
  return all
    .filter((a) => a.stage === stage)
    .sort((a, b) => fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs)[0];
}

function determineResumePoint() {
  // If --fresh, start at stage 1
  if (fresh) {
    return { fromStage: 1, lastStage: null, lastVerdict: null, reason: 'fresh' };
  }

  // No state at all → suggest start
  if (!exists(FORGE_DIR)) {
    return { error: 'no_state', suggestion: `forge start <KEY>` };
  }

  const state = readState();
  const artifacts = listStageArtifacts();
  if (artifacts.length === 0) {
    return { error: 'no_artifacts', suggestion: `forge start <KEY>` };
  }

  // Find the highest stage that has an artifact
  const maxStage = Math.max(...artifacts.map((a) => a.stage));
  const stageInfo = STAGES.find((s) => s.num === maxStage);
  const lastVerdict = state?.verdict || state?.lastVerdict || null;
  const lastStage = state?.lastStage || stageInfo?.name;

  // If the last run failed and --force is not set, refuse to resume
  if (lastVerdict === 'FAIL' && !force) {
    return {
      error: 'last_failed',
      lastStage,
      lastVerdict,
      suggestion: '`forge continue --force` to retry the failed stage',
    };
  }

  // Otherwise, the next stage is maxStage + 1 (if it exists), or just rerun maxStage if last was FAIL with --force
  let fromStage;
  if (lastVerdict === 'FAIL' && force) {
    fromStage = maxStage; // rerun the failed stage
  } else {
    fromStage = maxStage + 1;
  }

  if (fromStage > 5) {
    return { error: 'all_stages_done', lastStage, lastVerdict, suggestion: 'all stages complete — nothing to resume' };
  }

  return {
    fromStage,
    lastStage,
    lastVerdict,
    lastArtifact: findLatestArtifact(maxStage),
    reason: 'resume',
  };
}

const result = determineResumePoint();

if (result.error === 'no_state' || result.error === 'no_artifacts') {
  if (json) {
    console.log(JSON.stringify({ status: 'NO_STATE', suggestion: result.suggestion }, null, 2));
  } else {
    console.log(`No prior forge state found in ${FORGE_DIR}`);
    console.log(`Run: ${result.suggestion}`);
  }
  process.exit(1);
}

if (result.error === 'last_failed') {
  if (json) {
    console.log(JSON.stringify({ status: 'LAST_FAILED', lastStage: result.lastStage, lastVerdict: result.lastVerdict, suggestion: result.suggestion }, null, 2));
  } else {
    console.log(`Last forge run failed at stage "${result.lastStage}" (verdict: ${result.lastVerdict})`);
    console.log(`To resume anyway: ${result.suggestion}`);
  }
  process.exit(2);
}

if (result.error === 'all_stages_done') {
  if (json) {
    console.log(JSON.stringify({ status: 'ALL_DONE', lastStage: result.lastStage }, null, 2));
  } else {
    console.log(`All stages complete. Last verdict: ${result.lastVerdict}`);
  }
  process.exit(0);
}

const target = STAGES.find((s) => s.num === result.fromStage);
const directive = {
  status: 'RESUME',
  ticketKey: key || result.lastStage || null,
  fromStage: result.fromStage,
  stageName: target.name,
  agent: target.agent,
  lastStage: result.lastStage,
  lastVerdict: result.lastVerdict,
  lastArtifact: result.lastArtifact?.file || null,
  reason: result.reason,
  command: `/forge ${target.name} ${key || ''}`.trim(),
};

if (json) {
  console.log(JSON.stringify(directive, null, 2));
} else {
  console.log(`Resuming from stage ${result.fromStage} (${target.name}).`);
  console.log(`  Last stage:  ${result.lastStage || 'n/a'}`);
  console.log(`  Last verdict: ${result.lastVerdict || 'n/a'}`);
  console.log(`  Last artifact: ${result.lastArtifact?.file || 'n/a'}`);
  console.log('');
  console.log(`Next command: ${directive.command}`);
}

process.exit(0);
