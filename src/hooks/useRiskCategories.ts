import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type RiskCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  display_order: number | null;
  is_active: boolean;
  risk_type: 'institutional' | 'compliance';
};

/**
 * Loads risk categories from the database (single source of truth).
 * `riskType` filters by register; `activeOnly` (default true) restricts to enabled rows.
 */
export function useRiskCategories(opts?: {
  riskType?: 'institutional' | 'compliance';
  activeOnly?: boolean;
}) {
  const { riskType, activeOnly = true } = opts || {};
  const [categories, setCategories] = useState<RiskCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('risk_categories')
        .select('*')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (activeOnly) query = query.eq('is_active', true);
      if (riskType) query = query.eq('risk_type', riskType);

      const { data, error: err } = await query;
      if (err) throw err;
      setCategories((data || []) as RiskCategoryRow[]);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load risk categories');
    } finally {
      setLoading(false);
    }
  }, [riskType, activeOnly]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  return { categories, loading, error, refetch: fetchCategories };
}
