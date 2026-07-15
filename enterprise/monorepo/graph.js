#!/usr/bin/env node
// enterprise/monorepo/graph.js
// Reads .forge/monorepo.json, builds a dependency graph, and emits the
// build order (topological sort) plus detected cycles.
//
// Usage:
//   node enterprise/monorepo/graph.js                # human-readable
//   node enterprise/monorepo/graph.js --json         # machine-readable
//   node enterprise/monorepo/graph.js --order        # just the build order
//   node enterprise/monorepo/graph.js --validate     # exit non-zero on cycle

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const REGISTRY = path.join(ROOT, '.forge/monorepo.json');

const args = process.argv.slice(2);
const json = args.includes('--json');
const orderOnly = args.includes('--order');
const validate = args.includes('--validate');

function loadRegistry() {
  if (!fs.existsSync(REGISTRY)) {
    console.error(`No monorepo registry at ${REGISTRY}. Create one — see enterprise/monorepo/registry.example.json`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
}

function buildGraph(registry) {
  const nodes = new Map();
  for (const r of registry.repos || []) {
    nodes.set(r.name, { name: r.name, path: r.path, role: r.role, owner: r.owner, dependsOn: r.dependsOn || [] });
  }
  return nodes;
}

function topoSort(nodes) {
  // Kahn's algorithm
  const inDegree = new Map();
  const adj = new Map();
  for (const [name, n] of nodes) {
    inDegree.set(name, 0);
    adj.set(name, []);
  }
  for (const [name, n] of nodes) {
    for (const dep of n.dependsOn) {
      if (!nodes.has(dep)) {
        return { error: `repo "${name}" depends on unknown repo "${dep}"` };
      }
      adj.get(dep).push(name);
      inDegree.set(name, inDegree.get(name) + 1);
    }
  }
  const queue = [];
  for (const [name, deg] of inDegree) {
    if (deg === 0) queue.push(name);
  }
  const sorted = [];
  while (queue.length > 0) {
    const n = queue.shift();
    sorted.push(n);
    for (const next of adj.get(n)) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }
  if (sorted.length !== nodes.size) {
    const cycleNodes = [...nodes.keys()].filter((n) => !sorted.includes(n));
    return { error: `cycle detected involving: ${cycleNodes.join(', ')}` };
  }
  return { sorted };
}

function main() {
  const registry = loadRegistry();
  const nodes = buildGraph(registry);
  const result = topoSort(nodes);
  if (result.error) {
    if (json) {
      console.log(JSON.stringify({ status: 'ERROR', error: result.error }, null, 2));
    } else {
      console.error(`ERROR: ${result.error}`);
    }
    process.exit(validate ? 1 : 0);
  }

  const order = result.sorted;
  const primary = (registry.repos || []).find((r) => r.role === 'primary');
  const sharedTypes = (registry.repos || []).filter((r) => r.role === 'shared-types');
  const consumers = (registry.repos || []).filter((r) => r.role === 'consumer');
  const infra = (registry.repos || []).filter((r) => r.role === 'infra');

  const output = {
    status: 'OK',
    defaultBranch: registry.defaultBranch || 'main',
    repoCount: nodes.size,
    order,
    primary: primary?.name || null,
    sharedTypes: sharedTypes.map((r) => r.name),
    consumers: consumers.map((r) => r.name),
    infra: infra.map((r) => r.name),
  };

  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (orderOnly) {
    console.log(order.join('\n'));
    return;
  }

  console.log(`Monorepo: ${nodes.size} repos, default branch: ${output.defaultBranch}`);
  console.log('');
  console.log('Build order (topological):');
  for (let i = 0; i < order.length; i++) {
    const n = nodes.get(order[i]);
    console.log(`  ${i + 1}. ${order[i]} (${n.role}) — ${n.path}`);
  }
  if (primary) console.log(`\nPrimary repo: ${primary.name}`);
  if (sharedTypes.length) console.log(`Shared types: ${sharedTypes.map((r) => r.name).join(', ')}`);
  if (consumers.length) console.log(`Consumers: ${consumers.map((r) => r.name).join(', ')}`);
  if (infra.length) console.log(`Infra: ${infra.map((r) => r.name).join(', ')}`);
}

main();
