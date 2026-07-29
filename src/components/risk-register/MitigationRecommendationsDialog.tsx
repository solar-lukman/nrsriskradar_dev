import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Lightbulb,
  Shield,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useMitigationRecommendations, MitigationResult } from '@/hooks/useMitigationRecommendations';

interface MitigationRecommendationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskId: string;
  riskTitle: string;
}

export function MitigationRecommendationsDialog({
  open,
  onOpenChange,
  riskId,
  riskTitle
}: MitigationRecommendationsDialogProps) {
  const { loading, error, recommendations, generateRecommendations, clearRecommendations } = useMitigationRecommendations();

  React.useEffect(() => {
    if (open && !recommendations && !loading) {
      generateRecommendations(riskId);
    }
  }, [open, riskId]);

  React.useEffect(() => {
    if (!open) {
      clearRecommendations();
    }
  }, [open]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'preventive': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'detective': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
      case 'corrective': return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'compensating': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getCostIcon = (cost: string) => {
    switch (cost) {
      case 'low': return '₦';
      case 'medium': return '₦₦';
      case 'high': return '₦₦₦';
      default: return '₦';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Mitigation Recommendations
          </DialogTitle>
          <DialogDescription>
            AI-generated strategies for: {riskTitle}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground">Analyzing risk and generating recommendations...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-8">
            <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-destructive font-medium mb-2">Failed to generate recommendations</p>
            <p className="text-muted-foreground text-sm mb-4">{error}</p>
            <Button onClick={() => generateRecommendations(riskId)} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {recommendations && (
          <ScrollArea className="h-[65vh] pr-4">
            <div className="space-y-6">
              {/* Summary */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-primary mb-1">Executive Summary</p>
                      <p className="text-sm">{recommendations.recommendations.summary}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Strategies */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4" />
                  Mitigation Strategies ({recommendations.recommendations.strategies.length})
                </h3>
                <div className="space-y-3">
                  {recommendations.recommendations.strategies.map((strategy, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium">{strategy.title}</h4>
                          <div className="flex gap-2">
                            <Badge variant={getPriorityColor(strategy.priority) as any}>
                              {strategy.priority}
                            </Badge>
                            <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(strategy.type)}`}>
                              {strategy.type}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{strategy.description}</p>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Cost: {getCostIcon(strategy.estimatedCost)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {strategy.implementationTime}
                          </span>
                          <span className="flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            Impact: {strategy.expectedImpactReduction}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Suggested Controls */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4" />
                  Suggested Controls ({recommendations.recommendations.controls.length})
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {recommendations.recommendations.controls.map((control, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm">{control.name}</h4>
                          <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(control.type)}`}>
                            {control.type}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{control.description}</p>
                        <p className="text-xs"><span className="font-medium">Frequency:</span> {control.frequency}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Separator />

              {/* KPIs */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4" />
                  Key Performance Indicators
                </h3>
                <div className="grid gap-3 md:grid-cols-3">
                  {recommendations.recommendations.kpis.map((kpi, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <h4 className="font-medium text-sm mb-1">{kpi.name}</h4>
                        <p className="text-xs text-muted-foreground mb-2">{kpi.description}</p>
                        <Badge variant="outline">Target: {kpi.target}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Best Practices & Warnings */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-green-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      Best Practices
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {recommendations.recommendations.bestPractices.map((practice, index) => (
                        <li key={index} className="text-sm flex items-start gap-2">
                          <CheckCircle className="w-3 h-3 text-green-500 mt-1 flex-shrink-0" />
                          {practice}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-amber-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      Warnings & Pitfalls
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {recommendations.recommendations.warnings.map((warning, index) => (
                        <li key={index} className="text-sm flex items-start gap-2">
                          <AlertTriangle className="w-3 h-3 text-amber-500 mt-1 flex-shrink-0" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Footer */}
              <div className="text-xs text-muted-foreground text-center pt-4 border-t">
                Generated at {new Date(recommendations.generatedAt).toLocaleString()} • 
                Risk Level: {recommendations.currentRiskLevel} • 
                Category: {recommendations.riskCategory}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
