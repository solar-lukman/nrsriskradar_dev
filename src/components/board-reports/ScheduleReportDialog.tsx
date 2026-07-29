import React, { useState, useEffect } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Mail, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ScheduleReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduleCreated: () => void;
  defaultType?: string;
}

const reportTypes = [
  { value: 'quarterly', label: 'Quarterly Risk Assessment' },
  { value: 'annual', label: 'Annual Risk Management Review' },
  { value: 'emergency', label: 'Emergency Response Readiness' },
  { value: 'compliance', label: 'Regulatory Compliance Status' },
  { value: 'kri', label: 'Key Risk Indicators' },
];

const frequencies = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

export function ScheduleReportDialog({ open, onOpenChange, onScheduleCreated, defaultType }: ScheduleReportDialogProps) {
  const { user } = useAuth();
  const [reportType, setReportType] = useState(defaultType || 'quarterly');

  useEffect(() => {
    if (open && defaultType) setReportType(defaultType);
  }, [open, defaultType]);
  const [frequency, setFrequency] = useState('monthly');
  const [sendEmail, setSendEmail] = useState(true);
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const addRecipient = () => {
    const email = recipientInput.trim();
    if (email && email.includes('@') && !recipients.includes(email)) {
      setRecipients([...recipients, email]);
      setRecipientInput('');
    }
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const selectedReport = reportTypes.find(r => r.value === reportType);
      const now = new Date();
      const nextRun = calculateNextRun(frequency, now);

      const { error } = await supabase.from('report_schedules').insert({
        report_type: reportType,
        title: selectedReport?.label || reportType,
        frequency,
        recipients,
        is_active: true,
        next_run_at: nextRun.toISOString(),
        created_by: user.id,
      } as any);

      if (error) throw error;
      toast.success('Report schedule created');
      onScheduleCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Failed to create schedule: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Schedule Automated Report
          </DialogTitle>
          <DialogDescription>
            Configure a recurring report that will be auto-generated and archived.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Report Type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {reportTypes.map(rt => (
                  <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {frequencies.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email to stakeholders
            </Label>
            <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
          </div>

          {sendEmail && (
            <div className="space-y-2">
              <Label>Recipients</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="email@company.com"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                />
                <Button variant="outline" size="icon" onClick={addRecipient}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {recipients.map(email => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeRecipient(email)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Creating…' : 'Create Schedule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function calculateNextRun(frequency: string, from: Date): Date {
  switch (frequency) {
    case 'weekly': return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly': return new Date(from.getFullYear(), from.getMonth() + 1, 1);
    case 'quarterly': return new Date(from.getFullYear(), from.getMonth() + 3, 1);
    case 'annually': return new Date(from.getFullYear() + 1, 0, 1);
    default: return new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}
