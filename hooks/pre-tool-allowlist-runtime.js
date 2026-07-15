#!/usr/bin/env node
// PreToolUse hook — enforce the orchestrator runtime allowlist for Bash.
// The orchestrator manifest denies Bash broadly; the "allowlist-by-script" promise
// is that it may ONLY run the scripts listed in orchestrator.json runtime.*.command.
// This hook enforces that: allow only commands starting with an allowed script prefix.
// Reads the tool invocation from stdin, exits 2 with stderr message to block.

// Script prefixes extracted from .kiro/agents/orchestrator.json runtime.*.command.
// startsWith (not exact) so flags/args pass through.
const ALLOWED_SCRIPTS = [
  'node enterprise/preflight/check.js',
  'node enterprise/resume/continue.js',
  'node enterprise/research/research.js',
  'node enterprise/tests/collect.js',
  'node enterprise/monorepo/check-per-repo.js',
  'node enterprise/ci/generate.js',
  'node enterprise/backlog/dispatcher.js',
];

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let invocation;
  try {
    invocation = JSON.parse(input);
  } catch {
    // Could not parse — fail open (do not block on parse error)
    return;
  }

  const tool = invocation?.tool_name || invocation?.tool || '';
  if (tool !== 'Bash') return;

  const cmd = (invocation?.tool_input || invocation?.input || {}).command
    || (invocation?.tool_input || invocation?.input || {}).cmd || '';
  const trimmed = cmd.trimStart();

  if (ALLOWED_SCRIPTS.some((s) => trimmed.startsWith(s))) {
    process.exit(0);
  }

  process.stderr.write(
    `[forge-sdlc hook] BLOCKED: bash command not in orchestrator runtime allowlist. ` +
    `Command was: "${cmd.slice(0, 200)}". ` +
    `Allowed: ${ALLOWED_SCRIPTS.join(', ')}\n`
  );
  process.exit(2);
});
