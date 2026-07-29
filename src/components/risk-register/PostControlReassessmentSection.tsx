import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, ShieldCheck, Save, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface PostControlReassessmentSectionProps {
  risk: any;
  onUpdated?: () => void;
}

const SCALE = [1, 2, 3, 4, 5];

export function PostControlReassessmentSection({ risk, onUpdated }: PostControlReassessmentSectionProps) {
  const { toast } = useToast();
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('edit_risks') ||
    risk.owner_id === user?.id || risk.created_by === user?.id || risk.assigned_to_id === user?.id;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState<string>(risk.control_effectiveness_rating || '');
  const [pcL, setPcL] = useState<number | undefined>(risk.post_control_likelihood ?? undefined);
  const [pcI, setPcI] = useState<number | undefined>(risk.post_control_impact ?? undefined);
  const [notes, setNotes] = useState<string>(risk.post_control_notes || '');

  const residualScore = (risk.residual_likelihood || 0) * (risk.residual_impact || 0);
  const postScore = (pcL || risk.post_control_likelihood || 0) * (pcI || risk.post_control_impact || 0);
  const hasPostControl = !!(risk.post_control_likelihood && risk.post_control_impact);
  const delta = hasPostControl ? postScore - residualScore : 0;

  const handleSave = async () => {
    if (!rating) {
      toast({ title: 'Rating required', description: 'Select a control effectiveness rating.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('risks')
        .update({
          control_effectiveness_rating: rating,
          post_control_likelihood: pcL ?? null,
          post_control_impact: pcI ?? null,
          post_control_notes: notes || null,
          post_control_assessed_at: new Date().toISOString(),
          post_control_assessed_by: user?.id,
        } as any)
        .eq('id', risk.id);

      if (error) throw error;

      toast({ title: 'Saved', description: 'Post-control reassessment saved.' });
      setEditing(false);
      onUpdated?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const ratingColor =
    rating === 'High' ? 'success' : rating === 'Medium' ? 'warning' : rating === 'Low' ? 'destructive' : 'secondary';

  const TrendIcon = delta < 0 ? TrendingDown : delta > 0 ? TrendingUp : Minus;
  const trendColor = delta < 0 ? 'text-success' : delta > 0 ? 'text-destructive' : 'text-muted-foreground';

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Post-Control Reassessment
          </div>
          {risk.control_effectiveness_rating && !editing && (
            <Badge variant={ratingColor as any}>
              <Shield className="w-3 h-3 mr-1" />
              Controls: {risk.control_effectiveness_rating}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing ? (
          <>
            {hasPostControl || risk.control_effectiveness_rating ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-md border bg-muted/30">
                    <div className="text-xs text-muted-foreground">Residual Score</div>
                    <div className="text-lg font-semibold">{residualScore || '—'}</div>
                  </div>
                  <div className="p-3 rounded-md border bg-muted/30">
                    <div className="text-xs text-muted-foreground">Post-Control Score</div>
                    <div className="text-lg font-semibold">{hasPostControl ? postScore : '—'}</div>
                  </div>
                  <div className="p-3 rounded-md border bg-muted/30">
                    <div className="text-xs text-muted-foreground">Effectiveness Delta</div>
                    <div className={`text-lg font-semibold flex items-center gap-1 ${trendColor}`}>
                      <TrendIcon className="w-4 h-4" />
                      {hasPostControl ? (delta > 0 ? `+${delta}` : delta) : '—'}
                    </div>
                  </div>
                </div>

                {hasPostControl && (
                  <div className="text-sm grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Post-Control Likelihood:</span>{' '}
                      <span className="font-medium">{risk.post_control_likelihood}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Post-Control Impact:</span>{' '}
                      <span className="font-medium">{risk.post_control_impact}</span>
                    </div>
                  </div>
                )}

                {risk.post_control_notes && (
                  <div className="text-sm bg-muted/40 rounded p-2">
                    <span className="text-muted-foreground">Notes: </span>
                    {risk.post_control_notes}
                  </div>
                )}

                {risk.post_control_assessed_at && (
                  <div className="text-xs text-muted-foreground">
                    Last reassessed {new Date(risk.post_control_assessed_at).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No post-control reassessment recorded yet. Add one to evaluate how well your controls reduce the residual risk.
              </div>
            )}

            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {hasPostControl ? 'Update Reassessment' : 'Add Reassessment'}
              </Button>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Control Effectiveness Rating *</Label>
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High — Controls fully mitigate the risk</SelectItem>
                  <SelectItem value="Medium">Medium — Controls partially mitigate the risk</SelectItem>
                  <SelectItem value="Low">Low — Controls have minimal effect</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Post-Control Likelihood</Label>
                <Select value={pcL?.toString() ?? ''} onValueChange={(v) => setPcL(parseInt(v))}>
                  <SelectTrigger><SelectValue placeholder="1–5" /></SelectTrigger>
                  <SelectContent>
                    {SCALE.map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Post-Control Impact</Label>
                <Select value={pcI?.toString() ?? ''} onValueChange={(v) => setPcI(parseInt(v))}>
                  <SelectTrigger><SelectValue placeholder="1–5" /></SelectTrigger>
                  <SelectContent>
                    {SCALE.map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Briefly describe the controls applied and observed effect…"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving…' : 'Save Reassessment'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
