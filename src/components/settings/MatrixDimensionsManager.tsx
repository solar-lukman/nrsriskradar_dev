import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Grid3X3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function MatrixDimensionsManager() {
  const { toast } = useToast();
  const [institutional, setInstitutional] = useState<'4' | '5'>('5');
  const [compliance, setCompliance] = useState<'4' | '5'>('5');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'matrix_dimensions')
        .maybeSingle();
      const v = (data?.setting_value as any) || {};
      setInstitutional(String(v.institutional ?? 5) === '4' ? '4' : '5');
      setCompliance(String(v.compliance ?? 5) === '4' ? '4' : '5');
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          setting_value: { institutional: parseInt(institutional), compliance: parseInt(compliance) },
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', 'matrix_dimensions');
      if (error) throw error;
      toast({ title: 'Saved', description: 'Matrix dimensions updated. Reload pages to see changes.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Grid3X3 className="w-5 h-5" /> Matrix Dimensions</CardTitle>
        <CardDescription>Choose 4×4 or 5×5 heatmap per register type</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Institutional Risk Matrix</Label>
            <Select value={institutional} onValueChange={(v) => setInstitutional(v as '4' | '5')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4×4 (16 cells)</SelectItem>
                <SelectItem value="5">5×5 (25 cells)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Compliance Risk Matrix</Label>
            <Select value={compliance} onValueChange={(v) => setCompliance(v as '4' | '5')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4×4 (16 cells)</SelectItem>
                <SelectItem value="5">5×5 (25 cells)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />{saving ? 'Saving…' : 'Save Matrix Dimensions'}
        </Button>
      </CardContent>
    </Card>
  );
}
