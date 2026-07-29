#!/usr/bin/env node
/**
 * ISO 31000 naming lint.
 *
 * Scans src/**\/*.{ts,tsx} and supabase/**\/*.sql for deprecated synonyms and
 * fails CI when it finds them. Add `// iso-lint-ignore: reason` on the same
 * line to accept a specific violation (record the exception in
 * docs/iso31000-naming.md).
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();

const SCAN_DIRS = ['src', 'supabase'];
const SCAN_EXTS = new Set(['.ts', '.tsx', '.sql']);

const ALLOWLIST_PATH_SUBSTR = [
  'e2e/fixtures/',
  'src/integrations/supabase/types.ts',
  'src/components/ui/', // shadcn primitives
  'scripts/lint-iso31000.mjs',
  'docs/iso31000-naming.md',
  // Historical SQL migrations are frozen history — new naming rules only
  // apply going forward and are enforced in fresh migrations + app code.
  'supabase/migrations/',
  'supabase/migrations-onprem/',
  // Docs content mirrors user-facing labels (e.g. "high-severity risks").
  'src/docs/content.ts',
  'docs/',
];

// Allow `severity` inside incident-focused paths, BCP test findings
// (audit-style), audit logs, and dashboard/reporting surfaces where
// "High Severity" is the accepted user-facing score-bucket label.
const SEVERITY_ALLOWED_SUBSTR = [
  '/incidents/',
  '/risk_events',
  '/risk-events',
  'IncidentsDashboard',
  'system_audit_logs',
  'audit_logs',
  'AuditLog',
  'severity_level',
  // BCP test findings are audit-style observations, not risks.
  '/bcp/',
  // Dashboard/reporting UI uses "severity" as the visible label for
  // score-bucket badges (High/Medium/Low ≥15/8-14/<8).
  '/dashboard/',
  'ExportReportsMenu',
  'BoardReports',
  'ExecutiveSummary',
  'ReportsDashboard',
  'useBoardReports',
  'useBudgetForecast',
  'useRealtimeRisks',
  'chartUtils',
  'NotificationCenter',
  'AuthVerification',
  'ReportCrystallizedDialog',
  'RiskEventsSection',
  'components/Dashboard.tsx',
  'sample-data-manager',
];


const RULES = [
  {
    id: 'probability',
    pattern: /\bprobability\b/gi,
    message: "Use `likelihood` (ISO 31000) instead of `probability`.",
  },
  {
    id: 'severity',
    pattern: /\bseverity\b/gi,
    message: "`severity` is reserved for incidents/audit logs. Use `impact` for risks.",
    allowIf: (file) => SEVERITY_ALLOWED_SUBSTR.some((s) => file.includes(s)),
  },
  {
    id: 'raw_score',
    pattern: /\b(raw|gross)_(likelihood|impact|score)\b/gi,
    message: "Use `inherent_*` instead of `raw_*` / `gross_*`.",
  },
  {
    id: 'net_score',
    pattern: /\bnet_(likelihood|impact|score)\b/gi,
    message: "Use `residual_*` instead of `net_*`.",
  },
];

let findings = 0;

function walk(dir) {
  let files = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return files; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) files = files.concat(walk(full));
    else if (SCAN_EXTS.has(extname(name))) files.push(full);
  }
  return files;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

for (const file of files) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST_PATH_SUBSTR.some((s) => rel.includes(s))) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('iso-lint-ignore')) return;
    for (const rule of RULES) {
      if (rule.allowIf && rule.allowIf(rel)) continue;
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) {
        findings += 1;
        console.log(`${rel}:${idx + 1}  [${rule.id}] ${rule.message}`);
        console.log(`    ${line.trim()}`);
      }
    }
  });
}

if (findings > 0) {
  console.error(`\nISO 31000 naming lint failed with ${findings} finding(s).`);
  console.error('See docs/iso31000-naming.md for the glossary and exception process.');
  process.exit(1);
}
console.log('ISO 31000 naming lint: clean.');
