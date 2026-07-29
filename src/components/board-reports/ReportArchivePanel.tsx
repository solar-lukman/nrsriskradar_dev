import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Archive, Download, Eye, Loader2, Calendar, Clock, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import {
  loadNrsLogo,
  drawNrsHeader,
  drawNrsFooter,
  drawNrsSectionHeading,
  renderNrsKeyValueTable,
  ensureNrsSpace,
} from '@/lib/nrsPdf';
import { BoardReportPreviewDialog } from './BoardReportPreviewDialog';

interface ReportArchive {
  id: string;
  report_type: string;
  title: string;
  period: string;
  report_data: any;
  generated_by: string;
  generated_at: string;
  is_scheduled: boolean;
  metadata: any;
}

interface ReportSchedule {
  id: string;
  report_type: string;
  title: string;
  frequency: string;
  recipients: string[];
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

export function ReportArchivePanel() {
  const [archives, setArchives] = useState<ReportArchive[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState<ReportArchive | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [archiveRes, scheduleRes] = await Promise.all([
      supabase.from('board_report_archives').select('*').order('generated_at', { ascending: false }).limit(20),
      supabase.from('report_schedules').select('*').order('created_at', { ascending: false }),
    ]);
    setArchives((archiveRes.data as any[]) || []);
    setSchedules((scheduleRes.data as any[]) || []);
    setLoading(false);
  };

  const handlePreview = (archive: ReportArchive) => {
    setSelectedArchive(archive);
    setPreviewOpen(true);
  };

  const handleDownload = async (archive: ReportArchive) => {
    const logo = await loadNrsLogo();
    const doc = new jsPDF();

    drawNrsHeader(
      doc,
      logo,
      archive.title,
      `Period: ${archive.period}  •  Generated ${new Date(archive.generated_at).toLocaleDateString()}`,
    );

    let y = 56;
    const data = archive.report_data || {};

    const sectionsToRender: Array<{ title: string; rows: { label: string; value: string | number }[] }> = [];

    if (data.summary && typeof data.summary === 'object') {
      sectionsToRender.push({
        title: 'Executive Summary',
        rows: Object.entries(data.summary).map(([k, v]) => ({ label: k, value: String(v) })),
      });
    }
    if (data.categories && typeof data.categories === 'object') {
      sectionsToRender.push({
        title: 'Risk Categories',
        rows: Object.entries(data.categories).map(([k, v]) => ({ label: k, value: String(v) })),
      });
    }
    // Render any other top-level object fields generically
    Object.entries(data).forEach(([key, val]) => {
      if (key === 'summary' || key === 'categories') return;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        sectionsToRender.push({
          title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          rows: Object.entries(val as Record<string, unknown>).map(([k, v]) => ({ label: k, value: String(v) })),
        });
      }
    });

    if (sectionsToRender.length === 0) {
      sectionsToRender.push({
        title: 'Report Data',
        rows: [{ label: 'Notice', value: 'No structured data available for this archive.' }],
      });
    }

    sectionsToRender.forEach((section, idx) => {
      y = ensureNrsSpace(doc, y, 24);
      if (idx > 0) y += 2;
      y = drawNrsSectionHeading(doc, y, section.title);
      y = ensureNrsSpace(doc, y, 18);
      y = renderNrsKeyValueTable(doc, y, section.rows);
    });

    drawNrsFooter(doc);
    doc.save(`NRS-${archive.title.replace(/\s+/g, '-')}-${new Date(archive.generated_at).toISOString().split('T')[0]}.pdf`);
    toast.success('PDF downloaded');
  };


  const toggleSchedule = async (schedule: ReportSchedule) => {
    const { error } = await supabase
      .from('report_schedules')
      .update({ is_active: !schedule.is_active } as any)
      .eq('id', schedule.id);
    if (error) {
      toast.error('Failed to update schedule');
    } else {
      toast.success(schedule.is_active ? 'Schedule paused' : 'Schedule activated');
      fetchData();
    }
  };

  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from('report_schedules').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete schedule');
    } else {
      toast.success('Schedule deleted');
      fetchData();
    }
  };

  const previewSections = selectedArchive ? convertToSections(selectedArchive.report_data) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Schedules */}
      {schedules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5" />
              Active Schedules
            </CardTitle>
            <CardDescription>Recurring report generation schedules</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {schedules.map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{schedule.title}</p>
                      <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                        {schedule.is_active ? 'Active' : 'Paused'}
                      </Badge>
                      <Badge variant="outline">{schedule.frequency}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {schedule.recipients.length > 0 && `📧 ${schedule.recipients.join(', ')} · `}
                      {schedule.next_run_at && `Next: ${new Date(schedule.next_run_at).toLocaleDateString()}`}
                      {schedule.last_run_at && ` · Last: ${new Date(schedule.last_run_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleSchedule(schedule)}>
                      {schedule.is_active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteSchedule(schedule.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Archives */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Archive className="w-5 h-5" />
            Report History
          </CardTitle>
          <CardDescription>Previously generated board reports</CardDescription>
        </CardHeader>
        <CardContent>
          {archives.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No reports have been archived yet. Generate a report from above to get started.
            </p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {archives.map(archive => (
                  <div key={archive.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{archive.title}</p>
                        {archive.is_scheduled && <Badge variant="outline" className="text-xs">Scheduled</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {archive.period} · {new Date(archive.generated_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handlePreview(archive)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownload(archive)}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Preview dialog for archived reports */}
      {selectedArchive && (
        <BoardReportPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          reportTitle={selectedArchive.title}
          reportPeriod={selectedArchive.period}
          sections={previewSections}
          loading={false}
          onDownloadPDF={() => handleDownload(selectedArchive)}
        />
      )}
    </div>
  );
}

function convertToSections(data: any) {
  const sections: Array<{ title: string; content: string; data?: Array<{ label: string; value: string | number }> }> = [];

  if (data?.summary) {
    sections.push({
      title: 'Executive Summary',
      content: '',
      data: Object.entries(data.summary).map(([k, v]) => ({
        label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase()),
        value: v as string | number,
      })),
    });
  }

  if (data?.categories) {
    sections.push({
      title: 'Risk Categories',
      content: '',
      data: Object.entries(data.categories).map(([cat, cnt]) => ({ label: cat, value: cnt as number })),
    });
  }

  if (data?.budget) {
    sections.push({
      title: 'Budget',
      content: '',
      data: Object.entries(data.budget).map(([k, v]) => ({
        label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase()),
        value: v as string | number,
      })),
    });
  }

  if (data?.bcp) {
    sections.push({
      title: 'Business Continuity',
      content: '',
      data: Object.entries(data.bcp).map(([k, v]) => ({
        label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase()),
        value: v as string | number,
      })),
    });
  }

  if (data?.topRisks) {
    sections.push({
      title: 'Top Risks',
      content: '',
      data: data.topRisks.map((r: any, i: number) => ({
        label: `${i + 1}. ${r.title}`,
        value: `Score: ${r.score} (${r.status})`,
      })),
    });
  }

  return sections;
}
