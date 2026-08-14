/**
 * Per-case test data factories.
 *
 * Every factory is **idempotent**: it looks the row up by its `[UAT]` tag and
 * only inserts when missing, so seeding can be re-run before every cycle
 * without duplicating data. Nothing here touches production-shaped records —
 * all rows carry the `[UAT]` prefix and can be removed with `--cleanup`.
 *
 * Auth: the seed client signs in with a privileged UAT account
 * (E2E_SEED_EMAIL / E2E_SEED_PASSWORD, falling back to ADMIN → RMD → CRO),
 * so every write is still subject to RLS. No service-role key is used.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UAT_TAG = '[UAT]';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(dirname, '../..');

function envFromDotFile(key: string): string | undefined {
  for (const file of ['.env', 'e2e/.env']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith(`${key}=`));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

function env(key: string): string | undefined {
  return process.env[key] || envFromDotFile(key);
}

export interface SeedCredentials {
  email: string;
  password: string;
}

export function seedCredentials(): SeedCredentials | null {
  const explicit = { email: env('E2E_SEED_EMAIL'), password: env('E2E_SEED_PASSWORD') };
  if (explicit.email && explicit.password) return explicit as SeedCredentials;
  for (const role of ['ADMIN', 'RMD', 'CRO']) {
    const email = env(`E2E_${role}_EMAIL`);
    const password = env(`E2E_${role}_PASSWORD`);
    if (email && password) return { email, password };
  }
  return null;
}

export interface SeedContext {
  sb: SupabaseClient;
  userId: string;
  log: (message: string) => void;
  /** Rows created during this run, keyed by table. */
  created: Record<string, number>;
  /** Rows found already present, keyed by table. */
  reused: Record<string, number>;
  warnings: string[];
}

