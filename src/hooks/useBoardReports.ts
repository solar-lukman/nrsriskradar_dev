import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import {
  loadNrsLogo,
  drawNrsHeader,
  drawNrsFooter,
  drawNrsSectionHeading,
  drawNrsParagraph,
  renderNrsKeyValueTable,
  ensureNrsSpace,
} from '@/lib/nrsPdf';

interface ReportSection {
  title: string;
  content: string;
  data?: Array<{ label: string; value: string | number }>;
}

const ratingToPercent = (rating: unknown): number => {
  if (typeof rating === 'number') return rating;
  if (typeof rating === 'string') {
    switch (rating.toLowerCase()) {
      case 'high': return 90;
      case 'medium': return 60;
      case 'low': return 30;
      default: return 0;
    }
  }
  return 0;
};

type ReportType = 'quarterly' | 'annual' | 'emergency' | 'compliance' | 'kri';

export function useBoardReports() {
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [activeReport, setActiveReport] = useState<{ title: string; period: string } | null>(null);

  const fetchRisks = async () => {
    const { data } = await supabase
      .from('risks')
      .select('*, owner_profile:profiles!risks_owner_id_fkey(full_name)')
      .order('created_at', { ascending: false });
    return data || [];
  };

  const fetchBCPs = async () => {
    const { data } = await supabase
      .from('business_continuity_plans')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  };

  const fetchControls = async () => {
    const { data } = await supabase
      .from('risk_controls')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  };

  const pct = (n: number, total: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%';

  const generateQuarterlyReport = async (): Promise<ReportSection[]> => {
    const risks = await fetchRisks();
    const controls = await fetchControls();
    const total = risks.length;
    const open = risks.filter(r => r.status !== 'Mitigated').length;
    const mitigated = risks.filter(r => r.status === 'Mitigated').length;
    const escalated = risks.filter(r => r.status === 'Escalated').length;
    const high = risks.filter(r => r.inherent_likelihood * r.inherent_impact >= 15).length;
    const avgResidual = total > 0 ? Math.round(risks.reduce((s, r) => s + r.residual_likelihood * r.residual_impact, 0) / total * 10) / 10 : 0;

    const catCounts: Record<string, number> = {};
    const deptCounts: Record<string, number> = {};
    risks.forEach(r => {
      catCounts[r.category] = (catCounts[r.category] || 0) + 1;
      if (r.department) deptCounts[r.department] = (deptCounts[r.department] || 0) + 1;
    });

    const activeControls = controls.filter(c => c.status === 'active').length;
    const avgEffectiveness = controls.length > 0
      ? Math.round(controls.reduce((s, c) => s + ratingToPercent(c.effectiveness_rating), 0) / controls.length)
      : 0;

    return [
      {
        title: 'Executive Summary',
        content: `This quarterly risk assessment covers ${total} identified risks across the organization. ${open} risks remain open, with ${high} classified as high priority (score ≥ 15). The average residual risk score is ${avgResidual}. ${mitigated} risks have been successfully mitigated this period.`,
        data: [
          { label: 'Total Risks', value: total },
          { label: 'Open Risks', value: open },
          { label: 'Mitigated', value: mitigated },
          { label: 'Escalated', value: escalated },
          { label: 'High Priority (≥15)', value: high },
          { label: 'Avg Residual Score', value: avgResidual },
        ],
      },
      {
        title: 'Risk Distribution by Category',
        content: '',
        data: Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => ({
          label: cat, value: `${cnt} (${pct(cnt, total)})`
        })),
      },
      {
        title: 'Risk Distribution by Department',
        content: '',
        data: Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([dept, cnt]) => ({
          label: dept, value: `${cnt} (${pct(cnt, total)})`
        })),
      },
      {
        title: 'Control Effectiveness',
        content: `${activeControls} active controls are in place across all risks with an average effectiveness rating of ${avgEffectiveness}%.`,
        data: [
          { label: 'Active Controls', value: activeControls },
          { label: 'Avg Effectiveness', value: `${avgEffectiveness}%` },
        ],
      },
      {
        title: 'Top 5 Highest Risks',
        content: '',
        data: risks
          .sort((a, b) => (b.residual_likelihood * b.residual_impact) - (a.residual_likelihood * a.residual_impact))
          .slice(0, 5)
          .map((r, i) => ({
            label: `${i + 1}. ${r.title}`,
            value: `Score: ${r.residual_likelihood * r.residual_impact} (${r.status})`
          })),
      },
    ];
  };

  const generateAnnualReport = async (): Promise<ReportSection[]> => {
    const risks = await fetchRisks();
    const controls = await fetchControls();
    const bcps = await fetchBCPs();
    const total = risks.length;
    const mitigated = risks.filter(r => r.status === 'Mitigated').length;
    const open = total - mitigated;
    const high = risks.filter(r => r.inherent_likelihood * r.inherent_impact >= 15).length;

    const totalBudget = risks.reduce((s, r) => s + (Number(r.mitigation_budget) || 0), 0);
    const totalSpent = risks.reduce((s, r) => s + (Number(r.mitigation_budget_spent) || 0), 0);
    const utilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    const catCounts: Record<string, number> = {};
    risks.forEach(r => { catCounts[r.category] = (catCounts[r.category] || 0) + 1; });

    const readyBCPs = bcps.filter(b => b.status === 'Ready').length;
    const testedBCPs = bcps.filter(b => b.test_status === 'Passed').length;

    return [
      {
        title: 'Annual Overview',
        content: `This annual review provides a comprehensive assessment of the organization's risk management effectiveness. A total of ${total} risks were tracked during the year, with ${mitigated} successfully mitigated (${pct(mitigated, total)} mitigation rate). ${high} risks were classified as high priority.`,
        data: [
          { label: 'Total Risks Tracked', value: total },
          { label: 'Risks Mitigated', value: `${mitigated} (${pct(mitigated, total)})` },
          { label: 'Open Risks', value: open },
          { label: 'High Priority Risks', value: high },
        ],
      },
      {
        title: 'Risk Category Trends',
        content: 'Distribution of risks across organizational categories:',
        data: Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => ({
          label: cat, value: `${cnt} risks`
        })),
      },
      {
        title: 'Budget Utilization',
        content: `Total mitigation budget allocated was ₦${totalBudget.toLocaleString()}, with ₦${totalSpent.toLocaleString()} spent (${utilization}% utilization).`,
        data: [
          { label: 'Total Budget', value: `₦${totalBudget.toLocaleString()}` },
          { label: 'Total Spent', value: `₦${totalSpent.toLocaleString()}` },
          { label: 'Utilization', value: `${utilization}%` },
          { label: 'Remaining', value: `₦${(totalBudget - totalSpent).toLocaleString()}` },
        ],
      },
      {
        title: 'Business Continuity Readiness',
        content: `${bcps.length} Business Continuity Plans are maintained. ${readyBCPs} are in "Ready" status and ${testedBCPs} have passed testing.`,
        data: [
          { label: 'Total BCPs', value: bcps.length },
          { label: 'Ready', value: readyBCPs },
          { label: 'Tested & Passed', value: testedBCPs },
        ],
      },
      {
        title: 'Control Effectiveness Summary',
        content: '',
        data: [
          { label: 'Total Controls', value: controls.length },
          { label: 'Active Controls', value: controls.filter(c => c.status === 'active').length },
          { label: 'Avg Effectiveness', value: controls.length > 0 ? `${Math.round(controls.reduce((s, c) => s + ratingToPercent(c.effectiveness_rating), 0) / controls.length)}%` : 'N/A' },
        ],
      },
    ];
  };

  const generateEmergencyReport = async (): Promise<ReportSection[]> => {
    const bcps = await fetchBCPs();
    const risks = await fetchRisks();
    const escalated = risks.filter(r => r.status === 'Escalated');
    const ready = bcps.filter(b => b.status === 'Ready').length;
    const needsReview = bcps.filter(b => b.status === 'Needs Review').length;
    const outdated = bcps.filter(b => b.status === 'Outdated').length;
    const overdueBCPs = bcps.filter(b => b.test_status === 'Overdue').length;

    const deptBCPs: Record<string, number> = {};
    bcps.forEach(b => { deptBCPs[b.department] = (deptBCPs[b.department] || 0) + 1; });

    return [
      {
        title: 'Emergency Readiness Overview',
        content: `The organization maintains ${bcps.length} Business Continuity Plans. ${ready} are in "Ready" status, ${needsReview} need review, and ${outdated} are outdated. ${overdueBCPs} plans have overdue testing.`,
        data: [
          { label: 'Total BCPs', value: bcps.length },
          { label: 'Ready', value: ready },
          { label: 'Needs Review', value: needsReview },
          { label: 'Outdated', value: outdated },
          { label: 'Overdue Testing', value: overdueBCPs },
        ],
      },
      {
        title: 'Escalated Risks Requiring Attention',
        content: escalated.length > 0
          ? `${escalated.length} risks are currently escalated and require immediate attention:`
          : 'No risks are currently in escalated status.',
        data: escalated.slice(0, 10).map(r => ({
          label: r.title,
          value: `Score: ${r.residual_likelihood * r.residual_impact} | ${r.category}`
        })),
      },
      {
        title: 'BCP Coverage by Department',
        content: '',
        data: Object.entries(deptBCPs).sort((a, b) => b[1] - a[1]).map(([dept, cnt]) => ({
          label: dept, value: `${cnt} plans`
        })),
      },
      {
        title: 'Recovery Objectives',
        content: '',
        data: bcps.filter(b => b.recovery_time_objective).slice(0, 8).map(b => ({
          label: b.title,
          value: `RTO: ${b.recovery_time_objective}h | RPO: ${b.recovery_point_objective || 'N/A'}h`
        })),
      },
    ];
  };

  const generateComplianceReport = async (): Promise<ReportSection[]> => {
    const risks = await fetchRisks();
    const complianceRisks = risks.filter(r => ((r.risk_type as string) || '').toLowerCase() === 'compliance');
    const controls = await fetchControls();
    const total = complianceRisks.length;
    const open = complianceRisks.filter(r => r.status !== 'Mitigated').length;
    const mitigated = complianceRisks.filter(r => r.status === 'Mitigated').length;
    const high = complianceRisks.filter(r => r.inherent_likelihood * r.inherent_impact >= 15).length;

    const statusCounts: Record<string, number> = {};
    complianceRisks.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

    const complianceControlIds = new Set(complianceRisks.map(r => r.id));
    const complianceControls = controls.filter(c => complianceControlIds.has(c.risk_id));

    return [
      {
        title: 'Compliance Risk Summary',
        content: `${total} compliance-related risks have been identified. ${open} remain open and ${mitigated} have been mitigated. ${high} are classified as high priority.`,
        data: [
          { label: 'Total Compliance Risks', value: total },
          { label: 'Open', value: open },
          { label: 'Mitigated', value: mitigated },
          { label: 'High Priority', value: high },
        ],
      },
      {
        title: 'Status Breakdown',
        content: '',
        data: Object.entries(statusCounts).map(([status, cnt]) => ({
          label: status, value: `${cnt} (${pct(cnt, total)})`
        })),
      },
      {
        title: 'Compliance Controls',
        content: `${complianceControls.length} controls are associated with compliance risks.`,
        data: [
          { label: 'Total Controls', value: complianceControls.length },
          { label: 'Active', value: complianceControls.filter(c => c.status === 'active').length },
          { label: 'Avg Effectiveness', value: complianceControls.length > 0 ? `${Math.round(complianceControls.reduce((s, c) => s + ratingToPercent(c.effectiveness_rating), 0) / complianceControls.length)}%` : 'N/A' },
        ],
      },
      {
        title: 'Top Compliance Risks',
        content: '',
        data: complianceRisks
          .sort((a, b) => (b.residual_likelihood * b.residual_impact) - (a.residual_likelihood * a.residual_impact))
          .slice(0, 5)
          .map((r, i) => ({
            label: `${i + 1}. ${r.title}`,
            value: `Score: ${r.residual_likelihood * r.residual_impact}`
          })),
      },
    ];
  };

  const generateKRIReport = async (): Promise<ReportSection[]> => {
    const risks = await fetchRisks();
    const total = risks.length;
    const high = risks.filter(r => r.residual_likelihood * r.residual_impact >= 15).length;
    const medium = risks.filter(r => {
      const s = r.residual_likelihood * r.residual_impact;
      return s >= 8 && s < 15;
    }).length;
    const low = risks.filter(r => r.residual_likelihood * r.residual_impact < 8).length;

    const avgInherent = total > 0 ? Math.round(risks.reduce((s, r) => s + r.inherent_likelihood * r.inherent_impact, 0) / total * 10) / 10 : 0;
    const avgResidual = total > 0 ? Math.round(risks.reduce((s, r) => s + r.residual_likelihood * r.residual_impact, 0) / total * 10) / 10 : 0;
    const riskReduction = avgInherent > 0 ? Math.round(((avgInherent - avgResidual) / avgInherent) * 100) : 0;

    const overdue = risks.filter(r => r.review_date && new Date(r.review_date) < new Date()).length;
    const withAI = risks.filter(r => r.ai_score_status === 'completed').length;

    const catScores: Record<string, { total: number; count: number }> = {};
    risks.forEach(r => {
      if (!catScores[r.category]) catScores[r.category] = { total: 0, count: 0 };
      catScores[r.category].total += r.residual_likelihood * r.residual_impact;
      catScores[r.category].count += 1;
    });

    return [
      {
        title: 'Key Risk Indicators Summary',
        content: `This report presents key risk indicators across the organization. The overall risk reduction from inherent to residual is ${riskReduction}%, demonstrating control effectiveness.`,
        data: [
          { label: 'Total Risks Monitored', value: total },
          { label: 'Avg Inherent Score', value: avgInherent },
          { label: 'Avg Residual Score', value: avgResidual },
          { label: 'Risk Reduction', value: `${riskReduction}%` },
        ],
      },
      {
        title: 'Risk Severity Distribution',
        content: '',
        data: [
          { label: '🔴 High (≥15)', value: `${high} (${pct(high, total)})` },
          { label: '🟡 Medium (8–14)', value: `${medium} (${pct(medium, total)})` },
          { label: '🟢 Low (<8)', value: `${low} (${pct(low, total)})` },
        ],
      },
      {
        title: 'Average Risk Score by Category',
        content: '',
        data: Object.entries(catScores)
          .map(([cat, d]) => ({ label: cat, value: Math.round(d.total / d.count * 10) / 10 }))
          .sort((a, b) => (b.value as number) - (a.value as number)),
      },
      {
        title: 'Threshold Breaches & Alerts',
        content: '',
        data: [
          { label: 'Overdue Reviews', value: overdue },
          { label: 'High Priority Risks', value: high },
          { label: 'AI-Analyzed Risks', value: withAI },
        ],
      },
    ];
  };

  const generateReport = async (type: ReportType, title: string, period: string) => {
    setLoading(true);
    setActiveReport({ title, period });
    try {
      let result: ReportSection[];
      switch (type) {
        case 'quarterly': result = await generateQuarterlyReport(); break;
        case 'annual': result = await generateAnnualReport(); break;
        case 'emergency': result = await generateEmergencyReport(); break;
        case 'compliance': result = await generateComplianceReport(); break;
        case 'kri': result = await generateKRIReport(); break;
      }
      setSections(result);
    } catch (err) {
      console.error('Report generation error:', err);
      setSections([{ title: 'Error', content: 'Failed to generate report. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (title: string, period: string, reportSections: ReportSection[]) => {
    const logo = await loadNrsLogo();
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.width;

    drawNrsHeader(
      doc,
      logo,
      title,
      `Period: ${period}  •  Generated ${new Date().toLocaleDateString()}`,
    );

    let y = 56;

    reportSections.forEach((section, idx) => {
      y = ensureNrsSpace(doc, y, 24);
      if (idx > 0) y += 2;
      y = drawNrsSectionHeading(doc, y, section.title);

      if (section.content) {
        y = drawNrsParagraph(doc, y, section.content);
      }

      if (section.data && section.data.length > 0) {
        y = ensureNrsSpace(doc, y, 18);
        y = renderNrsKeyValueTable(doc, y, section.data);
      }

      y += 2;
    });

    drawNrsFooter(doc);
    doc.save(`NRS-${title.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return {
    loading,
    sections,
    activeReport,
    generateReport,
    downloadPDF,
  };
}

