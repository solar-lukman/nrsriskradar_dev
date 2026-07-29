import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface BCPlan {
  department: string;
  bia_criticality_rating?: string;
  bia_assessment_date?: string;
}

interface BIASummaryWidgetProps {
  plans: BCPlan[];
}

const CRITICALITY_COLORS: Record<string, string> = {
  Critical: 'hsl(0, 72%, 51%)',
  High: 'hsl(25, 95%, 53%)',
  Medium: 'hsl(45, 93%, 47%)',
  Low: 'hsl(142, 71%, 45%)',
};

export function BIASummaryWidget({ plans }: BIASummaryWidgetProps) {
  const criticalityData = useMemo(() => {
    const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    plans.forEach(p => {
      const rating = p.bia_criticality_rating || 'Medium';
      if (counts[rating] !== undefined) counts[rating]++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [plans]);

  const deptData = useMemo(() => {
    const deptMap: Record<string, Record<string, number>> = {};
    plans.forEach(p => {
      const dept = p.department || 'Unknown';
      const rating = p.bia_criticality_rating || 'Medium';
      if (!deptMap[dept]) deptMap[dept] = { Critical: 0, High: 0, Medium: 0, Low: 0 };
      deptMap[dept][rating]++;
    });
    return Object.entries(deptMap).map(([dept, ratings]) => ({
      department: dept.length > 12 ? dept.slice(0, 12) + '…' : dept,
      ...ratings,
    }));
  }, [plans]);

  const biaComplete = plans.filter(p => p.bia_assessment_date).length;
  const biaPercent = plans.length > 0 ? Math.round((biaComplete / plans.length) * 100) : 0;

  if (plans.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Criticality Distribution Pie */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            BIA Criticality Distribution
            <Badge variant="outline" className="text-xs font-normal">
              {biaPercent}% assessed
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={criticalityData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
                labelLine={false}
              >
                {criticalityData.map((entry) => (
                  <Cell key={entry.name} fill={CRITICALITY_COLORS[entry.name]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Department Breakdown Bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Criticality by Department
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptData} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="department" width={90} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="Critical" stackId="a" fill={CRITICALITY_COLORS.Critical} />
              <Bar dataKey="High" stackId="a" fill={CRITICALITY_COLORS.High} />
              <Bar dataKey="Medium" stackId="a" fill={CRITICALITY_COLORS.Medium} />
              <Bar dataKey="Low" stackId="a" fill={CRITICALITY_COLORS.Low} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
