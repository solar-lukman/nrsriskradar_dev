import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Brain, Shield, Plus, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMitigationRecommendations } from '@/hooks/useMitigationRecommendations';

interface ExistingControl {
  id: string;
  control_name: string;
  control_type: string;
  effectiveness_rating: string | number;
  status: string;
}

const effectivenessToPercent = (rating: string | number): number => {
  if (typeof rating === 'number') return rating;
  switch ((rating || '').toLowerCase()) {
    case 'high': return 90;
    case 'medium': return 60;
    case 'low': return 30;
    default: return 0;
  }
};

interface AIRecommendedControlsProps {
  riskId: string;
  riskTitle: string;
  existingControls: ExistingControl[];
  onControlAdded: () => void;
}

export function AIRecommendedControls({ riskId, riskTitle, existingControls, onControlAdded }: AIRecommendedControlsProps) {
  const { loading, recommendations, generateRecommendations } = useMitigationRecommendations();
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const handleGenerate = () => {
    generateRecommendations(riskId);
  };

  const handleSaveControl = async (control: { name: string; description: string; type: string; frequency: string }, index: number) => {
    try {
      setSavingIndex(index);
      const { error } = await supabase
        .from('risk_controls')
        .insert({
          risk_id: riskId,
          control_name: control.name,
          description: control.description,
          control_type: control.type,
          test_frequency: control.frequency,
          status: 'planned',
          effectiveness_rating: 'untested',
        });

      if (error) throw error;

      toast({ title: 'Control Added', description: `"${control.name}" has been added.` });
      onControlAdded();
    } catch (err) {
      console.error('Error saving control:', err);
      toast({ title: 'Error', description: 'Failed to save control', variant: 'destructive' });
    } finally {
      setSavingIndex(null);
    }
  };

  const aiControls = recommendations?.recommendations?.controls || [];
  const existingNames = new Set(existingControls.map(c => c.control_name.toLowerCase()));

  const getTypeColor = (type: string): "destructive" | "secondary" | "default" | "outline" => {
    switch (type.toLowerCase()) {
      case 'preventive': return 'secondary';
      case 'detective': return 'outline';
      case 'corrective': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Comparison Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">AI vs Existing Controls</h3>
        </div>
        <Button onClick={handleGenerate} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {loading ? 'Generating...' : aiControls.length > 0 ? 'Refresh' : 'Generate AI Recommendations'}
        </Button>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Existing Controls */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Existing Controls ({existingControls.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {existingControls.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No controls defined yet</p>
            ) : (
              existingControls.map((control) => (
                <div key={control.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <span className="font-medium text-sm">{control.control_name}</span>
                    <Badge variant={getTypeColor(control.control_type)} className="text-xs">
                      {control.control_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={effectivenessToPercent(control.effectiveness_rating)} className="h-1.5 flex-1" />
                    <span className="text-xs font-medium">{effectivenessToPercent(control.effectiveness_rating)}%</span>
                  </div>
                  <Badge variant={control.status === 'active' ? 'secondary' : 'outline'} className="text-xs">
                    {control.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* AI Recommended Controls */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              AI Recommended Controls ({aiControls.length})
              {aiControls.length > 0 && <Badge variant="secondary" className="text-xs">AI</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : aiControls.length === 0 ? (
              <div className="text-center py-4 space-y-2">
                <Sparkles className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Click "Generate AI Recommendations" to get suggested controls
                </p>
              </div>
            ) : (
              aiControls.map((control, index) => {
                const isDuplicate = existingNames.has(control.name.toLowerCase());
                return (
                  <div key={index} className={`border rounded-lg p-3 space-y-2 ${isDuplicate ? 'opacity-60' : 'border-primary/30'}`}>
                    <div className="flex items-start justify-between">
                      <span className="font-medium text-sm">{control.name}</span>
                      <Badge variant={getTypeColor(control.type)} className="text-xs">
                        {control.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{control.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Frequency: {control.frequency}</span>
                      {isDuplicate ? (
                        <Badge variant="outline" className="text-xs">Already exists</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-primary hover:bg-primary/10"
                          onClick={() => handleSaveControl(control, index)}
                          disabled={savingIndex === index}
                        >
                          {savingIndex === index ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-3 h-3 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coverage Summary */}
      {aiControls.length > 0 && existingControls.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span>{existingControls.length} existing</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <span>{aiControls.filter(c => !existingNames.has(c.name.toLowerCase())).length} new AI suggestions</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2 font-medium">
                <span>{existingControls.length + aiControls.filter(c => !existingNames.has(c.name.toLowerCase())).length} potential total</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
