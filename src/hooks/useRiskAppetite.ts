import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AppetiteConfig {
  id: string;
  category: string | null;
  risk_type: 'institutional' | 'compliance';
  taxpayer_segment: string | null;
  tolerance_level: string;
  threshold_score: number;
  escalation_action: 'notify' | 'escalate' | 'flag_audit';
  description: string | null;
  is_active: boolean;
}

export function useRiskAppetite() {
  const [configs, setConfigs] = useState<AppetiteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('risk_appetite_config')
      .select('*')
      .order('risk_type', { ascending: true })
      .order('threshold_score', { ascending: true });
    if (error) setError(error.message);
    else setConfigs((data || []) as AppetiteConfig[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  /** Find the most specific appetite rule for a given risk. */
  const resolveForRisk = useCallback(
    (risk: {
      risk_type?: string;
      category?: string | null;
      taxpayer_segment?: string | null;
    }): AppetiteConfig | null => {
      const rt = risk.risk_type;
      if (!rt) return null;
      const candidates = configs.filter(
        (c) =>
          c.is_active &&
          c.risk_type === rt &&
          (c.category === null || c.category === risk.category) &&
          (c.taxpayer_segment === null ||
            (risk.taxpayer_segment && c.taxpayer_segment === risk.taxpayer_segment))
      );
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => {
        const aSpec = (a.category ? 1 : 0) + (a.taxpayer_segment ? 1 : 0);
        const bSpec = (b.category ? 1 : 0) + (b.taxpayer_segment ? 1 : 0);
        if (aSpec !== bSpec) return bSpec - aSpec;
        return a.threshold_score - b.threshold_score;
      });
      return candidates[0];
    },
    [configs]
  );

  /**
   * Return ranked candidates for a risk along with the reason each
   * non-winning rule was not selected. Used to explain rule selection.
   */
  const rankCandidatesForRisk = useCallback(
    (risk: {
      risk_type?: string;
      category?: string | null;
      taxpayer_segment?: string | null;
    }): Array<{
      config: AppetiteConfig;
      specificity: number;
      isMatch: boolean;
      reason: string;
    }> => {
      const rt = risk.risk_type;
      if (!rt) return [];
      const sameType = configs.filter((c) => c.is_active && c.risk_type === rt);
      const ranked = sameType.map((c) => {
        const categoryOk = c.category === null || c.category === risk.category;
        const segmentOk =
          c.taxpayer_segment === null ||
          (!!risk.taxpayer_segment && c.taxpayer_segment === risk.taxpayer_segment);
        const specificity = (c.category ? 1 : 0) + (c.taxpayer_segment ? 1 : 0);
        const isMatch = categoryOk && segmentOk;
        let reason = 'Matches risk attributes';
        if (!categoryOk) {
          reason = `Category "${c.category}" doesn't match risk category "${
            risk.category ?? 'none'
          }"`;
        } else if (!segmentOk) {
          reason = `Segment "${c.taxpayer_segment}" doesn't match risk segment "${
            risk.taxpayer_segment ?? 'none'
          }"`;
        }
        return { config: c, specificity, isMatch, reason };
      });
      ranked.sort((a, b) => {
        if (a.isMatch !== b.isMatch) return a.isMatch ? -1 : 1;
        if (a.specificity !== b.specificity) return b.specificity - a.specificity;
        return a.config.threshold_score - b.config.threshold_score;
      });
      return ranked;
    },
    [configs]
  );

  return {
    configs,
    loading,
    error,
    refetch: fetchConfigs,
    resolveForRisk,
    rankCandidatesForRisk,
  };
}
