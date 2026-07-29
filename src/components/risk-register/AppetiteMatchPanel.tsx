import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Gauge, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { useRiskAppetite, AppetiteConfig } from '@/hooks/useRiskAppetite';

interface AppetiteMatchPanelProps {
  risk: {
    id: string;
    risk_type?: string;
    category?: string | null;
    taxpayer_segment?: string | null;
    residual_likelihood?: number | null;
    residual_impact?: number | null;
    flagged_for_audit?: boolean | null;
    status?: string;
  };
}

const ACTION_LABELS: Record<string, string> = {
  notify: 'Notify owners & risk team',
  escalate: 'Escalate risk status',
  flag_audit: 'Flag for audit review',
};

export function AppetiteMatchPanel({ risk }: AppetiteMatchPanelProps) {
  const [detailRule, setDetailRule] = useState<{
    config: AppetiteConfig;
    isWinner: boolean;
    isMatch: boolean;
    reason: string;
    specLabel: string;
  } | null>(null);
  const { resolveForRisk, rankCandidatesForRisk, loading } = useRiskAppetite();

  const appetite = resolveForRisk({
    risk_type: risk.risk_type,
    category: risk.category,
    taxpayer_segment: risk.taxpayer_segment,
  });

  const ranked = rankCandidatesForRisk({
    risk_type: risk.risk_type,
    category: risk.category,
    taxpayer_segment: risk.taxpayer_segment,
  });

  const score =
    (risk.residual_likelihood ?? 0) * (risk.residual_impact ?? 0);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="w-4 h-4" /> Appetite Match
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Resolving appetite rule…
        </CardContent>
      </Card>
    );
  }

  if (!appetite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="w-4 h-4" /> Appetite Match
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No appetite rule is configured for this risk's type/category/segment.
          Admins can add a rule under Settings → Risk Management.
        </CardContent>
      </Card>
    );
  }

  const exceeds = score >= appetite.threshold_score;
  const specificity =
    (appetite.category ? 1 : 0) + (appetite.taxpayer_segment ? 1 : 0);
  const specificityLabel =
    specificity === 2
      ? 'Most specific (category + segment)'
      : specificity === 1
      ? appetite.category
        ? 'Category-specific'
        : 'Segment-specific'
      : 'Default rule for risk type';

  return (
    <Card className={exceeds ? 'border-destructive/40' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4" /> Appetite Match
          </div>
          {exceeds ? (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" /> Exceeds threshold
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-success">
              <CheckCircle2 className="w-3 h-3" /> Within tolerance
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Tolerance</div>
            <Badge variant="outline">{appetite.tolerance_level}</Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Threshold</div>
            <div className="font-medium">≥ {appetite.threshold_score}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Residual Score</div>
            <div
              className={
                exceeds ? 'font-bold text-destructive' : 'font-medium'
              }
            >
              {score}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Auto Action</div>
            <div className="font-medium">
              {ACTION_LABELS[appetite.escalation_action] ??
                appetite.escalation_action}
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
          <div className="font-medium">Why this rule was selected</div>
          <div className="text-muted-foreground">{specificityLabel}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="secondary" className="capitalize">
              Type: {appetite.risk_type}
            </Badge>
            <Badge variant="secondary">
              Category: {appetite.category || 'Any'}
            </Badge>
            {appetite.risk_type === 'compliance' && (
              <Badge variant="secondary">
                Segment: {appetite.taxpayer_segment || 'Any'}
              </Badge>
            )}
          </div>
          {appetite.description && (
            <div className="text-muted-foreground pt-1">
              {appetite.description}
            </div>
          )}
        </div>

        {ranked.length > 1 && (
          <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-2">
            <div className="font-medium">Matched-rule ranking</div>
            <div className="text-muted-foreground">
              All configured rules for{' '}
              <span className="font-medium capitalize">{risk.risk_type}</span>{' '}
              risks, ordered by match status, specificity, then threshold.
            </div>
            <ol className="space-y-1.5">
              {ranked.map((entry, idx) => {
                const isWinner = entry.config.id === appetite.id;
                const specLabel =
                  entry.specificity === 2
                    ? 'Category + Segment'
                    : entry.specificity === 1
                    ? entry.config.category
                      ? 'Category-specific'
                      : 'Segment-specific'
                    : 'Default (any)';
                return (
                  <li
                    key={entry.config.id}
                    className={
                      'flex flex-wrap items-center gap-2 rounded border p-2 ' +
                      (isWinner
                        ? 'border-primary/40 bg-primary/5'
                        : entry.isMatch
                        ? 'border-border'
                        : 'border-dashed border-muted-foreground/30 opacity-70')
                    }
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{idx + 1}
                    </span>
                    {isWinner ? (
                      <Badge variant="default" className="text-[10px] gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Selected
                      </Badge>
                    ) : entry.isMatch ? (
                      <Badge variant="outline" className="text-[10px]">
                        Eligible
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <XCircle className="w-3 h-3" /> Skipped
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {specLabel}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {entry.config.tolerance_level} · ≥{' '}
                      {entry.config.threshold_score}
                    </Badge>
                    <span className="text-muted-foreground flex-1 min-w-[160px]">
                      {isWinner
                        ? 'Most specific eligible rule with the lowest threshold'
                        : entry.reason}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={() =>
                        setDetailRule({
                          config: entry.config,
                          isWinner,
                          isMatch: entry.isMatch,
                          reason: entry.reason,
                          specLabel,
                        })
                      }
                    >
                      <Info className="w-3 h-3" />
                      View rule details
                    </Button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {exceeds && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription className="text-xs">
              This risk's residual score ({score}) is at or above the configured{' '}
              {appetite.tolerance_level} appetite threshold (
              {appetite.threshold_score}). The system will{' '}
              <span className="font-medium">
                {ACTION_LABELS[appetite.escalation_action]}
              </span>{' '}
              on approval.
              {risk.flagged_for_audit && ' This risk is currently flagged for audit.'}
              {risk.status === 'Escalated' && ' Status has been escalated.'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <Dialog open={!!detailRule} onOpenChange={(o) => !o && setDetailRule(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="w-4 h-4" /> Appetite rule details
            </DialogTitle>
            <DialogDescription>
              Full configuration row for the selected appetite rule.
            </DialogDescription>
          </DialogHeader>
          {detailRule && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {detailRule.isWinner ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Selected rule
                  </Badge>
                ) : detailRule.isMatch ? (
                  <Badge variant="outline">Eligible (not selected)</Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <XCircle className="w-3 h-3" /> Skipped
                  </Badge>
                )}
                <Badge variant="secondary">{detailRule.specLabel}</Badge>
                <Badge
                  variant={
                    detailRule.config.is_active ? 'secondary' : 'outline'
                  }
                >
                  {detailRule.config.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Risk type" value={detailRule.config.risk_type} />
                <DetailField
                  label="Tolerance level"
                  value={detailRule.config.tolerance_level}
                />
                <DetailField
                  label="Threshold score"
                  value={`≥ ${detailRule.config.threshold_score}`}
                />
                <DetailField
                  label="Escalation action"
                  value={
                    ACTION_LABELS[detailRule.config.escalation_action] ??
                    detailRule.config.escalation_action
                  }
                />
                <DetailField
                  label="Category"
                  value={detailRule.config.category || 'Any'}
                />
                <DetailField
                  label="Taxpayer segment"
                  value={detailRule.config.taxpayer_segment || 'Any'}
                />
              </div>

              {detailRule.config.description && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Description
                  </div>
                  <div className="rounded border bg-muted/30 p-2 text-xs">
                    {detailRule.config.description}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Match outcome for this risk
                </div>
                <div className="rounded border bg-muted/20 p-2 text-xs">
                  {detailRule.isWinner
                    ? 'Most specific eligible rule with the lowest threshold — applied to this risk.'
                    : detailRule.reason}
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground font-mono break-all">
                Rule ID: {detailRule.config.id}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium capitalize">{value}</div>
    </div>
  );
}
