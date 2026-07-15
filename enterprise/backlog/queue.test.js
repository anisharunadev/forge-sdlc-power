// Tests for enterprise/backlog/queue.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'queue.js');

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-queue-'));
  fs.mkdirSync(path.join(tmp, '.forge'), { recursive: true });
  return tmp;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
  });
}

function readQueue(cwd) {
  return JSON.parse(fs.readFileSync(path.join(cwd, '.forge/backlog.json'), 'utf8'));
}

test('add puts a ticket in the queue with the right priority', () => {
  const tmp = setup();
  try {
    const r = run(['add', 'PROJ-401', '--priority', 'high'], tmp);
    assert.strictEqual(r.status, 0);
    const q = readQueue(tmp);
    assert.strictEqual(q.queue.length, 1);
    assert.strictEqual(q.queue[0].key, 'PROJ-401');
    assert.strictEqual(q.queue[0].priority, 'high');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('queue is sorted by priority', () => {
  const tmp = setup();
  try {
    run(['add', 'PROJ-401', '--priority', 'low'], tmp);
    run(['add', 'PROJ-402', '--priority', 'critical'], tmp);
    run(['add', 'PROJ-403', '--priority', 'medium'], tmp);
    const q = readQueue(tmp);
    assert.deepStrictEqual(q.queue.map((x) => x.key), ['PROJ-402', 'PROJ-403', 'PROJ-401']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('start moves a ticket from queue to in_flight', () => {
  const tmp = setup();
  try {
    run(['add', 'PROJ-401'], tmp);
    run(['start', 'PROJ-401'], tmp);
    const q = readQueue(tmp);
    assert.strictEqual(q.queue.length, 0);
    assert.ok(q.in_flight['PROJ-401']);
    assert.strictEqual(q.in_flight['PROJ-401'].stage, 'requirements');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('done moves a ticket to history', () => {
  const tmp = setup();
  try {
    run(['add', 'PROJ-401'], tmp);
    run(['start', 'PROJ-401'], tmp);
    run(['done', 'PROJ-401', 'PASS'], tmp);
    const q = readQueue(tmp);
    assert.ok(!q.in_flight['PROJ-401']);
    assert.strictEqual(q.history.length, 1);
    assert.strictEqual(q.history[0].verdict, 'PASS');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('cannot add the same ticket twice', () => {
  const tmp = setup();
  try {
    run(['add', 'PROJ-401'], tmp);
    const r = run(['add', 'PROJ-401'], tmp);
    assert.strictEqual(r.status, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('status shows queue + in_flight', () => {
  const tmp = setup();
  try {
    run(['add', 'PROJ-401', '--priority', 'high'], tmp);
    run(['add', 'PROJ-402'], tmp);
    run(['start', 'PROJ-402'], tmp);
    const r = run(['status'], tmp);
    assert.match(r.stdout, /1 ready/);
    assert.match(r.stdout, /1 in flight/);
    assert.match(r.stdout, /PROJ-401/);
    assert.match(r.stdout, /PROJ-402/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('next returns the highest-priority ready ticket', () => {
  const tmp = setup();
  try {
    run(['add', 'PROJ-401', '--priority', 'low'], tmp);
    run(['add', 'PROJ-402', '--priority', 'critical'], tmp);
    const r = run(['next'], tmp);
    assert.match(r.stdout, /PROJ-402/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('next returns null on empty queue', () => {
  const tmp = setup();
  try {
    const r = run(['next'], tmp);
    assert.match(r.stdout, /Queue is empty/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
