#!/usr/bin/env node
// SessionStart hook — read the configured ticket system and surface to the orchestrator.
// Companion to post-stage-cmd.js: both read .forge/ticket-system.json.

'use strict';
const fs = require('node:fs');
const path = require('node:path');

const f = path.join(process.cwd(), '.forge', 'ticket-system.json');
if (!fs.existsSync(f)) {
  process.stdout.write('[forge-sdlc] No ticket system configured. Run `node adapters/install.js --enable jira` (or clickup) to enable one.\n');
  return;
}

try {
  const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!cfg.system) {
    process.stdout.write('[forge-sdlc] Ticket system not enabled. Status updates will not post to any ticket.\n');
    return;
  }
  process.stdout.write(
    `[forge-sdlc] Ticket system: ${cfg.system}\n` +
    `  Status updates at every stage will post to ${cfg.system}.\n` +
    `  Override: disable ${cfg.system} and enable another, or disable all to skip status updates.\n`
  );
} catch {
  // Corrupt config — start without it
}
