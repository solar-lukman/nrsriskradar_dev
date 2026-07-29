import React from 'react';
import { Download, FileText, FileSpreadsheet, FileType } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

interface ExportRisksMenuProps {
  risks: any[];
  /** Active register — controls which column set is exported */
  register?: 'institutional' | 'compliance';
}

const ngnFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

export function ExportRisksMenu({ risks, register = 'institutional' }: ExportRisksMenuProps) {
  const isCompliance = register === 'compliance';
  const reportTitle = isCompliance ? 'Compliance Risk Register Report' : 'Institutional Risk Register Report';
  const fileBase = isCompliance ? 'compliance-risk-register' : 'risk-register';

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    let yPosition = margin;

    doc.setFontSize(20);
    doc.text(reportTitle, margin, yPosition);
    yPosition += 15;

    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPosition);
    doc.text(`Total Risks: ${risks.length}`, margin, yPosition + 7);

    if (isCompliance) {
      const totalTaxAtRisk = risks.reduce((sum, r) => sum + (Number(r.estimated_tax_at_risk) || 0), 0);
      doc.text(`Total Estimated Tax at Risk: ${ngnFmt.format(totalTaxAtRisk)}`, margin, yPosition + 14);
      yPosition += 32;
    } else {
      yPosition += 25;
    }

    risks.forEach((risk, index) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = margin;
      }

      const inherentScore = risk.inherent_likelihood * risk.inherent_impact;
      const residualScore = risk.residual_likelihood * risk.residual_impact;
      const refLabel = risk.risk_reference ? `[${risk.risk_reference}] ` : '';

      doc.setFontSize(12);
      doc.text(`${index + 1}. ${refLabel}${risk.title}`, margin, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      if (isCompliance) {
        doc.text(`Tax Type: ${risk.tax_type || 'N/A'}`, margin, yPosition);
        doc.text(`Segment: ${risk.taxpayer_segment || 'N/A'}`, margin + 90, yPosition);
        yPosition += 6;
        doc.text(`Sector: ${risk.tax_sector || 'N/A'}`, margin, yPosition);
        doc.text(`Sub-sector: ${risk.tax_sub_sector || 'N/A'}`, margin + 90, yPosition);
        yPosition += 6;
        doc.text(
          `Estimated Tax at Risk: ${risk.estimated_tax_at_risk ? ngnFmt.format(Number(risk.estimated_tax_at_risk)) : 'N/A'}`,
          margin,
          yPosition,
        );
        yPosition += 6;
        doc.text(`Status: ${risk.status}`, margin, yPosition);
        doc.text(`Timeline: ${risk.treatment_timeline || 'N/A'}`, margin + 90, yPosition);
        yPosition += 6;
        doc.text(`Inherent: ${inherentScore} | Residual: ${residualScore}`, margin, yPosition);
        yPosition += 8;

        const desc = risk.compliance_description || risk.description || '';
        if (desc) {
          const split = doc.splitTextToSize(desc, pageWidth - 2 * margin);
          doc.text(split, margin, yPosition);
          yPosition += split.length * 5 + 8;
        }
      } else {
        doc.text(`Category: ${risk.category}`, margin, yPosition);
        doc.text(`Status: ${risk.status}`, margin + 70, yPosition);
        yPosition += 6;
        doc.text(`Inherent Risk: ${inherentScore}`, margin, yPosition);
        doc.text(`Residual Risk: ${residualScore}`, margin + 70, yPosition);
        yPosition += 6;

        const split = doc.splitTextToSize(risk.description || '', pageWidth - 2 * margin);
        doc.text(split, margin, yPosition);
        yPosition += split.length * 5 + 10;
      }
    });

    doc.save(`${fileBase}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = () => {
    const worksheetData = isCompliance
      ? risks.map(risk => ({
          'Risk Reference': risk.risk_reference || '',
          'Title': risk.title,
          'Tax Type': risk.tax_type || '',
          'Taxpayer Segment': risk.taxpayer_segment || '',
          'Sector': risk.tax_sector || '',
          'Sub-Sector': risk.tax_sub_sector || '',
          'Estimated Tax at Risk (NGN)': risk.estimated_tax_at_risk ?? '',
          'Compliance Description': risk.compliance_description || risk.description || '',
          'Information Sources': risk.information_sources || '',
          'Treatment Owner': risk.treatment_owner_profile?.full_name || '',
          'Monitoring Officer': risk.monitoring_officer_profile?.full_name || '',
          'Treatment Timeline': risk.treatment_timeline || '',
          'Status': risk.status,
          'Inherent Score': risk.inherent_likelihood * risk.inherent_impact,
          'Residual Score': risk.residual_likelihood * risk.residual_impact,
          'Department': risk.department || '',
          'Created Date': new Date(risk.created_at).toLocaleDateString(),
          'Last Updated': new Date(risk.updated_at).toLocaleDateString(),
        }))
      : risks.map(risk => ({
          'Risk Reference': risk.risk_reference || '',
          'Risk ID': risk.id,
          'Title': risk.title,
          'Description': risk.description,
          'Category': risk.category,
          'Department': risk.department,
          'Owner': risk.owner_profile?.full_name || 'Unassigned',
          'Status': risk.status,
          'Inherent Likelihood': risk.inherent_likelihood,
          'Inherent Impact': risk.inherent_impact,
          'Inherent Score': risk.inherent_likelihood * risk.inherent_impact,
          'Residual Likelihood': risk.residual_likelihood,
          'Residual Impact': risk.residual_impact,
          'Residual Score': risk.residual_likelihood * risk.residual_impact,
          'Mitigation Plan': risk.mitigation_plan,
          'Target Date': risk.target_date,
          'Review Date': risk.review_date,
          'Created Date': new Date(risk.created_at).toLocaleDateString(),
          'Last Updated': new Date(risk.updated_at).toLocaleDateString(),
        }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, isCompliance ? 'Compliance Register' : 'Risk Register');

    XLSX.writeFile(workbook, `${fileBase}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToCSV = () => {
    const worksheetData = isCompliance
      ? risks.map(risk => ({
          'Risk Reference': risk.risk_reference || '',
          Title: risk.title,
          'Tax Type': risk.tax_type || '',
          'Taxpayer Segment': risk.taxpayer_segment || '',
          Sector: risk.tax_sector || '',
          'Sub-Sector': risk.tax_sub_sector || '',
          'Estimated Tax at Risk (NGN)': risk.estimated_tax_at_risk ?? '',
          'Compliance Description': risk.compliance_description || risk.description || '',
          'Treatment Owner': risk.treatment_owner_profile?.full_name || '',
          'Monitoring Officer': risk.monitoring_officer_profile?.full_name || '',
          'Treatment Timeline': risk.treatment_timeline || '',
          Status: risk.status,
          'Inherent Score': risk.inherent_likelihood * risk.inherent_impact,
          'Residual Score': risk.residual_likelihood * risk.residual_impact,
          Department: risk.department || '',
        }))
      : risks.map(risk => ({
          'Risk Reference': risk.risk_reference || '',
          'Risk ID': risk.id,
          Title: risk.title,
          Description: risk.description,
          Category: risk.category,
          Department: risk.department,
          Owner: risk.owner_profile?.full_name || 'Unassigned',
          Status: risk.status,
          'Inherent Likelihood': risk.inherent_likelihood,
          'Inherent Impact': risk.inherent_impact,
          'Inherent Score': risk.inherent_likelihood * risk.inherent_impact,
          'Residual Likelihood': risk.residual_likelihood,
          'Residual Impact': risk.residual_impact,
          'Residual Score': risk.residual_likelihood * risk.residual_impact,
          'Mitigation Plan': risk.mitigation_plan,
          'Target Date': risk.target_date,
          'Review Date': risk.review_date,
        }));
    const ws = XLSX.utils.json_to_sheet(worksheetData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportToPDF}>
          <FileText className="w-4 h-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToExcel}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export as Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToCSV}>
          <FileType className="w-4 h-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
