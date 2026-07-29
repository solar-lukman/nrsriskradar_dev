import React, { useState, useRef } from 'react';
import { Brain, Download, Loader2, FileText, Copy, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';

interface AIReportGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReportData {
  report: string;
  reportType: string;
  generatedAt: string;
  stats: {
    totalRisks: number;
    openRisks: number;
    highRisks: number;
    criticalRisks: number;
    avgResidualScore: number;
    avgControlEffectiveness: number;
  };
}

export function AIReportGeneratorDialog({ open, onOpenChange }: AIReportGeneratorDialogProps) {
  const { toast } = useToast();
  const [reportType, setReportType] = useState('executive_summary');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const generateReport = async () => {
    setLoading(true);
    setReportData(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const filters: any = {};
      if (filterCategory) filters.category = filterCategory;
      if (filterStatus) filters.status = filterStatus;

      const { data, error } = await supabase.functions.invoke('ai-report-generator', {
        body: { reportType, filters },
        headers: { Authorization: `Bearer ${session.session.access_token}` },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Report generation failed');

      setReportData(data);
      toast({ title: 'Report Generated', description: 'AI executive report is ready' });
    } catch (err: any) {
      console.error('Report generation error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to generate report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const copyReport = () => {
    if (!reportData) return;
    navigator.clipboard.writeText(reportData.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied', description: 'Report copied to clipboard' });
  };

  const exportToPDF = () => {
    if (!reportData) return;

    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.width - margin * 2;
    let y = margin;

    doc.setFontSize(18);
    doc.text('AI-Generated Risk Report', margin, y);
    y += 10;

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, margin, y);
    y += 10;

    // Stats summary
    doc.setFontSize(10);
    doc.setTextColor(0);
    const stats = reportData.stats;
    doc.text(`Total Risks: ${stats.totalRisks}  |  Open: ${stats.openRisks}  |  High: ${stats.highRisks}  |  Critical: ${stats.criticalRisks}`, margin, y);
    y += 12;

    // Report body
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(reportData.report.replace(/[#*]/g, ''), pageWidth);
    
    for (const line of lines) {
      if (y > doc.internal.pageSize.height - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 5;
    }

    doc.save(`ai-risk-report-${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: 'Downloaded', description: 'Report exported as PDF' });
  };

  // Simple markdown-to-JSX renderer
  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold mt-4 mb-2">{line.slice(2)}</h1>;
      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mt-3 mb-1">{line.slice(3)}</h2>;
      if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold mt-2 mb-1">{line.slice(4)}</h3>;
      if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 text-sm">{line.slice(2)}</li>;
      if (line.match(/^\d+\./)) return <li key={i} className="ml-4 text-sm list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>;
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-sm">{line.slice(2, -2)}</p>;
      if (line.trim() === '') return <br key={i} />;
      return <p key={i} className="text-sm leading-relaxed">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Risk Report Generator
          </DialogTitle>
          <DialogDescription>
            Generate executive summary reports from your risk data using AI analysis
          </DialogDescription>
        </DialogHeader>

        {!reportData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="executive_summary">Executive Summary</SelectItem>
                    <SelectItem value="detailed_analysis">Detailed Analysis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Filter by Category</Label>
                <Select value={filterCategory || 'all'} onValueChange={(v) => setFilterCategory(v === 'all' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Strategic">Strategic</SelectItem>
                    <SelectItem value="Operational">Operational</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Compliance">Compliance</SelectItem>
                    <SelectItem value="Technology">Technology</SelectItem>
                    <SelectItem value="Reputational">Reputational</SelectItem>
                    <SelectItem value="Environmental">Environmental</SelectItem>
                    <SelectItem value="Human Resources">Human Resources</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Filter by Status</Label>
                <Select value={filterStatus || 'all'} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="In Review">In Review</SelectItem>
                    <SelectItem value="Mitigated">Mitigated</SelectItem>
                    <SelectItem value="Escalated">Escalated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card>
              <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">The AI report will include:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Executive overview with key risk indicators</li>
                  <li>Top risks analysis with scoring breakdown</li>
                  <li>Risk landscape assessment by category and department</li>
                  <li>Control effectiveness summary</li>
                  <li>Strategic recommendations and action items</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex flex-wrap gap-3">
              <Badge variant="outline">Total: {reportData.stats.totalRisks}</Badge>
              <Badge variant="outline">Open: {reportData.stats.openRisks}</Badge>
              <Badge variant="destructive">High: {reportData.stats.highRisks}</Badge>
              <Badge variant="destructive">Critical: {reportData.stats.criticalRisks}</Badge>
              <Badge variant="outline">Avg Score: {reportData.stats.avgResidualScore}</Badge>
              <Badge variant="outline">Control: {reportData.stats.avgControlEffectiveness}%</Badge>
            </div>

            <ScrollArea className="h-[450px] border rounded-lg p-4" ref={reportRef}>
              <div className="prose prose-sm max-w-none">
                {renderMarkdown(reportData.report)}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          {!reportData ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={generateReport} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                {loading ? 'Generating...' : 'Generate Report'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setReportData(null)}>New Report</Button>
              <Button variant="outline" onClick={copyReport}>
                {copied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button onClick={exportToPDF}>
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
