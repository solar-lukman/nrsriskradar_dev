import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Department {
  id: string;
  name: string;
  is_active: boolean;
}

export function useDepartments(activeOnly = true) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let q = supabase.from('departments').select('id, name, is_active').order('name');
      if (activeOnly) q = q.eq('is_active', true);
      const { data } = await q;
      if (mounted) {
        setDepartments((data || []) as Department[]);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [activeOnly]);

  return { departments, loading };
}
