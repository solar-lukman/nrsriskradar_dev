import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type RiskFromDB = {
  id: string;
  title: string;
  description: string;
  department: string | null;
  category: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  status: string;
  review_date: string | null;
  updated_at: string;
  mitigation_actions: any;
  owner?: { full_name: string | null } | null;
  assigned_to?: { full_name: string | null } | null;
  created_by_profile?: { full_name: string | null } | null;
};

export interface RiskData {
  id: string;
  title: string;
  description: string;
  department: string | null;
  owner: string;
  category: string;
  riskType: string;
  inherentLikelihood: number;
  inherentImpact: number;
  residualLikelihood: number;
  residualImpact: number;
  status: string;
  lastReviewed: string;
  mitigationActions: string[];
  treatmentStrategy: string | null;
  strategicObjective: string | null;
  reviewFrequency: string | null;
  flaggedForAudit: boolean;
  approvalStatus: string;
  // Raw fields needed by workflow components (kept snake_case for compatibility)
  approval_status?: string;
  submitted_by?: string | null;
  created_by?: string | null;
  current_reviewer_id?: string | null;
  risk_type?: string;
}

export function useRisks() {
  const [risks, setRisks] = useState<RiskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchRisks = async () => {
    if (!user) {
      setRisks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: risksData, error: risksError } = await supabase
        .from('risks')
        .select(`
          *,
          owner:owner_id(full_name),
          assigned_to:assigned_to_id(full_name),
          created_by_profile:created_by(full_name)
        `)
        .order('created_at', { ascending: false });

      if (risksError) {
        console.error('Error fetching risks:', risksError);
        setError(risksError.message);
        return;
      }

      // Transform database risks to match the component interface
      const transformedRisks: RiskData[] = (risksData || []).map((risk: any) => ({
        id: risk.id,
        title: risk.title,
        description: risk.description,
        department: risk.department || 'Unknown',
        owner: risk.owner?.full_name || risk.created_by_profile?.full_name || 'Unknown',
        category: risk.category,
        riskType: risk.risk_type || 'institutional',
        inherentLikelihood: risk.inherent_likelihood,
        inherentImpact: risk.inherent_impact,
        residualLikelihood: risk.residual_likelihood,
        residualImpact: risk.residual_impact,
        status: risk.status,
        lastReviewed: risk.review_date || risk.updated_at.split('T')[0],
        mitigationActions: Array.isArray(risk.mitigation_actions) 
              ? risk.mitigation_actions.map((action: any) => 
                  typeof action === 'string' ? action : action.description || action.action || 'Unknown action'
                )
              : [],
        treatmentStrategy: risk.treatment_strategy || null,
        strategicObjective: risk.strategic_objective || null,
        reviewFrequency: risk.review_frequency || null,
        flaggedForAudit: risk.flagged_for_audit || false,
        approvalStatus: risk.approval_status || 'Draft',
        approval_status: risk.approval_status || 'Draft',
        submitted_by: risk.submitted_by ?? null,
        created_by: risk.created_by ?? null,
        current_reviewer_id: risk.current_reviewer_id ?? null,
        risk_type: risk.risk_type || 'institutional',
      }));

      setRisks(transformedRisks);
    } catch (err) {
      console.error('Error in fetchRisks:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRisks();
  }, [user]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`risks-changes-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'risks'
        },
        () => {
          // Refetch risks when any change occurs
          fetchRisks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    risks,
    loading,
    error,
    refetch: fetchRisks
  };
}