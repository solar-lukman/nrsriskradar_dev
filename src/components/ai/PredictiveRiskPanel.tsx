import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Brain, 
  RefreshCw, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  ChevronDown, 
  ChevronRight,
  Lightbulb,
  Clock,
  Target,
  Sparkles,
  XCircle
} from 'lucide-react';
import { useAIPredictions } from '@/hooks/useAIPredictions';
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

const timeframeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  'immediate': { label: 'Immediate', icon: <AlertTriangle className="h-3 w-3" /> },
  'short-term': { label: '1-3 months', icon: <Clock className="h-3 w-3" /> },
  'medium-term': { label: '3-6 months', icon: <TrendingUp className="h-3 w-3" /> },
  'long-term': { label: '6+ months', icon: <Target className="h-3 w-3" /> },
};

export function PredictiveRiskPanel() {
  const { 
    predictions, 
    loading, 
    generating, 
    generateNewAnalysis, 
    acknowledgePrediction,
    dismissPrediction 
  } = useAIPredictions();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 80) return 'High Confidence';
    if (score >= 60) return 'Medium Confidence';
    return 'Low Confidence';
  };

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
            <Skeleton key={i} className="h-24 w-full" />
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
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                AI Risk Predictions
                <Sparkles className="h-4 w-4 text-yellow-500" />
              </CardTitle>
              <CardDescription>
                Emerging risks identified by AI analysis
              </CardDescription>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => generateNewAnalysis()}
            disabled={generating}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", generating && "animate-spin")} />
            {generating ? 'Analyzing...' : 'Refresh Analysis'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {predictions.length === 0 ? (
          <div className="text-center py-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Brain className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">No Active Predictions</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Generate a new AI analysis to identify emerging risks
            </p>
            <Button onClick={() => generateNewAnalysis()} disabled={generating}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Analysis
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {predictions.map((prediction) => {
                const isExpanded = expandedId === prediction.id;
                const timeframe = prediction.metadata?.timeframe || 'medium-term';
                const timeframeInfo = timeframeLabels[timeframe] || timeframeLabels['medium-term'];

                return (
                  <Collapsible
                    key={prediction.id}
                    open={isExpanded}
                    onOpenChange={() => setExpandedId(isExpanded ? null : prediction.id)}
                  >
                    <div className="rounded-lg border bg-card hover:shadow-md transition-shadow">
                      <CollapsibleTrigger className="w-full">
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 text-left">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge 
                                  variant="outline" 
                                  className={cn("text-xs", categoryColors[prediction.category])}
                                >
                                  {prediction.category}
                                </Badge>
                                <Badge variant="secondary" className="text-xs gap-1">
                                  {timeframeInfo.icon}
                                  {timeframeInfo.label}
                                </Badge>
                              </div>
                              <h4 className="font-medium text-sm mb-1">{prediction.title}</h4>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {prediction.description}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="text-right">
                                <div className={cn("text-lg font-bold", getConfidenceColor(prediction.confidence_score))}>
                                  {prediction.confidence_score}%
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {getConfidenceLabel(prediction.confidence_score)}
                                </div>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                          <div className="mt-3">
                            <Progress 
                              value={prediction.confidence_score} 
                              className="h-1.5"
                            />
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-4 pb-4 space-y-4 border-t pt-4">
                          {/* Risk Factors */}
                          {prediction.risk_factors.length > 0 && (
                            <div>
                              <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Risk Factors
                              </h5>
                              <ul className="space-y-1">
                                {prediction.risk_factors.map((factor, idx) => (
                                  <li key={idx} className="text-sm flex items-start gap-2">
                                    <span className="text-destructive mt-1">•</span>
                                    <span>{factor}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Recommended Actions */}
                          {prediction.recommended_actions.length > 0 && (
                            <div>
                              <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                <Lightbulb className="h-3 w-3" />
                                Recommended Actions
                              </h5>
                              <ul className="space-y-1">
                                {prediction.recommended_actions.map((action, idx) => (
                                  <li key={idx} className="text-sm flex items-start gap-2">
                                    <span className="text-primary mt-1">→</span>
                                    <span>{action}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                acknowledgePrediction(prediction.id);
                              }}
                              className="gap-1"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Acknowledge
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissPrediction(prediction.id);
                              }}
                              className="gap-1 text-muted-foreground"
                            >
                              <XCircle className="h-3 w-3" />
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
