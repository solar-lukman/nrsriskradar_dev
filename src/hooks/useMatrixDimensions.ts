import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type MatrixDimensions = { institutional: number; compliance: number };

const DEFAULT: MatrixDimensions = { institutional: 5, compliance: 5 };

const clamp = (n: any): 4 | 5 => {
  const v = Number(n);
  return v === 4 ? 4 : 5;
};

/**
 * Reads the configurable matrix dimensions per register type from system_settings.
 * Returns 4 or 5 only (clamped). Falls back to 5×5 on error.
 */
export function useMatrixDimensions() {
  const [dimensions, setDimensions] = useState<MatrixDimensions>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'matrix_dimensions')
      .maybeSingle();

    const raw = (data?.setting_value as any) ?? {};
    setDimensions({
      institutional: clamp(raw.institutional ?? 5),
      compliance: clamp(raw.compliance ?? 5),
    });
    setLoading(false);
  };

  useEffect(() => { refetch(); }, []);

  const sizeFor = (riskType: 'institutional' | 'compliance'): 4 | 5 =>
    clamp(dimensions[riskType]);

  return { dimensions, sizeFor, loading, refetch };
}
