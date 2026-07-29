import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Calculator, 
  RefreshCw, 
  TrendingDown, 
  TrendingUp,
  Check, 
  X,
  ChevronDown, 
  ChevronRight,
  Sparkles,
  ArrowRight,
  Info
} from 'lucide-react';
import { useAIScoring } from '@/hooks/useAIScoring';
import { cn } from '@/lib/utils';

const categoryColors: Record<string, string> = {
  'Strategic': 'bg-purple-500/10 text-purple-600 border-purple-200',
  'Operational': 'bg-blue-500/10 text-blue-600 border-blue-200',
  'Financial': 'bg-green-500/10 text-green-600 border-green-200',
  'Compliance': 'bg-orange-500/10 text-orange-600 border-orange-200',
  'Technology': 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
  'Reputational': 'bg-pink-500/10 text-pink-600 border-pink-200',
  'Environmental': 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
  'Human Resources': 'bg-amber-500/10 text-amber-600 border-amber-200',
};

function getScoreColor(score: number): string {
  if (score >= 15) return 'text-destructive';
  if (score >= 10) return 'text-warning';
  return 'text-success';
}

function getScoreLabel(score: number): string {
  if (score >= 15) return 'High';
  if (score >= 10) return 'Medium';
  return 'Low';
}

export function AIRiskScoreCard() {
  const { 
    risksWithPendingScores, 
    loading, 
    analyzing, 
    analyzeRiskScores, 
    applyRecommendation,
    dismissRecommendation,
    pendingCount
  } = useAIScoring();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                AI Score Recommendations
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {pendingCount} pending
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Intelligent scoring based on controls & trends
              </CardDescription>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => analyzeRiskScores()}
            disabled={analyzing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", analyzing && "animate-spin")} />
            {analyzing ? 'Analyzing...' : 'Analyze Risks'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {risksWithPendingScores.length === 0 ? (
          <div className="text-center py-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Calculator className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">No Pending Recommendations</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Run analysis to get AI-powered scoring recommendations
            </p>
            <Button onClick={() => analyzeRiskScores()} disabled={analyzing}>
              <Sparkles className="h-4 w-4 mr-2" />
              Analyze Risk Scores
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[350px] pr-4">
            <div className="space-y-3">
              {risksWithPendingScores.map((risk) => {
                const isExpanded = expandedId === risk.id;
                const currentScore = risk.residual_likelihood * risk.residual_impact;
                const recommendedScore = (risk.ai_recommended_likelihood || 0) * (risk.ai_recommended_impact || 0);
                const scoreDiff = currentScore - recommendedScore;
                const isReduction = scoreDiff > 0;

                return (
                  <Collapsible
                    key={risk.id}
                    open={isExpanded}
                    onOpenChange={() => setExpandedId(isExpanded ? null : risk.id)}
                  >
                    <div className="rounded-lg border bg-card hover:shadow-md transition-shadow">
                      <CollapsibleTrigger className="w-full">
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 text-left">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge 
                                  variant="outline" 
                                  className={cn("text-xs", categoryColors[risk.category])}
                                >
                                  {risk.category}
                                </Badge>
                                {risk.ai_confidence && (
                                  <Badge variant="secondary" className="text-xs">
                                    {risk.ai_confidence}% confidence
                                  </Badge>
                                )}
                              </div>
                              <h4 className="font-medium text-sm mb-2">{risk.title}</h4>
                              
                              {/* Score Comparison */}
                              <div className="flex items-center gap-3 text-sm">
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Current:</span>
                                  <span className={cn("font-bold", getScoreColor(currentScore))}>
                                    {currentScore}
                                  </span>
                                  <Badge variant="outline" className="text-xs ml-1">
                                    {getScoreLabel(currentScore)}
                                  </Badge>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">AI:</span>
                                  <span className={cn("font-bold", getScoreColor(recommendedScore))}>
                                    {recommendedScore}
                                  </span>
                                  <Badge variant="outline" className="text-xs ml-1">
                                    {getScoreLabel(recommendedScore)}
                                  </Badge>
                                </div>
                                {scoreDiff !== 0 && (
                                  <div className={cn(
                                    "flex items-center gap-1 text-xs font-medium",
                                    isReduction ? "text-success" : "text-destructive"
                                  )}>
                                    {isReduction ? (
                                      <TrendingDown className="h-3 w-3" />
                                    ) : (
                                      <TrendingUp className="h-3 w-3" />
                                    )}
                                    {isReduction ? '-' : '+'}{Math.abs(scoreDiff)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-4 pb-4 space-y-4 border-t pt-4">
                          {/* Score Details */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="space-y-2">
                              <div className="text-muted-foreground font-medium">Current Scores</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-muted/50 rounded p-2 text-center">
                                  <div className="text-xs text-muted-foreground">Likelihood</div>
                                  <div className="font-bold">{risk.residual_likelihood}</div>
                                </div>
                                <div className="bg-muted/50 rounded p-2 text-center">
                                  <div className="text-xs text-muted-foreground">Impact</div>
                                  <div className="font-bold">{risk.residual_impact}</div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-muted-foreground font-medium">AI Recommended</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-primary/10 rounded p-2 text-center">
                                  <div className="text-xs text-muted-foreground">Likelihood</div>
                                  <div className="font-bold text-primary">{risk.ai_recommended_likelihood}</div>
                                </div>
                                <div className="bg-primary/10 rounded p-2 text-center">
                                  <div className="text-xs text-muted-foreground">Impact</div>
                                  <div className="font-bold text-primary">{risk.ai_recommended_impact}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Reasoning */}
                          {risk.ai_score_reasoning && (
                            <div>
                              <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                AI Reasoning
                              </h5>
                              <p className="text-sm bg-muted/30 rounded p-3">
                                {risk.ai_score_reasoning}
                              </p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-2">
                            <Button 
                              size="sm" 
                              onClick={(e) => {
                                e.stopPropagation();
                                applyRecommendation(risk.id);
                              }}
                              className="gap-1"
                            >
                              <Check className="h-3 w-3" />
                              Apply Scores
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissRecommendation(risk.id);
                              }}
                              className="gap-1 text-muted-foreground"
                            >
                              <X className="h-3 w-3" />
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
