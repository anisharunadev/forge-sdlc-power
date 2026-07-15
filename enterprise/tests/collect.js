#!/usr/bin/env node
// enterprise/tests/collect.js
// Collects test results from a run, diffs them against the prior run, and
// emits a structured report. The orchestrator posts the diff back to the
// ticket ("5 new test failures, 2 in auth.test.ts").
//
// Supports:
//   - jest (--json output)
//   - pytest (--junit-xml output)
//   - vitest (--reporter=json)
//
// Usage:
//   node enterprise/tests/collect.js                   # auto-detect
//   node enterprise/tests/collect.js --framework jest
//   node enterprise/tests/collect.js --json
//   node enterprise/tests/collect.js --diff            # compare to .forge/prior-results.json
//
// Writes:
//   .forge/test-results.json       — current run, structured
//   .forge/prior-results.json      — for next run's diff

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.cwd();
const FORGE_DIR = path.join(ROOT, '.forge');
const PRIOR_FILE = path.join(FORGE_DIR, 'prior-results.json');
const CURRENT_FILE = path.join(FORGE_DIR, 'test-results.json');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const framework = arg('--framework') || detectFramework();
const diff = args.includes('--diff');
const json = args.includes('--json');

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function detectFramework() {
  if (exists(path.join(ROOT, 'jest.config.js')) || exists(path.join(ROOT, 'jest.config.ts'))) return 'jest';
  if (exists(path.join(ROOT, 'vitest.config.js')) || exists(path.join(ROOT, 'vitest.config.ts'))) return 'vitest';
  if (exists(path.join(ROOT, 'pyproject.toml'))) return 'pytest';
  return 'jest'; // best guess
}

function runJest() {
  try {
    const out = execSync('npx jest --json --outputFile=.forge/jest-raw.json 2>/dev/null', {
      encoding: 'utf8',
      cwd: ROOT,
    });
    return JSON.parse(fs.readFileSync(path.join(FORGE_DIR, 'jest-raw.json'), 'utf8'));
  } catch (e) {
    // jest exits non-zero on test failures, but still produces --json
    const raw = path.join(FORGE_DIR, 'jest-raw.json');
    if (exists(raw)) return JSON.parse(fs.readFileSync(raw, 'utf8'));
    return { error: e.message };
  }
}

function runVitest() {
  try {
    const out = execSync('npx vitest run --reporter=json --outputFile=.forge/vitest-raw.json 2>/dev/null', {
      encoding: 'utf8',
      cwd: ROOT,
    });
    return JSON.parse(fs.readFileSync(path.join(FORGE_DIR, 'vitest-raw.json'), 'utf8'));
  } catch (e) {
    const raw = path.join(FORGE_DIR, 'vitest-raw.json');
    if (exists(raw)) return JSON.parse(fs.readFileSync(raw, 'utf8'));
    return { error: e.message };
  }
}

function runPytest() {
  try {
    execSync('mkdir -p .forge && pytest --junit-xml=.forge/pytest-raw.xml 2>/dev/null', { cwd: ROOT });
    const xml = fs.readFileSync(path.join(FORGE_DIR, 'pytest-raw.xml'), 'utf8');
    return parsePytestXml(xml);
  } catch (e) {
    const raw = path.join(FORGE_DIR, 'pytest-raw.xml');
    if (exists(raw)) return parsePytestXml(fs.readFileSync(raw, 'utf8'));
    return { error: e.message };
  }
}

function parsePytestXml(xml) {
  // Minimal JUnit-XML parser — enough to extract test counts + failure names
  const suites = [];
  const suiteRegex = /<testsuite\s+name="([^"]+)"[^>]*tests="(\d+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"[^>]*>/g;
  let m;
  while ((m = suiteRegex.exec(xml)) !== null) {
    suites.push({ name: m[1], tests: Number(m[2]), failures: Number(m[3]), errors: Number(m[4]) });
  }
  const failures = [];
  const failureRegex = /<testcase\s+name="([^"]+)"[^>]*classname="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>/g;
  while ((m = failureRegex.exec(xml)) !== null) {
    const failureMatch = m[3].match(/<failure[^>]*>([\s\S]*?)<\/failure>/);
    if (failureMatch) {
      failures.push({ name: m[1], classname: m[2], message: failureMatch[1].slice(0, 200) });
    }
  }
  const totalTests = suites.reduce((s, x) => s + x.tests, 0);
  const totalFailures = suites.reduce((s, x) => s + x.failures, 0);
  return { numTotalTests: totalTests, numFailedTests: totalFailures, failures, testResults: suites };
}

