import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Star } from 'lucide-react';

interface AddAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskId: string;
  onSuccess: () => void;
}

type QuestionType = 'text' | 'number' | 'single_choice' | 'multi_choice' | 'rating' | 'yes_no';
interface Template { id: string; name: string; description: string | null; risk_type: string; is_default: boolean; is_active: boolean; }
interface Section { id: string; title: string; description: string | null; sort_order: number; }
interface Question {
  id: string; section_id: string; question_text: string; help_text: string | null;
  question_type: QuestionType; is_required: boolean; options: string[]; sort_order: number;
}

export function AddAssessmentDialog({ open, onOpenChange, riskId, onSuccess }: AddAssessmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [risk, setRisk] = useState<{ category: string; risk_type: string } | null>(null);
  const [formData, setFormData] = useState({
    assessment_type: 'current',
    likelihood: 1,
    impact: 1,
    control_score: 0,
    notes: '',
  });

  const [templates, setTemplates] = useState<Template[]>([]);
  const [suggestedIds, setSuggestedIds] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('none');
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  // Load risk + templates when opening
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: r } = await supabase
        .from('risks')
        .select('category, risk_type')
        .eq('id', riskId)
        .single();
      setRisk(r as any);

      const { data: tpls } = await supabase
        .from('assessment_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      const list = (tpls as Template[]) || [];

      // Match by category link first; fall back to default for risk_type
      let suggested = new Set<string>();
      let defaultId = '';
      if (r) {
        const { data: links } = await supabase
          .from('template_category_links')
          .select('template_id, assessment_templates!inner(risk_type, is_active)')
          .eq('category', r.category)
          .eq('assessment_templates.risk_type', r.risk_type)
          .eq('assessment_templates.is_active', true);
        suggested = new Set((links || []).map((l: any) => l.template_id));

        const def = list.find((t) => t.risk_type === r.risk_type && t.is_default);
        if (def) defaultId = def.id;
      }

      setTemplates(list.filter((t) => !r || t.risk_type === r.risk_type));
      setSuggestedIds(suggested);

      const initial = suggested.size > 0 ? Array.from(suggested)[0] : defaultId || 'none';
      setSelectedTemplateId(initial);
    })();
  }, [open, riskId]);

  // Load template structure when selection changes
  useEffect(() => {
    if (!open) return;
    if (selectedTemplateId === 'none') {
      setSections([]); setQuestions([]); setAnswers({});
      return;
    }
    (async () => {
      const [{ data: secs }, { data: qs }] = await Promise.all([
        supabase
          .from('template_sections')
          .select('*')
          .eq('template_id', selectedTemplateId)
          .order('sort_order'),
        supabase
          .from('template_questions')
          .select('*, template_sections!inner(template_id)')
          .eq('template_sections.template_id', selectedTemplateId)
          .order('sort_order'),
      ]);
      setSections((secs as Section[]) || []);
      setQuestions(((qs as any[]) || []).map((q) => ({ ...q, options: q.options || [] })));
      setAnswers({});
    })();
  }, [selectedTemplateId, open]);

  const requiredMissing = useMemo(() => {
    return questions
      .filter((q) => q.is_required)
      .filter((q) => {
        const v = answers[q.id];
        if (q.question_type === 'multi_choice') return !Array.isArray(v) || v.length === 0;
        return v === undefined || v === null || v === '';
      });
  }, [questions, answers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiredMissing.length > 0) {
      toast.error(`Please answer ${requiredMissing.length} required question(s)`);
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const answersPayload =
        selectedTemplateId !== 'none'
          ? { template_id: selectedTemplateId, responses: answers }
          : {};

      const { error } = await supabase
        .from('risk_assessments')
        .insert({
          risk_id: riskId,
          assessment_type: formData.assessment_type,
          likelihood: formData.likelihood,
          impact: formData.impact,
          control_score: formData.control_score,
          notes: formData.notes || null,
          assessed_by: user.id,
          template_id: selectedTemplateId !== 'none' ? selectedTemplateId : null,
          answers: answersPayload,
        });

      if (error) throw error;

      toast.success('Assessment added successfully');
      onSuccess();
      setFormData({ assessment_type: 'current', likelihood: 1, impact: 1, control_score: 0, notes: '' });
      setAnswers({});
    } catch (error: any) {
      console.error('Error adding assessment:', error);
      toast.error(error.message || 'Failed to add assessment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Risk Assessment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 overflow-hidden flex flex-col flex-1">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Template picker */}
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template (free-form only)</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          {t.name}
                          {suggestedIds.has(t.id) && (
                            <Badge variant="secondary" className="text-[10px] gap-0.5">
                              <Star className="w-2.5 h-2.5" /> Suggested
                            </Badge>
                          )}
                          {t.is_default && (
                            <Badge variant="outline" className="text-[10px]">Default</Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {risk && (
                  <p className="text-xs text-muted-foreground">
                    Suggestions based on category: <strong>{risk.category}</strong>
                  </p>
                )}
              </div>

              {/* Standard scoring */}
              <div className="space-y-2">
                <Label htmlFor="assessment_type">Assessment Type</Label>
                <Select
                  value={formData.assessment_type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, assessment_type: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherent">Inherent Risk</SelectItem>
                    <SelectItem value="residual">Residual Risk</SelectItem>
                    <SelectItem value="target">Target Risk</SelectItem>
                    <SelectItem value="current">Current Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Likelihood (1-5)</Label>
                  <Input type="number" min={1} max={5} value={formData.likelihood}
                    onChange={(e) => setFormData((p) => ({ ...p, likelihood: parseInt(e.target.value) }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Impact (1-5)</Label>
                  <Input type="number" min={1} max={5} value={formData.impact}
                    onChange={(e) => setFormData((p) => ({ ...p, impact: parseInt(e.target.value) }))} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Control Score (%)</Label>
                <Input type="number" min={0} max={100} value={formData.control_score}
                  onChange={(e) => setFormData((p) => ({ ...p, control_score: parseInt(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={formData.notes}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Assessment notes..." />
              </div>

              {/* Template sections + questions */}
              {sections.map((s) => (
                <div key={s.id} className="border rounded-md p-3 space-y-3">
                  <div>
                    <h4 className="font-semibold text-sm">{s.title}</h4>
                    {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                  </div>
                  {questions.filter((q) => q.section_id === s.id).map((q) => (
                    <QuestionInput
                      key={q.id}
                      question={q}
                      value={answers[q.id]}
                      onChange={(v) => setAnswers((p) => ({ ...p, [q.id]: v }))}
                    />
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end space-x-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Assessment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuestionInput({
  question, value, onChange,
}: {
  question: Question;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {question.question_text}
        {question.is_required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {question.help_text && <p className="text-xs text-muted-foreground">{question.help_text}</p>}
      {question.question_type === 'text' && (
        <Textarea rows={2} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
      {question.question_type === 'number' && (
        <Input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      )}
      {question.question_type === 'yes_no' && (
        <RadioGroup value={value ?? ''} onValueChange={onChange} className="flex gap-4">
          <div className="flex items-center gap-1"><RadioGroupItem value="yes" id={`${question.id}-y`} /><Label htmlFor={`${question.id}-y`}>Yes</Label></div>
          <div className="flex items-center gap-1"><RadioGroupItem value="no" id={`${question.id}-n`} /><Label htmlFor={`${question.id}-n`}>No</Label></div>
        </RadioGroup>
      )}
      {question.question_type === 'rating' && (
        <RadioGroup value={String(value ?? '')} onValueChange={(v) => onChange(Number(v))} className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="flex items-center gap-1">
              <RadioGroupItem value={String(n)} id={`${question.id}-${n}`} />
              <Label htmlFor={`${question.id}-${n}`}>{n}</Label>
            </div>
          ))}
        </RadioGroup>
      )}
      {question.question_type === 'single_choice' && (
        <RadioGroup value={value ?? ''} onValueChange={onChange} className="space-y-1">
          {question.options.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`${question.id}-${opt}`} />
              <Label htmlFor={`${question.id}-${opt}`} className="font-normal">{opt}</Label>
            </div>
          ))}
        </RadioGroup>
      )}
      {question.question_type === 'multi_choice' && (
        <div className="space-y-1">
          {question.options.map((opt) => {
            const arr: string[] = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt);
            return (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    onChange(c ? [...arr, opt] : arr.filter((o) => o !== opt));
                  }}
                />
                <Label className="font-normal">{opt}</Label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
