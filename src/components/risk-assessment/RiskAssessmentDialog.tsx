import { useNavigate } from 'react-router-dom';
import { ExternalLink, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RiskAssessmentDashboard } from './RiskAssessmentDashboard';

interface RiskAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskId: string;
  /** Called when the user makes changes inside the modal so the parent
   *  page can refetch and reflect them immediately. */
  onChanged?: () => void;
}

export function RiskAssessmentDialog({
  open,
  onOpenChange,
  riskId,
  onChanged,
}: RiskAssessmentDialogProps) {
  const navigate = useNavigate();

  const shareUrl = `${window.location.origin}/risk-register?view=${riskId}&assess=1`;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Shareable link copied', {
        description: 'Anyone with access will land on this risk with the assessment open.',
      });
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-row items-center justify-between space-y-0">
          <DialogTitle>Detailed Risk Assessment</DialogTitle>
          <div className="flex items-center gap-1 mr-8">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1" onClick={copyShareLink}>
                  <Link2 className="w-4 h-4" />
                  Copy link
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy a shareable link that opens this assessment</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/risk-assessment/${riskId}`);
                  }}
                >
                  <ExternalLink className="w-4 h-4" />
                  Open full page
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in a dedicated page</TooltipContent>
            </Tooltip>
          </div>
        </DialogHeader>
        <div className="px-2 pb-4">
          <RiskAssessmentDashboard
            key={riskId}
            riskIdOverride={riskId}
            onChanged={onChanged}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
