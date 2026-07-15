#!/usr/bin/env node
// PreToolUse hook — block destructive operations
// Reads the tool invocation from stdin, returns exit 2 with stderr message to block.

const PROTECTED_PATH_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)uv\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)go\.sum$/,
  /(^|\/)\.eslintrc(\.|$)/i,
  /(^|\/)biome\.json$/,
  /(^|\/)\.prettierrc(\.|$)/i,
  /(^|\/)\.ruff\.toml$/,
  /(^|\/)tsconfig\.json$/,
];

const FORBIDDEN_BASH_PATTERNS = [
  /\bgit\s+commit\s+--no-verify\b/,
  /\bgit\s+commit\s+(-[a-z]*[a-z]*n[a-z]*\s|--no-verify)/,
  /\bgit\s+push\s+(.*\s)?--force\b.*\b(main|master|production)\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bgit\s+push\s+origin\s+(main|master)\b/,
  /\brm\s+-rf\s+\/(?!\.?forge)/,
];

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxoxb-[0-9A-Za-z-]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9_-]{20,}\b/,
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
  const args = invocation?.tool_input || invocation?.input || {};

  // --- Protected path check (applies to Write/Edit/MultiEdit) ---
  if (['Write', 'Edit', 'MultiEdit'].includes(tool)) {
    const path = args.file_path || args.path || args.notebook_path || '';
    for (const pat of PROTECTED_PATH_PATTERNS) {
      if (pat.test(path)) {
        process.stderr.write(
          `[forge-sdlc hook] BLOCKED: ${tool} on protected path "${path}". ` +
          `Lockfiles, linter configs, and .env* are policy files — fix the code, not the config.\n`
        );
        process.exit(2);
      }
    }
  }

  // --- Forbidden bash check (applies to Bash) ---
  if (tool === 'Bash') {
    const cmd = args.command || args.cmd || '';
    for (const pat of FORBIDDEN_BASH_PATTERNS) {
      if (pat.test(cmd)) {
        process.stderr.write(
          `[forge-sdlc hook] BLOCKED: bash command matches forbidden pattern. ` +
          `Command was: "${cmd.slice(0, 200)}". Reason: ${pat.source}\n`
        );
        process.exit(2);
      }
    }
  }

  // --- Secret pattern check (applies to Write content) ---
  if (['Write', 'MultiEdit', 'Edit'].includes(tool)) {
    const content = args.content || args.new_string || '';
    for (const pat of SECRET_PATTERNS) {
      if (pat.test(content)) {
        process.stderr.write(
          `[forge-sdlc hook] BLOCKED: ${tool} would write a secret-pattern match. ` +
          `Use environment variables or a secret manager. Pattern: ${pat.source}\n`
        );
        process.exit(2);
      }
    }
  }
});
