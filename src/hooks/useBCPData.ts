import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type BCP = Tables<'business_continuity_plans'>;

export function useBCPData() {
  const [bcpData, setBcpData] = useState({
    totalPlans: 0,
    readyPlans: 0,
    coverage: 0,
    lastUpdated: null as Date | null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBCPData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('business_continuity_plans')
        .select('status, last_updated_date');

      if (error) throw error;

      const totalPlans = data?.length || 0;
      const readyPlans = data?.filter(plan => plan.status === 'Ready').length || 0;
      const coverage = totalPlans > 0 ? Math.round((readyPlans / totalPlans) * 100) : 0;
      
      // Find most recent update
      const lastUpdated = data?.reduce((latest, plan) => {
        const planDate = new Date(plan.last_updated_date);
        return !latest || planDate > latest ? planDate : latest;
      }, null as Date | null);

      setBcpData({
        totalPlans,
        readyPlans,
        coverage,
        lastUpdated,
      });
    } catch (err) {
      console.error('Error fetching BCP data:', err);
      setError('Failed to load BCP data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBCPData();

    // Set up real-time subscription with unique channel name to avoid HMR/StrictMode collisions
    const channel = supabase
      .channel(`bcp-changes-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'business_continuity_plans'
      }, () => {
        console.log('BCP data changed, refetching...');
        fetchBCPData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { bcpData, loading, error, refetch: fetchBCPData };
}