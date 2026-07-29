/**
 * Convert a documentation page (markdown) to a branded PDF.
 * Lightweight markdown renderer — supports headings, paragraphs,
 * bullet/numbered lists, blockquotes, inline emphasis, tables, and
 * fenced code blocks. Good enough for the role-based user guides.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  NRS_BRAND,
  drawNrsHeader,
  drawNrsFooter,
  loadNrsLogo,
} from './nrsPdf';
import type { DocPage } from '@/docs/content';
import { getPageRoles, DOC_ROLE_LABELS } from '@/docs/content';

const MARGIN_X = 12;
const HEADER_BOTTOM = 54;
const FOOTER_TOP = 280;

function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[🖱👀💬✅⚠️📊📈📋🔒🎯]/gu, '');
}

function ensureSpace(doc: jsPDF, cursor: number, needed = 10): number {
  if (cursor + needed > FOOTER_TOP) {
    doc.addPage();
    return HEADER_BOTTOM;
  }
  return cursor;
}

function writeText(
  doc: jsPDF,
  y: number,
  text: string,
  opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {},
): number {
  const { size = 10, bold = false, color = NRS_BRAND.text, indent = 0 } = opts;
  const pageWidth = doc.internal.pageSize.width;
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, pageWidth - MARGIN_X * 2 - indent);
  let cursor = y;
  for (const line of lines) {
    cursor = ensureSpace(doc, cursor, size * 0.5);
    doc.text(line, MARGIN_X + indent, cursor);
    cursor += size * 0.5 + 1;
  }
  return cursor + 1;
}

function parseTable(lines: string[], startIndex: number): { rows: string[][]; end: number } | null {
  const header = lines[startIndex];
  const sep = lines[startIndex + 1];
  if (!header?.includes('|') || !/^\s*\|?[\s:|-]+\|?\s*$/.test(sep || '')) return null;
  const toCells = (l: string) =>
    l.replace(/^\||\|$/g, '').split('|').map((c) => stripInline(c.trim()));
  const rows: string[][] = [toCells(header)];
  let i = startIndex + 2;
  while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
    rows.push(toCells(lines[i]));
    i++;
  }
  return { rows, end: i - 1 };
}

function renderMarkdown(doc: jsPDF, markdown: string, startY: number): number {
  const lines = markdown.split('\n');
  let y = startY;
  let inCode = false;
  let codeBuffer: string[] = [];

  const flushCode = () => {
    if (codeBuffer.length === 0) return;
    const pageWidth = doc.internal.pageSize.width;
    const text = codeBuffer.join('\n');
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    const wrapped = doc.splitTextToSize(text, pageWidth - MARGIN_X * 2 - 6);
    const boxH = wrapped.length * 4 + 6;
    y = ensureSpace(doc, y, boxH);
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(...NRS_BRAND.border);
    doc.roundedRect(MARGIN_X, y - 4, pageWidth - MARGIN_X * 2, boxH, 1.5, 1.5, 'FD');
    doc.setTextColor(...NRS_BRAND.text);
    doc.text(wrapped, MARGIN_X + 3, y);
    y += boxH;
    codeBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');

    if (/^```/.test(line)) {
      if (inCode) { flushCode(); inCode = false; } else { inCode = true; }
      continue;
    }
    if (inCode) { codeBuffer.push(raw); continue; }

    if (line.trim() === '') { y += 2; continue; }

    // Tables
    if (line.includes('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const parsed = parseTable(lines, i);
      if (parsed) {
        y = ensureSpace(doc, y, 20);
        autoTable(doc, {
          startY: y,
          head: [parsed.rows[0]],
          body: parsed.rows.slice(1),
          theme: 'grid',
          headStyles: { fillColor: NRS_BRAND.primary, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
          styles: { fontSize: 8.5, cellPadding: 2, textColor: NRS_BRAND.text },
          alternateRowStyles: { fillColor: NRS_BRAND.primarySoft },
          margin: { left: MARGIN_X, right: MARGIN_X },
        });
        y = (doc as any).lastAutoTable.finalY + 4;
        i = parsed.end;
        continue;
      }
    }

    // Headings
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = stripInline(h[2]);
      const size = level === 1 ? 18 : level === 2 ? 14 : level === 3 ? 12 : 10.5;
      y = ensureSpace(doc, y + (level <= 2 ? 4 : 2), size + 4);
      y = writeText(doc, y, text, { size, bold: true, color: NRS_BRAND.primary });
      if (level === 2) {
        const pageWidth = doc.internal.pageSize.width;
        doc.setDrawColor(...NRS_BRAND.border);
        doc.line(MARGIN_X, y - 2, pageWidth - MARGIN_X, y - 2);
        y += 2;
      }
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const text = stripInline(line.replace(/^>\s?/, ''));
      y = ensureSpace(doc, y, 8);
      const pageWidth = doc.internal.pageSize.width;
      const startBar = y - 3;
      const before = y;
      y = writeText(doc, y, text, { size: 9.5, color: NRS_BRAND.muted, indent: 6 });
      doc.setDrawColor(...NRS_BRAND.primary);
      doc.setLineWidth(1.2);
      doc.line(MARGIN_X, startBar, MARGIN_X, before + (y - before) - 4);
      continue;
    }

    // Bullet list
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      const indent = Math.min(bullet[1].length, 8);
      const text = stripInline(bullet[2]);
      y = ensureSpace(doc, y, 6);
      doc.setFillColor(...NRS_BRAND.primary);
      doc.circle(MARGIN_X + indent + 1.5, y - 1.5, 0.7, 'F');
      y = writeText(doc, y, text, { size: 10, indent: indent + 5 });
      continue;
    }

    // Numbered list
    const numbered = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      const indent = Math.min(numbered[1].length, 8);
      const text = stripInline(numbered[3]);
      y = ensureSpace(doc, y, 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...NRS_BRAND.primary);
      doc.text(`${numbered[2]}.`, MARGIN_X + indent, y);
      y = writeText(doc, y, text, { size: 10, indent: indent + 6 });
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      const pageWidth = doc.internal.pageSize.width;
      y = ensureSpace(doc, y, 6);
      doc.setDrawColor(...NRS_BRAND.border);
      doc.line(MARGIN_X, y, pageWidth - MARGIN_X, y);
      y += 4;
      continue;
    }

    // Paragraph
    y = writeText(doc, y, stripInline(line), { size: 10 });
  }

  if (inCode) flushCode();
  return y;
}

export async function exportDocPageToPdf(page: DocPage): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadNrsLogo();
  const roles = getPageRoles(page);
  const rolesLabel = roles.length
    ? roles.map((r) => `${r} — ${DOC_ROLE_LABELS[r]}`).join(', ')
    : page.group;
  const subtitle = `${page.group} • ${rolesLabel} • Generated ${new Date().toLocaleDateString()}`;

  drawNrsHeader(doc, logo, page.title, subtitle);

  let y = HEADER_BOTTOM;
  if (page.description) {
    y = writeText(doc, y, page.description, { size: 10, color: NRS_BRAND.muted });
    y += 2;
  }
  renderMarkdown(doc, page.content, y);
  drawNrsFooter(doc);

  const safe = page.slug.replace(/[^a-z0-9-_]/gi, '-');
  doc.save(`NRS-RMP-${safe}.pdf`);
}
