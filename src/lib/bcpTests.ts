import { supabase } from '@/integrations/supabase/client';

export type FindingStatus = 'Open' | 'In Progress' | 'Closed';

export interface TestFindingEntry {
  description: string;
  severity: string;
  recommendation: string;
  /** Corrective action agreed for this finding. */
  action?: string;
  /** Profile user_id of the person accountable for closing the finding. */
  owner_id?: string | null;
  owner_name?: string | null;
  due_date?: string | null;
  status?: FindingStatus;
  closure_notes?: string;
  closed_at?: string | null;
}

export const FINDING_STATUSES: FindingStatus[] = ['Open', 'In Progress', 'Closed'];

export const emptyFinding = (): TestFindingEntry => ({
  description: '',
  severity: 'Medium',
  recommendation: '',
  action: '',
  owner_id: null,
  owner_name: null,
  due_date: null,
  status: 'Open',
  closure_notes: '',
  closed_at: null,
});

export const normalizeFinding = (f: any): TestFindingEntry => ({
  ...emptyFinding(),
  ...(f || {}),
  status: (f?.status as FindingStatus) || 'Open',
});

export interface RescheduleEntry {
  from: string | null;
  to: string | null;
  changed_at: string;
  changed_by?: string | null;
}

export type BCPTestStatus = 'Scheduled' | 'Passed' | 'Failed' | 'Cancelled' | 'Not Tested';

export interface BCPTestEntry {
  id?: string;
  test_type: string;
  test_scope: string;
  test_results: string;
  test_status: BCPTestStatus;
  scheduled_date: string | null;
  performed_date: string | null;
  participants: string;
  findings: TestFindingEntry[];
  cancellation_reason?: string;
  original_scheduled_date?: string | null;
  reschedule_history?: RescheduleEntry[];
}

export const TEST_TYPES = ['Tabletop Exercise', 'Walkthrough', 'Simulation', 'Full Test'];

export const emptyTest = (status: BCPTestStatus = 'Scheduled'): BCPTestEntry => ({
  test_type: '',
  test_scope: '',
  test_results: '',
  test_status: status,
  scheduled_date: status === 'Scheduled' ? new Date().toISOString().split('T')[0] : null,
  performed_date: status === 'Scheduled' ? null : new Date().toISOString().split('T')[0],
  participants: '',
  findings: [],
  cancellation_reason: '',
  original_scheduled_date: null,
  reschedule_history: [],
});

export const isCompleted = (t: BCPTestEntry) => t.test_status === 'Passed' || t.test_status === 'Failed';

export const isCancelled = (t: BCPTestEntry) => t.test_status === 'Cancelled';

/** Open findings across a set of tests (anything not yet closed). */
export function openFindings(tests: BCPTestEntry[]): TestFindingEntry[] {
  return tests.flatMap((t) => (t.findings || []).filter((f) => (f.status || 'Open') !== 'Closed'));
}

/** Most recent completed test (by performed date). */
export function latestCompleted(tests: BCPTestEntry[]): BCPTestEntry | undefined {
  return tests
    .filter((t) => isCompleted(t) && t.performed_date)
    .sort((a, b) => (a.performed_date! < b.performed_date! ? 1 : -1))[0];
}

/** Earliest scheduled test that is still in the future (or today). */
export function nextScheduled(tests: BCPTestEntry[], now = new Date()): BCPTestEntry | undefined {
  const todayStr = now.toISOString().split('T')[0];
  return tests
    .filter((t) => t.test_status === 'Scheduled' && t.scheduled_date && t.scheduled_date >= todayStr)
    .sort((a, b) => (a.scheduled_date! > b.scheduled_date! ? 1 : -1))[0];
}

export function validateTests(tests: BCPTestEntry[]): Record<string, string> {
  const errs: Record<string, string> = {};
  tests.forEach((t, i) => {
    if (!t.test_type.trim()) errs[`tests.${i}.test_type`] = 'Test type is required';
    if (t.test_status === 'Scheduled' && !t.scheduled_date) {
      errs[`tests.${i}.scheduled_date`] = 'A scheduled date is required';
    }
    if (isCompleted(t) && !t.performed_date) {
      errs[`tests.${i}.performed_date`] = 'A test date is required for a completed test';
    }
    if (isCancelled(t) && !(t.cancellation_reason || '').trim()) {
      errs[`tests.${i}.cancellation_reason`] = 'Give a reason so the history stays auditable';
    }
    (t.findings || []).forEach((f, fi) => {
      if (f.status === 'Closed' && !(f.closure_notes || '').trim()) {
        errs[`tests.${i}.findings.${fi}.closure_notes`] = 'Closure evidence is required';
      }
    });
  });
  return errs;
}

export async function fetchTests(bcpId: string): Promise<BCPTestEntry[]> {
  const { data, error } = await (supabase as any)
    .from('bcp_tests')
    .select('*')
    .eq('bcp_id', bcpId)
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('performed_date', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data as any[]) || []).map((r) => ({
    id: r.id,
    test_type: r.test_type || '',
    test_scope: r.test_scope || '',
    test_results: r.test_results || '',
    test_status: (r.test_status || 'Scheduled') as BCPTestStatus,
    scheduled_date: r.scheduled_date,
    performed_date: r.performed_date,
    participants: r.participants || '',
    findings: Array.isArray(r.findings) ? r.findings.map(normalizeFinding) : [],
    cancellation_reason: r.cancellation_reason || '',
    original_scheduled_date: r.original_scheduled_date ?? null,
    reschedule_history: Array.isArray(r.reschedule_history) ? r.reschedule_history : [],
  }));
}

/**
 * Diffs the wizard's test list against what is stored and applies inserts/updates.
 * Removals are soft: a test that disappears from the list is marked Cancelled so the
 * exercise history is never lost.
 */
export async function syncTests(bcpId: string, tests: BCPTestEntry[], existingIds: string[]) {
  const keptIds = tests.map((t) => t.id).filter(Boolean) as string[];
  const dropped = existingIds.filter((id) => !keptIds.includes(id));

  if (dropped.length) {
    const { error } = await (supabase as any)
      .from('bcp_tests')
      .update({ test_status: 'Cancelled', cancellation_reason: 'Removed from plan' })
      .in('id', dropped);
    if (error) throw error;
  }

  for (const t of tests) {
    const row = {
      bcp_id: bcpId,
      test_type: t.test_type.trim(),
      test_scope: t.test_scope || null,
      test_results: t.test_results || null,
      test_status: t.test_status,
      scheduled_date: t.scheduled_date || null,
      performed_date: t.performed_date || null,
      participants: t.participants || null,
      findings: JSON.parse(JSON.stringify(t.findings || [])),
      cancellation_reason: t.cancellation_reason || null,
    };
    if (t.id) {
      const { error } = await (supabase as any).from('bcp_tests').update(row).eq('id', t.id);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any).from('bcp_tests').insert(row);
      if (error) throw error;
    }
  }
}
