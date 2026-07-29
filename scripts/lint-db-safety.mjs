#!/usr/bin/env node
/**
 * Database / Supabase safety lint.
 *
 * Fails CI on:
 *   1. `execute_sql` RPC or other generic SQL-runner calls.
 *   2. Template-string SQL passed into rpc() calls.
 *   3. New `CREATE TABLE public.<name>` migrations without a GRANT in the same file.
 *   4. Client-side role checks via localStorage / sessionStorage.
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();

const CODE_DIRS = ['src', 'supabase/functions'];
const MIGRATION_DIRS = ['supabase/migrations'];
const CODE_EXTS = new Set(['.ts', '.tsx']);

const ALLOWLIST = [
  'scripts/lint-db-safety.mjs',
  'docs/secure-db-guidelines.md',
];

let findings = 0;
function report(file, line, id, message, snippet) {
  findings += 1;
  console.log(`${file}:${line}  [${id}] ${message}`);
  if (snippet) console.log(`    ${snippet.trim()}`);
}

function walk(dir, exts) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out = out.concat(walk(full, exts));
    else if (!exts || exts.has(extname(name))) out.push(full);
  }
  return out;
}

// --- Code checks ---
const codeFiles = CODE_DIRS.flatMap((d) => walk(join(ROOT, d), CODE_EXTS));

for (const file of codeFiles) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST.some((s) => rel.includes(s))) continue;
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  lines.forEach((line, idx) => {
    if (line.includes('db-lint-ignore')) return;
    const ln = idx + 1;

    // 1. execute_sql / exec_sql / run_sql RPCs
    if (/\.rpc\(\s*['"`](execute_sql|exec_sql|run_sql|raw_sql)['"`]/.test(line)) {
      report(rel, ln, 'raw-sql-rpc', 'Generic SQL RPC is forbidden. Use typed queries or a parameterised, named RPC.', line);
    }

    // 2. rpc(..., { sql: `...${...}...` })
    if (/\.rpc\([^)]*sql:\s*`[^`]*\$\{/.test(line)) {
      report(rel, ln, 'interpolated-sql', 'Template-string SQL passed into rpc(). Use parameters instead.', line);
    }

    // 3. Client-side role checks
    if (/(localStorage|sessionStorage)\.getItem\(['"`][^'"`]*role/i.test(line) ||
        /(localStorage|sessionStorage)\.getItem\(['"`][^'"`]*admin/i.test(line)) {
      report(rel, ln, 'client-role-check', 'Do not read role/admin flags from web storage. Use AuthContext + has_role().', line);
    }
  });
}

// --- Migration checks ---
// Historical migrations frequently added GRANTs in a later file. We enforce
// the rule going forward by only scanning migrations created on/after this
// cutoff; earlier migrations are considered baseline and are validated by
// having a GRANT anywhere in the migrations tree.
const NEW_MIGRATION_CUTOFF = '20260601'; // YYYYMMDD

// Tables created historically and later dropped from the schema — no runtime
// GRANT is meaningful, so exempt them from the same-file grant rule.
const DROPPED_TABLES = new Set(['whistleblow_attachments']);

const migrationFiles = MIGRATION_DIRS.flatMap((d) => walk(join(ROOT, d), new Set(['.sql'])));

// Build a global index of GRANTs across all migrations so baseline files
// covered by a later grant migration don't false-positive.
const globalSrc = migrationFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
function hasGlobalGrant(table) {
  const re = new RegExp(`grant\\s+[^;]*\\s+on\\s+(?:table\\s+)?public\\.${table}\\b`, 'i');
  return re.test(globalSrc);
}

function migrationTimestamp(file) {
  const base = file.split(/[\\/]/).pop() || '';
  const m = base.match(/^(\d{8})/);
  return m ? m[1] : '';
}

for (const file of migrationFiles) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  const ts = migrationTimestamp(file);
  const isNew = ts && ts >= NEW_MIGRATION_CUTOFF;

  const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi;
  let m;
  while ((m = tableRe.exec(src)) !== null) {
    const table = m[1];
    if (table.startsWith('_')) continue;
    if (DROPPED_TABLES.has(table)) continue;

    const grantRe = new RegExp(`grant\\s+[^;]*\\s+on\\s+(?:table\\s+)?public\\.${table}\\b`, 'i');
    const sameFile = grantRe.test(src);
    if (sameFile) continue;

    // For historical migrations, accept a GRANT anywhere in the tree.
    if (!isNew && hasGlobalGrant(table)) continue;

    const line = src.slice(0, m.index).split('\n').length;
    report(rel, line, 'missing-grant',
      `CREATE TABLE public.${table} without a matching GRANT in the same migration.`, m[0]);
  }
}

if (findings > 0) {
  console.error(`\nDB safety lint failed with ${findings} finding(s).`);
  console.error('See docs/secure-db-guidelines.md for guidance.');
  process.exit(1);
}
console.log('DB safety lint: clean.');
