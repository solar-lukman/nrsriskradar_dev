import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Brain, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';

interface BatchAIAnalysisButtonProps {
  risks: { id: string }[];
  onComplete: () => void;
}

export function BatchAIAnalysisButton({ risks, onComplete }: BatchAIAnalysisButtonProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const { toast } = useToast();

  const handleBatchAnalysis = async () => {
    if (risks.length === 0) {
      toast({ title: 'No Risks', description: 'No risks available to analyze.', variant: 'destructive' });
      return;
    }

    try {
      setAnalyzing(true);
      setProgress(10);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('You must be logged in');
      }

      setProgress(20);

      // Send all risk IDs for batch analysis
      const riskIds = risks.map(r => r.id);
      
      const response = await supabase.functions.invoke('risk-scoring-engine', {
        body: { riskIds, analyzeAll: riskIds.length === 0 },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      setProgress(80);

      if (response.error) throw response.error;

      const result = response.data;
      
      if (result.success) {
        setAnalyzedCount(result.analyzedCount || 0);
        setProgress(100);
        
        toast({
          title: 'Batch Analysis Complete',
          description: `Successfully analyzed ${result.analyzedCount} risk(s). AI score recommendations are now available.`,
        });

        onComplete();
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('Batch analysis error:', err);
      toast({
        title: 'Analysis Failed',
        description: err instanceof Error ? err.message : 'Failed to run batch analysis',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
      setProgress(0);
      setAnalyzedCount(0);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={analyzing}>
          {analyzing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Brain className="w-4 h-4 mr-2" />
          )}
          {analyzing ? 'Analyzing...' : 'AI Analysis'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run AI Analysis on All Risks</AlertDialogTitle>
          <AlertDialogDescription>
            This will analyze {risks.length} risk(s) using AI to generate score recommendations based on controls, assessment history, and category benchmarks.
            {risks.length > 20 && (
              <span className="block mt-2 text-primary font-medium">
                Note: Large batches may take a few minutes to complete.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {analyzing && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              {progress < 80 ? 'Analyzing risks...' : `Completed ${analyzedCount} risk(s)`}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={analyzing}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleBatchAnalysis} disabled={analyzing}>
            {analyzing ? 'Running...' : `Analyze ${risks.length} Risk(s)`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
