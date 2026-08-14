#!/usr/bin/env node
/**
 * Per-case E2E test data seeder (CLI wrapper).
 *
 * Runs the Playwright `seed` project, which provisions exactly the fixtures
 * required by the requested UAT case IDs (see e2e/fixtures/caseData.ts).
 *
 * Usage:
 *   node scripts/seed-e2e-data.mjs --all
 *   node scripts/seed-e2e-data.mjs --case UAT-KRI-03 --case UAT-GOV-02
 *   node scripts/seed-e2e-data.mjs --all --cleanup --verify
 *   node scripts/seed-e2e-data.mjs --docs           # regenerate docs/e2e-test-data.md
 *   node scripts/seed-e2e-data.mjs --list           # print the case → fixture map
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

const cases = [];
let all = false;
let cleanup = false;
let verify = false;
let docs = false;
let list = false;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--all') all = true;
  else if (arg === '--cleanup') cleanup = true;
  else if (arg === '--verify') verify = true;
  else if (arg === '--docs') docs = true;
  else if (arg === '--list') list = true;
  else if (arg === '--case' || arg === '-c') cases.push(...String(argv[++i] || '').split(','));
  else if (arg.startsWith('--case=')) cases.push(...arg.slice('--case='.length).split(','));
  else if (arg === '--help' || arg === '-h') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
}

if (list) {
  // Static view without booting Playwright: parse the registry source.
  const src = fs.readFileSync(path.join(root, 'e2e/fixtures/caseData.ts'), 'utf8');
  const body = src.split('export const CASE_FIXTURES')[1] || '';
  const rows = [...body.matchAll(/'(UAT-[A-Z0-9-]+)':\s*\[([^\]]*)\]/g)];
  console.log(`${rows.length} mapped case IDs\n`);
  for (const [, id, fixtures] of rows) {
    const keys = [...fixtures.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const spread = /\.\.\.LOOKUPS/.test(fixtures) ? ['lookups.*'] : [];
    console.log(`${id.padEnd(14)} ${[...keys, ...spread].join(', ')}`);
  }
  process.exit(0);
}

const selected = cases.map((c) => c.trim().toUpperCase()).filter(Boolean);
if (!all && selected.length === 0 && !docs) {
  console.error('Nothing to do. Pass --all, --case <ID>, --docs or --list (see --help).');
  process.exit(1);
}

const env = {
  ...process.env,
  E2E_SEED_CASES: all || selected.length === 0 ? 'all' : selected.join(','),
};
if (cleanup) env.E2E_SEED_CLEANUP = '1';
if (verify) env.E2E_SEED_VERIFY = '1';
if (docs) env.E2E_SEED_DOCS = '1';

const args = [
  'playwright',
  'test',
  '--config',
  'e2e/playwright.config.ts',
  '--project=seed',
  '--reporter=list',
];

console.log(`Seeding test data for: ${env.E2E_SEED_CASES}`);
const result = spawnSync('npx', args, { cwd: root, env, stdio: 'inherit' });
process.exit(result.status ?? 1);
