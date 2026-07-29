import React, { useState } from 'react';
import { Upload, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

type RegisterType = 'institutional' | 'compliance';

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  register?: RegisterType;
}

const institutionalTemplate = [
  {
    title: 'Sample Risk Title',
    description: 'Sample risk description',
    category: 'Technology',
    department: 'IT',
    inherent_likelihood: 3,
    inherent_impact: 4,
    residual_likelihood: 2,
    residual_impact: 3,
    status: 'New',
    mitigation_plan: 'Sample mitigation plan',
    target_date: '2024-12-31',
    review_date: '2024-06-30',
  },
];

const complianceTemplate = [
  {
    title: 'Late VAT Filing — Large Taxpayers',
    description: 'Risk of taxpayers in the LTO segment filing VAT returns after the statutory deadline',
    category: 'Filing',
    department: 'Large Taxpayer Office',
    inherent_likelihood: 4,
    inherent_impact: 4,
    residual_likelihood: 3,
    residual_impact: 3,
    status: 'New',
    tax_type: 'VAT',
    estimated_tax_at_risk: 25000000,
    tax_sector: 'Oil & Gas',
    tax_sub_sector: 'Upstream',
    taxpayer_segment: 'Large Taxpayers',
    compliance_description: 'Late or non-filing of monthly VAT returns by registered LTO taxpayers',
    information_sources: 'TaxPro Max filing logs; LTO compliance reports',
    treatment_owner_email: 'owner@example.com',
    monitoring_officer_email: 'monitor@example.com',
    treatment_timeline: '90 days',
    mitigation_plan: 'Automated reminders, escalation to enforcement after 14 days overdue',
    target_date: '2025-12-31',
    review_date: '2025-06-30',
  },
];

const toIntInRange = (v: unknown, min = 1, max = 5, fallback = 1) => {
  const n = parseInt(String(v));
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const toNumberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const toDateOrNull = (v: unknown): string | null => {
  if (!v) return null;
  // Accept ISO strings or Excel-parsed Date objects
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};

export function BulkUploadDialog({ open, onOpenChange, onSuccess, register = 'institutional' }: BulkUploadDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const isCompliance = register === 'compliance';

  const downloadTemplate = () => {
    const data = isCompliance ? complianceTemplate : institutionalTemplate;
    const sheetName = isCompliance ? 'Compliance Register' : 'Institutional Register';
    const fileName = isCompliance ? 'compliance-risk-register-template.xlsx' : 'risk-register-template.xlsx';

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);

    toast({
      title: 'Template Downloaded',
      description: `${isCompliance ? 'Compliance' : 'Institutional'} risk register template has been downloaded`,
    });
  };

  const resolveProfileIdByEmail = async (email?: string): Promise<string | null> => {
    if (!email) return null;
    const trimmed = String(email).trim().toLowerCase();
    if (!trimmed) return null;
    const { data } = await supabase
      .from('profiles')
      .select('user_id')
      .ilike('email', trimmed)
      .maybeSingle();
    return data?.user_id ?? null;
  };

  const handleFileUpload = async () => {
    if (!file || !user) return;

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

      if (jsonData.length === 0) {
        throw new Error('No data found in the uploaded file');
      }

      // Resolve owner / monitor profile IDs in parallel for compliance rows
      const enriched = await Promise.all(
        jsonData.map(async (row) => {
          const base = {
            title: String(row.title || '').trim(),
            description: String(row.description || '').trim(),
            category: (row.category as string) || (isCompliance ? 'Filing' : 'Operational'),
            department: (row.department as string) || '',
            inherent_likelihood: toIntInRange(row.inherent_likelihood),
            inherent_impact: toIntInRange(row.inherent_impact),
            residual_likelihood: toIntInRange(row.residual_likelihood),
            residual_impact: toIntInRange(row.residual_impact),
            status: (row.status as string) || 'New',
            mitigation_plan: (row.mitigation_plan as string) || '',
            target_date: toDateOrNull(row.target_date),
            review_date: toDateOrNull(row.review_date),
            created_by: user.id,
            mitigation_actions: [],
            risk_type: register,
          };

          if (!isCompliance) return base;

          const [treatmentOwnerId, monitoringOfficerId] = await Promise.all([
            resolveProfileIdByEmail(row.treatment_owner_email as string | undefined),
            resolveProfileIdByEmail(row.monitoring_officer_email as string | undefined),
          ]);

          return {
            ...base,
            tax_type: (row.tax_type as string) || null,
            estimated_tax_at_risk: toNumberOrNull(row.estimated_tax_at_risk),
            tax_sector: (row.tax_sector as string) || null,
            tax_sub_sector: (row.tax_sub_sector as string) || null,
            taxpayer_segment: (row.taxpayer_segment as string) || null,
            compliance_description: (row.compliance_description as string) || null,
            information_sources: (row.information_sources as string) || null,
            treatment_owner_id: treatmentOwnerId,
            monitoring_officer_id: monitoringOfficerId,
            treatment_timeline: (row.treatment_timeline as string) || null,
          };
        })
      );

      const invalidRows = enriched.filter(r => !r.title || !r.description);
      if (invalidRows.length > 0) {
        throw new Error(`${invalidRows.length} rows are missing required fields (title, description)`);
      }

      const { error } = await supabase.from('risks').insert(enriched as never);
      if (error) throw error;

      toast({
        title: 'Success',
        description: `${enriched.length} ${isCompliance ? 'compliance' : 'institutional'} risks uploaded successfully`,
      });

      onSuccess();
      onOpenChange(false);
      setFile(null);
    } catch (error) {
      console.error('Error uploading risks:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload risks',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Upload className="w-5 h-5 mr-2" />
            Bulk Upload {isCompliance ? 'Compliance Risks' : 'Risks'}
          </DialogTitle>
          <DialogDescription>
            Upload multiple {isCompliance ? 'compliance ' : ''}risks from an Excel file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Step 1: Download Template</Label>
            <Button variant="outline" onClick={downloadTemplate} className="w-full mt-2">
              <Download className="w-4 h-4 mr-2" />
              Download {isCompliance ? 'Compliance ' : ''}Excel Template
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Download the template, fill it with your risk data, and upload it back.
            </p>
          </div>

          <div>
            <Label>Step 2: Upload Completed File</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Select your completed Excel file with risk data.
            </p>
          </div>

          <div className="p-3 bg-muted rounded-lg text-xs">
            <p className="font-medium mb-2">Required Fields:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• title (required)</li>
              <li>• description (required)</li>
              <li>• category</li>
              <li>• inherent_likelihood / inherent_impact (1-5)</li>
              <li>• residual_likelihood / residual_impact (1-5)</li>
              {isCompliance && (
                <>
                  <li className="pt-2 font-medium text-foreground">Compliance fields:</li>
                  <li>• tax_type, estimated_tax_at_risk</li>
                  <li>• tax_sector, tax_sub_sector, taxpayer_segment</li>
                  <li>• compliance_description, information_sources</li>
                  <li>• treatment_owner_email, monitoring_officer_email (resolved to users)</li>
                  <li>• treatment_timeline</li>
                </>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleFileUpload} disabled={!file || loading}>
            {loading ? 'Uploading...' : 'Upload Risks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
