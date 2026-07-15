#!/usr/bin/env node
// PostToolUse hook — append operation to .forge/session-log.jsonl
// Best-effort audit trail. Never blocks.

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(input);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      tool: evt.tool_name || evt.tool,
      ok: evt.tool_result?.ok ?? evt.ok ?? true,
      ...(evt.tool_name === 'Bash'
        ? { cmd: (evt.tool_input?.command || '').slice(0, 200) }
        : { path: evt.tool_input?.file_path || evt.tool_input?.path }),
    }) + '\n';

    const dir = path.join(process.cwd(), '.forge');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'session-log.jsonl'), line);
  } catch {
    // Best-effort: never block on post-tool errors
  }
});
