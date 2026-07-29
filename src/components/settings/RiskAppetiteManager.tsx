import React, { useState } from 'react';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Gauge, Plus, Pencil, Trash2, Layers, RefreshCcw, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useRiskAppetite, AppetiteConfig } from '@/hooks/useRiskAppetite';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRiskCategories } from '@/hooks/useRiskCategories';

const TAXPAYER_SEGMENTS = ['Large Taxpayers', 'Medium Taxpayers', 'Emerging Taxpayers'];
const TOLERANCE_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
const ESCALATION_ACTIONS: AppetiteConfig['escalation_action'][] = [
  'notify',
  'escalate',
  'flag_audit',
];

const ACTION_LABELS: Record<string, string> = {
  notify: 'Notify owners',
  escalate: 'Escalate status',
  flag_audit: 'Flag for audit',
};

const formSchema = z.object({
  risk_type: z.enum(['institutional', 'compliance']),
  category: z.string().nullable(),
  taxpayer_segment: z.string().nullable(),
  tolerance_level: z.string().min(1, 'Tolerance level is required'),
  threshold_score: z
    .number()
    .int()
    .min(1, 'Threshold must be 1–25')
    .max(25, 'Threshold must be 1–25'),
  escalation_action: z.enum(['notify', 'escalate', 'flag_audit']),
  description: z.string().max(500).nullable(),
  is_active: z.boolean(),
});

type FormState = z.infer<typeof formSchema>;

const emptyForm: FormState = {
  risk_type: 'institutional',
  category: null,
  taxpayer_segment: null,
  tolerance_level: 'Medium',
  threshold_score: 12,
  escalation_action: 'notify',
  description: '',
  is_active: true,
};

