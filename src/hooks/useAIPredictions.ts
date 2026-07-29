import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AIPrediction {
  id: string;
  prediction_type: string;
  category: string;
  title: string;
  description: string;
  confidence_score: number;
  risk_factors: string[];
  recommended_actions: string[];
  data_sources: string[];
  generated_at: string;
  expires_at: string;
  status: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  converted_risk_id: string | null;
  metadata: {
    timeframe?: string;
    analysis_context?: {
      total_risks: number;
      high_risk_count: number;
    };
  };
  created_at: string;
  updated_at: string;
}

interface GenerateAnalysisResponse {
  success: boolean;
  predictions: AIPrediction[];
  analysis_summary: string;
  context: {
    total_risks_analyzed: number;
    categories_covered: number;
    generated_at: string;
  };
  error?: string;
  code?: string;
}

export function useAIPredictions() {
  const [predictions, setPredictions] = useState<AIPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Note: predictions table may have evolved schema; cast to bypass strict types
      const { data, error: fetchError } = await (supabase
        .from('ai_predictions') as any)
        .select('*')
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString())
        .order('confidence_score', { ascending: false });

      if (fetchError) {
        console.error('Error fetching predictions:', fetchError);
        setPredictions([]);
        return;
      }

      // Transform data to match our interface
      const transformedData: AIPrediction[] = (data || []).map((item: any) => ({
        ...item,
        risk_factors: Array.isArray(item.risk_factors) ? item.risk_factors : [],
        recommended_actions: Array.isArray(item.recommended_actions) ? item.recommended_actions : [],
        data_sources: Array.isArray(item.data_sources) ? item.data_sources : [],
        metadata: typeof item.metadata === 'object' ? item.metadata : {}
      }));

      setPredictions(transformedData);
    } catch (err) {
      console.error('Failed to fetch predictions:', err);
      setError('Failed to load AI predictions');
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  const generateNewAnalysis = async (): Promise<GenerateAnalysisResponse | null> => {
    try {
      setGenerating(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('You must be logged in to generate AI analysis');
      }

      const response = await supabase.functions.invoke('risk-ai-analysis', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (response.error) {
        console.error('Edge function error:', response.error);
        throw new Error(response.error.message || 'Failed to generate analysis');
      }

      const result = response.data as GenerateAnalysisResponse;

      if (!result.success) {
        if (result.code === 'RATE_LIMIT') {
          toast({
            title: "Rate Limited",
            description: "AI service is busy. Please try again in a moment.",
            variant: "destructive"
          });
        } else if (result.code === 'PAYMENT_REQUIRED') {
          toast({
            title: "Credits Exhausted",
            description: "AI credits have been used up. Please add credits to continue.",
            variant: "destructive"
          });
        }
        throw new Error(result.error || 'Analysis generation failed');
      }

      toast({
        title: "Analysis Complete",
        description: `Generated ${result.predictions.length} risk predictions based on your data.`,
      });

      // Refresh predictions list
      await fetchPredictions();

      return result;
    } catch (err) {
      console.error('Failed to generate analysis:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate AI analysis';
      setError(errorMessage);
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const acknowledgePrediction = async (predictionId: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error: updateError } = await (supabase
        .from('ai_predictions') as any)
        .update({
          status: 'acknowledged',
          acknowledged_by: userData.user?.id,
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', predictionId);

      if (updateError) throw updateError;

      toast({
        title: "Prediction Acknowledged",
        description: "The prediction has been marked as reviewed."
      });

      await fetchPredictions();
    } catch (err) {
      console.error('Failed to acknowledge prediction:', err);
      toast({
        title: "Error",
        description: "Failed to acknowledge prediction",
        variant: "destructive"
      });
    }
  };

  const dismissPrediction = async (predictionId: string) => {
    try {
      const { error: updateError } = await (supabase
        .from('ai_predictions') as any)
        .update({ status: 'dismissed' })
        .eq('id', predictionId);

      if (updateError) throw updateError;

      toast({
        title: "Prediction Dismissed",
        description: "The prediction has been dismissed."
      });

      await fetchPredictions();
    } catch (err) {
      console.error('Failed to dismiss prediction:', err);
      toast({
        title: "Error",
        description: "Failed to dismiss prediction",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, []);

  return {
    predictions,
    loading,
    generating,
    error,
    generateNewAnalysis,
    acknowledgePrediction,
    dismissPrediction,
    refetch: fetchPredictions
  };
}