function normalize(result, framework) {
  // Convert to a common shape:
  //   { passed, failed, total, failures: [{name, file, message}] }
  if (framework === 'jest' || framework === 'vitest') {
    const failures = (result.testResults || []).flatMap((suite) =>
      (suite.assertionResults || [])
        .filter((t) => t.status === 'failed')
        .map((t) => ({
          name: t.fullName || t.title,
          file: suite.name,
          message: (t.failureMessages || []).join('\n').slice(0, 200),
        }))
    );
    return {
      framework,
      passed: result.numPassedTests || 0,
      failed: result.numFailedTests || 0,
      total: result.numTotalTests || 0,
      failures,
    };
  }
  if (framework === 'pytest') {
    return {
      framework,
      passed: (result.numTotalTests || 0) - (result.numFailedTests || 0),
      failed: result.numFailedTests || 0,
      total: result.numTotalTests || 0,
      failures: (result.failures || []).map((f) => ({
        name: f.name,
        file: f.classname,
        message: f.message,
      })),
    };
  }
  return { framework, error: 'unknown framework' };
}

function diffResults(prior, current) {
  const priorFailed = new Set((prior.failures || []).map((f) => `${f.file}::${f.name}`));
  const currentFailed = new Set((current.failures || []).map((f) => `${f.file}::${f.name}`));
  const newFailures = [...currentFailed].filter((k) => !priorFailed.has(k));
  const resolvedFailures = [...priorFailed].filter((k) => !currentFailed.has(k));
  return {
    newFailures,
    resolvedFailures,
    passDelta: current.passed - prior.passed,
    failDelta: current.failed - prior.failed,
  };
}

function main() {
  let raw;
  if (framework === 'jest') raw = runJest();
  else if (framework === 'vitest') raw = runVitest();
  else if (framework === 'pytest') raw = runPytest();
  else { console.error(`Unknown framework: ${framework}`); process.exit(2); }

  const current = normalize(raw, framework);

  fs.mkdirSync(FORGE_DIR, { recursive: true });
  fs.writeFileSync(CURRENT_FILE, JSON.stringify(current, null, 2));

  if (diff && exists(PRIOR_FILE)) {
    const prior = JSON.parse(fs.readFileSync(PRIOR_FILE, 'utf8'));
    const d = diffResults(prior, current);
    current.diff = d;
  }

  // Rotate: current becomes prior for next run
  fs.writeFileSync(PRIOR_FILE, JSON.stringify(current, null, 2));

  if (json) {
    console.log(JSON.stringify(current, null, 2));
  } else {
    console.log(`Tests (${current.framework}): ${current.passed} passed, ${current.failed} failed, ${current.total} total`);
    if (current.failures && current.failures.length > 0) {
      console.log('Failures:');
      for (const f of current.failures.slice(0, 5)) {
        console.log(`  - ${f.file} :: ${f.name}`);
        if (f.message) console.log(`    ${f.message.split('\n')[0].slice(0, 100)}`);
      }
      if (current.failures.length > 5) {
        console.log(`  ... and ${current.failures.length - 5} more`);
      }
    }
    if (current.diff) {
      console.log('');
      console.log(`Diff vs. prior run:`);
      console.log(`  new failures:    ${current.diff.newFailures.length}`);
      console.log(`  resolved:         ${current.diff.resolvedFailures.length}`);
      console.log(`  pass delta:       ${current.diff.passDelta >= 0 ? '+' : ''}${current.diff.passDelta}`);
      console.log(`  fail delta:       ${current.diff.failDelta >= 0 ? '+' : ''}${current.diff.failDelta}`);
    }
  }
}

main();