export function RiskAppetiteManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { configs, loading, refetch } = useRiskAppetite();
  const { categories: instCats } = useRiskCategories({ riskType: 'institutional' });
  const { categories: compCats } = useRiskCategories({ riskType: 'compliance' });
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<AppetiteConfig | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);

  const handleReevaluate = async () => {
    setReevaluating(true);
    try {
      const { data, error } = await supabase.rpc('reevaluate_risk_appetite', {
        p_risk_type: null,
        p_category: null,
        p_segment: null,
      });
      if (error) throw error;
      const r = (data ?? {}) as Record<string, number>;
      toast({
        title: 'Re-evaluation complete',
        description: `Scanned ${r.scanned ?? 0} approved risks · ${r.actioned ?? 0} matched (escalated ${r.escalated ?? 0}, flagged ${r.flagged ?? 0}, notified ${r.notified ?? 0}). Already-actioned risks were skipped.`,
      });
    } catch (e: any) {
      toast({
        title: 'Re-evaluation failed',
        description: e?.message ?? 'Unable to re-evaluate risks.',
        variant: 'destructive',
      });
    } finally {
      setReevaluating(false);
    }
  };
  const [bulkForm, setBulkForm] = useState<{
    threshold_score: string;
    escalation_action: string;
    is_active: string;
  }>({ threshold_score: '', escalation_action: 'keep', is_active: 'keep' });

  const allSelected =
    configs.length > 0 && selectedIds.length === configs.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(configs.map((c) => c.id));
  };
  const toggleOne = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleBulkSave = async () => {
    if (selectedIds.length === 0) return;
    const payload: {
      threshold_score?: number;
      escalation_action?: AppetiteConfig['escalation_action'];
      is_active?: boolean;
    } = {};
    if (bulkForm.threshold_score !== '') {
      const n = parseInt(bulkForm.threshold_score);
      if (Number.isNaN(n) || n < 1 || n > 25) {
        toast({
          title: 'Invalid threshold',
          description: 'Threshold must be a number between 1 and 25.',
          variant: 'destructive',
        });
        return;
      }
      payload.threshold_score = n;
    }
    if (bulkForm.escalation_action !== 'keep') {
      payload.escalation_action =
        bulkForm.escalation_action as AppetiteConfig['escalation_action'];
    }
    if (bulkForm.is_active !== 'keep') {
      payload.is_active = bulkForm.is_active === 'active';
    }
    if (Object.keys(payload).length === 0) {
      toast({
        title: 'Nothing to update',
        description: 'Choose at least one field to change.',
      });
      return;
    }

    setBulkSaving(true);
    try {
      const { error } = await supabase
        .from('risk_appetite_config')
        .update(payload)
        .in('id', selectedIds);
      if (error) throw error;
      toast({
        title: 'Bulk update applied',
        description: `${selectedIds.length} ${
          selectedIds.length === 1 ? 'rule' : 'rules'
        } updated.`,
      });
      setShowBulkDialog(false);
      setBulkForm({
        threshold_score: '',
        escalation_action: 'keep',
        is_active: 'keep',
      });
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast({
        title: 'Bulk update failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setBulkSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const openEdit = (cfg: AppetiteConfig) => {
    setEditing(cfg);
    setForm({
      risk_type: cfg.risk_type,
      category: cfg.category,
      taxpayer_segment: cfg.taxpayer_segment,
      tolerance_level: cfg.tolerance_level,
      threshold_score: cfg.threshold_score,
      escalation_action: cfg.escalation_action,
      description: cfg.description ?? '',
      is_active: cfg.is_active,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      toast({
        title: 'Validation error',
        description:
          parsed.error.errors[0]?.message ?? 'Please review the form.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        risk_type: parsed.data.risk_type,
        category: parsed.data.category as any,
        taxpayer_segment:
          parsed.data.risk_type === 'compliance'
            ? parsed.data.taxpayer_segment
            : null,
        tolerance_level: parsed.data.tolerance_level,
        threshold_score: parsed.data.threshold_score,
        escalation_action: parsed.data.escalation_action,
        description: parsed.data.description || null,
        is_active: parsed.data.is_active,
      };

      if (editing) {
        const { error } = await supabase
          .from('risk_appetite_config')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Updated', description: 'Appetite rule saved.' });
      } else {
        const { error } = await supabase
          .from('risk_appetite_config')
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast({ title: 'Created', description: 'Appetite rule created.' });
      }
      setShowDialog(false);
      refetch();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from('risk_appetite_config')
      .delete()
      .eq('id', deleteId);
    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Deleted', description: 'Appetite rule removed.' });
      refetch();
    }
    setDeleteId(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            Risk Appetite & Tolerance
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBulkDialog(true)}
              >
                <Layers className="w-4 h-4 mr-1" /> Bulk edit ({selectedIds.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleReevaluate}
              disabled={reevaluating}
              title="Re-scan all approved risks and apply any exceeded thresholds"
            >
              {reevaluating
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <RefreshCcw className="w-4 h-4 mr-1" />}
              Re-evaluate all
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Add Rule
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Configure tolerance thresholds per category and taxpayer segment.
          Approved risks crossing these thresholds will trigger the configured
          escalation action.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Loading…
          </div>
        ) : configs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No appetite rules configured yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allSelected
                        ? true
                        : someSelected
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all rules"
                  />
                </TableHead>
                <TableHead>Risk Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead>Tolerance</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((cfg) => (
                <TableRow
                  key={cfg.id}
                  data-state={selectedIds.includes(cfg.id) ? 'selected' : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(cfg.id)}
                      onCheckedChange={() => toggleOne(cfg.id)}
                      aria-label="Select rule"
                    />
                  </TableCell>
                  <TableCell className="capitalize">{cfg.risk_type}</TableCell>
                  <TableCell>{cfg.category || 'All categories'}</TableCell>
                  <TableCell>{cfg.taxpayer_segment || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{cfg.tolerance_level}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    ≥ {cfg.threshold_score}
                  </TableCell>
                  <TableCell>
                    {ACTION_LABELS[cfg.escalation_action] ??
                      cfg.escalation_action}
                  </TableCell>
                  <TableCell>
                    {cfg.is_active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(cfg)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteId(cfg.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Appetite Rule' : 'New Appetite Rule'}
            </DialogTitle>
            <DialogDescription>
              Define when an approved risk should trigger an alert or
              escalation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Risk Type</Label>
                <Select
                  value={form.risk_type}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      risk_type: v as 'institutional' | 'compliance',
                      taxpayer_segment:
                        v === 'compliance' ? form.taxpayer_segment : null,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="institutional">Institutional</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category (optional)</Label>
                <Select
                  value={form.category ?? '__all__'}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      category: v === '__all__' ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All categories</SelectItem>
                    {(form.risk_type === 'compliance' ? compCats : instCats).map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.risk_type === 'compliance' && (
              <div>
                <Label>Taxpayer Segment (optional)</Label>
                <Select
                  value={form.taxpayer_segment ?? '__all__'}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      taxpayer_segment: v === '__all__' ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All segments</SelectItem>
                    {TAXPAYER_SEGMENTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Tolerance Level</Label>
                <Select
                  value={form.tolerance_level}
                  onValueChange={(v) =>
                    setForm({ ...form, tolerance_level: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOLERANCE_LEVELS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Threshold (1–25)</Label>
                <Input
                  type="number"
                  min={1}
                  max={25}
                  value={form.threshold_score}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      threshold_score: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div>
                <Label>Escalation Action</Label>
                <Select
                  value={form.escalation_action}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      escalation_action:
                        v as AppetiteConfig['escalation_action'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESCALATION_ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {ACTION_LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description ?? ''}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
                maxLength={500}
                placeholder="Optional context for this rule"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete appetite rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This rule will no longer apply to new risk assessments. Existing
              audit logs are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk edit dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk edit appetite rules</DialogTitle>
            <DialogDescription>
              Apply changes to {selectedIds.length}{' '}
              {selectedIds.length === 1 ? 'selected rule' : 'selected rules'}.
              Leave a field unchanged to keep its current value.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Threshold (1–25, blank to keep)</Label>
              <Input
                type="number"
                min={1}
                max={25}
                value={bulkForm.threshold_score}
                onChange={(e) =>
                  setBulkForm({ ...bulkForm, threshold_score: e.target.value })
                }
                placeholder="Keep current"
              />
            </div>
            <div>
              <Label>Escalation Action</Label>
              <Select
                value={bulkForm.escalation_action}
                onValueChange={(v) =>
                  setBulkForm({ ...bulkForm, escalation_action: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Keep current</SelectItem>
                  {ESCALATION_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTION_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={bulkForm.is_active}
                onValueChange={(v) =>
                  setBulkForm({ ...bulkForm, is_active: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Keep current</SelectItem>
                  <SelectItem value="active">Set Active</SelectItem>
                  <SelectItem value="inactive">Set Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowBulkDialog(false)}
              disabled={bulkSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkSave} disabled={bulkSaving}>
              {bulkSaving ? 'Applying…' : 'Apply to selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
