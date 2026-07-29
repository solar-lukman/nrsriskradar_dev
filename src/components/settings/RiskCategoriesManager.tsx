import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Tag, Building, Target, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type RiskTypeValue = 'institutional' | 'compliance';

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  display_order: number | null;
  is_active: boolean;
  risk_type: RiskTypeValue;
}

const DEFAULT_COLOR = '#0F5132';

export function RiskCategoriesManager() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<RiskTypeValue>('institutional');

  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [usageInfo, setUsageInfo] = useState<{ count: number; loading: boolean } | null>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    color: DEFAULT_COLOR,
    display_order: 0,
    risk_type: 'institutional' as RiskTypeValue,
    is_active: true,
  });

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('risk_categories')
      .select('*')
      .order('risk_type')
      .order('display_order', { ascending: true })
      .order('name');
    if (error) {
      toast({ title: 'Failed to load categories', description: error.message, variant: 'destructive' });
    } else {
      setCategories((data || []) as CategoryRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      description: '',
      color: DEFAULT_COLOR,
      display_order: (categories.filter(c => c.risk_type === activeTab).length + 1) * 10,
      risk_type: activeTab,
      is_active: true,
    });
    setShowDialog(true);
  };

  const openEdit = (cat: CategoryRow) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      description: cat.description || '',
      color: cat.color || DEFAULT_COLOR,
      display_order: cat.display_order ?? 0,
      risk_type: cat.risk_type,
      is_active: cat.is_active,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name required', description: 'Please enter a category name.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color,
        display_order: form.display_order,
        risk_type: form.risk_type,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('risk_categories').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Category updated', description: `"${payload.name}" saved.` });
      } else {
        const { error } = await supabase.from('risk_categories').insert(payload);
        if (error) throw error;
        toast({ title: 'Category created', description: `"${payload.name}" added.` });
      }
      setShowDialog(false);
      await fetchCategories();
    } catch (err: any) {
      toast({
        title: editing ? 'Update failed' : 'Create failed',
        description: err?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat: CategoryRow) => {
    const { error } = await supabase
      .from('risk_categories')
      .update({ is_active: !cat.is_active, updated_at: new Date().toISOString() })
      .eq('id', cat.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: !cat.is_active ? 'Category enabled' : 'Category disabled',
        description: `"${cat.name}" is now ${!cat.is_active ? 'active' : 'inactive'}.`,
      });
      fetchCategories();
    }
  };

  const openDelete = async (cat: CategoryRow) => {
    setDeleting(cat);
    setUsageInfo({ count: 0, loading: true });
    const { data, error } = await supabase.rpc('risk_category_usage', { p_category_id: cat.id });
    if (error) {
      setUsageInfo({ count: 0, loading: false });
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      setUsageInfo({ count: Number(row?.reference_count || 0), loading: false });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const { error } = await supabase.from('risk_categories').delete().eq('id', deleting.id);
      if (error) throw error;
      toast({ title: 'Category deleted', description: `"${deleting.name}" has been removed.` });
      setDeleting(null);
      setUsageInfo(null);
      await fetchCategories();
    } catch (err: any) {
      const msg = err?.message || '';
      const inUse = err?.code === '23503' || /referenced by|in use/i.test(msg);
      toast({
        title: inUse ? 'Cannot delete — category in use' : 'Delete failed',
        description: inUse
          ? `"${deleting.name}" is referenced by existing risks. Disable it instead so it stays available for reporting but is hidden from new entries.`
          : msg || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const disableFromDeleteDialog = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const { error } = await supabase
        .from('risk_categories')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', deleting.id);
      if (error) throw error;
      toast({ title: 'Category disabled', description: `"${deleting.name}" is now inactive.` });
      setDeleting(null);
      setUsageInfo(null);
      await fetchCategories();
    } catch (err: any) {
      toast({ title: 'Disable failed', description: err?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setDeletingBusy(false);
    }
  };

  const filtered = categories.filter(c => c.risk_type === activeTab);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Tag className="w-5 h-5" /> Risk Categories</CardTitle>
            <CardDescription>
              Manage classification categories used by the Risk Wizard. Add, edit, enable or disable values per register.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Add Category
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RiskTypeValue)}>
          <TabsList>
            <TabsTrigger value="institutional"><Building className="w-4 h-4 mr-1" /> Institutional</TabsTrigger>
            <TabsTrigger value="compliance"><Target className="w-4 h-4 mr-1" /> Compliance</TabsTrigger>
          </TabsList>

          {(['institutional', 'compliance'] as RiskTypeValue[]).map((type) => (
            <TabsContent key={type} value={type} className="mt-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                  No {type} categories yet. Click "Add Category" to create one.
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-4 h-4 rounded border"
                          style={{ backgroundColor: cat.color || DEFAULT_COLOR }}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{cat.name}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {cat.description || `${cat.risk_type === 'institutional' ? 'Institutional' : 'Compliance'} risk category`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Switch checked={cat.is_active} onCheckedChange={() => toggleActive(cat)} aria-label="Toggle active" />
                        <Button variant="ghost" size="sm" onClick={() => openEdit(cat)} aria-label="Edit category">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDelete(cat)}
                          aria-label="Delete category"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Risk Category' : 'Add Risk Category'}</DialogTitle>
            <DialogDescription>
              Categories appear in the Risk Wizard dropdown for the selected register.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Register *</Label>
                <Select
                  value={form.risk_type}
                  onValueChange={(v) => setForm(f => ({ ...f, risk_type: v as RiskTypeValue }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="institutional">Institutional</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm(f => ({ ...f, display_order: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Cybersecurity"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description shown in the Settings list"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                    className="h-10 w-16 p-1"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-md">
                <Label className="m-0">Active</Label>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : (editing ? 'Save Changes' : 'Create Category')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) { setDeleting(null); setUsageInfo(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete risk category?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  You're about to permanently remove <span className="font-medium">"{deleting?.name}"</span>.
                </p>
                {usageInfo?.loading ? (
                  <p className="text-sm text-muted-foreground">Checking whether this category is used by existing risks…</p>
                ) : usageInfo && usageInfo.count > 0 ? (
                  <p className="text-sm text-destructive">
                    This category is referenced by <strong>{usageInfo.count}</strong> existing risk{usageInfo.count === 1 ? '' : 's'}.
                    Deleting it will be blocked by the database. We recommend disabling it instead — existing risks keep
                    their classification, but it won't appear in new entries.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No existing risks use this category. It is safe to delete.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>Cancel</AlertDialogCancel>
            {usageInfo && usageInfo.count > 0 && (
              <Button
                variant="secondary"
                onClick={disableFromDeleteDialog}
                disabled={deletingBusy || !deleting?.is_active}
              >
                {deleting?.is_active ? 'Disable instead' : 'Already disabled'}
              </Button>
            )}
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deletingBusy || (usageInfo?.loading ?? false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBusy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
