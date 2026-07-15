// bin/lib/memory.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const mem = require('./memory');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forge-mem-'));
}

test('ensureMemory creates 5 category dirs + index.json', () => {
  const dir = tmp();
  mem.ensureMemory(dir);
  for (const c of mem.CATEGORIES) {
    assert.ok(fs.existsSync(path.join(dir, 'memory', c)));
  }
  assert.ok(fs.existsSync(path.join(dir, 'memory', 'index.json')));
});

test('addEntry persists body + index entry', () => {
  const dir = tmp();
  const r = mem.addEntry(dir, { type: 'decision', body: 'Use bun', tags: ['perf', 'scripts'] });
  assert.equal(r.type, 'decisions');
  assert.ok(r.id.length === 8);

  const got = mem.getEntry(dir, r.id);
  assert.equal(got.type, 'decisions');
  assert.ok(got.body.includes('Use bun'));
  assert.deepEqual(got.tags, ['perf', 'scripts']);
});

test('listEntries filters by type and tag', () => {
  const dir = tmp();
  mem.addEntry(dir, { type: 'pattern', body: 'a', tags: ['x'] });
  mem.addEntry(dir, { type: 'pattern', body: 'b', tags: ['y'] });
  mem.addEntry(dir, { type: 'error', body: 'c', tags: ['x'] });

  assert.equal(mem.listEntries(dir).length, 3);
  assert.equal(mem.listEntries(dir, { type: 'pattern' }).length, 2);
  assert.equal(mem.listEntries(dir, { tag: 'x' }).length, 2);
});

test('search finds entries by body content', () => {
  const dir = tmp();
  mem.addEntry(dir, { type: 'learning', body: 'rate limit hits on every 100 reqs' });
  mem.addEntry(dir, { type: 'learning', body: 'cache invalidation is hard' });
  const hits = mem.search(dir, 'rate limit');
  assert.equal(hits.length, 1);
  assert.ok(hits[0].snippet.includes('rate limit'));
});

test('gc removes entries whose files were deleted on disk', () => {
  const dir = tmp();
  const r = mem.addEntry(dir, { type: 'context', body: 'will be deleted' });
  fs.unlinkSync(path.join(dir, 'memory', 'context', `${r.id}.md`));
  const result = mem.gc(dir);
  assert.equal(result.removed, 1);
  assert.equal(result.remaining, 0);
});

test('stats returns per-type counts', () => {
  const dir = tmp();
  mem.addEntry(dir, { type: 'decision', body: 'a' });
  mem.addEntry(dir, { type: 'decision', body: 'b' });
  mem.addEntry(dir, { type: 'error', body: 'c' });
  const s = mem.stats(dir);
  assert.equal(s.total, 3);
  assert.equal(s.byType.decisions, 2);
  assert.equal(s.byType.errors, 1);
});

test('addEntry rejects unknown type', () => {
  const dir = tmp();
  assert.throws(() => mem.addEntry(dir, { type: 'bogus', body: 'x' }));
});
