import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shield, Clock, User } from 'lucide-react';
import { format } from 'date-fns';

interface Control {
  id: string;
  control_name: string;
  control_type: string;
  control_description?: string;
  description?: string;
  effectiveness_rating: string | number;
  status: string;
  last_tested_date?: string;
  next_test_date?: string;
  test_frequency: string;
  owner_name?: string;
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

interface ControlEffectivenessChartProps {
  controls: Control[];
}

export function ControlEffectivenessChart({ controls }: ControlEffectivenessChartProps) {
  const getTypeColor = (type: string): "destructive" | "secondary" | "default" | "outline" => {
    switch (type.toLowerCase()) {
      case 'preventive': return 'secondary';
      case 'detective': return 'outline';
      case 'mitigative': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusColor = (status: string): "destructive" | "secondary" | "default" | "outline" => {
    switch (status.toLowerCase()) {
      case 'active': return 'secondary';
      case 'inactive': return 'destructive';
      case 'planned': return 'outline';
      default: return 'outline';
    }
  };

  const getEffectivenessColor = (rating: number) => {
    if (rating >= 80) return 'success';
    if (rating >= 60) return 'warning';
    return 'destructive';
  };

  const descriptionOf = (c: Control) => c.control_description || c.description;

  const isOverdue = (nextTestDate?: string) => {
    if (!nextTestDate) return false;
    return new Date(nextTestDate) < new Date();
  };

  const groupedControls = controls.reduce((acc, control) => {
    const type = control.control_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(control);
    return acc;
  }, {} as Record<string, Control[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedControls).map(([type, typeControls]) => (
        <Card key={type}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {type.charAt(0).toUpperCase() + type.slice(1)} Controls
              <Badge variant={getTypeColor(type)}>
                {typeControls.length} controls
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {typeControls.map((control) => (
                <div key={control.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{control.control_name}</h4>
                      {descriptionOf(control) && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {descriptionOf(control)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusColor(control.status)}>
                        {control.status}
                      </Badge>
                      {isOverdue(control.next_test_date) && (
                        <Badge variant="destructive">Overdue</Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Effectiveness</span>
                        <span className="text-sm font-bold">
                          {effectivenessToPercent(control.effectiveness_rating)}%
                        </span>
                      </div>
                      <Progress 
                        value={effectivenessToPercent(control.effectiveness_rating)} 
                        className="h-2"
                      />
                    </div>

                    <div className="space-y-2">
                      {control.last_tested_date && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Last tested:</span>
                          <span>{format(new Date(control.last_tested_date), 'MMM dd, yyyy')}</span>
                        </div>
                      )}
                      {control.next_test_date && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Next test:</span>
                          <span className={isOverdue(control.next_test_date) ? 'text-destructive font-medium' : ''}>
                            {format(new Date(control.next_test_date), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Frequency:</span>
                        <span className="capitalize">{control.test_frequency}</span>
                      </div>
                      {control.owner_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span>{control.owner_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {typeControls.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No {type.toLowerCase()} controls defined
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      
      {controls.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Controls Defined</h3>
            <p className="text-muted-foreground">
              Add controls to track their effectiveness and testing schedules.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}