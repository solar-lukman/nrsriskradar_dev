/**
 * Pure metric helpers for the Business Continuity register.
 * No React / Supabase imports so these stay unit-testable.
 */

export interface BCPMetricPlan {
  status?: string;
  test_status?: string;
  department?: string;
  bia_criticality_rating?: string | null;
  bia_assessment_date?: string | null;
  bia_max_tolerable_downtime?: number | null;
  recovery_time_objective?: number | null;
  recovery_point_objective?: number | null;
  next_test_date?: string | null;
  last_tested_date?: string | null;
  title?: string;
  business_function?: string;
  mitigation_actions?: any[];
  test_type?: string | null;
}

export const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

export interface BCPMetrics {
  total: number;
  ready: number;
  needsReview: number;
  outdated: number;
  biaComplete: number;
  biaPercent: number;
  tested: number;
  passed: number;
  failed: number;
  notTested: number;
  passRate: number;
  overdueTests: number;
  dueSoonTests: number;
  rtoBreaches: number;
  readiness: number;
}

const daysBetween = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / 86_400_000);

export function computeBCPMetrics(
  plans: BCPMetricPlan[],
  now: Date = new Date(),
): BCPMetrics {
  const total = plans.length;
  const ready = plans.filter((p) => p.status === 'Ready').length;
  const needsReview = plans.filter((p) => p.status === 'Needs Review').length;
  const outdated = plans.filter((p) => p.status === 'Outdated').length;

  const biaComplete = plans.filter((p) => !!p.bia_assessment_date).length;
  const passed = plans.filter((p) => p.test_status === 'Passed').length;
  const failed = plans.filter((p) => p.test_status === 'Failed').length;
  const notTested = plans.filter(
    (p) => !p.test_status || p.test_status === 'Not Tested',
  ).length;
  const tested = total - notTested;

  let overdueTests = 0;
  let dueSoonTests = 0;
  for (const p of plans) {
    if (p.test_status === 'Overdue') {
      overdueTests++;
      continue;
    }
    if (!p.next_test_date) continue;
    const diff = daysBetween(new Date(p.next_test_date), now);
    if (diff < 0) overdueTests++;
    else if (diff <= 30) dueSoonTests++;
  }

  const rtoBreaches = plans.filter(
    (p) =>
      typeof p.recovery_time_objective === 'number' &&
      typeof p.bia_max_tolerable_downtime === 'number' &&
      p.recovery_time_objective > p.bia_max_tolerable_downtime,
  ).length;

  const passRate = pct(passed, tested);
  const biaPercent = pct(biaComplete, total);

  // Composite readiness: plan status (40%), BIA completion (30%), testing (30%).
  const readiness =
    total === 0
      ? 0
      : Math.round(
          pct(ready, total) * 0.4 + biaPercent * 0.3 + pct(passed, total) * 0.3,
        );

  return {
    total,
    ready,
    needsReview,
    outdated,
    biaComplete,
    biaPercent,
    tested,
    passed,
    failed,
    notTested,
    passRate,
    overdueTests,
    dueSoonTests,
    rtoBreaches,
    readiness,
  };
}

/** A plan is overdue when it is flagged Overdue or its next test date has passed. */
export function isTestOverdue(plan: BCPMetricPlan, now: Date = new Date()): boolean {
  if (plan.test_status === 'Overdue') return true;
  if (!plan.next_test_date) return false;
  return daysBetween(new Date(plan.next_test_date), now) < 0;
}

/**
 * Quick-filter predicates keyed by KPI card. These MUST mirror the counts in
 * computeBCPMetrics so a card never filters to fewer plans than it advertises.
 */
export const BCP_QUICK_FILTERS: Record<
  string,
  { label: string; match: (plan: BCPMetricPlan, now: Date) => boolean }
> = {
  ready: { label: 'Ready', match: (p) => p.status === 'Ready' },
  attention: {
    label: 'Needs attention',
    match: (p) => p.status === 'Needs Review' || p.status === 'Outdated',
  },
  pass: { label: 'Tests passed', match: (p) => p.test_status === 'Passed' },
  overdue: { label: 'Tests overdue', match: (p, now) => isTestOverdue(p, now) },
};

export function matchesBCPQuickFilter(
  plan: BCPMetricPlan,
  key: string,
  now: Date = new Date(),
): boolean {
  const f = BCP_QUICK_FILTERS[key];
  return f ? f.match(plan, now) : true;
}


export function readinessLabel(score: number): string {
  if (score >= 80) return 'Strong — continuity posture is well evidenced';
  if (score >= 60) return 'Adequate — some plans need review or testing';
  if (score >= 40) return 'Developing — significant assessment and testing gaps';
  return 'At risk — most plans lack assessment or testing evidence';
}

export interface JourneyCompleteness {
  basics: boolean;
  actions: boolean;
  bia: boolean;
  test: boolean;
  percent: number;
}

export function journeyCompleteness(plan: BCPMetricPlan): JourneyCompleteness {
  const basics = !!(
    plan.title &&
    plan.business_function &&
    plan.department &&
    typeof plan.recovery_time_objective === 'number' &&
    typeof plan.recovery_point_objective === 'number'
  );
  const actions = Array.isArray(plan.mitigation_actions) && plan.mitigation_actions.length > 0;
  const bia = !!(plan.bia_assessment_date && plan.bia_criticality_rating);
  const test = !!(plan.test_type && plan.last_tested_date);
  const done = [basics, actions, bia, test].filter(Boolean).length;
  return { basics, actions, bia, test, percent: pct(done, 4) };
}

export function criticalityBreakdown(plans: BCPMetricPlan[]) {
  const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const p of plans) {
    const rating = p.bia_criticality_rating || 'Medium';
    if (counts[rating] !== undefined) counts[rating]++;
  }
  return counts;
}

export function recoveryObjectiveRows(plans: BCPMetricPlan[]) {
  return plans
    .filter(
      (p) =>
        typeof p.recovery_time_objective === 'number' ||
        typeof p.bia_max_tolerable_downtime === 'number',
    )
    .map((p) => ({
      name: (p.title || p.business_function || 'Untitled').slice(0, 18),
      rto: p.recovery_time_objective ?? 0,
      mtd: p.bia_max_tolerable_downtime ?? 0,
      breach:
        typeof p.recovery_time_objective === 'number' &&
        typeof p.bia_max_tolerable_downtime === 'number' &&
        p.recovery_time_objective > p.bia_max_tolerable_downtime,
    }));
}

export function formatHours(hours?: number | null): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem === 0 ? `${days} day${days === 1 ? '' : 's'}` : `${days}d ${rem}h`;
}
