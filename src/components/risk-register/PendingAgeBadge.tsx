import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  /** ISO timestamp the risk entered the pending state (submitted_at or returned_at). */
  since?: string | null;
  /** Optional label override (defaults to "Pending"). */
  label?: string;
  className?: string;
}

/**
 * Coloured ageing pill for items awaiting an approval action.
 * - 0–3 days → muted
 * - 3–7 days → warning
 * - >7 days  → destructive
 */
export function PendingAgeBadge({ since, label = 'Pending', className }: Props) {
  if (!since) return null;
  const ms = Date.now() - new Date(since).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const days = ms / (1000 * 60 * 60 * 24);
  const rounded = days < 1 ? '<1d' : `${Math.floor(days)}d`;

  const tone =
    days > 7
      ? 'border-destructive text-destructive bg-destructive/10'
      : days > 3
      ? 'border-warning text-warning bg-warning/10'
      : 'border-muted-foreground/30 text-muted-foreground bg-muted/40';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn('gap-1 font-normal', tone, className)}>
          <Clock className="w-3 h-3" />
          {label} {rounded}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {label} for {days < 1 ? 'less than a day' : `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`}
        {days > 7 && ' — overdue'}
        {days > 3 && days <= 7 && ' — approaching SLA'}
      </TooltipContent>
    </Tooltip>
  );
}
