// bin/lib/memory.js
// Continuous memory v2 — "ECC-style" (Elastic Continuous Context) layered store.
//
// Layout:
//   <forgeRoot>/memory/
//     index.json                  # ordered list of entry ids + minimal metadata
//     decisions/<id>.md           # decisions (why we chose X over Y)
//     patterns/<id>.md            # recurring patterns (works for this codebase)
//     learnings/<id>.md           # things learned from failures/successes
//     errors/<id>.md              # error → root cause → fix
//     context/<id>.md             # project context (architecture, conventions)
//
// Each entry file:
//
//   ---
//   id: <shortid>
//   type: decision | pattern | learning | error | context
//   tags: [array]
//   refs:  [array of entry ids]
//   createdAt: ISO
//   updatedAt: ISO
//   ---
//
//   <markdown body>
//
// The index.json is rebuilt on demand and is the canonical list. Search walks
// the index + per-category files; the body is only read on get/show.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CATEGORIES = ['decisions', 'patterns', 'learnings', 'errors', 'context'];

function memoryRoot(forgeRoot) {
  return path.join(forgeRoot, 'memory');
}

function ensureMemory(forgeRoot) {
  const root = memoryRoot(forgeRoot);
  fs.mkdirSync(root, { recursive: true });
  for (const c of CATEGORIES) fs.mkdirSync(path.join(root, c), { recursive: true });
  const idx = path.join(root, 'index.json');
  if (!fs.existsSync(idx)) fs.writeFileSync(idx, JSON.stringify({ version: 2, entries: [] }, null, 2) + '\n');
  return root;
}

function shortId() {
  return crypto.randomBytes(4).toString('hex'); // 8 chars
}

function readIndex(mRoot) {
  const idx = path.join(mRoot, 'index.json');
  try { return JSON.parse(fs.readFileSync(idx, 'utf8')); }
  catch { return { version: 2, entries: [] }; }
}

function writeIndex(mRoot, idx) {
  fs.writeFileSync(path.join(mRoot, 'index.json'), JSON.stringify(idx, null, 2) + '\n');
}

function normalizeType(t) {
  if (CATEGORIES.includes(t)) return t;
  // singular → plural
  const singulars = { decision: 'decisions', pattern: 'patterns', learning: 'learnings', error: 'errors', context: 'context' };
  return singulars[t] || t;
}

function addEntry(forgeRoot, { type, body, tags = [], refs = [] }) {
  const normalized = normalizeType(type);
  if (!CATEGORIES.includes(normalized)) throw new Error(`Invalid type "${type}". Must be one of: ${CATEGORIES.join(', ')}`);
  type = normalized;
  const mRoot = ensureMemory(forgeRoot);
  const id = shortId();
  const now = new Date().toISOString();
  const meta = { id, type, tags, refs, createdAt: now, updatedAt: now };
  const fm = ['---', `id: ${id}`, `type: ${type}`, `tags: [${tags.join(', ')}]`, `refs: [${refs.join(', ')}]`, `createdAt: ${now}`, `updatedAt: ${now}`, '---', '', body.trim(), ''].join('\n');
  const file = path.join(mRoot, type, `${id}.md`);
  fs.writeFileSync(file, fm);
  const idx = readIndex(mRoot);
  idx.entries.push({ id, type, tags, refs, file: path.relative(mRoot, file), createdAt: now, updatedAt: now });
  writeIndex(mRoot, idx);
  return { id, type, file };
}

function getEntry(forgeRoot, id) {
  const mRoot = ensureMemory(forgeRoot);
  const idx = readIndex(mRoot);
  const meta = idx.entries.find((e) => e.id === id);
  if (!meta) return null;
  const file = path.join(mRoot, meta.file);
  if (!fs.existsSync(file)) return { ...meta, body: null, missing: true };
  const raw = fs.readFileSync(file, 'utf8');
  const fmEnd = raw.indexOf('\n---', 4);
  const body = fmEnd > 0 ? raw.slice(fmEnd + 4).trim() : raw;
  return { ...meta, body };
}

function listEntries(forgeRoot, { type, tag } = {}) {
  const mRoot = ensureMemory(forgeRoot);
  const idx = readIndex(mRoot);
  const wantType = type ? normalizeType(type) : null;
  return idx.entries
    .filter((e) => !wantType || e.type === wantType)
    .filter((e) => !tag || (e.tags || []).includes(tag))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function search(forgeRoot, query) {
  // Naive search: scans body + meta. Good enough for hundreds of entries.
  const mRoot = ensureMemory(forgeRoot);
  const idx = readIndex(mRoot);
  const q = query.toLowerCase();
  const hits = [];
  for (const meta of idx.entries) {
    const file = path.join(mRoot, meta.file);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8').toLowerCase();
    if (raw.includes(q)) {
      hits.push({ id: meta.id, type: meta.type, snippet: extractSnippet(raw, q) });
    }
  }
  return hits;
}

function extractSnippet(haystack, needle) {
  const i = haystack.indexOf(needle);
  if (i < 0) return '';
  const start = Math.max(0, i - 40);
  const end = Math.min(haystack.length, i + needle.length + 40);
  return (start > 0 ? '…' : '') + haystack.slice(start, end).replace(/\s+/g, ' ').trim() + (end < haystack.length ? '…' : '');
}

function stats(forgeRoot) {
  const mRoot = ensureMemory(forgeRoot);
  const idx = readIndex(mRoot);
  const byType = {};
  for (const c of CATEGORIES) byType[c] = 0;
  for (const e of idx.entries) byType[e.type] = (byType[e.type] || 0) + 1;
  return { total: idx.entries.length, byType };
}

// Compact the index: removes entries whose files have been deleted on disk.
function gc(forgeRoot) {
  const mRoot = ensureMemory(forgeRoot);
  const idx = readIndex(mRoot);
  const before = idx.entries.length;
  idx.entries = idx.entries.filter((e) => fs.existsSync(path.join(mRoot, e.file)));
  writeIndex(mRoot, idx);
  return { removed: before - idx.entries.length, remaining: idx.entries.length };
}

module.exports = {
  CATEGORIES,
  memoryRoot,
  ensureMemory,
  addEntry,
  getEntry,
  listEntries,
  search,
  stats,
  gc,
};
