import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RiskData {
  id: string;
  title: string;
  category: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
}

interface RiskHeatmapEnhancedProps {
  riskData: RiskData[];
  showResidual?: boolean;
}

export function RiskHeatmapEnhanced({ riskData, showResidual = true }: RiskHeatmapEnhancedProps) {
  const createMatrix = () => {
    const matrix: Array<Array<RiskData[]>> = Array(5).fill(null).map(() => Array(5).fill(null).map(() => []));
    
    riskData.forEach(risk => {
      const likelihood = showResidual ? risk.residual_likelihood : risk.inherent_likelihood;
      const impact = showResidual ? risk.residual_impact : risk.inherent_impact;
      
      if (likelihood >= 1 && likelihood <= 5 && impact >= 1 && impact <= 5) {
        matrix[5 - likelihood][impact - 1].push(risk);
      }
    });
    
    return matrix;
  };

  const getCellColorClass = (likelihood: number, impact: number) => {
    const score = likelihood * impact;
    if (score >= 15) return 'hsl(var(--destructive))';
    if (score >= 9) return 'hsl(var(--warning))';
    if (score >= 4) return 'hsl(var(--accent))';
    return 'hsl(var(--success))';
  };

  const matrix = createMatrix();
  const likelihoodLabels = ['Very High', 'High', 'Medium', 'Low', 'Very Low'];
  const impactLabels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Risk Heatmap - {showResidual ? 'Residual' : 'Inherent'} Risk
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {riskData.length} risks plotted
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-sm font-medium text-center border border-border">
                  Impact →<br />Likelihood ↓
                </th>
                {impactLabels.map((label, index) => (
                  <th key={index} className="p-2 text-sm font-medium text-center border border-border min-w-[100px]">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, likelihoodIndex) => (
                <tr key={likelihoodIndex}>
                  <td className="p-2 text-sm font-medium text-center border border-border bg-muted">
                    {likelihoodLabels[likelihoodIndex]}
                  </td>
                  {row.map((risks, impactIndex) => {
                    const likelihood = 5 - likelihoodIndex;
                    const impact = impactIndex + 1;
                    const score = likelihood * impact;
                    
                    return (
                      <td
                        key={impactIndex}
                        className="p-2 text-center border border-border h-20 relative group cursor-pointer transition-all hover:scale-105"
                        style={{ 
                          backgroundColor: getCellColorClass(likelihood, impact),
                          opacity: 0.8 
                        }}
                      >
                        <div className="flex flex-col items-center justify-center h-full">
                          <div className="text-lg font-bold text-foreground">
                            {score}
                          </div>
                          {risks.length > 0 && (
                            <div className="text-xs text-foreground opacity-90">
                              {risks.length} risk{risks.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                        
                        {/* Tooltip */}
                        {risks.length > 0 && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-background border border-border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 min-w-[200px]">
                            <div className="text-sm font-medium mb-2">
                              Likelihood: {likelihood}, Impact: {impact}
                            </div>
                            <div className="space-y-1">
                              {risks.slice(0, 3).map(risk => (
                                <div key={risk.id} className="text-xs">
                                  <span className="font-medium">{risk.title}</span>
                                  <Badge variant="outline" className="ml-1 text-xs">
                                    {risk.category}
                                  </Badge>
                                </div>
                              ))}
                              {risks.length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                  +{risks.length - 3} more...
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Legend */}
        <div className="mt-6">
          <h4 className="text-sm font-medium mb-3">Risk Level Legend</h4>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: 'hsl(var(--destructive))' }}
              />
              <span className="text-sm">Critical (15-25)</span>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: 'hsl(var(--warning))' }}
              />
              <span className="text-sm">High (9-14)</span>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: 'hsl(var(--accent))' }}
              />
              <span className="text-sm">Medium (4-8)</span>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: 'hsl(var(--success))' }}
              />
              <span className="text-sm">Low (1-3)</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}