import jsPDF from 'jspdf';
import type { BCPFormState } from '@/hooks/useBCPForm';
import { normalizeFinding } from '@/lib/bcpTests';

const MARGIN = 16;
const LINE = 6;

/** Renders a single continuity plan to a shareable PDF and triggers the download. */
export function exportBCPPlanToPDF(form: BCPFormState, options?: { reference?: string }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  let y = MARGIN;

  const ensureSpace = (needed = LINE) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const heading = (text: string) => {
    ensureSpace(14);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(text, MARGIN, y);
    y += 2;
    doc.setDrawColor(200);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += LINE;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
  };

  const row = (label: string, value?: string | number | null) => {
    const text = value === null || value === undefined || value === '' ? '—' : String(value);
    const wrapped = doc.splitTextToSize(text, pageWidth - MARGIN * 2 - 50);
    ensureSpace(wrapped.length * LINE);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(wrapped, MARGIN + 50, y);
    y += wrapped.length * LINE;
  };

  const bullet = (text: string) => {
    const wrapped = doc.splitTextToSize(`• ${text}`, pageWidth - MARGIN * 2 - 4);
    ensureSpace(wrapped.length * LINE);
    doc.text(wrapped, MARGIN + 4, y);
    y += wrapped.length * LINE;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Business Continuity Plan', MARGIN, y);
  y += 8;
  doc.setFontSize(12);
  doc.text(form.title || 'Untitled plan', MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${options?.reference ? `${options.reference} · ` : ''}Generated ${new Date().toLocaleString()}`,
    MARGIN,
    y,
  );
  doc.setTextColor(0);
  y += 4;

  heading('Plan basics');
  row('Department', form.department);
  row('Business function', form.businessFunction);
  row('Owner', form.ownerId ? 'Assigned' : 'Unassigned');
  row('Status', form.status);
  row('RTO (hours)', form.recoveryTimeObjective);
  row('RPO (hours)', form.recoveryPointObjective);
  row('Dependencies', form.dependencies.filter((d) => d.trim()).join(', '));
  row('Description', form.description);

  heading('Mitigation actions');
  if (form.mitigationActions.length === 0) {
    bullet('No mitigation actions recorded.');
  } else {
    form.mitigationActions.forEach((a) =>
      bullet(
        `${a.action || 'Untitled action'} — ${a.responsible || 'Unassigned'} · due ${
          a.target_date || 'n/a'
        } · ${a.status}`,
      ),
    );
  }

  heading('Business impact assessment');
  row('Criticality', form.biaCriticalityRating);
  row(
    'Financial impact',
    form.biaFinancialImpact ? `NGN ${Number(form.biaFinancialImpact).toLocaleString()}` : '',
  );
  row('Max tolerable downtime', form.biaMaxTolerableDowntime ? `${form.biaMaxTolerableDowntime} hours` : '');
  row('Assessment date', form.biaAssessmentDate);
  row('Operational impact', form.biaOperationalImpact);
  row('Reputational impact', form.biaReputationalImpact);
  row('Regulatory impact', form.biaRegulatoryImpact);

  heading('Test history');
  if (form.tests.length === 0) {
    bullet('No exercises recorded.');
  } else {
    form.tests.forEach((t) => {
      ensureSpace(LINE * 2);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `${t.test_type || 'Exercise'} — ${t.test_status} (${t.performed_date || t.scheduled_date || 'no date'})`,
        MARGIN,
        y,
      );
      doc.setFont('helvetica', 'normal');
      y += LINE;
      if (t.test_scope) bullet(`Scope: ${t.test_scope}`);
      if (t.participants) bullet(`Participants: ${t.participants}`);
      if (t.test_results) bullet(`Results: ${t.test_results}`);
      if (t.cancellation_reason) bullet(`Cancellation reason: ${t.cancellation_reason}`);
      (t.findings || []).map(normalizeFinding).forEach((f, fi) => {
        bullet(
          `Finding ${fi + 1} [${f.severity}/${f.status}] ${f.description || '—'}` +
            `${f.action ? ` · Action: ${f.action}` : ''}` +
            `${f.owner_name ? ` · Owner: ${f.owner_name}` : ''}` +
            `${f.due_date ? ` · Due: ${f.due_date}` : ''}`,
        );
      });
    });
  }

  const safe = (form.title || 'bcp-plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
  doc.save(`${safe}-${new Date().toISOString().split('T')[0]}.pdf`);
}
