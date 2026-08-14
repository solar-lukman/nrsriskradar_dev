import { describe, it, expect } from 'vitest';
import {
  computeBCPMetrics,
  journeyCompleteness,
  readinessLabel,
  matchesBCPQuickFilter,
  recoveryObjectiveRows,
  criticalityBreakdown,
  formatHours,
  pct,
} from '@/lib/bcpMetrics';

const NOW = new Date('2026-08-06T00:00:00Z');

const plans = [
  {
    title: 'Payments',
    business_function: 'Payments processing',
    department: 'Operations',
    status: 'Ready',
    test_status: 'Passed',
    bia_assessment_date: '2026-07-01',
    bia_criticality_rating: 'Critical',
    bia_max_tolerable_downtime: 24,
    recovery_time_objective: 12,
    recovery_point_objective: 4,
    next_test_date: '2026-08-20',
    last_tested_date: '2026-02-20',
    test_type: 'Full Test',
    mitigation_actions: [{ action: 'Fail over' }],
  },
  {
    title: 'Payroll',
    department: 'Finance',
    status: 'Needs Review',
    test_status: 'Failed',
    bia_assessment_date: null,
    bia_criticality_rating: 'High',
    bia_max_tolerable_downtime: 8,
    recovery_time_objective: 48,
    recovery_point_objective: 8,
    next_test_date: '2026-07-01',
    mitigation_actions: [],
  },
  {
    title: 'Intranet',
    department: 'IT',
    status: 'Outdated',
    test_status: 'Not Tested',
    bia_criticality_rating: 'Low',
    mitigation_actions: [],
  },
];

describe('bcpMetrics', () => {
  it('computes register-wide counts', () => {
    const m = computeBCPMetrics(plans, NOW);
    expect(m.total).toBe(3);
    expect(m.ready).toBe(1);
    expect(m.needsReview).toBe(1);
    expect(m.outdated).toBe(1);
    expect(m.biaComplete).toBe(1);
    expect(m.biaPercent).toBe(33);
    expect(m.notTested).toBe(1);
    expect(m.tested).toBe(2);
    expect(m.passed).toBe(1);
    expect(m.failed).toBe(1);
    expect(m.passRate).toBe(50);
  });

  it('classifies overdue and due-soon tests relative to now', () => {
    const m = computeBCPMetrics(plans, NOW);
    expect(m.overdueTests).toBe(1); // payroll next_test_date in the past
    expect(m.dueSoonTests).toBe(1); // payments due in 14 days
  });

  it('flags plans whose RTO exceeds their tolerable downtime', () => {
    const m = computeBCPMetrics(plans, NOW);
    expect(m.rtoBreaches).toBe(1);
    const rows = recoveryObjectiveRows(plans);
    expect(rows.find((r) => r.name.startsWith('Payroll'))?.breach).toBe(true);
    expect(rows.find((r) => r.name.startsWith('Payments'))?.breach).toBe(false);
  });

  it('produces a weighted readiness score with a label', () => {
    const m = computeBCPMetrics(plans, NOW);
    // 33*0.4 + 33*0.3 + 33*0.3 ≈ 33
    expect(m.readiness).toBeGreaterThan(25);
    expect(m.readiness).toBeLessThan(45);
    expect(readinessLabel(m.readiness)).toMatch(/At risk/);
    expect(readinessLabel(50)).toMatch(/Developing/);
    expect(readinessLabel(70)).toMatch(/Adequate/);
    expect(readinessLabel(90)).toMatch(/Strong/);
    expect(readinessLabel(10)).toMatch(/At risk/);
  });

  it('returns zeroed metrics for an empty register', () => {
    const m = computeBCPMetrics([], NOW);
    expect(m.total).toBe(0);
    expect(m.readiness).toBe(0);
    expect(m.biaPercent).toBe(0);
    expect(m.passRate).toBe(0);
  });

  it('tracks the four journey stages per plan', () => {
    expect(journeyCompleteness(plans[0])).toMatchObject({
      basics: true,
      actions: true,
      bia: true,
      test: true,
      percent: 100,
    });
    expect(journeyCompleteness(plans[2])).toMatchObject({
      basics: false,
      actions: false,
      bia: false,
      test: false,
      percent: 0,
    });
  });

  it('summarises criticality counts', () => {
    expect(criticalityBreakdown(plans)).toEqual({ Critical: 1, High: 1, Medium: 0, Low: 1 });
  });

  it('formats hours in human terms', () => {
    expect(formatHours(null)).toBe('—');
    expect(formatHours(0.5)).toBe('30 min');
    expect(formatHours(1)).toBe('1 hour');
    expect(formatHours(12)).toBe('12 hours');
    expect(formatHours(48)).toBe('2 days');
    expect(formatHours(26)).toBe('1d 2h');
  });

  it('guards percentage division by zero', () => {
    expect(pct(3, 0)).toBe(0);
    expect(pct(1, 4)).toBe(25);
  });
});

describe('quick filter parity with KPI counts', () => {
  const now = new Date('2026-08-08');
  const plans = [
    { status: 'Ready', test_status: 'Passed', next_test_date: '2026-12-01' },
    { status: 'Needs Review', test_status: 'Failed', next_test_date: '2026-09-01' },
    { status: 'Outdated', test_status: 'Not Tested', next_test_date: '2026-07-01' },
    { status: 'Needs Review', test_status: 'Overdue' },
  ];

  it('needs-attention filter returns needsReview + outdated', () => {
    const m = computeBCPMetrics(plans as any, now);
    const rows = plans.filter((p) => matchesBCPQuickFilter(p as any, 'attention', now));
    expect(rows).toHaveLength(m.needsReview + m.outdated);
  });

  it('overdue filter returns the same count as the overdue KPI', () => {
    const m = computeBCPMetrics(plans as any, now);
    const rows = plans.filter((p) => matchesBCPQuickFilter(p as any, 'overdue', now));
    expect(rows).toHaveLength(m.overdueTests);
    expect(m.overdueTests).toBe(2);
  });

  it('ready and passed filters match their KPI counts', () => {
    const m = computeBCPMetrics(plans as any, now);
    expect(plans.filter((p) => matchesBCPQuickFilter(p as any, 'ready', now))).toHaveLength(m.ready);
    expect(plans.filter((p) => matchesBCPQuickFilter(p as any, 'pass', now))).toHaveLength(m.passed);
  });
});
