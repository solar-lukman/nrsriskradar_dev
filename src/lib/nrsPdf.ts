/**
 * Shared NRS-branded PDF helpers.
 * Adopts the same header/footer/KPI style used across NRS Risk Radar reports
 * (see src/components/dashboard/ExportReportsMenu.tsx for the original template).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const NRS_BRAND = {
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

export async function loadNrsLogo(): Promise<string | null> {
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

export function drawNrsHeader(
  doc: jsPDF,
  logo: string | null,
  title: string,
  subtitle: string,
) {
  const pageWidth = doc.internal.pageSize.width;
  doc.setFillColor(...NRS_BRAND.primary);
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

  doc.setTextColor(...NRS_BRAND.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 10, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...NRS_BRAND.muted);
  doc.text(subtitle, 10, 46);

  doc.setDrawColor(...NRS_BRAND.border);
  doc.setLineWidth(0.3);
  doc.line(10, 49, pageWidth - 10, 49);
}

export function drawNrsFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...NRS_BRAND.border);
    doc.line(10, pageHeight - 14, pageWidth - 10, pageHeight - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...NRS_BRAND.muted);
    doc.text('NRS Risk Radar — Confidential', 10, pageHeight - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 10, pageHeight - 8, { align: 'right' });
    doc.text(new Date().toLocaleString(), pageWidth / 2, pageHeight - 8, { align: 'center' });
  }
}

export function drawNrsStatBox(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  label: string, value: string,
  accent: [number, number, number] = NRS_BRAND.primary,
) {
  doc.setFillColor(...NRS_BRAND.primarySoft);
  doc.setDrawColor(...NRS_BRAND.border);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setFillColor(...accent);
  doc.rect(x, y, 2, h, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...NRS_BRAND.muted);
  doc.text(label.toUpperCase(), x + 5, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NRS_BRAND.text);
  const valStr = String(value);
  const truncated = valStr.length > 16 ? valStr.slice(0, 15) + '…' : valStr;
  doc.text(truncated, x + 5, y + 16);
}

export function drawNrsSectionHeading(doc: jsPDF, y: number, text: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NRS_BRAND.text);
  doc.text(text, 10, y);
  doc.setDrawColor(...NRS_BRAND.primary);
  doc.setLineWidth(0.6);
  doc.line(10, y + 1.5, 60, y + 1.5);
  return y + 6;
}

export function drawNrsParagraph(doc: jsPDF, y: number, text: string): number {
  const pageWidth = doc.internal.pageSize.width;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...NRS_BRAND.muted);
  const lines = doc.splitTextToSize(text, pageWidth - 20);
  doc.text(lines, 10, y);
  return y + lines.length * 4 + 4;
}

const HEADER_BOTTOM = 52;
const FOOTER_TOP = 280;

export function ensureNrsSpace(doc: jsPDF, cursor: number, needed = 20): number {
  if (cursor + needed > FOOTER_TOP) {
    doc.addPage();
    return HEADER_BOTTOM;
  }
  if (!isFinite(cursor) || cursor < HEADER_BOTTOM) return HEADER_BOTTOM;
  return cursor;
}

export function afterNrsTable(doc: jsPDF, fallback: number, gap = 8): number {
  const last = (doc as any).lastAutoTable;
  const finalY = last && typeof last.finalY === 'number' ? last.finalY : null;
  if (finalY == null || finalY < HEADER_BOTTOM) {
    return ensureNrsSpace(doc, fallback + gap, 10);
  }
  return ensureNrsSpace(doc, finalY + gap, 10);
}

export interface NrsKeyValueRow { label: string; value: string | number }

/** Render a 2-column key/value table styled with NRS brand colors. */
export function renderNrsKeyValueTable(
  doc: jsPDF,
  startY: number,
  rows: NrsKeyValueRow[],
): number {
  autoTable(doc, {
    startY,
    head: [['Metric', 'Value']],
    body: rows.map(r => [r.label, String(r.value)]),
    theme: 'grid',
    headStyles: { fillColor: NRS_BRAND.primary, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2.5, textColor: NRS_BRAND.text },
    alternateRowStyles: { fillColor: NRS_BRAND.primarySoft },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 10, right: 10 },
  });
  return afterNrsTable(doc, startY + 20, 6);
}
