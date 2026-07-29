import React, { useMemo, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, TrendingUp, TrendingDown } from 'lucide-react';

interface Risk {
  id: string;
  title: string;
  description: string;
  department: string;
  owner: string;
  category: string;
  inherentLikelihood: number;
  inherentImpact: number;
  residualLikelihood: number;
  residualImpact: number;
  status: string;
  lastReviewed: string;
  mitigationActions: string[];
}

interface RiskHeatmapProps {
  risks: Risk[];
  riskType: 'inherent' | 'residual';
  /** Matrix dimension (4 or 5). Defaults to 5 for backward compatibility. */
  dimensions?: 4 | 5;
  onRiskClick?: (risk: Risk) => void;
}

export function RiskHeatmap({ risks, riskType, dimensions = 5, onRiskClick }: RiskHeatmapProps) {
  const [selectedCell, setSelectedCell] = useState<{ likelihood: number; impact: number; risks: Risk[] } | null>(null);
  const [showCellDialog, setShowCellDialog] = useState(false);

  const N = dimensions; // matrix size
  const maxScore = N * N;

  // Create an NxN matrix for the heatmap
  const matrix = useMemo(() => {
    const grid = Array(N).fill(null).map(() => Array(N).fill(null).map(() => ({ risks: [] as Risk[], count: 0 })));

    risks.forEach(risk => {
      // Clamp likelihood/impact into the configured matrix size
      const rawL = riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood;
      const rawI = riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact;
      const likelihood = Math.min(N, Math.max(1, rawL));
      const impact = Math.min(N, Math.max(1, rawI));

      const likelihoodIndex = likelihood - 1;
      const impactIndex = impact - 1;

      grid[N - 1 - impactIndex][likelihoodIndex].risks.push(risk);
      grid[N - 1 - impactIndex][likelihoodIndex].count++;
    });

    return grid;
  }, [risks, riskType, N]);

  // Threshold buckets scale with matrix size:
  // critical >= 80% of max, high >= 60%, medium >= 32%, else low
  const getRiskColor = (likelihood: number, impact: number) => {
    const score = likelihood * impact;
    const pct = score / maxScore;
    if (pct >= 0.8) return 'bg-destructive';
    if (pct >= 0.6) return 'bg-warning';
    if (pct >= 0.32) return 'bg-primary';
    return 'bg-success';
  };

  const getIntensity = (count: number) => {
    if (count === 0) return 'opacity-20';
    if (count === 1) return 'opacity-60';
    if (count === 2) return 'opacity-80';
    return 'opacity-100';
  };

  const getTrendIndicator = (risk: Risk) => {
    const inherentScore = risk.inherentLikelihood * risk.inherentImpact;
    const residualScore = risk.residualLikelihood * risk.residualImpact;

    if (residualScore < inherentScore) {
      return <TrendingDown className="w-3 h-3 text-success inline ml-1" />;
    } else if (residualScore > inherentScore) {
      return <TrendingUp className="w-3 h-3 text-destructive inline ml-1" />;
    }
    return null;
  };

  const handleCellClick = (likelihood: number, impact: number, cellRisks: Risk[]) => {
    if (cellRisks.length > 0) {
      setSelectedCell({ likelihood, impact, risks: cellRisks });
      setShowCellDialog(true);
    }
  };

  // Build labels dynamically (descending impact down the y-axis, ascending likelihood across x-axis)
  const baseLabels4 = ['Low', 'Medium', 'High', 'Very High'];
  const baseLabels5 = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
  const labels = N === 4 ? baseLabels4 : baseLabels5;
  const impactLabels = [...labels].reverse().map((l, i) => `${l} (${N - i})`);
  const likelihoodLabels = labels.map((l, i) => `${l} (${i + 1})`);

  // Legend buckets scaled to N
  const legendBuckets = [
    { label: `Low (1-${Math.max(1, Math.floor(maxScore * 0.32) - 1)})`, cls: 'bg-success' },
    { label: `Medium (${Math.floor(maxScore * 0.32)}-${Math.max(1, Math.floor(maxScore * 0.6) - 1)})`, cls: 'bg-primary' },
    { label: `High (${Math.floor(maxScore * 0.6)}-${Math.max(1, Math.floor(maxScore * 0.8) - 1)})`, cls: 'bg-warning' },
    { label: `Critical (${Math.floor(maxScore * 0.8)}-${maxScore})`, cls: 'bg-destructive' },
  ];

  const gridColsClass = N === 4 ? 'grid-cols-4' : 'grid-cols-5';

  return (
    <>
      <div className="w-full transition-opacity duration-300 animate-fade-in" key={`${riskType}-${N}`}>
        {/* Matrix Grid */}
        <div className="relative">
          <div className="absolute -left-24 top-0 bottom-0 flex flex-col justify-center">
            <div className="transform -rotate-90 text-sm font-medium text-muted-foreground whitespace-nowrap">
              Impact
            </div>
          </div>

          <div className="flex">
            <div className="w-24 flex flex-col">
              {impactLabels.map((label, index) => (
                <div key={index} className="h-16 flex items-center justify-end pr-2 text-xs text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>

            <div className="flex-1">
              <div className={`grid ${gridColsClass} gap-1`}>
                {matrix.map((row, rowIndex) =>
                  row.map((cell, colIndex) => {
                    const likelihood = colIndex + 1;
                    const impact = N - rowIndex;
                    const riskScore = likelihood * impact;

                    return (
                      <Tooltip key={`${rowIndex}-${colIndex}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={`
                              h-16 border border-border rounded cursor-pointer
                              transition-all duration-300 hover:scale-105 hover:shadow-lg hover:z-10
                              ${getRiskColor(likelihood, impact)}
                              ${getIntensity(cell.count)}
                              flex items-center justify-center
                              animate-fade-in
                              ${cell.count > 0 ? 'hover:ring-2 hover:ring-primary' : ''}
                            `}
                            onClick={() => handleCellClick(likelihood, impact, cell.risks)}
                          >
                            <div className="text-center">
                              <div className="text-lg font-bold text-white drop-shadow-sm">
                                {cell.count || ''}
                              </div>
                              <div className="text-xs text-white/80 drop-shadow-sm">
                                {riskScore}
                              </div>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm">
                          <div className="space-y-2">
                            <div className="font-semibold">
                              Likelihood: {likelihood} | Impact: {impact} | Score: {riskScore}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {cell.count} risk{cell.count !== 1 ? 's' : ''} in this category
                            </div>
                            {cell.risks.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-sm font-medium">Risks:</div>
                                {cell.risks.slice(0, 3).map((risk) => (
                                  <div key={risk.id} className="text-sm">
                                    • {risk.title} ({risk.department})
                                  </div>
                                ))}
                                {cell.risks.length > 3 && (
                                  <div className="text-sm text-muted-foreground">
                                    +{cell.risks.length - 3} more...
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })
                )}
              </div>

              <div className={`grid ${gridColsClass} gap-1 mt-2`}>
                {likelihoodLabels.map((label, index) => (
                  <div key={index} className="text-center text-xs text-muted-foreground py-1">
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-center mt-4">
            <div className="text-sm font-medium text-muted-foreground">Likelihood</div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <div className="text-sm font-medium mb-3">Risk Level Legend ({N}×{N} matrix)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {legendBuckets.map((b, i) => (
              <div key={i} className="flex items-center space-x-2">
                <div className={`w-4 h-4 ${b.cls} rounded`}></div>
                <span className="text-sm">{b.label}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Risk Score = Likelihood × Impact (max {maxScore}). Numbers in cells show risk count and score.
          </div>
        </div>
      </div>

      {/* Cell Detail Dialog */}
      <Dialog open={showCellDialog} onOpenChange={setShowCellDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Risks in Cell: Likelihood {selectedCell?.likelihood} × Impact {selectedCell?.impact}
            </DialogTitle>
            <DialogDescription>
              Risk Score: {(selectedCell?.likelihood || 0) * (selectedCell?.impact || 0)} | {selectedCell?.risks.length} risk(s) in this category
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedCell?.risks.map((risk) => {
              const score = (riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood) *
                            (riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact);
              const pct = score / maxScore;
              let riskLevel = 'Low';
              let riskColor = 'success';
              if (pct >= 0.8) { riskLevel = 'Critical'; riskColor = 'destructive'; }
              else if (pct >= 0.6) { riskLevel = 'High'; riskColor = 'warning'; }
              else if (pct >= 0.32) { riskLevel = 'Medium'; riskColor = 'primary'; }

              return (
                <div
                  key={risk.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => {
                    setShowCellDialog(false);
                    onRiskClick?.(risk);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="font-semibold">{risk.title}</h4>
                        <Badge variant={riskColor as any}>{riskLevel}</Badge>
                        {getTrendIndicator(risk)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{risk.description}</p>
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                        <span>Dept: {risk.department}</span>
                        <span>Owner: {risk.owner}</span>
                        <span>Status: {risk.status}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
