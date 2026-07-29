import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface ControlScoreGaugeProps {
  score: number;
  target: number;
  title: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ControlScoreGauge({ score, target, title, size = 'md' }: ControlScoreGaugeProps) {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const scorePercentage = Math.min(score, 100);
  const targetPercentage = Math.min(target, 100);
  
  const radius = size === 'sm' ? 28 : size === 'md' ? 40 : 56;
  const circumference = 2 * Math.PI * radius;
  const scoreOffset = circumference - (scorePercentage / 100) * circumference;
  const targetOffset = circumference - (targetPercentage / 100) * circumference;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'hsl(var(--success))';
    if (score >= 60) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  return (
    <Card className="p-4">
      <CardContent className="flex flex-col items-center space-y-2">
        <div className="relative">
          <svg className={`${sizeClasses[size]} transform -rotate-90`} viewBox="0 0 120 120">
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke="hsl(var(--muted))"
              strokeWidth="8"
              fill="transparent"
              className="opacity-20"
            />
            {/* Target circle */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={targetOffset}
              className="opacity-40"
              strokeLinecap="round"
            />
            {/* Score circle */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke={getScoreColor(score)}
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={scoreOffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-bold text-foreground ${textSizes[size]}`}>
              {score}%
            </span>
            {size !== 'sm' && (
              <span className="text-xs text-muted-foreground">
                / {target}%
              </span>
            )}
          </div>
        </div>
        <div className="text-center">
          <h4 className={`font-medium ${textSizes[size]}`}>{title}</h4>
          {size !== 'sm' && (
            <p className="text-xs text-muted-foreground">
              Target: {target}%
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}