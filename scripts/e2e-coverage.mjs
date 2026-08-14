#!/usr/bin/env node
/**
 * Detailed E2E coverage report generator.
 *
 * Produces docs/e2eCoverage.md: for every case ID in docs/uat-test-plan.md it
 * lists the Playwright spec + test title that covers it, the assertions the
 * test makes, and the test data the test requires (derived from its
 * `test.skip(...)` guards plus the plan's Section 8 / per-section data notes).
 *
 * Usage: node scripts/e2e-coverage.mjs
 * Exit 1 if a spec annotation references a case ID that is not in the plan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = path.join(root, 'docs/uat-test-plan.md');
const SPEC_DIR = path.join(root, 'e2e/tests');
const OUT = path.join(root, 'docs/e2eCoverage.md');

const ALLOWED_EXTRA = /^UAT-(RLS-[A-Z0-9]+|DATA-neg)$|-(neg|extra-[a-z-]+)$/;

/** Module prefix -> plan section title + section-level test data note. */
function readPlan() {
  const md = fs.readFileSync(PLAN, 'utf8');
  const lines = md.split('\n');
  const cases = new Map();
  const sections = new Map(); // prefix -> {title, dataNote}
  let section = '';
  let pendingNote = '';
  for (const line of lines) {
    const h = line.match(/^###\s+(.*)$/);
    if (h) {
      section = h[1].trim();
      pendingNote = '';
      continue;
    }
    if (/^Test data:/i.test(line.trim())) pendingNote = line.trim().replace(/^Test data:\s*/i, '');
    else if (pendingNote && line.trim() && !line.startsWith('|')) pendingNote += ' ' + line.trim();

    const m = line.match(
      /^\|\s*(UAT-([A-Z]+)-\d+)\s*\|\s*(P\d)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/,
    );
    if (m) {
      cases.set(m[1], {
        id: m[1],
        prefix: m[2],
        priority: m[3],
        role: m[4].trim(),
        step: m[5].trim(),
        expected: m[6].trim(),
        section,
      });
      if (!sections.has(m[2])) sections.set(m[2], { title: section, dataNote: pendingNote });
      else if (pendingNote && !sections.get(m[2]).dataNote) sections.get(m[2]).dataNote = pendingNote;
    }
  }

  // Section 8 data table
  const seed = [];
  const s8 = (md.split('## 8. Test Data Requirements & Reset')[1] || '').split('\n## ')[0];
  for (const line of s8.split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (m && !/^-+$/.test(m[1]) && m[1] !== 'Area') seed.push({ area: m[1], data: m[2] });
  }
  return { cases, sections, seed };
}

/** Split each spec into test blocks and capture annotation, assertions, guards. */
function readSpecs() {
  const blocks = [];
  for (const file of fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.spec.ts'))) {
    const src = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
    const lines = src.split('\n');

    // Collect helper functions declared in the file so tests that delegate to
    // them still report the assertions those helpers make.
    const helpers = new Map(); // name -> {assertions, guards}
    {
      let cur = null;
      let depth = 0;
      for (const line of lines) {
        const h = line.match(/^\s*(?:async\s+)?function\s+(\w+)\s*\(/);
        if (h && !cur) {
          cur = { name: h[1], assertions: [], guards: [] };
          depth = 0;
        }
        if (!cur) continue;
        collect(cur, line);
        depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        if (depth <= 0 && /}/.test(line) && cur.assertions.length + cur.guards.length >= 0 && /^\s*}\s*$/.test(line)) {
          helpers.set(cur.name, cur);
          cur = null;
        }
      }
    }

    let cur = null;
    const push = () => {
      if (cur) {
        // pull in helper assertions for helpers the test calls
        for (const [name, h] of helpers) {
          if (cur.body.some((l) => new RegExp(`\\b${name}\\s*\\(`).test(l))) {
            cur.assertions.push(...h.assertions);
            cur.guards.push(...h.guards);
          }
        }
        cur.assertions = [...new Set(cur.assertions)];
        cur.guards = [...new Set(cur.guards)];
        blocks.push(cur);
      }
      cur = null;
    };
    for (const line of lines) {
      const t = line.match(/^\s*test\((?:`|')(.+?)(?:`|')\s*,/);
      if (t) {
        push();
        cur = { file, title: t[1], ids: [], assertions: [], guards: [], body: [] };
        continue;
      }
      if (!cur) continue;
      cur.body.push(line);
      const a = line.match(/type:\s*'uat',\s*description:\s*'([^']+)'/);
      if (a) cur.ids.push(a[1]);
      collect(cur, line);
    }
    push();
  }
  return blocks;
}

/** Accumulate assertion / skip-guard text, joining statements wrapped over lines. */
function collect(target, line) {
  const trimmed = line.trim();
  if (target._pending !== undefined) {
    target._pending += ' ' + trimmed;
    if (/[;)]\s*$/.test(trimmed) && balanced(target._pending)) {
      target.assertions.push(target._pending);
      delete target._pending;
    }
    return;
  }
  if (/\bexpect(\.soft)?\(/.test(trimmed)) {
    if (balanced(trimmed)) target.assertions.push(trimmed);
    else target._pending = trimmed;
  }
  const s = trimmed.match(/test\.skip\([^,]*,\s*'([^']+)'/);
  if (s) target.guards.push(s[1]);
}

function balanced(s) {
  let n = 0;
  for (const ch of s) {
    if (ch === '(') n++;
    else if (ch === ')') n--;
  }
  return n <= 0;
}

const { cases, sections, seed } = readPlan();
const blocks = readSpecs();

const byId = new Map();
for (const b of blocks) for (const id of b.ids) {
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push(b);
}

const orphans = [...byId.keys()].filter((id) => !cases.has(id) && !ALLOWED_EXTRA.test(id));
const extras = [...byId.keys()].filter((id) => !cases.has(id) && ALLOWED_EXTRA.test(id));
const covered = [...cases.keys()].filter((id) => byId.has(id));
const pct = cases.size ? Math.round((covered.length / cases.size) * 1000) / 10 : 0;

const clean = (s) =>
  s
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();

/** Summarise an assertion line into readable prose-ish form. */
const summariseAssertion = (line) => {
  const msg = line.match(/,\s*'([^']{8,})'\s*\)/);
  let out = line.replace(/^await\s+/, '').replace(/;$/, '');
  if (msg) out = `${out}`;
  return clean(out.length > 200 ? out.slice(0, 197) + '…' : out);
};

let body = '';
const prefixes = [...new Set([...cases.values()].map((c) => c.prefix))];

for (const prefix of prefixes) {
  const sec = sections.get(prefix) || { title: prefix, dataNote: '' };
  body += `\n## ${sec.title}\n\n`;
  if (sec.dataNote) body += `**Section test data:** ${sec.dataNote}\n\n`;
  for (const c of [...cases.values()].filter((x) => x.prefix === prefix)) {
    const hits = byId.get(c.id) || [];
    body += `### ${c.id} — ${c.priority} — ${c.role}\n\n`;
    body += `- **Plan step:** ${c.step}\n`;
    body += `- **Expected:** ${c.expected}\n`;
    if (!hits.length) {
      body += `- **Automation:** _manual only_\n\n`;
      continue;
    }
    for (const h of hits) {
      body += `- **Spec:** \`e2e/tests/${h.file}\` → \`${clean(h.title)}\`\n`;
      if (h.assertions.length) {
        body += `  - Assertions:\n`;
        for (const a of h.assertions.slice(0, 8)) body += `    - \`${summariseAssertion(a)}\`\n`;
        if (h.assertions.length > 8) body += `    - _…and ${h.assertions.length - 8} more_\n`;
      } else {
        body += `  - Assertions: _none captured (navigational / setup step)_\n`;
      }
      body += `  - Required test data / skip guards: ${
        h.guards.length
          ? h.guards.map((g) => `${clean(g)}`).join('; ')
          : 'none beyond the seeded baseline'
      }\n`;
    }
    body += '\n';
  }
}

const extraRows = extras
  .map((id) => {
    const hits = byId.get(id);
    return `| \`${id}\` | ${hits.map((h) => `\`${h.file}\``).join(', ')} | ${hits
      .map((h) => clean(h.title))
      .join('; ')} |`;
  })
  .join('\n');

const md = `# E2E coverage report

Generated by \`node scripts/e2e-coverage.mjs\` — do not edit by hand.
Source of truth: \`docs/uat-test-plan.md\` and the Playwright specs in \`e2e/tests/\`.
See \`docs/uat-traceability.md\` for the one-line matrix view.

## Summary

| Metric | Value |
| --- | --- |
| Plan cases | ${cases.size} |
| Automated | ${covered.length} (${pct}%) |
| Manual only | ${cases.size - covered.length} |
| Spec files | ${new Set(blocks.map((b) => b.file)).size} |
| Annotated tests | ${blocks.filter((b) => b.ids.length).length} |
| Extra automated checks (no plan case) | ${extras.length} |
| Orphan annotations | ${orphans.length} |

## Baseline seed data (plan Section 8)

| Area | Required test data |
| --- | --- |
${seed.map((s) => `| ${s.area} | ${s.data} |`).join('\n')}

Every case ID is mapped to a data factory in \`e2e/fixtures/caseData.ts\`; run
\`node scripts/seed-e2e-data.mjs --case <ID>\` (or \`npm run test:e2e:seed\`) to
provision it. The full matrix is in \`docs/e2e-test-data.md\`.

Tests guard themselves with \`test.skip(...)\` when a fixture is absent, so a thin
dataset silently reduces effective coverage — the "Required test data" line under
each case lists exactly what must exist for that test to execute rather than skip.

## Case-by-case coverage
${body}
## Extra automated checks (security depth / negative paths, no plan case)

| Annotation | Spec | Test |
| --- | --- | --- |
${extraRows || '| _none_ | | |'}
${orphans.length ? `\n## Orphan annotations (fix these)\n\n${orphans.map((id) => `- \`${id}\``).join('\n')}\n` : ''}`;

fs.writeFileSync(OUT, md);
console.log(`E2E coverage report: ${covered.length}/${cases.size} plan cases automated (${pct}%). Written to docs/e2eCoverage.md`);
if (orphans.length) {
  console.error('Orphan annotations:', orphans.join(', '));
  process.exit(1);
}
