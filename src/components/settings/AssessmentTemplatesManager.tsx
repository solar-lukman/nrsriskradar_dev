import React, { useEffect, useState } from 'react';
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, FileText, Star, Save, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { useRiskCategories } from '@/hooks/useRiskCategories';

type RiskType = 'institutional' | 'compliance';
type QuestionType = 'text' | 'number' | 'single_choice' | 'multi_choice' | 'rating' | 'yes_no';

interface Template {
  id: string;
  name: string;
  description: string | null;
  risk_type: RiskType;
  is_default: boolean;
  is_active: boolean;
}
interface Section {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}
interface Question {
  id: string;
  section_id: string;
  question_text: string;
  help_text: string | null;
  question_type: QuestionType;
  is_required: boolean;
  options: string[];
  sort_order: number;
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multi_choice', label: 'Multi choice' },
  { value: 'rating', label: 'Rating (1–5)' },
  { value: 'yes_no', label: 'Yes / No' },
];

export function AssessmentTemplatesManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canManage = ['ADMIN', 'RMD', 'CRO'].includes(user?.role || '');

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('assessment_templates')
      .select('*')
      .order('risk_type')
      .order('name');
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setTemplates((data as Template[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Assessment Templates
          </CardTitle>
          <CardDescription>
            Reusable structured questionnaires for risk assessments. Auto-suggested by category.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() =>
            setEditingTemplate({
              id: '',
              name: '',
              description: '',
              risk_type: 'institutional',
              is_default: false,
              is_active: true,
            })
          }
        >
          <Plus className="w-4 h-4 mr-1" /> New template
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates yet. Create one to standardize how assessments are filled out.
          </p>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={openTemplateId ?? undefined}
            onValueChange={(v) => setOpenTemplateId(v || null)}
            className="space-y-2"
          >
            {templates.map((t) => (
              <AccordionItem key={t.id} value={t.id} className="border rounded-md">
                <div className="flex items-center justify-between pr-3">
                  <AccordionTrigger className="px-3 py-2 hover:no-underline flex-1">
                    <div className="flex items-center gap-2 text-left">
                      <span className="font-medium">{t.name}</span>
                      <Badge variant="outline" className="text-xs">{t.risk_type}</Badge>
                      {t.is_default && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Star className="w-3 h-3" /> Default
                        </Badge>
                      )}
                      {!t.is_active && <Badge variant="outline" className="text-xs">Archived</Badge>}
                    </div>
                  </AccordionTrigger>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditingTemplate(t)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        if (!confirm(`Delete template "${t.name}"? This removes its sections and questions.`))
                          return;
                        const { error } = await supabase
                          .from('assessment_templates')
                          .delete()
                          .eq('id', t.id);
                        if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
                        else fetchTemplates();
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <AccordionContent className="px-3 pb-3">
                  <TemplateBody templateId={t.id} riskType={t.risk_type} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>

      {editingTemplate && (
        <TemplateEditDialog
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => {
            setEditingTemplate(null);
            fetchTemplates();
          }}
        />
      )}
    </Card>
  );
}

/* ---------------- Template edit (name, scope, default, categories) ---------------- */

function TemplateEditDialog({
  template,
  onClose,
  onSaved,
}: {
  template: Template;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Template>(template);
  const { categories } = useRiskCategories({ riskType: form.risk_type });
  const [linkedCategoryNames, setLinkedCategoryNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template.id) return;
    supabase
      .from('template_category_links')
      .select('category')
      .eq('template_id', template.id)
      .then(({ data }) => setLinkedCategoryNames((data || []).map((r: any) => r.category)));
  }, [template.id]);

  const toggleCategory = (name: string) =>
    setLinkedCategoryNames((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let id = form.id;
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        risk_type: form.risk_type,
        is_default: form.is_default,
        is_active: form.is_active,
      };
      if (id) {
        const { error } = await supabase.from('assessment_templates').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('assessment_templates')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        id = data!.id;
      }

      // Sync category links
      await supabase.from('template_category_links').delete().eq('template_id', id);
      if (linkedCategoryNames.length > 0) {
        const rows = linkedCategoryNames.map((c) => ({ template_id: id, category: c as any }));
        const { error: insErr } = await supabase.from('template_category_links').insert(rows);
        if (insErr) throw insErr;
      }

      toast({ title: form.id ? 'Template updated' : 'Template created' });
      onSaved();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template.id ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>
            Templates are auto-suggested when creating an assessment based on the risk's category.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Scope</Label>
              <Select
                value={form.risk_type}
                onValueChange={(v: RiskType) => setForm({ ...form, risk_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="institutional">Institutional</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-3">
              <div className="flex items-center justify-between">
                <Label>Default for this scope</Label>
                <Switch
                  checked={form.is_default}
                  onCheckedChange={(v) => setForm({ ...form, is_default: v })}
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
          </div>

          <div>
            <Label>Applies to categories</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Leave empty to make this template available manually only. Picked categories auto-suggest it.
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.length === 0 && (
                <span className="text-xs text-muted-foreground">No categories defined for this scope.</span>
              )}
              {categories.map((c) => {
                const on = linkedCategoryNames.includes(c.name);
                return (
                  <Badge
                    key={c.id}
                    variant={on ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleCategory(c.name)}
                  >
                    {c.name}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="w-4 h-4 mr-1" />Cancel</Button>
          <Button onClick={save} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />{saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Sections + questions editor (inside template accordion) ---------------- */

function TemplateBody({ templateId, riskType }: { templateId: string; riskType: RiskType }) {
  const { toast } = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const [{ data: secs }, { data: qs }] = await Promise.all([
      supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order'),
      supabase
        .from('template_questions')
        .select('*, template_sections!inner(template_id)')
        .eq('template_sections.template_id', templateId)
        .order('sort_order'),
    ]);
    setSections((secs as Section[]) || []);
    setQuestions(((qs as any[]) || []).map((q) => ({ ...q, options: q.options || [] })));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [templateId]);

  const addSection = async () => {
    const { error } = await supabase.from('template_sections').insert({
      template_id: templateId,
      title: 'New section',
      sort_order: sections.length,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else refresh();
  };

  const updateSection = async (id: string, patch: Partial<Section>) => {
    const { error } = await supabase.from('template_sections').update(patch).eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else refresh();
  };

  const moveSection = async (s: Section, dir: -1 | 1) => {
    const target = sections.find((x) => x.sort_order === s.sort_order + dir);
    if (!target) return;
    await Promise.all([
      supabase.from('template_sections').update({ sort_order: target.sort_order }).eq('id', s.id),
      supabase.from('template_sections').update({ sort_order: s.sort_order }).eq('id', target.id),
    ]);
    refresh();
  };

  const deleteSection = async (id: string) => {
    if (!confirm('Delete this section and its questions?')) return;
    const { error } = await supabase.from('template_sections').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else refresh();
  };

  const addQuestion = async (section_id: string) => {
    const sectQs = questions.filter((q) => q.section_id === section_id);
    const { error } = await supabase.from('template_questions').insert({
      section_id,
      question_text: 'New question',
      question_type: 'text',
      sort_order: sectQs.length,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else refresh();
  };

  const updateQuestion = async (id: string, patch: Partial<Question>) => {
    const { error } = await supabase.from('template_questions').update(patch).eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else refresh();
  };

  const deleteQuestion = async (id: string) => {
    const { error } = await supabase.from('template_questions').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else refresh();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading sections…</p>;

  return (
    <div className="space-y-3">
      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground">No sections yet.</p>
      )}
      {sections.map((s, idx) => (
        <div key={s.id} className="border rounded-md p-3 bg-muted/30 space-y-3">
          <div className="flex items-start gap-2">
            <Input
              className="font-medium"
              value={s.title}
              onChange={(e) => setSections((p) => p.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
              onBlur={(e) => updateSection(s.id, { title: e.target.value })}
            />
            <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => moveSection(s, -1)}>
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={idx === sections.length - 1}
              onClick={() => moveSection(s, 1)}
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => deleteSection(s.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
          <Textarea
            placeholder="Section description (optional)"
            value={s.description || ''}
            onChange={(e) => setSections((p) => p.map((x) => (x.id === s.id ? { ...x, description: e.target.value } : x)))}
            onBlur={(e) => updateSection(s.id, { description: e.target.value })}
            rows={2}
          />

          <div className="space-y-2">
            {questions
              .filter((q) => q.section_id === s.id)
              .map((q) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  onChange={(patch) => updateQuestion(q.id, patch)}
                  onDelete={() => deleteQuestion(q.id)}
                />
              ))}
            <Button size="sm" variant="outline" onClick={() => addQuestion(s.id)}>
              <Plus className="w-3 h-3 mr-1" /> Add question
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={addSection}>
        <Plus className="w-4 h-4 mr-1" /> Add section
      </Button>
    </div>
  );
}

function QuestionRow({
  question,
  onChange,
  onDelete,
}: {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(question);
  useEffect(() => setLocal(question), [question.id]);

  const needsOptions = local.question_type === 'single_choice' || local.question_type === 'multi_choice';

  return (
    <div className="border rounded-md p-3 bg-background space-y-2">
      <div className="flex items-start gap-2">
        <Input
          value={local.question_text}
          onChange={(e) => setLocal({ ...local, question_text: e.target.value })}
          onBlur={(e) => onChange({ question_text: e.target.value })}
        />
        <Select
          value={local.question_type}
          onValueChange={(v: QuestionType) => {
            setLocal({ ...local, question_type: v });
            onChange({ question_type: v });
          }}
        >
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {QUESTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 px-2">
          <Switch
            checked={local.is_required}
            onCheckedChange={(v) => { setLocal({ ...local, is_required: v }); onChange({ is_required: v }); }}
          />
          <span className="text-xs text-muted-foreground">Required</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
      <Input
        placeholder="Help text (optional)"
        value={local.help_text || ''}
        onChange={(e) => setLocal({ ...local, help_text: e.target.value })}
        onBlur={(e) => onChange({ help_text: e.target.value })}
      />
      {needsOptions && (
        <div>
          <Label className="text-xs">Options (one per line)</Label>
          <Textarea
            rows={3}
            value={(local.options || []).join('\n')}
            onChange={(e) => setLocal({ ...local, options: e.target.value.split('\n') })}
            onBlur={(e) =>
              onChange({ options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })
            }
          />
        </div>
      )}
    </div>
  );
}
