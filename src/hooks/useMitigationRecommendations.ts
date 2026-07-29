import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MitigationStrategy {
  title: string;
  description: string;
  type: 'preventive' | 'detective' | 'corrective' | 'compensating';
  priority: 'high' | 'medium' | 'low';
  estimatedCost: 'low' | 'medium' | 'high';
  implementationTime: 'immediate' | 'short-term' | 'medium-term' | 'long-term';
  expectedImpactReduction: string;
}

interface SuggestedControl {
  name: string;
  description: string;
  type: 'preventive' | 'detective' | 'corrective';
  frequency: string;
}

interface KPI {
  name: string;
  description: string;
  target: string;
}

export interface MitigationRecommendations {
  summary: string;
  strategies: MitigationStrategy[];
  controls: SuggestedControl[];
  kpis: KPI[];
  bestPractices: string[];
  warnings: string[];
}

export interface MitigationResult {
  success: boolean;
  riskId: string;
  riskTitle: string;
  riskCategory: string;
  currentRiskLevel: string;
  recommendations: MitigationRecommendations;
  generatedAt: string;
}

export function useMitigationRecommendations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<MitigationResult | null>(null);
  const { toast } = useToast();

  const generateRecommendations = async (riskId: string): Promise<MitigationResult | null> => {
    try {
      setLoading(true);
      setError(null);
      setRecommendations(null);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('You must be logged in to generate recommendations');
      }

      const response = await supabase.functions.invoke('mitigation-recommender', {
        body: { riskId },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (response.error) {
        console.error('Edge function error:', response.error);
        throw new Error(response.error.message || 'Failed to generate recommendations');
      }

      const result = response.data as MitigationResult;

      if (!result.success) {
        if ((result as any).code === 'RATE_LIMIT') {
          toast({
            title: "Rate Limited",
            description: "AI service is busy. Please try again in a moment.",
            variant: "destructive"
          });
        }
        throw new Error((result as any).error || 'Recommendation generation failed');
      }

      setRecommendations(result);

      toast({
        title: "Recommendations Generated",
        description: `AI mitigation recommendations ready for "${result.riskTitle}"`,
      });

      return result;
    } catch (err) {
      console.error('Failed to generate recommendations:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate recommendations';
      setError(errorMessage);
      toast({
        title: "Generation Failed",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const clearRecommendations = () => {
    setRecommendations(null);
    setError(null);
  };

  return {
    loading,
    error,
    recommendations,
    generateRecommendations,
    clearRecommendations
  };
}
