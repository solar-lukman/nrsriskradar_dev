import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddControlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskId: string;
  onSuccess: () => void;
}

export function AddControlDialog({ open, onOpenChange, riskId, onSuccess }: AddControlDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    control_name: '',
    control_type: 'mitigative',
    control_description: '',
    effectiveness_rating: 0,
    test_frequency: 'annual',
    status: 'active'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const effectivenessLabel =
        formData.effectiveness_rating >= 80 ? 'high'
          : formData.effectiveness_rating >= 50 ? 'medium'
          : formData.effectiveness_rating > 0 ? 'low'
          : 'untested';

      const { error } = await supabase
        .from('risk_controls')
        .insert({
          risk_id: riskId,
          control_name: formData.control_name,
          control_type: formData.control_type,
          description: formData.control_description || null,
          effectiveness_rating: effectivenessLabel,
          test_frequency: formData.test_frequency,
          status: formData.status,
          owner_id: user.id
        });

      if (error) throw error;

      toast.success('Control added successfully');
      onSuccess();
      setFormData({
        control_name: '',
        control_type: 'mitigative',
        control_description: '',
        effectiveness_rating: 0,
        test_frequency: 'annual',
        status: 'active'
      });
    } catch (error) {
      console.error('Error adding control:', error);
      toast.error('Failed to add control');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Risk Control</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="control_name">Control Name</Label>
            <Input
              id="control_name"
              value={formData.control_name}
              onChange={(e) => setFormData(prev => ({ ...prev, control_name: e.target.value }))}
              placeholder="Enter control name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="control_type">Control Type</Label>
            <Select 
              value={formData.control_type} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, control_type: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select control type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preventive">Preventive</SelectItem>
                <SelectItem value="detective">Detective</SelectItem>
                <SelectItem value="mitigative">Mitigative</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="control_description">Description</Label>
            <Textarea
              id="control_description"
              value={formData.control_description}
              onChange={(e) => setFormData(prev => ({ ...prev, control_description: e.target.value }))}
              placeholder="Describe the control..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="effectiveness_rating">Effectiveness (%)</Label>
              <Input
                id="effectiveness_rating"
                type="number"
                min="0"
                max="100"
                value={formData.effectiveness_rating}
                onChange={(e) => setFormData(prev => ({ ...prev, effectiveness_rating: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test_frequency">Test Frequency</Label>
              <Select 
                value={formData.test_frequency} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, test_frequency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Control'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}