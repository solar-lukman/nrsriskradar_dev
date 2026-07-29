import React from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import { format } from 'date-fns';

interface IncidentRow {
  id: string;
  reference_number?: string | null;
  title?: string | null;
  event_date?: string | null;
  occurred_at?: string | null;
  discovered_date?: string | null;
  resolution_date?: string | null;
  severity?: string | null;
  status?: string | null;
  risk_posture?: string | null;
  financial_impact?: number | null;
  impact_amount?: number | null;
  financial_impact_currency?: string | null;
  event_description?: string | null;
  description?: string | null;
  root_cause?: string | null;
  immediate_response?: string | null;
  operational_impact?: string | null;
  reputational_impact?: string | null;
  lessons_learned?: string | null;
  reporter?: { full_name?: string | null; email?: string | null } | null;
  risks?: { title?: string | null; category?: string | null; department?: string | null } | null;
}

interface ExportIncidentsMenuProps {
  incidents: IncidentRow[];
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportIncidentsMenu({ incidents }: ExportIncidentsMenuProps) {
  const dateStamp = new Date().toISOString().split('T')[0];

  const exportCSV = () => {
    const headers = [
      'Reference', 'Title', 'Event Date', 'Discovery Date', 'Resolution Date',
      'Severity', 'Status', 'Risk Posture', 'Linked Risk', 'Department',
      'Reporter', 'Financial Impact', 'Currency',
      'Description', 'Root Cause', 'Immediate Response',
      'Operational Impact', 'Reputational Impact', 'Lessons Learned',
    ];
    const rows = incidents.map((i) => [
      i.reference_number, i.title,
      i.event_date || i.occurred_at, i.discovered_date, i.resolution_date,
      i.severity, i.status, i.risk_posture,
      i.risks?.title || '', i.risks?.department || '',
      i.reporter?.full_name || i.reporter?.email || '',
      i.financial_impact ?? i.impact_amount ?? '',
      i.financial_impact_currency || '',
      i.event_description || i.description || '',
      i.root_cause || '', i.immediate_response || '',
      i.operational_impact || '', i.reputational_impact || '', i.lessons_learned || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    downloadBlob('\uFEFF' + csv, `incidents-${dateStamp}.csv`, 'text/csv;charset=utf-8;');
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const margin = 14;
    const pageWidth = doc.internal.pageSize.width;
    let y = margin;

    doc.setFontSize(16);
    doc.text('Incidents Report', margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')} • Total: ${incidents.length}`, margin, y);
    y += 8;
    doc.setTextColor(0);

    // KPI summary
    const open = incidents.filter((i) => i.status === 'Open' || i.status === 'Under Investigation').length;
    const resolved = incidents.filter((i) => i.status === 'Resolved' || i.status === 'Closed').length;
    const totalImpact = incidents.reduce((s, i) => s + (Number(i.financial_impact ?? i.impact_amount) || 0), 0);
    doc.setFontSize(10);
    doc.text(`Open: ${open}  •  Resolved: ${resolved}  •  Total Financial Impact: ₦${totalImpact.toLocaleString()}`, margin, y);
    y += 8;

    // Table header
    const cols = [
      { key: 'ref', label: 'Ref', w: 22 },
      { key: 'date', label: 'Date', w: 22 },
      { key: 'title', label: 'Title', w: 70 },
      { key: 'sev', label: 'Severity', w: 22 },
      { key: 'status', label: 'Status', w: 32 },
      { key: 'posture', label: 'Posture', w: 25 },
      { key: 'reporter', label: 'Reporter', w: 40 },
      { key: 'impact', label: 'Financial', w: 35 },
    ];
    const drawHeader = () => {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      let x = margin + 2;
      cols.forEach((c) => { doc.text(c.label, x, y + 5); x += c.w; });
      doc.setFont('helvetica', 'normal');
      y += 7;
    };
    drawHeader();

    incidents.forEach((i) => {
      if (y > doc.internal.pageSize.height - 20) {
        doc.addPage();
        y = margin;
        drawHeader();
      }
      const rowData = [
        i.reference_number || '—',
        i.event_date ? format(new Date(i.event_date), 'dd MMM yy') : '—',
        (i.title || '—').slice(0, 50),
        i.severity || '—',
        i.status || '—',
        i.risk_posture || '—',
        (i.reporter?.full_name || i.reporter?.email || '—').slice(0, 28),
        i.financial_impact || i.impact_amount
          ? `${i.financial_impact_currency || 'NGN'} ${Number(i.financial_impact ?? i.impact_amount).toLocaleString()}`
          : '—',
      ];
      let x = margin + 2;
      doc.setFontSize(8);
      rowData.forEach((val, idx) => { doc.text(String(val), x, y + 5); x += cols[idx].w; });
      doc.setDrawColor(230);
      doc.line(margin, y + 7, pageWidth - margin, y + 7);
      y += 7;
    });

    if (incidents.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text('No incidents in current filter.', margin, y + 6);
    }

    doc.save(`incidents-${dateStamp}.pdf`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCSV}>
          <FileSpreadsheet className="w-4 h-4 mr-2" /> Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPDF}>
          <FileText className="w-4 h-4 mr-2" /> Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-incident detail PDF for compliance reporting */
export function exportIncidentDetailPDF(i: IncidentRow) {
  const doc = new jsPDF();
  const margin = 14;
  const pageWidth = doc.internal.pageSize.width;
  let y = margin;

  doc.setFontSize(18);
  doc.text('Incident Report', margin, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated ${format(new Date(), 'dd MMM yyyy HH:mm')}`, margin, y);
  y += 10;
  doc.setTextColor(0);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`${i.reference_number || ''} — ${i.title || 'Untitled'}`, margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const fields: Array<[string, string]> = [
    ['Event Date', i.event_date ? format(new Date(i.event_date), 'dd MMM yyyy') : '—'],
    ['Discovery Date', i.discovered_date ? format(new Date(i.discovered_date), 'dd MMM yyyy') : '—'],
    ['Resolution Date', i.resolution_date ? format(new Date(i.resolution_date), 'dd MMM yyyy') : '—'],
    ['Severity', i.severity || '—'],
    ['Status', i.status || '—'],
    ['Risk Posture', i.risk_posture || '—'],
    ['Linked Risk', i.risks?.title || '—'],
    ['Department', i.risks?.department || '—'],
    ['Reporter', i.reporter?.full_name || i.reporter?.email || '—'],
    ['Financial Impact', i.financial_impact || i.impact_amount
      ? `${i.financial_impact_currency || 'NGN'} ${Number(i.financial_impact ?? i.impact_amount).toLocaleString()}`
      : '—'],
  ];

  fields.forEach(([label, val]) => {
    if (y > doc.internal.pageSize.height - 20) { doc.addPage(); y = margin; }
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(val, pageWidth - margin * 2 - 45);
    doc.text(lines, margin + 45, y);
    y += Math.max(6, lines.length * 5);
  });

  y += 4;

  const sections: Array<[string, string | null | undefined]> = [
    ['Description', i.event_description || i.description],
    ['Root Cause', i.root_cause],
    ['Immediate Response', i.immediate_response],
    ['Operational Impact', i.operational_impact],
    ['Reputational Impact', i.reputational_impact],
    ['Lessons Learned', i.lessons_learned],
  ];
  sections.forEach(([label, val]) => {
    if (!val) return;
    if (y > doc.internal.pageSize.height - 30) { doc.addPage(); y = margin; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(val, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  });

  doc.save(`incident-${i.reference_number || i.id}-${new Date().toISOString().split('T')[0]}.pdf`);
}
