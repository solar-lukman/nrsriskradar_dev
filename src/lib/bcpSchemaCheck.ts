import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const REQUIRED_BCP_COLUMNS = [
  'bia_criticality_rating',
  'bia_financial_impact',
  'bia_operational_impact',
  'bia_reputational_impact',
  'bia_regulatory_impact',
  'bia_max_tolerable_downtime',
  'bia_assessment_date',
  'test_type',
  'test_scope',
  'test_results',
  'test_findings',
] as const;

let verified = false;

async function logSchemaCheck(payload: {
  status: 'ok' | 'missing_columns' | 'error';
  missing_columns?: string[];
  error_message?: string | null;
}) {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from('bcp_schema_check_logs' as any).insert({
      checked_by: userRes?.user?.id ?? null,
      status: payload.status,
      missing_columns: payload.missing_columns ?? [],
      error_message: payload.error_message ?? null,
      client_info: {
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        path: typeof window !== 'undefined' ? window.location.pathname : null,
      },
    });
  } catch (e) {
    // Don't let audit logging block the check itself
    console.warn('[BCP schema check] failed to write audit log:', e);
  }
}

/**
 * Verifies the business_continuity_plans table exposes the BIA / test detail
 * columns required by the edit form. Records every check (ok / missing / error)
 * to bcp_schema_check_logs so admins have an audit trail. If anything is
 * missing, surfaces a clear error toast so admins know to apply the migration.
 */
export async function verifyBcpSchema(): Promise<boolean> {
  if (verified) return true;
  try {
    const selectList = REQUIRED_BCP_COLUMNS.join(', ');
    const { error } = await supabase
      .from('business_continuity_plans')
      .select(`id, ${selectList}`)
      .limit(1);

    if (error) {
      const msg = error.message || 'Unknown error';
      const missing = REQUIRED_BCP_COLUMNS.filter((c) => msg.includes(c));
      toast.error('Business Continuity schema mismatch', {
        description: missing.length
          ? `Required column "${missing[0]}" is missing from business_continuity_plans. Apply the latest migration.`
          : `BCP schema check failed: ${msg}`,
        duration: 10000,
      });
      console.error('[BCP schema check] failed:', error);
      await logSchemaCheck({
        status: missing.length ? 'missing_columns' : 'error',
        missing_columns: missing,
        error_message: msg,
      });
      return false;
    }
    verified = true;
    await logSchemaCheck({ status: 'ok' });
    return true;
  } catch (e: any) {
    console.error('[BCP schema check] exception:', e);
    await logSchemaCheck({
      status: 'error',
      error_message: e?.message || String(e),
    });
    return false;
  }
}
