import React from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

interface BCPlan {
  id: string;
  title: string;
  description: string;
  department: string;
  business_function: string;
  dependencies: string[];
  recovery_time_objective: number;
  recovery_point_objective: number;
  status: string;
  test_status: string;
  last_tested_date: string;
  next_test_date: string;
  last_updated_date: string;
  created_at: string;
  owner_profile?: {
    full_name: string;
  };
}

interface ExportBCPMenuProps {
  plans: BCPlan[];
}

export function ExportBCPMenu({ plans }: ExportBCPMenuProps) {
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    let yPosition = margin;

    // Title
    doc.setFontSize(20);
    doc.text('Business Continuity Register', margin, yPosition);
    yPosition += 15;

    // Summary
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPosition);
    doc.text(`Total Plans: ${plans.length}`, margin, yPosition + 7);
    
    const readyPlans = plans.filter(p => p.status === 'Ready').length;
    const needsReview = plans.filter(p => p.status === 'Needs Review').length;
    const outdated = plans.filter(p => p.status === 'Outdated').length;
    
    doc.text(`Ready: ${readyPlans} | Needs Review: ${needsReview} | Outdated: ${outdated}`, margin, yPosition + 14);
    yPosition += 30;

    // Plans details
    plans.forEach((plan, index) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(12);
      doc.text(`${index + 1}. ${plan.title}`, margin, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.text(`Department: ${plan.department}`, margin, yPosition);
      doc.text(`Status: ${plan.status}`, margin + 70, yPosition);
      yPosition += 6;
      
      doc.text(`Function: ${plan.business_function}`, margin, yPosition);
      doc.text(`Test Status: ${plan.test_status}`, margin + 70, yPosition);
      yPosition += 6;

      doc.text(`RTO: ${plan.recovery_time_objective || 'N/A'}h`, margin, yPosition);
      doc.text(`RPO: ${plan.recovery_point_objective || 'N/A'}h`, margin + 70, yPosition);
      yPosition += 6;

      if (plan.description) {
        const splitDescription = doc.splitTextToSize(plan.description, pageWidth - 2 * margin);
        doc.text(splitDescription, margin, yPosition);
        yPosition += splitDescription.length * 5;
      }
      
      yPosition += 10;
    });

    doc.save(`bcp-register-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = () => {
    const worksheetData = plans.map(plan => ({
      'Plan ID': plan.id,
      'Title': plan.title,
      'Description': plan.description || '',
      'Department': plan.department,
      'Business Function': plan.business_function,
      'Owner': plan.owner_profile?.full_name || 'Unassigned',
      'Status': plan.status,
      'Test Status': plan.test_status,
      'RTO (hours)': plan.recovery_time_objective || '',
      'RPO (hours)': plan.recovery_point_objective || '',
      'Dependencies': plan.dependencies?.join('; ') || '',
      'Last Tested': plan.last_tested_date ? new Date(plan.last_tested_date).toLocaleDateString() : '',
      'Next Test Date': plan.next_test_date ? new Date(plan.next_test_date).toLocaleDateString() : '',
      'Last Updated': new Date(plan.last_updated_date).toLocaleDateString(),
      'Created Date': new Date(plan.created_at).toLocaleDateString(),
    }));

    // Summary data
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Plans', plans.length],
      ['Ready', plans.filter(p => p.status === 'Ready').length],
      ['Needs Review', plans.filter(p => p.status === 'Needs Review').length],
      ['Outdated', plans.filter(p => p.status === 'Outdated').length],
      ['Not Tested', plans.filter(p => p.test_status === 'Not Tested').length],
      ['Test Passed', plans.filter(p => p.test_status === 'Passed').length],
      ['Test Failed', plans.filter(p => p.test_status === 'Failed').length],
      ['Test Overdue', plans.filter(p => p.test_status === 'Overdue').length],
      ['Generated', new Date().toLocaleDateString()],
    ];

    const workbook = XLSX.utils.book_new();
    
    // Add summary sheet
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Add detailed data sheet
    const detailSheet = XLSX.utils.json_to_sheet(worksheetData);
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'BCP Details');

    // Add department breakdown
    const deptData: Record<string, number> = {};
    plans.forEach(plan => {
      deptData[plan.department] = (deptData[plan.department] || 0) + 1;
    });

    const deptBreakdown = Object.entries(deptData).map(([dept, count]) => ({
      'Department': dept,
      'Plan Count': count,
      'Percentage': Math.round((count / plans.length) * 100)
    }));

    const deptSheet = XLSX.utils.json_to_sheet(deptBreakdown);
    XLSX.utils.book_append_sheet(workbook, deptSheet, 'By Department');

    XLSX.writeFile(workbook, `bcp-register-${new Date().toISOString().split('T')[0]}.xlsx`);
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}