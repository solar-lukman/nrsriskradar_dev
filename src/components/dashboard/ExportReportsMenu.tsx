import React from 'react';
import { Download, FileText, FileSpreadsheet, FileBarChart, ShieldAlert, Activity, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface Risk {
  id: string;
  title: string;
  category: string;
  department: string;
  status: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  created_at: string;
  updated_at?: string;
  description?: string;
  risk_reference?: string;
  mitigation_plan?: string;
  mitigation_actions?: any;
  treatment_strategy?: string;
  treatment_timeline?: string;
  target_date?: string;
  review_date?: string;
  inherent_likelihood_rationale?: string;
  inherent_impact_rationale?: string;
  residual_likelihood_rationale?: string;
  residual_impact_rationale?: string;
  control_effectiveness_rating?: string;
  control_effectiveness_score?: number;
  owner_profile?: { full_name: string };
}

interface ExportReportsMenuProps {
  risks: Risk[];
}

const BRAND = {
  primary: [22, 78, 51] as [number, number, number], // deep green
  primarySoft: [232, 244, 236] as [number, number, number],
  text: [30, 41, 59] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  high: [220, 38, 38] as [number, number, number],
  med: [217, 119, 6] as [number, number, number],
  low: [22, 163, 74] as [number, number, number],
};

const LOGO_PATH = '/nrs-logo.jpg';

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_PATH);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function severityOf(score: number): { label: string; color: [number, number, number] } {
  if (score >= 15) return { label: 'High', color: BRAND.high };
  if (score >= 8) return { label: 'Medium', color: BRAND.med };
  return { label: 'Low', color: BRAND.low };
}