export async function createSeedContext(log: (m: string) => void = console.log): Promise<SeedContext> {
  const url = env('VITE_SUPABASE_URL') || env('E2E_SUPABASE_URL');
  const key = env('VITE_SUPABASE_PUBLISHABLE_KEY') || env('E2E_SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY');

  const creds = seedCredentials();
  if (!creds) {
    throw new Error(
      'No seed credentials. Set E2E_SEED_EMAIL/E2E_SEED_PASSWORD (or ADMIN/RMD/CRO creds) in e2e/.env',
    );
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword(creds);
  if (error || !data.user) throw new Error(`Seed sign-in failed: ${error?.message || 'no user'}`);

  return { sb, userId: data.user.id, log, created: {}, reused: {}, warnings: [] };
}

/** Insert `row` when no row matches `match`; returns the row id either way. */
async function ensureRow(
  ctx: SeedContext,
  table: string,
  match: Record<string, unknown>,
  row: Record<string, unknown>,
): Promise<string | null> {
  let query = ctx.sb.from(table).select('id').limit(1);
  for (const [col, val] of Object.entries(match)) query = query.eq(col, val as never);
  const { data: existing } = await query;
  if (existing && existing.length > 0) {
    ctx.reused[table] = (ctx.reused[table] || 0) + 1;
    return (existing[0] as { id: string }).id;
  }

  const { data, error } = await ctx.sb.from(table).insert(row).select('id').single();
  if (error) {
    ctx.warnings.push(`${table}: ${error.message}`);
    ctx.log(`  ! ${table} insert skipped — ${error.message}`);
    return null;
  }
  ctx.created[table] = (ctx.created[table] || 0) + 1;
  return (data as { id: string }).id;
}

const today = () => new Date().toISOString().slice(0, 10);
const shiftDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const shiftIso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const UAT_DEPARTMENTS = ['UAT Operations', 'UAT Finance', 'UAT ICT'];

export async function seedDepartments(ctx: SeedContext) {
  for (const name of UAT_DEPARTMENTS) {
    await ensureRow(ctx, 'departments', { name }, { name, description: `${UAT_TAG} seeded department` });
  }
}

export const UAT_CATEGORIES: Array<{ name: string; risk_type: 'institutional' | 'compliance' }> = [
  { name: 'Operational', risk_type: 'institutional' },
  { name: 'Financial', risk_type: 'institutional' },
  { name: 'Compliance', risk_type: 'compliance' },
  { name: 'Technology', risk_type: 'institutional' },
  { name: 'Strategic', risk_type: 'institutional' },
];

export async function seedCategories(ctx: SeedContext) {
  for (const c of UAT_CATEGORIES) {
    await ensureRow(ctx, 'risk_categories', { name: c.name }, { ...c, description: `${UAT_TAG} lookup` });
  }
}

export async function seedObjectives(ctx: SeedContext) {
  for (const name of ['UAT Revenue Growth', 'UAT Service Excellence', 'UAT Compliance Assurance']) {
    await ensureRow(ctx, 'strategic_objectives', { name }, { name, description: `${UAT_TAG} objective` });
  }
}

/* ------------------------------------------------------------------ */
/* Risks                                                               */
/* ------------------------------------------------------------------ */

interface RiskSeed {
  slug: string;
  status: string;
  approval_status: string;
  residualHigh?: boolean;
  category?: string;
}

export const UAT_RISKS: RiskSeed[] = [
  { slug: 'draft', status: 'Draft', approval_status: 'Draft' },
  { slug: 'draft-2', status: 'Draft', approval_status: 'Draft', category: 'Technology' },
  { slug: 'submitted', status: 'Submitted', approval_status: 'Submitted' },
  { slug: 'submitted-2', status: 'Submitted', approval_status: 'Submitted', category: 'Financial' },
  { slug: 'under-review', status: 'In Review', approval_status: 'Under Review' },
  { slug: 'approved', status: 'Approved', approval_status: 'Approved' },
  { slug: 'approved-high', status: 'Approved', approval_status: 'Approved', residualHigh: true },
  { slug: 'escalated', status: 'Escalated', approval_status: 'Approved', residualHigh: true },
  { slug: 'mitigated', status: 'Mitigated', approval_status: 'Approved' },
  { slug: 'crystallized', status: 'Crystallized', approval_status: 'Approved', category: 'Compliance' },
];

export const riskTitle = (slug: string) => `${UAT_TAG} Risk ${slug}`;

export async function seedRisks(ctx: SeedContext) {
  for (const r of UAT_RISKS) {
    const residual = r.residualHigh ? 5 : 2;
    await ensureRow(
      ctx,
      'risks',
      { title: riskTitle(r.slug) },
      {
        title: riskTitle(r.slug),
        description: `${UAT_TAG} seeded risk for acceptance testing (${r.slug}).`,
        category: r.category || 'Operational',
        department: UAT_DEPARTMENTS[0],
        inherent_likelihood: 4,
        inherent_impact: 4,
        residual_likelihood: residual,
        residual_impact: r.residualHigh ? 4 : 2,
        status: r.status,
        approval_status: r.approval_status,
        risk_type: 'institutional',
      },
    );
  }
}

export async function findRisk(ctx: SeedContext, slug: string): Promise<string | null> {
  const { data } = await ctx.sb.from('risks').select('id').eq('title', riskTitle(slug)).limit(1);
  return data && data[0] ? (data[0] as { id: string }).id : null;
}

/* ------------------------------------------------------------------ */
/* Treatment                                                           */
/* ------------------------------------------------------------------ */

export async function seedMitigationTasks(ctx: SeedContext) {
  const riskId = (await findRisk(ctx, 'approved')) || (await findRisk(ctx, 'approved-high'));
  if (!riskId) {
    ctx.warnings.push('treatment: no seeded risk available for mitigation tasks');
    return;
  }
  const tasks = [
    { slug: 'on-track', due_date: shiftDays(30), status: 'in_progress', priority: 'medium' },
    { slug: 'overdue', due_date: shiftDays(-10), status: 'pending', priority: 'high' },
    { slug: 'budget-strained', due_date: shiftDays(14), status: 'in_progress', priority: 'high' },
  ];
  for (const t of tasks) {
    await ensureRow(
      ctx,
      'risk_mitigation_tasks',
      { title: `${UAT_TAG} Task ${t.slug}` },
      {
        risk_id: riskId,
        title: `${UAT_TAG} Task ${t.slug}`,
        description: `${UAT_TAG} mitigation action (NGN budget scenario: ${t.slug}).`,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date,
        created_by: ctx.userId,
      },
    );
  }
  // > 90% budget utilisation scenario lives on the parent risk.
  await ctx.sb
    .from('risks')
    .update({ mitigation_budget: 1_000_000, mitigation_budget_spent: 950_000, mitigation_budget_currency: 'NGN' })
    .eq('id', riskId);
}

/* ------------------------------------------------------------------ */
/* Appetite                                                            */
/* ------------------------------------------------------------------ */

export async function seedAppetite(ctx: SeedContext) {
  const rows = [
    {
      category: 'Operational',
      tolerance_level: 'Tolerant',
      threshold_score: 20,
      escalation_action: 'notify',
      description: `${UAT_TAG} tolerant appetite row`,
    },
    {
      category: 'Compliance',
      tolerance_level: 'Low',
      threshold_score: 12,
      escalation_action: 'escalate',
      description: `${UAT_TAG} low-tolerance appetite row (threshold 12)`,
    },
  ];
  for (const row of rows) {
    await ensureRow(
      ctx,
      'risk_appetite_config',
      { description: row.description },
      { ...row, risk_type: 'institutional', is_active: true, created_by: ctx.userId },
    );
  }
}

/* ------------------------------------------------------------------ */
/* KRIs                                                                */
/* ------------------------------------------------------------------ */

export const UAT_KRI_ABOVE = `${UAT_TAG} KRI failed logins (higher is worse)`;
export const UAT_KRI_BELOW = `${UAT_TAG} KRI collection rate (lower is worse)`;

export async function seedKRIs(ctx: SeedContext) {
  const linkedRisk = await findRisk(ctx, 'approved-high');
  await ensureRow(
    ctx,
    'kris',
    { name: UAT_KRI_ABOVE },
    {
      name: UAT_KRI_ABOVE,
      description: `${UAT_TAG} indicator with an overdue next-due date`,
      risk_id: linkedRisk,
      category: 'Technology',
      department: UAT_DEPARTMENTS[2],
      unit: 'count',
      target_value: 10,
      warning_threshold: 25,
      critical_threshold: 50,
      breach_direction: 'above',
      measurement_frequency: 'Monthly',
      next_due_date: shiftDays(-5),
      owner_id: ctx.userId,
      created_by: ctx.userId,
    },
  );
  await ensureRow(
    ctx,
    'kris',
    { name: UAT_KRI_BELOW },
    {
      name: UAT_KRI_BELOW,
      description: `${UAT_TAG} indicator where lower values breach`,
      category: 'Financial',
      department: UAT_DEPARTMENTS[1],
      unit: '%',
      target_value: 95,
      warning_threshold: 85,
      critical_threshold: 70,
      breach_direction: 'below',
      measurement_frequency: 'Monthly',
      next_due_date: shiftDays(20),
      owner_id: ctx.userId,
      created_by: ctx.userId,
    },
  );
}

export async function seedKRIReadings(ctx: SeedContext) {
  const { data } = await ctx.sb.from('kris').select('id,name').in('name', [UAT_KRI_ABOVE, UAT_KRI_BELOW]);
  for (const kri of (data || []) as Array<{ id: string; name: string }>) {
    const above = kri.name === UAT_KRI_ABOVE;
    const series = above ? [5, 30, 60] : [98, 80, 60];
    for (let i = 0; i < series.length; i++) {
      const reading_date = shiftDays(-((series.length - i) * 7));
      await ensureRow(
        ctx,
        'kri_readings',
        { kri_id: kri.id, reading_date },
        { kri_id: kri.id, reading_date, value: series[i], note: `${UAT_TAG} seeded reading`, recorded_by: ctx.userId },
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Governance                                                          */
/* ------------------------------------------------------------------ */

export async function seedGovernanceDecisions(ctx: SeedContext) {
  const riskId = await findRisk(ctx, 'escalated');
  if (!riskId) {
    ctx.warnings.push('governance: no Escalated risk available');
    return;
  }
  await ensureRow(
    ctx,
    'risk_governance_decisions',
    { minute_reference: 'ERMSC/UAT/001' },
    {
      risk_id: riskId,
      decision_type: 'Escalate',
      forum: 'ERMSC',
      decision_date: today(),
      rationale: `${UAT_TAG} Committee escalated the exposure pending further mitigation evidence.`,
      minute_reference: 'ERMSC/UAT/001',
      review_date: shiftDays(60),
      decided_by: ctx.userId,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Business continuity                                                 */
/* ------------------------------------------------------------------ */

export const bcpTitle = (slug: string) => `${UAT_TAG} BCP ${slug}`;

export async function seedBCPs(ctx: SeedContext) {
  const plans = [
    {
      slug: 'ready',
      test_status: 'Passed',
      last_tested_date: shiftDays(-30),
      next_test_date: shiftDays(180),
      bia: true,
    },
    { slug: 'needs-review', test_status: 'Not Tested', last_tested_date: null, next_test_date: shiftDays(45), bia: false },
    { slug: 'outdated', test_status: 'Overdue', last_tested_date: shiftDays(-500), next_test_date: shiftDays(-60), bia: true },
  ];
  for (const p of plans) {
    await ensureRow(
      ctx,
      'business_continuity_plans',
      { title: bcpTitle(p.slug) },
      {
        title: bcpTitle(p.slug),
        description: `${UAT_TAG} seeded continuity plan (${p.slug})`,
        department: UAT_DEPARTMENTS[0],
        business_function: `${UAT_TAG} Core service ${p.slug}`,
        recovery_time_objective: 8,
        recovery_point_objective: 4,
        test_status: p.test_status,
        last_tested_date: p.last_tested_date,
        next_test_date: p.next_test_date,
        owner_id: ctx.userId,
        created_by: ctx.userId,
        ...(p.bia
          ? {
              bia_criticality_rating: 'High',
              bia_financial_impact: 5_000_000,
              bia_operational_impact: `${UAT_TAG} service interruption`,
              bia_reputational_impact: `${UAT_TAG} media exposure`,
              bia_regulatory_impact: `${UAT_TAG} reporting breach`,
              bia_max_tolerable_downtime: 24,
              bia_assessment_date: today(),
            }
          : {}),
      },
    );
  }
}

export async function seedScheduledBCPTest(ctx: SeedContext) {
  const { data } = await ctx.sb
    .from('business_continuity_plans')
    .select('id')
    .eq('title', bcpTitle('ready'))
    .limit(1);
  const planId = data && data[0] ? (data[0] as { id: string }).id : null;
  if (!planId) {
    ctx.warnings.push('bcp: no Ready plan available for a scheduled test');
    return;
  }
  await ensureRow(
    ctx,
    'bcp_tests',
    { bcp_id: planId, test_scope: `${UAT_TAG} scheduled walkthrough` },
    {
      bcp_id: planId,
      test_type: 'Walkthrough',
      test_scope: `${UAT_TAG} scheduled walkthrough`,
      scheduled_date: shiftDays(14),
      test_status: 'Scheduled',
      created_by: ctx.userId,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Incidents                                                           */
/* ------------------------------------------------------------------ */

export async function seedIncidents(ctx: SeedContext) {
  const riskId = (await findRisk(ctx, 'crystallized')) || (await findRisk(ctx, 'approved'));
  const incidents = [
    { slug: 'open', status: 'reported', severity: 'High' },
    { slug: 'resolved', status: 'resolved', severity: 'Medium' },
  ];
  for (const inc of incidents) {
    await ensureRow(
      ctx,
      'risk_events',
      { title: `${UAT_TAG} Incident ${inc.slug}` },
      {
        title: `${UAT_TAG} Incident ${inc.slug}`,
        risk_id: riskId,
        event_type: 'crystallized',
        description: `${UAT_TAG} crystallised risk event (${inc.slug}) captured for UAT.`,
        event_description: `${UAT_TAG} crystallised risk event (${inc.slug}).`,
        occurred_at: shiftIso(-7),
        event_date: shiftDays(-7),
        discovered_date: shiftDays(-6),
        severity: inc.severity,
        status: inc.status,
        root_cause: `${UAT_TAG} control gap`,
        immediate_response: `${UAT_TAG} containment applied`,
        financial_impact: 250_000,
        owner_id: ctx.userId,
        reported_by: ctx.userId,
        ...(inc.status === 'resolved'
          ? { resolution_notes: `${UAT_TAG} closed after review`, resolved_at: shiftIso(-1), resolution_date: shiftDays(-1) }
          : {}),
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Whistleblowing                                                      */
/* ------------------------------------------------------------------ */

export async function seedWhistleblowCases(ctx: SeedContext) {
  const cases = [
    { slug: 'fresh', created_at: shiftIso(-1) },
    { slug: 'sla-breach', created_at: shiftIso(-20) },
  ];
  for (const c of cases) {
    await ensureRow(
      ctx,
      'whistleblow_cases',
      { subject: `${UAT_TAG} Anonymous report ${c.slug}` },
      {
        category: 'Fraud',
        subject: `${UAT_TAG} Anonymous report ${c.slug}`,
        description: `${UAT_TAG} anonymous disclosure seeded for acceptance testing (${c.slug}).`,
        status: 'submitted',
        created_at: c.created_at,
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Security probe rows                                                 */
/* ------------------------------------------------------------------ */

/**
 * The RLS matrix asserts that permitted roles can SELECT each table. An empty
 * table returns `[]`, which the probe reads as "denied" — so the security
 * suite needs at least one readable row per table it covers.
 */
export const SECURITY_PROBE_TABLES = [
  'risks',
  'risk_events',
  'business_continuity_plans',
  'risk_categories',
  'departments',
  'risk_appetite_config',
  'user_roles',
  'risk_audit_logs',
  'approval_history',
  'bcp_version_history',
  'whistleblow_cases',
  'whistleblow_messages',
  'kris',
  'kri_readings',
  'risk_governance_decisions',
];

export async function verifySecurityProbeRows(ctx: SeedContext): Promise<string[]> {
  const empty: string[] = [];
  for (const table of SECURITY_PROBE_TABLES) {
    const { data, error } = await ctx.sb.from(table).select('*', { head: false }).limit(1);
    if (error) {
      ctx.warnings.push(`security probe: cannot read ${table} — ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) empty.push(table);
  }
  return empty;
}

/**
 * Generates the derived rows the security probes need by exercising the app's
 * own triggers: touching a seeded risk writes risk_audit_logs / approval_history,
 * touching a seeded plan writes bcp_version_history, replying to a seeded
 * whistleblow case writes whistleblow_messages.
 */
export async function seedSecurityProbeRows(ctx: SeedContext) {
  const riskId = await findRisk(ctx, 'approved');
  if (riskId) {
    await ctx.sb.from('risks').update({ description: `${UAT_TAG} touched ${new Date().toISOString()}` }).eq('id', riskId);
  }

  const { data: plan } = await ctx.sb
    .from('business_continuity_plans')
    .select('id')
    .eq('title', bcpTitle('ready'))
    .limit(1);
  if (plan && plan[0]) {
    await ctx.sb
      .from('business_continuity_plans')
      .update({ description: `${UAT_TAG} touched ${new Date().toISOString()}` })
      .eq('id', (plan[0] as { id: string }).id);
  }

  const { data: wb } = await ctx.sb
    .from('whistleblow_cases')
    .select('id')
    .eq('subject', `${UAT_TAG} Anonymous report fresh`)
    .limit(1);
  if (wb && wb[0]) {
    const caseId = (wb[0] as { id: string }).id;
    await ensureRow(
      ctx,
      'whistleblow_messages',
      { case_id: caseId },
      { case_id: caseId, sender_type: 'investigator', message: `${UAT_TAG} seeded investigator note.` },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Cleanup                                                             */
/* ------------------------------------------------------------------ */

const CLEANUP: Array<{ table: string; column: string }> = [
  { table: 'kri_readings', column: 'note' },
  { table: 'kris', column: 'name' },
  { table: 'risk_governance_decisions', column: 'rationale' },
  { table: 'risk_mitigation_tasks', column: 'title' },
  { table: 'bcp_tests', column: 'test_scope' },
  { table: 'business_continuity_plans', column: 'title' },
  { table: 'risk_events', column: 'title' },
  { table: 'whistleblow_messages', column: 'message' },
  { table: 'whistleblow_cases', column: 'subject' },
  { table: 'risks', column: 'title' },
  { table: 'risk_appetite_config', column: 'description' },
];

export async function cleanupSeedData(ctx: SeedContext) {
  for (const { table, column } of CLEANUP) {
    const { error } = await ctx.sb.from(table).delete().like(column, `${UAT_TAG}%`);
    if (error) ctx.warnings.push(`cleanup ${table}: ${error.message}`);
    else ctx.log(`  - cleaned ${table}`);
  }
}
