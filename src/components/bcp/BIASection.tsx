import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BIAErrors = Partial<Record<
  | 'biaCriticalityRating'
  | 'biaFinancialImpact'
  | 'biaOperationalImpact'
  | 'biaReputationalImpact'
  | 'biaRegulatoryImpact'
  | 'biaMaxTolerableDowntime'
  | 'biaAssessmentDate',
  string
>>;

interface BIASectionProps {
  criticalityRating: string;
  setCriticalityRating: (v: string) => void;
  financialImpact: string;
  setFinancialImpact: (v: string) => void;
  operationalImpact: string;
  setOperationalImpact: (v: string) => void;
  reputationalImpact: string;
  setReputationalImpact: (v: string) => void;
  regulatoryImpact: string;
  setRegulatoryImpact: (v: string) => void;
  maxTolerableDowntime: string;
  setMaxTolerableDowntime: (v: string) => void;
  assessmentDate: string;
  setAssessmentDate: (v: string) => void;
  errors?: BIAErrors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

export function BIASection({
  criticalityRating, setCriticalityRating,
  financialImpact, setFinancialImpact,
  operationalImpact, setOperationalImpact,
  reputationalImpact, setReputationalImpact,
  regulatoryImpact, setRegulatoryImpact,
  maxTolerableDowntime, setMaxTolerableDowntime,
  assessmentDate, setAssessmentDate,
  errors = {},
}: BIASectionProps) {
  const [open, setOpen] = React.useState(false);
  const today = new Date().toISOString().split('T')[0];
  const hasError = Object.values(errors).some(Boolean);

  // Auto-open when there are validation errors so the user sees them
  React.useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('w-full justify-between', hasError && 'border-destructive text-destructive')}
        >
          Business Impact Assessment (BIA){hasError ? ' — fix errors below' : ''}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Criticality Rating</Label>
            <Select value={criticalityRating} onValueChange={setCriticalityRating}>
              <SelectTrigger className={errors.biaCriticalityRating ? 'border-destructive' : ''}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
            <FieldError message={errors.biaCriticalityRating} />
          </div>
          <div className="space-y-2">
            <Label>Financial Impact (₦)</Label>
            <Input
              type="number"
              min={0}
              value={financialImpact}
              onChange={(e) => setFinancialImpact(e.target.value)}
              placeholder="e.g., 5000000"
              className={errors.biaFinancialImpact ? 'border-destructive' : ''}
            />
            <FieldError message={errors.biaFinancialImpact} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Operational Impact</Label>
          <Textarea
            value={operationalImpact}
            onChange={(e) => setOperationalImpact(e.target.value)}
            placeholder="Describe the operational impact if this function is disrupted..."
            rows={2}
            className={errors.biaOperationalImpact ? 'border-destructive' : ''}
          />
          <FieldError message={errors.biaOperationalImpact} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Reputational Impact</Label>
            <Textarea
              value={reputationalImpact}
              onChange={(e) => setReputationalImpact(e.target.value)}
              placeholder="Describe reputational consequences..."
              rows={2}
              className={errors.biaReputationalImpact ? 'border-destructive' : ''}
            />
            <FieldError message={errors.biaReputationalImpact} />
          </div>
          <div className="space-y-2">
            <Label>Regulatory Impact</Label>
            <Textarea
              value={regulatoryImpact}
              onChange={(e) => setRegulatoryImpact(e.target.value)}
              placeholder="Describe regulatory/compliance consequences..."
              rows={2}
              className={errors.biaRegulatoryImpact ? 'border-destructive' : ''}
            />
            <FieldError message={errors.biaRegulatoryImpact} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Maximum Tolerable Downtime (hours)</Label>
            <Input
              type="number"
              min={0}
              value={maxTolerableDowntime}
              onChange={(e) => setMaxTolerableDowntime(e.target.value)}
              placeholder="e.g., 48"
              className={errors.biaMaxTolerableDowntime ? 'border-destructive' : ''}
            />
            <FieldError message={errors.biaMaxTolerableDowntime} />
          </div>
          <div className="space-y-2">
            <Label>BIA Assessment Date</Label>
            <Input
              type="date"
              value={assessmentDate}
              max={today}
              onChange={(e) => setAssessmentDate(e.target.value)}
              className={errors.biaAssessmentDate ? 'border-destructive' : ''}
            />
            <FieldError message={errors.biaAssessmentDate} />
            <p className="text-xs text-muted-foreground">Defaults to today; cannot be in the future.</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
