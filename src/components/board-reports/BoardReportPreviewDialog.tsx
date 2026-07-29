import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ReportSection {
  title: string;
  content: string;
  data?: Array<{ label: string; value: string | number }>;
}

interface BoardReportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportTitle: string;
  reportPeriod: string;
  sections: ReportSection[];
  loading: boolean;
  onDownloadPDF: () => void;
}

export function BoardReportPreviewDialog({
  open,
  onOpenChange,
  reportTitle,
  reportPeriod,
  sections,
  loading,
  onDownloadPDF,
}: BoardReportPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">{reportTitle}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            Period: {reportPeriod}
            <Badge variant="outline" className="ml-2">Preview</Badge>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Generating report…</span>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[55vh] pr-4">
              <div className="space-y-6">
                {sections.map((section, idx) => (
                  <div key={idx} className="space-y-2">
                    <h3 className="text-base font-semibold border-b pb-1">{section.title}</h3>
                    {section.content && (
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{section.content}</p>
                    )}
                    {section.data && section.data.length > 0 && (
                      <div className="rounded-md border">
                        <table className="w-full text-sm">
                          <tbody>
                            {section.data.map((row, rIdx) => (
                              <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-muted/40' : ''}>
                                <td className="px-3 py-2 font-medium">{row.label}</td>
                                <td className="px-3 py-2 text-right">{row.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end pt-2">
              <Button onClick={onDownloadPDF}>
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
