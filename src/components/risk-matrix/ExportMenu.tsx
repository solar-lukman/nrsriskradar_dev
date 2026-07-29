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

interface Risk {
  id: string;
  title: string;
  description: string;
  department: string;
  owner: string;
  category: string;
  inherentLikelihood: number;
  inherentImpact: number;
  residualLikelihood: number;
  residualImpact: number;
  status: string;
  lastReviewed: string;
  mitigationActions: string[];
}

interface ExportMenuProps {
  risks: Risk[];
  riskType: 'inherent' | 'residual';
}

export function ExportMenu({ risks, riskType }: ExportMenuProps) {
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    let yPosition = margin;

    // Title
    doc.setFontSize(20);
    doc.text('Risk Matrix Report', margin, yPosition);
    yPosition += 15;

    // Subtitle
    doc.setFontSize(12);
    doc.text(`${riskType === 'inherent' ? 'Inherent' : 'Residual'} Risk Analysis`, margin, yPosition);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPosition + 7);
    yPosition += 25;

    // Summary
    doc.setFontSize(14);
    doc.text('Risk Summary', margin, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.text(`Total Risks: ${risks.length}`, margin, yPosition);
    yPosition += 7;

    // Calculate risk distribution
    const riskLevels = { critical: 0, high: 0, medium: 0, low: 0 };
    risks.forEach(risk => {
      const likelihood = riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood;
      const impact = riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact;
      const score = likelihood * impact;
      
      if (score >= 20) riskLevels.critical++;
      else if (score >= 15) riskLevels.high++;
      else if (score >= 8) riskLevels.medium++;
      else riskLevels.low++;
    });

    doc.text(`Critical Risks: ${riskLevels.critical}`, margin, yPosition);
    doc.text(`High Risks: ${riskLevels.high}`, margin + 60, yPosition);
    yPosition += 7;
    doc.text(`Medium Risks: ${riskLevels.medium}`, margin, yPosition);
    doc.text(`Low Risks: ${riskLevels.low}`, margin + 60, yPosition);
    yPosition += 20;

    // Risk Details
    doc.setFontSize(14);
    doc.text('Risk Details', margin, yPosition);
    yPosition += 15;

    risks.forEach((risk, index) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = margin;
      }

      const likelihood = riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood;
      const impact = riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact;
      const score = likelihood * impact;

      doc.setFontSize(12);
      doc.text(`${index + 1}. ${risk.title}`, margin, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.text(`Department: ${risk.department}`, margin, yPosition);
      doc.text(`Owner: ${risk.owner}`, margin + 70, yPosition);
      yPosition += 6;
      
      doc.text(`Likelihood: ${likelihood}/5`, margin, yPosition);
      doc.text(`Impact: ${impact}/5`, margin + 50, yPosition);
      doc.text(`Score: ${score}`, margin + 90, yPosition);
      yPosition += 6;

      // Description (wrap text)
      const splitDescription = doc.splitTextToSize(risk.description, pageWidth - 2 * margin);
      doc.text(splitDescription, margin, yPosition);
      yPosition += splitDescription.length * 5 + 10;
    });

    doc.save(`risk-matrix-${riskType}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = () => {
    const worksheetData = risks.map(risk => {
      const likelihood = riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood;
      const impact = riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact;
      const score = likelihood * impact;

      let riskLevel = 'Low';
      if (score >= 20) riskLevel = 'Critical';
      else if (score >= 15) riskLevel = 'High';
      else if (score >= 8) riskLevel = 'Medium';

      return {
        'Risk ID': risk.id,
        'Title': risk.title,
        'Description': risk.description,
        'Department': risk.department,
        'Owner': risk.owner,
        'Category': risk.category,
        'Status': risk.status,
        'Likelihood': likelihood,
        'Impact': impact,
        'Risk Score': score,
        'Risk Level': riskLevel,
        'Last Reviewed': risk.lastReviewed,
        'Mitigation Actions': risk.mitigationActions.join('; '),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${riskType.charAt(0).toUpperCase() + riskType.slice(1)} Risk`);

    // Add summary sheet
    const summaryData = [
      ['Risk Matrix Summary', ''],
      ['Report Type', `${riskType.charAt(0).toUpperCase() + riskType.slice(1)} Risk`],
      ['Generated Date', new Date().toLocaleDateString()],
      ['Total Risks', risks.length],
      ['', ''],
      ['Risk Distribution', ''],
    ];

    const riskLevels = { critical: 0, high: 0, medium: 0, low: 0 };
    risks.forEach(risk => {
      const likelihood = riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood;
      const impact = riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact;
      const score = likelihood * impact;
      
      if (score >= 20) riskLevels.critical++;
      else if (score >= 15) riskLevels.high++;
      else if (score >= 8) riskLevels.medium++;
      else riskLevels.low++;
    });

    summaryData.push(
      ['Critical Risks', riskLevels.critical],
      ['High Risks', riskLevels.high],
      ['Medium Risks', riskLevels.medium],
      ['Low Risks', riskLevels.low]
    );

    const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');

    XLSX.writeFile(workbook, `risk-matrix-${riskType}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToCSV = () => {
    const rows = risks.map(risk => {
      const likelihood = riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood;
      const impact = riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact;
      const score = likelihood * impact;
      let level = 'Low';
      if (score >= 20) level = 'Critical';
      else if (score >= 15) level = 'High';
      else if (score >= 8) level = 'Medium';
      return {
        'Risk ID': risk.id,
        Title: risk.title,
        Description: risk.description,
        Department: risk.department,
        Owner: risk.owner,
        Category: risk.category,
        Status: risk.status,
        Likelihood: likelihood,
        Impact: impact,
        'Risk Score': score,
        'Risk Level': level,
        'Last Reviewed': risk.lastReviewed,
        'Mitigation Actions': risk.mitigationActions.join(' | '),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `risk-matrix-${riskType}-${new Date().toISOString().split('T')[0]}.csv`;
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