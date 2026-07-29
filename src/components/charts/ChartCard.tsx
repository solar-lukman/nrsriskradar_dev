import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  height?: number | string;
  children: React.ReactNode;
}

/**
 * Unified chart wrapper with consistent loading, empty, and error states.
 * Use across all dashboards so charts behave the same way.
 */
export function ChartCard({
  title,
  description,
  actions,
  loading,
  error,
  isEmpty,
  emptyMessage = 'No data to display for the selected period.',
  emptyIcon,
  className,
  contentClassName,
  height,
  children,
}: ChartCardProps) {
  const heightStyle = height ? { height: typeof height === 'number' ? `${height}px` : height } : undefined;

  return (
    <Card className={cn('shadow-card', className)}>
      {(title || description || actions) && (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 flex-1">
            {title && <CardTitle className="text-base sm:text-lg">{title}</CardTitle>}
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn('relative', contentClassName)} style={heightStyle}>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-[220px] w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center text-center py-10 text-sm text-destructive">
            <AlertCircle className="w-6 h-6 mb-2" />
            <span>{error}</span>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center text-center py-10 text-sm text-muted-foreground">
            {emptyIcon ?? <BarChart3 className="w-6 h-6 mb-2 opacity-50" />}
            <span>{emptyMessage}</span>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
