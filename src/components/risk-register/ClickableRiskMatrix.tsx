import React from 'react';
import { cn } from '@/lib/utils';

interface ClickableRiskMatrixProps {
  selectedLikelihood: number;
  selectedImpact: number;
  onSelect: (likelihood: number, impact: number) => void;
  label?: string;
}

const getCellColor = (likelihood: number, impact: number) => {
  const score = likelihood * impact;
  if (score >= 20) return 'bg-destructive/90 hover:bg-destructive text-destructive-foreground';
  if (score >= 15) return 'bg-warning/90 hover:bg-warning text-warning-foreground';
  if (score >= 8) return 'bg-accent/80 hover:bg-accent text-accent-foreground';
  return 'bg-success/80 hover:bg-success text-success-foreground';
};

const getRiskLabel = (score: number) => {
  if (score >= 20) return 'Critical';
  if (score >= 15) return 'High';
  if (score >= 8) return 'Medium';
  return 'Low';
};

const LIKELIHOOD_LABELS = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];
const IMPACT_LABELS = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

export function ClickableRiskMatrix({ selectedLikelihood, selectedImpact, onSelect, label = 'Inherent Risk Score' }: ClickableRiskMatrixProps) {
  const score = selectedLikelihood * selectedImpact;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        {/* Y-axis label */}
        <div className="flex flex-col items-center justify-center h-full pt-8">
          <span className="text-xs font-medium text-muted-foreground [writing-mode:vertical-lr] rotate-180">
            Likelihood →
          </span>
        </div>

        <div className="flex-1">
          {/* Grid */}
          <div className="grid grid-cols-6 gap-1">
            {/* Header row */}
            <div className="h-8" />
            {IMPACT_LABELS.map((lbl) => (
              <div key={lbl} className="h-8 flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{lbl}</span>
              </div>
            ))}

            {/* Grid rows - from 5 (top) to 1 (bottom) */}
            {[5, 4, 3, 2, 1].map(likelihood => (
              <React.Fragment key={likelihood}>
                <div className="h-12 flex items-center justify-center">
                  <span className="text-xs font-medium text-muted-foreground">{likelihood}</span>
                </div>
                {[1, 2, 3, 4, 5].map(impact => {
                  const isSelected = selectedLikelihood === likelihood && selectedImpact === impact;
                  const cellScore = likelihood * impact;
                  return (
                    <button
                      key={`${likelihood}-${impact}`}
                      type="button"
                      onClick={() => onSelect(likelihood, impact)}
                      className={cn(
                        'h-12 rounded-md flex items-center justify-center text-xs font-bold transition-all cursor-pointer',
                        getCellColor(likelihood, impact),
                        isSelected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-105 shadow-lg',
                        !isSelected && 'opacity-70'
                      )}
                    >
                      {cellScore}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* X-axis label */}
          <div className="text-center mt-2">
            <span className="text-xs font-medium text-muted-foreground">Impact →</span>
          </div>
        </div>
      </div>

      {/* Score display */}
      {selectedLikelihood > 0 && selectedImpact > 0 && (
        <div className={cn(
          'p-3 rounded-lg text-center',
          score >= 20 ? 'bg-destructive/10 text-destructive' :
          score >= 15 ? 'bg-warning/10 text-warning' :
          score >= 8 ? 'bg-accent/10 text-accent' :
          'bg-success/10 text-success'
        )}>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-3xl font-bold">{score}</div>
          <div className="text-sm font-medium">{getRiskLabel(score)}</div>
        </div>
      )}
    </div>
  );
}
