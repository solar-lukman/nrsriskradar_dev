import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;
type RiskStatus = Enums<'risk_status'>;

interface UseRealtimeRisksProps {
  filters?: {
    startDate?: Date;
    endDate?: Date;
    department?: string;
    owner?: string;
    search?: string;
    status?: string;
    severity?: string;
    overdue?: boolean;
  };
}

export function useRealtimeRisks({ filters = {} }: UseRealtimeRisksProps = {}) {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRisks = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase.from('risks').select('*');

      // Apply filters
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }
      if (filters.department) {
        query = query.eq('department', filters.department);
      }
      if (filters.owner) {
        query = query.eq('owner_id', filters.owner);
      }
      const validStatuses: RiskStatus[] = [
        'New', 'In Review', 'Mitigated', 'Escalated',
        'Crystallized', 'Draft', 'Submitted', 'Approved',
      ] as RiskStatus[];
      if (filters.status && (validStatuses as string[]).includes(filters.status)) {
        query = query.eq('status', filters.status as RiskStatus);
      }
      if (filters.search) {
        // Escape characters that have special meaning in PostgREST `or()` filter syntax
        const safe = filters.search.trim().replace(/[,()*%]/g, ' ');
        if (safe) {
          query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      let result = data || [];

      // Severity is computed client-side from residual score (fallback to inherent)
      if (filters.severity) {
        result = result.filter((risk: any) => {
          const rL = risk.residual_likelihood ?? risk.inherent_likelihood ?? 0;
          const rI = risk.residual_impact ?? risk.inherent_impact ?? 0;
          const score = rL * rI;
          switch (filters.severity) {
            case 'high': return score >= 15;
            case 'medium': return score >= 10 && score < 15;
            case 'low': return score < 10;
            default: return true;
          }
        });
      }

      if (filters.overdue) {
        const now = Date.now();
        result = result.filter((risk: any) =>
          risk.review_date && new Date(risk.review_date).getTime() < now
        );
      }

      setRisks(result);
    } catch (err) {
      console.error('Error fetching risks:', err);
      setError('Failed to load risks data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRisks();
  }, [
    filters.startDate,
    filters.endDate,
    filters.department,
    filters.owner,
    filters.search,
    filters.status,
    filters.severity,
    filters.overdue,
  ]);

  useEffect(() => {
    // Set up real-time subscription
    const channel = supabase
      .channel(`risks-changes-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'risks'
      }, () => {
        console.log('Risk data changed, refetching...');
        fetchRisks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const refetch = () => fetchRisks();

  return {
    risks,
    loading,
    error,
    refetch
  };
}