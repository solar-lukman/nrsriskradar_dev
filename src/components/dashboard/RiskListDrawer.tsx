import React, { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Eye, Inbox } from 'lucide-react';
import { ViewRiskDialog } from '@/components/risk-register/ViewRiskDialog';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface RiskListDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  risks: Risk[];
}

function severityClass(score: number) {
  if (score >= 15) return 'bg-destructive text-destructive-foreground';
  if (score >= 10) return 'bg-warning text-warning-foreground';
  return 'bg-success text-success-foreground';
}

export function RiskListDrawer({ open, onOpenChange, title, description, risks }: RiskListDrawerProps) {
  const [activeRisk, setActiveRisk] = useState<Risk | null>(null);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {title}
              <Badge variant="secondary" className="text-xs">{risks.length}</Badge>
            </SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>

          <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
            {risks.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
                <Inbox className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No risks match this selection.</p>
              </div>
            ) : (
              <ul className="space-y-2 pb-6">
                {risks.map((r) => {
                  const inherent = (r.inherent_likelihood ?? 0) * (r.inherent_impact ?? 0);
                  const residual = (r.residual_likelihood ?? 0) * (r.residual_impact ?? 0);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setActiveRisk(r)}
                        className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{r.title}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] px-1.5">{r.category || '—'}</Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5">{r.department || 'No dept'}</Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5">{r.status}</Badge>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge className={`text-xs ${severityClass(residual)}`} title="Residual">
                              R {residual}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">I {inherent}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end mt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          <Eye className="w-3 h-3 mr-1" /> View details
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </SheetContent>
      </Sheet>

      {activeRisk && (
        <ViewRiskDialog
          open={!!activeRisk}
          onOpenChange={(o) => { if (!o) setActiveRisk(null); }}
          risk={activeRisk}
        />
      )}
    </>
  );
}
