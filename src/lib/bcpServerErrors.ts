/**
 * Maps Postgres trigger validation errors raised by
 * validate_bcp_bia_test_fields() into per-field error messages
 * for the Add/Edit BCP dialogs.
 *
 * The trigger raises messages like "bia_financial_impact must be ..."
 * — we look for the column name in the message text and map it to the
 * matching form field key used by the dialog state / zod schema.
 */
const COLUMN_TO_FIELD: Record<string, string> = {
  bia_criticality_rating: 'biaCriticalityRating',
  bia_financial_impact: 'biaFinancialImpact',
  bia_operational_impact: 'biaOperationalImpact',
  bia_reputational_impact: 'biaReputationalImpact',
  bia_regulatory_impact: 'biaRegulatoryImpact',
  bia_max_tolerable_downtime: 'biaMaxTolerableDowntime',
  bia_assessment_date: 'biaAssessmentDate',
  test_type: 'testType',
  test_scope: 'testScope',
  test_results: 'testResults',
  test_findings: 'testFindings',
};

export interface MappedServerError {
  fieldErrors: Record<string, string>;
  generalMessage: string | null;
}

export function mapBcpServerError(error: any): MappedServerError {
  const raw = error?.message || error?.details || String(error || '');
  const fieldErrors: Record<string, string> = {};

  if (raw.includes('BCP_STATUS_OVERRIDE_FORBIDDEN')) {
    return {
      fieldErrors: {},
      generalMessage: 'Only Admin or CRO users can override the plan status.',
    };
  }
  if (raw.includes('BCP_STATUS_OVERRIDE_REASON_REQUIRED')) {
    return {
      fieldErrors: { statusOverrideReason: 'A justification is required when overriding the plan status' },
      generalMessage: null,
    };
  }
  if (raw.includes('BCP_SIGNOFF_FORBIDDEN')) {
    return {
      fieldErrors: {},
      generalMessage: 'Only RMD, CRO or Admin users can sign off a continuity plan.',
    };
  }


  for (const [col, field] of Object.entries(COLUMN_TO_FIELD)) {
    if (raw.includes(col)) {
      // Take first sentence of message for cleaner UI
      const friendly = raw
        .replace(new RegExp(`^${col}\\s*`), '')
        .replace(/^must /, 'Must ')
        .split(/\.|\(/)[0]
        .trim();
      fieldErrors[field] = friendly || raw;
    }
  }

  return {
    fieldErrors,
    generalMessage: Object.keys(fieldErrors).length === 0 ? raw : null,
  };
}
