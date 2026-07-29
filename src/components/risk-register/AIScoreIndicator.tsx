import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Brain, Check, X, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AIScoreIndicatorProps {
  riskId: string;
  currentLikelihood: number;
  currentImpact: number;
  aiRecommendedLikelihood: number | null;
  aiRecommendedImpact: number | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  aiStatus: string | null;
  onScoreApplied: () => void;
}

export function AIScoreIndicator({
  riskId,
  currentLikelihood,
  currentImpact,
  aiRecommendedLikelihood,
  aiRecommendedImpact,
  aiConfidence,
  aiReasoning,
  aiStatus,
  onScoreApplied
}: AIScoreIndicatorProps) {
  const [applying, setApplying] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const { toast } = useToast();

  const hasRecommendation = aiStatus === 'pending' && 
    aiRecommendedLikelihood !== null && 
    aiRecommendedImpact !== null;

  const currentScore = currentLikelihood * currentImpact;
  const recommendedScore = hasRecommendation ? aiRecommendedLikelihood! * aiRecommendedImpact! : 0;
  const scoreDiff = recommendedScore - currentScore;

  const handleAnalyze = async () => {
    try {
      setAnalyzing(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('You must be logged in');
      }

      const response = await supabase.functions.invoke('risk-scoring-engine', {
        body: { riskIds: [riskId] },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (response.error) throw response.error;

      toast({
        title: "Analysis Complete",
        description: "AI score recommendation generated."
      });

      onScoreApplied();
    } catch (err) {
      console.error('Error analyzing risk:', err);
      toast({
        title: "Error",
        description: "Failed to analyze risk",
        variant: "destructive"
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = async () => {
    try {
      setApplying(true);
      
      const { error } = await supabase
        .from('risks')
        .update({
          residual_likelihood: aiRecommendedLikelihood,
          residual_impact: aiRecommendedImpact,
          ai_score_status: 'applied'
        })
        .eq('id', riskId);

      if (error) throw error;

      toast({
        title: "Score Applied",
        description: "AI-recommended scores have been applied to this risk."
      });

      onScoreApplied();
    } catch (err) {
      console.error('Error applying AI score:', err);
      toast({
        title: "Error",
        description: "Failed to apply AI score recommendation",
        variant: "destructive"
      });
    } finally {
      setApplying(false);
    }
  };

  const handleDismiss = async () => {
    try {
      setDismissing(true);
      
      const { error } = await supabase
        .from('risks')
        .update({ ai_score_status: 'dismissed' })
        .eq('id', riskId);

      if (error) throw error;

      toast({
        title: "Dismissed",
        description: "AI recommendation has been dismissed."
      });

      onScoreApplied();
    } catch (err) {
      console.error('Error dismissing AI score:', err);
      toast({
        title: "Error",
        description: "Failed to dismiss recommendation",
        variant: "destructive"
      });
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`h-7 px-2 gap-1 ${hasRecommendation ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
        >
          <Sparkles className="w-3 h-3" />
          <span className="text-xs">AI</span>
          {hasRecommendation && <span className="w-1.5 h-1.5 bg-primary rounded-full" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">AI Score Analysis</span>
          </div>

          {!hasRecommendation ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {aiStatus === 'applied' 
                  ? 'AI recommendation was applied to this risk.'
                  : aiStatus === 'dismissed'
                  ? 'AI recommendation was dismissed.'
                  : 'No AI recommendation available. Run analysis to get score suggestions.'}
              </p>
              <Button 
                size="sm" 
                className="w-full"
                onClick={handleAnalyze}
                disabled={analyzing}
              >
                {analyzing ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Current</p>
                  <Badge variant="outline">
                    L:{currentLikelihood} × I:{currentImpact} = {currentScore}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Recommended</p>
                  <Badge variant="default" className="bg-primary">
                    L:{aiRecommendedLikelihood} × I:{aiRecommendedImpact} = {recommendedScore}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Score change:</span>
                <span className={scoreDiff > 0 ? 'text-destructive' : scoreDiff < 0 ? 'text-green-600' : 'text-muted-foreground'}>
                  {scoreDiff > 0 ? '+' : ''}{scoreDiff}
                </span>
              </div>

              {aiConfidence && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Confidence:</span>
                  <span className="font-medium">{aiConfidence}%</span>
                </div>
              )}

              {aiReasoning && (
                <p className="text-xs text-muted-foreground border-t pt-2">
                  {aiReasoning.length > 150 ? aiReasoning.slice(0, 150) + '...' : aiReasoning}
                </p>
              )}

              <div className="flex gap-2 pt-2 border-t">
                <Button 
                  size="sm" 
                  className="flex-1"
                  onClick={handleApply}
                  disabled={applying || dismissing}
                >
                  {applying ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      Apply
                    </>
                  )}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleDismiss}
                  disabled={applying || dismissing}
                >
                  {dismissing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <X className="w-3 h-3 mr-1" />
                      Dismiss
                    </>
                  )}
                </Button>
              </div>

              <Button 
                size="sm" 
                variant="ghost"
                className="w-full text-xs"
                onClick={handleAnalyze}
                disabled={analyzing}
              >
                {analyzing ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                Re-analyze
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
