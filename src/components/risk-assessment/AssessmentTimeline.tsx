import React from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, TrendingUp, TrendingDown } from 'lucide-react';

interface Assessment {
  id: string;
  assessment_date: string;
  assessment_type: string;
  likelihood: number;
  impact: number;
  control_score: number;
  assessor_name?: string;
  notes?: string;
}

interface AssessmentTimelineProps {
  assessments: Assessment[];
  className?: string;
}

export function AssessmentTimeline({ assessments, className }: AssessmentTimelineProps) {
  const sortedAssessments = [...assessments].sort(
    (a, b) => new Date(b.assessment_date).getTime() - new Date(a.assessment_date).getTime()
  );

  const getTypeColor = (type: string): "destructive" | "secondary" | "default" | "outline" => {
    switch (type) {
      case 'inherent': return 'destructive';
      case 'residual': return 'secondary';
      case 'target': return 'outline';
      default: return 'secondary';
    }
  };

  const getRiskScore = (likelihood: number, impact: number) => {
    return likelihood * impact;
  };

  const getTrendIcon = (current: Assessment, previous?: Assessment) => {
    if (!previous) return null;
    
    const currentScore = getRiskScore(current.likelihood, current.impact);
    const previousScore = getRiskScore(previous.likelihood, previous.impact);
    
    if (currentScore > previousScore) {
      return <TrendingUp className="w-4 h-4 text-destructive" />;
    } else if (currentScore < previousScore) {
      return <TrendingDown className="w-4 h-4 text-success" />;
    }
    return null;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Assessment History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedAssessments.map((assessment, index) => (
            <div key={assessment.id} className="flex items-start space-x-4 pb-4 border-b border-border last:border-b-0">
              <div className="flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-primary mt-2" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={getTypeColor(assessment.assessment_type)}>
                      {assessment.assessment_type}
                    </Badge>
                    {getTrendIcon(assessment, sortedAssessments[index + 1])}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(assessment.assessment_date), 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-2">
                  <div className="text-center">
                    <div className="text-sm font-medium">Likelihood</div>
                    <div className="text-lg font-bold">{assessment.likelihood}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium">Impact</div>
                    <div className="text-lg font-bold">{assessment.impact}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium">Control</div>
                    <div className="text-lg font-bold">{assessment.control_score}%</div>
                  </div>
                </div>
                {assessment.assessor_name && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                    <User className="w-3 h-3" />
                    {assessment.assessor_name}
                  </div>
                )}
                {assessment.notes && (
                  <p className="text-sm text-muted-foreground">{assessment.notes}</p>
                )}
              </div>
            </div>
          ))}
          {sortedAssessments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No assessments recorded yet
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}