import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RiskWithAIScore {
  id: string;
  title: string;
  category: string;
  residual_likelihood: number;
  residual_impact: number;
  ai_recommended_likelihood: number | null;
  ai_recommended_impact: number | null;
  ai_score_reasoning: string | null;
  ai_confidence: number | null;
  ai_score_generated_at: string | null;
  ai_score_status: string | null;
}

interface ScoringResult {
  riskId: string;
  riskTitle: string;
  currentScore: number;
  recommendedLikelihood: number;
  recommendedImpact: number;
  recommendedScore: number;
  confidence: number;
  reasoning: string;
  keyFactors: string[];
  improvementSuggestions: string[];
}

export function useAIScoring() {
  const [risksWithPendingScores, setRisksWithPendingScores] = useState<RiskWithAIScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRisksWithPendingScores = async () => {
    try {
      setLoading(true);
      setError(null);

      // Columns now live in the risks table (added via migration 20260421).
      const { data, error: fetchError } = await supabase
        .from('risks')
        .select('id, title, category, residual_likelihood, residual_impact, ai_recommended_likelihood, ai_recommended_impact, ai_score_reasoning, ai_confidence, ai_score_generated_at, ai_score_status')
        .eq('ai_score_status', 'pending')
        .order('ai_confidence', { ascending: false });

      if (fetchError) {
        console.error('Error fetching risks with AI scores:', fetchError);
        // Don't throw — just return empty so UI doesn't crash if columns are missing
        setRisksWithPendingScores([]);
        return;
      }

      setRisksWithPendingScores((data || []) as RiskWithAIScore[]);
    } catch (err) {
      console.error('Failed to fetch risks with AI scores:', err);
      setError('Failed to load AI scoring recommendations');
      setRisksWithPendingScores([]);
    } finally {
      setLoading(false);
    }
  };

  const analyzeRiskScores = async (riskId?: string): Promise<ScoringResult[] | null> => {
    try {
      setAnalyzing(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('You must be logged in to analyze risk scores');
      }

      const response = await supabase.functions.invoke('risk-scoring-engine', {
        body: { riskId },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (response.error) {
        console.error('Edge function error:', response.error);
        throw new Error(response.error.message || 'Failed to analyze risk scores');
      }

      const result = response.data;

      if (!result.success) {
        if (result.code === 'RATE_LIMIT') {
          toast({
            title: "Rate Limited",
            description: "AI service is busy. Please try again in a moment.",
            variant: "destructive"
          });
        }
        throw new Error(result.error || 'Score analysis failed');
      }

      toast({
        title: "Analysis Complete",
        description: `Generated scoring recommendations for ${result.analyzedCount} risk(s).`,
      });

      await fetchRisksWithPendingScores();

      return result.results;
    } catch (err) {
      console.error('Failed to analyze risk scores:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze risk scores';
      setError(errorMessage);
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setAnalyzing(false);
    }
  };

  const applyRecommendation = async (riskId: string) => {
    try {
      // Get current recommendation
      const risk = risksWithPendingScores.find(r => r.id === riskId);
      if (!risk || !risk.ai_recommended_likelihood || !risk.ai_recommended_impact) {
        throw new Error('No recommendation to apply');
      }

      const { error: updateError } = await supabase
        .from('risks')
        .update({
          residual_likelihood: risk.ai_recommended_likelihood,
          residual_impact: risk.ai_recommended_impact,
          ai_score_status: 'applied'
        })
        .eq('id', riskId);

      if (updateError) throw updateError;

      toast({
        title: "Recommendation Applied",
        description: "Risk scores have been updated with AI recommendations."
      });

      await fetchRisksWithPendingScores();
    } catch (err) {
      console.error('Failed to apply recommendation:', err);
      toast({
        title: "Error",
        description: "Failed to apply AI recommendation",
        variant: "destructive"
      });
    }
  };

  const dismissRecommendation = async (riskId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('risks')
        .update({ ai_score_status: 'dismissed' })
        .eq('id', riskId);

      if (updateError) throw updateError;

      toast({
        title: "Recommendation Dismissed",
        description: "The AI scoring recommendation has been dismissed."
      });

      await fetchRisksWithPendingScores();
    } catch (err) {
      console.error('Failed to dismiss recommendation:', err);
      toast({
        title: "Error",
        description: "Failed to dismiss recommendation",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchRisksWithPendingScores();
  }, []);

  return {
    risksWithPendingScores,
    loading,
    analyzing,
    error,
    analyzeRiskScores,
    applyRecommendation,
    dismissRecommendation,
    refetch: fetchRisksWithPendingScores,
    pendingCount: risksWithPendingScores.length
  };
}
