import { useEffect, useState } from 'react';
import { CircleDashed, Loader2, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import {
  deriveAssessmentProgress,
  progressBadgeVariant,
  progressLabel,
  type AssessmentProgress,
} from '@/lib/assessmentProgress';

interface Props {
  riskId: string;
  approvalStatus?: string | null;
  status?: string | null;
  /** Bumping this value forces a refetch (used after edits in the modal). */
  refreshKey?: number;
  className?: string;
}

const ICONS: Record<AssessmentProgress, JSX.Element> = {
  draft: <CircleDashed className="w-3 h-3" />,
  in_review: <Loader2 className="w-3 h-3" />,
  completed: <CheckCircle2 className="w-3 h-3" />,
};

export function AssessmentProgressBadge({
  riskId,
  approvalStatus,
  status,
  refreshKey = 0,
  className,
}: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { count: c } = await supabase
        .from('risk_assessments')
        .select('id', { count: 'exact', head: true })
        .eq('risk_id', riskId);
      if (active) setCount(c ?? 0);
    })();
    return () => {
      active = false;
    };
  }, [riskId, refreshKey]);

  const progress = deriveAssessmentProgress({
    approval_status: approvalStatus,
    status,
    assessment_count: count ?? 0,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={progressBadgeVariant(progress) as any} className={`gap-1 ${className ?? ''}`}>
          {ICONS[progress]}
          Assessment: {progressLabel(progress)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {count === null
          ? 'Loading assessment progress…'
          : `${count} assessment${count === 1 ? '' : 's'} recorded · approval: ${approvalStatus || 'Draft'}`}
      </TooltipContent>
    </Tooltip>
  );
}