function drawHeader(doc: jsPDF, logo: string | null, title: string, subtitle: string) {
  const pageWidth = doc.internal.pageSize.width;
  // Header band
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageWidth, 28, 'F');

  if (logo) {
    try { doc.addImage(logo, 'JPEG', 10, 5, 18, 18); } catch { /* ignore */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('NRS Risk Radar', 32, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Enterprise Risk Management • ISO 31000', 32, 19);

  // Title row
  doc.setTextColor(...BRAND.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 10, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.muted);
  doc.text(subtitle, 10, 46);

  // Divider
  doc.setDrawColor(...BRAND.border);
  doc.setLineWidth(0.3);
  doc.line(10, 49, pageWidth - 10, 49);
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND.border);
    doc.line(10, pageHeight - 14, pageWidth - 10, pageHeight - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text('NRS Risk Radar — Confidential', 10, pageHeight - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 10, pageHeight - 8, { align: 'right' });
    doc.text(new Date().toLocaleString(), pageWidth / 2, pageHeight - 8, { align: 'center' });
  }
}

function statBox(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, accent: [number, number, number]) {
  doc.setFillColor(...BRAND.primarySoft);
  doc.setDrawColor(...BRAND.border);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setFillColor(...accent);
  doc.rect(x, y, 2, h, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  doc.text(label.toUpperCase(), x + 5, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.text);
  doc.text(value, x + 5, y + 17);
}

function aggregate(risks: Risk[]) {
  const total = risks.length;
  const open = risks.filter(r => r.status !== 'Mitigated' && r.status !== 'Closed').length;
  const mitigated = risks.filter(r => r.status === 'Mitigated' || r.status === 'Closed').length;
  const inherentScores = risks.map(r => (r.inherent_likelihood || 0) * (r.inherent_impact || 0));
  const residualScores = risks.map(r => (r.residual_likelihood || 0) * (r.residual_impact || 0));
  const high = residualScores.filter(s => s >= 15).length;
  const medium = residualScores.filter(s => s >= 8 && s < 15).length;
  const low = residualScores.filter(s => s < 8).length;
  const avgInherent = total ? inherentScores.reduce((a, b) => a + b, 0) / total : 0;
  const avgResidual = total ? residualScores.reduce((a, b) => a + b, 0) / total : 0;
  const reduction = avgInherent ? ((avgInherent - avgResidual) / avgInherent) * 100 : 0;

  const byCategory: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  risks.forEach(r => {
    byCategory[r.category || 'Uncategorized'] = (byCategory[r.category || 'Uncategorized'] || 0) + 1;
    byDepartment[r.department || 'Unassigned'] = (byDepartment[r.department || 'Unassigned'] || 0) + 1;
    byStatus[r.status || 'Unknown'] = (byStatus[r.status || 'Unknown'] || 0) + 1;
  });

  const topRisks = [...risks]
    .map(r => ({ r, score: (r.residual_likelihood || 0) * (r.residual_impact || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return { total, open, mitigated, high, medium, low, avgInherent, avgResidual, reduction, byCategory, byDepartment, byStatus, topRisks };
}

export function ExportReportsMenu({ risks }: ExportReportsMenuProps) {
  // ───────────────────────────── Executive Summary (PDF) ─────────────────────────────
  const exportExecutiveSummary = async () => {
    const logo = await loadLogoDataUrl();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const a = aggregate(risks);

    drawHeader(doc, logo, 'Executive Risk Dashboard Report', `Generated ${new Date().toLocaleDateString()} • ${a.total} risks in scope`);

    // KPI row
    const colW = (pageWidth - 20 - 9) / 4;
    let y = 56;
    statBox(doc, 10, y, colW, 22, 'Total Risks', String(a.total), BRAND.primary);
    statBox(doc, 10 + (colW + 3) * 1, y, colW, 22, 'Open', String(a.open), BRAND.med);
    statBox(doc, 10 + (colW + 3) * 2, y, colW, 22, 'High Severity', String(a.high), BRAND.high);
    statBox(doc, 10 + (colW + 3) * 3, y, colW, 22, 'Risk Reduction', `${a.reduction.toFixed(1)}%`, BRAND.low);

    y += 30;
    // Narrative
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.text);
    doc.text('Executive Overview', 10, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    const narrative = `The portfolio currently contains ${a.total} active risks, of which ${a.open} remain open and ${a.mitigated} have been mitigated or closed. ` +
      `${a.high} risk(s) sit above the high-severity threshold (score ≥ 15) and require executive attention. ` +
      `Average inherent score is ${a.avgInherent.toFixed(1)} and residual is ${a.avgResidual.toFixed(1)}, representing a ${a.reduction.toFixed(1)}% reduction from controls.`;
    const lines = doc.splitTextToSize(narrative, pageWidth - 20);
    doc.text(lines, 10, y + 5);
    y += 5 + lines.length * 4 + 6;

    // Severity distribution table
    autoTable(doc, {
      startY: y,
      head: [['Severity', 'Count', 'Share']],
      body: [
        ['High (≥15)', a.high, a.total ? `${((a.high / a.total) * 100).toFixed(1)}%` : '—'],
        ['Medium (8–14)', a.medium, a.total ? `${((a.medium / a.total) * 100).toFixed(1)}%` : '—'],
        ['Low (<8)', a.low, a.total ? `${((a.low / a.total) * 100).toFixed(1)}%` : '—'],
      ],
      theme: 'grid',
      headStyles: { fillColor: BRAND.primary, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9 },
      margin: { left: 10, right: 10 },
    });

    // Top 10 risks
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [['#', 'Title', 'Category', 'Department', 'Status', 'Score', 'Severity']],
      body: a.topRisks.map((t, i) => {
        const sev = severityOf(t.score);
        return [i + 1, t.r.title, t.r.category, t.r.department || '—', t.r.status, t.score, sev.label];
      }),
      theme: 'striped',
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 8 }, 5: { halign: 'center' }, 6: { halign: 'center' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 6) {
          const sev = severityOf(a.topRisks[data.row.index].score);
          data.cell.styles.textColor = sev.color;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 10, right: 10 },
    });

    // Category breakdown
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [['Category', 'Count', 'Share']],
      body: Object.entries(a.byCategory)
        .sort((x, y) => y[1] - x[1])
        .map(([k, v]) => [k, v, a.total ? `${((v / a.total) * 100).toFixed(1)}%` : '—']),
      theme: 'grid',
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 9 },
      margin: { left: 10, right: 10 },
    });

    drawFooter(doc);
    doc.save(`NRS-Executive-Risk-Summary-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Executive summary exported');
  };

  // Helper: section heading
  const sectionHeading = (doc: jsPDF, y: number, text: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.text);
    doc.text(text, 10, y);
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.6);
    doc.line(10, y + 1.5, 60, y + 1.5);
    return y + 6;
  };

  const paragraph = (doc: jsPDF, y: number, text: string, pageWidth: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    const lines = doc.splitTextToSize(text, pageWidth - 20);
    doc.text(lines, 10, y);
    return y + lines.length * 4 + 4;
  };

  // ── Runtime layout safety helpers ──
  // Top safe boundary (below the header band drawn by drawHeader)
  const HEADER_BOTTOM = 52;
  const FOOTER_TOP = 280; // page height ~297 (A4) — keep clear of footer band

  // Make sure we have `needed` mm of vertical space; otherwise add a page and reset cursor.
  const ensureSpace = (doc: jsPDF, cursor: number, needed = 20): number => {
    if (cursor + needed > FOOTER_TOP) {
      doc.addPage();
      return HEADER_BOTTOM;
    }
    // Also guard against an invalid negative/NaN cursor that would render off-page
    if (!isFinite(cursor) || cursor < HEADER_BOTTOM) return HEADER_BOTTOM;
    return cursor;
  };

  // Safely read autoTable's last finalY; warn + fall back if missing so the next
  // section never collides with the page header or renders behind the first page.
  const afterTable = (doc: jsPDF, fallback: number, gap = 8): number => {
    const last = (doc as any).lastAutoTable;
    const finalY = last && typeof last.finalY === 'number' ? last.finalY : null;
    if (finalY == null || finalY < HEADER_BOTTOM) {
      // eslint-disable-next-line no-console
      console.warn('[ExportReports] autoTable finalY missing/invalid — falling back', { finalY, fallback });
      return ensureSpace(doc, fallback + gap, 10);
    }
    return ensureSpace(doc, finalY + gap, 10);
  };

  // Verify the first content block actually lands on page 1, below the header.
  const assertOnFirstPage = (doc: jsPDF, y: number, label: string) => {
    if (doc.getNumberOfPages() !== 1 || y < HEADER_BOTTOM || y > FOOTER_TOP) {
      // eslint-disable-next-line no-console
      console.warn(`[ExportReports] "${label}" rendered outside first-page safe area`, {
        page: doc.getNumberOfPages(), y,
      });
    }
  };

  // Build a short narrative for a single risk from its actual register fields.
  const buildRiskNarrative = (r: Risk, inh: number, res: number) => {
    const drivers: string[] = [];
    if (r.inherent_likelihood_rationale) drivers.push(r.inherent_likelihood_rationale.trim());
    if (r.inherent_impact_rationale) drivers.push(r.inherent_impact_rationale.trim());
    if (!drivers.length && r.description) drivers.push(r.description.trim());
    const driverText = drivers.length
      ? drivers.join(' ')
      : `No inherent driver rationale recorded. Inherent score ${inh} reflects likelihood ${r.inherent_likelihood} × impact ${r.inherent_impact}.`;

    const controls: string[] = [];
    if (r.mitigation_plan) controls.push(r.mitigation_plan.trim());
    if (Array.isArray(r.mitigation_actions) && r.mitigation_actions.length) {
      const acts = r.mitigation_actions
        .map((a: any) => (typeof a === 'string' ? a : a?.action || a?.title || a?.description))
        .filter(Boolean);
      if (acts.length) controls.push(`Active actions: ${acts.slice(0, 3).join('; ')}.`);
    }
    if (r.control_effectiveness_rating) controls.push(`Control effectiveness rated "${r.control_effectiveness_rating}"${r.control_effectiveness_score ? ` (${r.control_effectiveness_score}/5)` : ''}.`);
    if (r.residual_likelihood_rationale || r.residual_impact_rationale) {
      controls.push([r.residual_likelihood_rationale, r.residual_impact_rationale].filter(Boolean).join(' '));
    }
    const controlText = controls.length
      ? controls.join(' ')
      : 'No mitigation plan or control rationale recorded for this risk.';

    const reductionPct = inh ? Math.round(((inh - res) / inh) * 100) : 0;
    const next: string[] = [];
    if (res >= 15) next.push('Escalate to ERMSC and require a treatment update within 14 days.');
    if (reductionPct < 25 && inh > 0) next.push(`Strengthen controls — current inherent-to-residual reduction is only ${reductionPct}%.`);
    if (!r.owner_profile?.full_name) next.push('Assign an accountable risk owner.');
    if (!r.target_date) next.push('Set a target treatment completion date.');
    else if (new Date(r.target_date).getTime() < Date.now()) next.push(`Target date (${new Date(r.target_date).toLocaleDateString()}) has passed — re-baseline the plan.`);
    if (!r.review_date) next.push('Schedule a formal review date.');
    if (r.treatment_strategy) next.push(`Continue "${r.treatment_strategy}" treatment strategy${r.treatment_timeline ? ` (timeline: ${r.treatment_timeline})` : ''}.`);
    if (!next.length) next.push('Maintain current controls and confirm effectiveness at next scheduled review.');

    return { driverText, controlText, nextSteps: next };
  };


  // ───────────────────────────── Top Risks Brief (PDF) ─────────────────────────────
  const exportTopRisksBrief = async () => {
    if (!risks.length) {
      toast.error('No risks available to generate the brief');
      return;
    }
    const logo = await loadLogoDataUrl();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const a = aggregate(risks);
    drawHeader(doc, logo, 'Top Risks Brief', `Top ${a.topRisks.length} risks by residual score • ${new Date().toLocaleDateString()}`);

    // KPI strip
    const colW = (pageWidth - 20 - 9) / 4;
    let y = 56;
    statBox(doc, 10, y, colW, 22, 'Risks in Scope', String(a.total), BRAND.primary);
    statBox(doc, 10 + (colW + 3), y, colW, 22, 'High Severity', String(a.high), BRAND.high);
    statBox(doc, 10 + (colW + 3) * 2, y, colW, 22, 'Avg Residual', a.avgResidual.toFixed(1), BRAND.med);
    statBox(doc, 10 + (colW + 3) * 3, y, colW, 22, 'Risk Reduction', `${a.reduction.toFixed(1)}%`, BRAND.low);
    y += 30;
    assertOnFirstPage(doc, y, 'Top Risks Brief — KPI strip');

    // Narrative
    y = sectionHeading(doc, y, 'Why These Risks Matter');
    const topHigh = a.topRisks.filter(t => t.score >= 15).length;
    const lead = a.topRisks[0];
    const leadName = lead ? `"${lead.r.title}"` : 'the leading exposure';
    y = paragraph(doc, y,
      `This brief ranks the ${a.topRisks.length} most material risks by residual score. ` +
      `${topHigh} of them currently breach the high-severity threshold (score ≥ 15) and warrant immediate executive review. ` +
      `${leadName} represents the largest residual exposure with a score of ${lead ? lead.score : 0}. ` +
      `Average residual score across the top tier is ${(a.topRisks.reduce((s, t) => s + t.score, 0) / Math.max(a.topRisks.length, 1)).toFixed(1)}, ` +
      `compared to the portfolio-wide residual average of ${a.avgResidual.toFixed(1)}.`,
      pageWidth);
    assertOnFirstPage(doc, y, 'Top Risks Brief — narrative');

    // Top risks table
    y = sectionHeading(doc, ensureSpace(doc, y + 2, 30), 'Ranked Top Risks');
    autoTable(doc, {
      startY: y,
      head: [['#', 'Risk Title', 'Owner', 'Department', 'Inherent', 'Residual', 'Reduction', 'Severity', 'Status']],
      body: a.topRisks.map((t, i) => {
        const inh = (t.r.inherent_likelihood || 0) * (t.r.inherent_impact || 0);
        const red = inh ? `${(((inh - t.score) / inh) * 100).toFixed(0)}%` : '—';
        const sev = severityOf(t.score);
        return [i + 1, t.r.title, t.r.owner_profile?.full_name || 'Unassigned', t.r.department || '—', inh, t.score, red, sev.label, t.r.status];
      }),
      theme: 'striped',
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 8 }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7) {
          const sev = severityOf(a.topRisks[data.row.index].score);
          data.cell.styles.textColor = sev.color;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 10, right: 10 },
    });

    // Per-risk narrative profiles (top 5)
    let cursor = afterTable(doc, y + 60, 8);
    cursor = sectionHeading(doc, cursor, 'Detailed Profiles — Top 5');
    a.topRisks.slice(0, 5).forEach((t, idx) => {
      const inh = (t.r.inherent_likelihood || 0) * (t.r.inherent_impact || 0);
      const sev = severityOf(t.score);
      const narrative = buildRiskNarrative(t.r, inh, t.score);

      // Pre-measure body text height so the card grows with content and never overflows the footer.
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const bodyWidth = pageWidth - 28;
      const driverLines = doc.splitTextToSize(`Inherent drivers: ${narrative.driverText}`, bodyWidth);
      const controlLines = doc.splitTextToSize(`Current controls: ${narrative.controlText}`, bodyWidth);
      const stepsLines = narrative.nextSteps.flatMap(s => doc.splitTextToSize(`• ${s}`, bodyWidth));
      const headerH = 18; // title + meta + score line
      const bodyH = (driverLines.length + controlLines.length + stepsLines.length) * 4 + 14; // +section labels/spacing
      const cardH = headerH + bodyH;

      cursor = ensureSpace(doc, cursor, cardH + 4);

      // Card background
      doc.setFillColor(...BRAND.primarySoft);
      doc.setDrawColor(...BRAND.border);
      doc.roundedRect(10, cursor, pageWidth - 20, cardH, 2, 2, 'FD');
      doc.setFillColor(...sev.color);
      doc.rect(10, cursor, 2, cardH, 'F');

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.text);
      const refTag = t.r.risk_reference ? `[${t.r.risk_reference}] ` : '';
      doc.text(`#${idx + 1}. ${refTag}${t.r.title}`, 14, cursor + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.muted);
      doc.text(`Owner: ${t.r.owner_profile?.full_name || 'Unassigned'}  •  Dept: ${t.r.department || '—'}  •  Category: ${t.r.category || '—'}  •  Status: ${t.r.status}`, 14, cursor + 11);
      doc.text(`Inherent ${inh}  →  Residual ${t.score}  •  Severity ${sev.label}  •  Created ${new Date(t.r.created_at).toLocaleDateString()}`, 14, cursor + 16);

      // Narrative body
      let by = cursor + headerH + 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...BRAND.text);
      doc.text('Inherent drivers', 14, by);
      by += 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BRAND.muted);
      doc.text(driverLines, 14, by);
      by += driverLines.length * 4 + 2;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND.text);
      doc.text('Current controls', 14, by);
      by += 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BRAND.muted);
      doc.text(controlLines, 14, by);
      by += controlLines.length * 4 + 2;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND.text);
      doc.text('Recommended next steps', 14, by);
      by += 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BRAND.muted);
      doc.text(stepsLines, 14, by);

      cursor += cardH + 4;
    });

    // Recommendations
    cursor = ensureSpace(doc, cursor + 2, 40);
    cursor = sectionHeading(doc, cursor, 'Executive Recommendations');
    const recs = [
      `Escalate the ${topHigh} high-severity risk(s) to the next ERMSC meeting for treatment review.`,
      `Re-validate residual scores for the top 5 risks within 30 days to confirm control effectiveness.`,
      `Mobilise additional mitigation resources for risks where inherent-to-residual reduction is below 25%.`,
      `Confirm risk owners and treatment timelines for any item shown as Unassigned or without a status update in the last quarter.`,
    ];
    recs.forEach(r => {
      cursor = ensureSpace(doc, cursor, 12);
      cursor = paragraph(doc, cursor, `• ${r}`, pageWidth);
    });

    drawFooter(doc);
    doc.save(`NRS-Top-Risks-Brief-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Top risks brief exported');
  };

  // ───────────────────────────── Compliance / ISO 31000 (PDF) ─────────────────────────────
  const exportComplianceReport = async () => {
    if (!risks.length) {
      toast.error('No risks available to generate the compliance snapshot');
      return;
    }
    const logo = await loadLogoDataUrl();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const a = aggregate(risks);
    drawHeader(doc, logo, 'ISO 31000 Compliance Snapshot', `Risk lifecycle and treatment posture • ${new Date().toLocaleDateString()}`);

    // KPI strip
    const colW = (pageWidth - 20 - 9) / 4;
    let y = 56;
    const treated = a.mitigated;
    const treatmentRate = a.total ? (treated / a.total) * 100 : 0;
    const reviewedRecently = risks.filter(r => {
      const updated = new Date((r as any).updated_at || r.created_at).getTime();
      return Date.now() - updated < 90 * 24 * 60 * 60 * 1000;
    }).length;
    const reviewRate = a.total ? (reviewedRecently / a.total) * 100 : 0;

    statBox(doc, 10, y, colW, 22, 'Risks Logged', String(a.total), BRAND.primary);
    statBox(doc, 10 + (colW + 3), y, colW, 22, 'Treatment Rate', `${treatmentRate.toFixed(0)}%`, BRAND.low);
    statBox(doc, 10 + (colW + 3) * 2, y, colW, 22, 'Reviewed (90d)', `${reviewRate.toFixed(0)}%`, BRAND.med);
    statBox(doc, 10 + (colW + 3) * 3, y, colW, 22, 'Open High Risks', String(a.high), BRAND.high);
    y += 30;
    assertOnFirstPage(doc, y, 'ISO Compliance — KPI strip');

    // ISO 31000 principles checklist
    y = sectionHeading(doc, y, 'ISO 31000:2018 Principles — Conformance');
    const principles: [string, string, string][] = [
      ['Integrated', 'Risk management embedded in governance & decision making', a.total > 0 ? 'Conformant' : 'Gap'],
      ['Structured & Comprehensive', 'Consistent process applied across all departments', Object.keys(a.byDepartment).length >= 3 ? 'Conformant' : 'Partial'],
      ['Customized', 'Risks classified by category and impact context', Object.keys(a.byCategory).length >= 3 ? 'Conformant' : 'Partial'],
      ['Inclusive', 'Risk ownership assigned to accountable individuals', risks.filter(r => r.owner_profile?.full_name).length / Math.max(a.total, 1) >= 0.8 ? 'Conformant' : 'Partial'],
      ['Dynamic', 'Risks re-assessed on a regular cadence', reviewRate >= 60 ? 'Conformant' : 'Gap'],
      ['Best Available Information', 'Inherent and residual scores recorded', risks.filter(r => r.residual_impact && r.residual_likelihood).length / Math.max(a.total, 1) >= 0.9 ? 'Conformant' : 'Partial'],
      ['Human & Cultural Factors', 'Departmental coverage demonstrates engagement', Object.keys(a.byDepartment).length >= 5 ? 'Conformant' : 'Partial'],
      ['Continual Improvement', 'Reduction from inherent to residual achieved', a.reduction >= 20 ? 'Conformant' : 'Partial'],
    ];
    autoTable(doc, {
      startY: y,
      head: [['Principle', 'Expectation', 'Status']],
      body: principles,
      theme: 'grid',
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' }, 2: { cellWidth: 28, halign: 'center', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const v = String(data.cell.raw);
          data.cell.styles.textColor = v === 'Conformant' ? BRAND.low : v === 'Partial' ? BRAND.med : BRAND.high;
        }
      },
      margin: { left: 10, right: 10 },
    });

    // Lifecycle status
    let cursor = afterTable(doc, y + 60, 8);
    cursor = sectionHeading(doc, cursor, 'Risk Lifecycle Status');
    autoTable(doc, {
      startY: cursor,
      head: [['Status', 'Count', 'Share']],
      body: Object.entries(a.byStatus).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, v, a.total ? `${((v / a.total) * 100).toFixed(1)}%` : '—']),
      theme: 'grid',
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 9 },
      margin: { left: 10, right: 10 },
    });

    // Departmental coverage
    cursor = afterTable(doc, cursor + 40, 8);
    cursor = sectionHeading(doc, cursor, 'Departmental Coverage & Severity');
    autoTable(doc, {
      startY: cursor,
      head: [['Department', 'Total', 'High', 'Medium', 'Low', 'Avg Residual']],
      body: Object.entries(a.byDepartment).sort((x, y) => y[1] - x[1]).map(([dept, count]) => {
        const deptRisks = risks.filter(r => (r.department || 'Unassigned') === dept);
        const h = deptRisks.filter(r => (r.residual_likelihood * r.residual_impact) >= 15).length;
        const m = deptRisks.filter(r => {
          const s = r.residual_likelihood * r.residual_impact;
          return s >= 8 && s < 15;
        }).length;
        const l = deptRisks.filter(r => (r.residual_likelihood * r.residual_impact) < 8).length;
        const avg = deptRisks.length
          ? deptRisks.reduce((s, r) => s + r.residual_likelihood * r.residual_impact, 0) / deptRisks.length
          : 0;
        return [dept, count, h, m, l, avg.toFixed(1)];
      }),
      theme: 'striped',
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 9 },
      margin: { left: 10, right: 10 },
    });

    // Evidence / Supporting Records — links back to register items
    cursor = afterTable(doc, cursor + 40, 8);
    cursor = sectionHeading(doc, cursor, 'Evidence / Supporting Records');
    cursor = paragraph(doc, cursor,
      'The following risk register entries support the conformance assessment above. ' +
      'Each row links to the live record in the NRS Risk Radar register so reviewers can verify status, ownership, and treatment evidence.',
      pageWidth);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const evidenceRows = [...risks]
      .sort((x, y) => (y.residual_likelihood * y.residual_impact) - (x.residual_likelihood * x.residual_impact))
      .slice(0, 25)
      .map(r => {
        const score = (r.residual_likelihood || 0) * (r.residual_impact || 0);
        const ref = r.risk_reference || r.id.slice(0, 8);
        const lastUpdated = r.updated_at ? new Date(r.updated_at).toLocaleDateString() : new Date(r.created_at).toLocaleDateString();
        const url = `${origin}/risk-register?risk=${r.id}`;
        return {
          ref, title: r.title, owner: r.owner_profile?.full_name || 'Unassigned',
          status: r.status, score, lastUpdated, url,
        };
      });

    autoTable(doc, {
      startY: cursor,
      head: [['Reference', 'Risk Title', 'Owner', 'Status', 'Residual', 'Last Updated', 'Evidence Link']],
      body: evidenceRows.map(e => [e.ref, e.title, e.owner, e.status, e.score, e.lastUpdated, 'Open record']),
      theme: 'striped',
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: 'bold' },
        4: { halign: 'center' },
        6: { textColor: BRAND.primary, fontStyle: 'bold' },
      },
      margin: { left: 10, right: 10 },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 6) {
          const row = evidenceRows[data.row.index];
          if (row?.url) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: row.url });
          }
        }
      },
    });

    // Compliance attestation
    cursor = afterTable(doc, cursor + 60, 8);
    cursor = ensureSpace(doc, cursor, 40);
    cursor = sectionHeading(doc, cursor, 'Attestation');
    cursor = paragraph(doc, cursor,
      `This snapshot was generated from the live NRS Risk Radar register on ${new Date().toLocaleString()}. ` +
      `It reflects the organization's current alignment with ISO 31000:2018 risk management principles. ` +
      `Items marked "Partial" or "Gap" should be addressed in the next ERMSC review cycle. ` +
      `Evidence records (above) are hyperlinked to live register entries for traceability. ` +
      `Average residual score is ${a.avgResidual.toFixed(2)} with an overall ${a.reduction.toFixed(1)}% reduction from inherent exposure, ` +
      `indicating ${a.reduction >= 30 ? 'effective' : a.reduction >= 15 ? 'developing' : 'limited'} control maturity.`,
      pageWidth);

    drawFooter(doc);
    doc.save(`NRS-Compliance-Snapshot-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Compliance snapshot exported');
  };

  // ───────────────────────────── Detailed Report (Excel) ─────────────────────────────
  const exportDetailedReport = () => {
    const a = aggregate(risks);
    const wb = XLSX.utils.book_new();

    // Cover
    const cover = [
      ['NRS Risk Radar — Detailed Risk Report'],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ['Metric', 'Value'],
      ['Total Risks', a.total],
      ['Open Risks', a.open],
      ['Mitigated/Closed', a.mitigated],
      ['High Severity (≥15)', a.high],
      ['Medium Severity (8–14)', a.medium],
      ['Low Severity (<8)', a.low],
      ['Avg Inherent Score', Number(a.avgInherent.toFixed(2))],
      ['Avg Residual Score', Number(a.avgResidual.toFixed(2))],
      ['Risk Reduction %', Number(a.reduction.toFixed(1))],
    ];
    const coverSheet = XLSX.utils.aoa_to_sheet(cover);
    coverSheet['!cols'] = [{ wch: 32 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, coverSheet, 'Summary');

    // Risk Register
    const detail = risks.map(r => {
      const inh = (r.inherent_likelihood || 0) * (r.inherent_impact || 0);
      const res = (r.residual_likelihood || 0) * (r.residual_impact || 0);
      return {
        'Risk ID': r.id,
        'Title': r.title,
        'Category': r.category,
        'Department': r.department || 'N/A',
        'Owner': r.owner_profile?.full_name || 'Unassigned',
        'Status': r.status,
        'Inherent Likelihood': r.inherent_likelihood,
        'Inherent Impact': r.inherent_impact,
        'Inherent Score': inh,
        'Residual Likelihood': r.residual_likelihood,
        'Residual Impact': r.residual_impact,
        'Residual Score': res,
        'Severity': severityOf(res).label,
        'Reduction %': inh ? Number((((inh - res) / inh) * 100).toFixed(1)) : 0,
        'Created Date': new Date(r.created_at).toLocaleDateString(),
      };
    });
    const detailSheet = XLSX.utils.json_to_sheet(detail);
    detailSheet['!cols'] = Object.keys(detail[0] || {}).map(k => ({ wch: Math.max(12, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Risk Register');

    // Top Risks
    const topSheet = XLSX.utils.json_to_sheet(a.topRisks.map((t, i) => ({
      Rank: i + 1,
      Title: t.r.title,
      Category: t.r.category,
      Department: t.r.department || '—',
      Owner: t.r.owner_profile?.full_name || 'Unassigned',
      Status: t.r.status,
      'Residual Score': t.score,
      Severity: severityOf(t.score).label,
    })));
    XLSX.utils.book_append_sheet(wb, topSheet, 'Top Risks');

    XLSX.writeFile(wb, `NRS-Detailed-Risk-Report-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Detailed report exported');
  };

  // ───────────────────────────── Analytics Report (Excel) ─────────────────────────────
  const exportAnalytics = () => {
    const a = aggregate(risks);
    const wb = XLSX.utils.book_new();

    const catData = Object.entries(a.byCategory).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({
      Category: k, Count: v, Percentage: a.total ? Number(((v / a.total) * 100).toFixed(1)) : 0,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catData), 'By Category');

    const statusData = Object.entries(a.byStatus).map(([k, v]) => ({
      Status: k, Count: v, Percentage: a.total ? Number(((v / a.total) * 100).toFixed(1)) : 0,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusData), 'By Status');

    const deptData = Object.entries(a.byDepartment).map(([dept, count]) => {
      const deptRisks = risks.filter(r => (r.department || 'Unassigned') === dept);
      const h = deptRisks.filter(r => (r.residual_likelihood * r.residual_impact) >= 15).length;
      const m = deptRisks.filter(r => {
        const s = r.residual_likelihood * r.residual_impact;
        return s >= 8 && s < 15;
      }).length;
      const l = deptRisks.filter(r => (r.residual_likelihood * r.residual_impact) < 8).length;
      const avg = deptRisks.length
        ? deptRisks.reduce((s, r) => s + r.residual_likelihood * r.residual_impact, 0) / deptRisks.length
        : 0;
      return { Department: dept, Total: count, High: h, Medium: m, Low: l, 'Avg Residual': Number(avg.toFixed(2)) };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deptData), 'By Department');

    // Severity matrix (5x5)
    const matrix: (string | number)[][] = [['Likelihood \\ Impact', 1, 2, 3, 4, 5]];
    for (let l = 5; l >= 1; l--) {
      const row: (string | number)[] = [l];
      for (let i = 1; i <= 5; i++) {
        row.push(risks.filter(r => r.residual_likelihood === l && r.residual_impact === i).length);
      }
      matrix.push(row);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), 'Heatmap Matrix');

    // Monthly trend (last 12 months)
    const months: { Month: string; New: number; Cumulative: number }[] = [];
    let cumulative = 0;
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const newCount = risks.filter(r => {
        const c = new Date(r.created_at);
        return c >= d && c < next;
      }).length;
      cumulative = risks.filter(r => new Date(r.created_at) < next).length;
      months.push({ Month: d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), New: newCount, Cumulative: cumulative });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(months), 'Monthly Trend');

    XLSX.writeFile(wb, `NRS-Risk-Analytics-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Analytics report exported');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Download className="w-4 h-4 mr-2" />
          Export Reports
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>PDF Reports</DropdownMenuLabel>
        <DropdownMenuItem onClick={exportExecutiveSummary}>
          <FileText className="w-4 h-4 mr-2" />
          Executive Summary
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportTopRisksBrief}>
          <ShieldAlert className="w-4 h-4 mr-2" />
          Top Risks Brief
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportComplianceReport}>
          <Building2 className="w-4 h-4 mr-2" />
          ISO 31000 Compliance
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Excel Reports</DropdownMenuLabel>
        <DropdownMenuItem onClick={exportDetailedReport}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Detailed Risk Register
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAnalytics}>
          <FileBarChart className="w-4 h-4 mr-2" />
          Analytics Workbook
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
