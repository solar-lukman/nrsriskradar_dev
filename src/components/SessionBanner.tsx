import React from 'react';
import { ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoLogout } from '@/hooks/useAutoLogout';

function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

/**
 * Displays current authentication status and the inactivity countdown.
 * Tints to warning under 60s and destructive under 15s.
 */
export function SessionBanner() {
  const { isAuthenticated, user } = useAuth();
  const { remainingMs, timeoutMs } = useAutoLogout();

  if (!isAuthenticated || remainingMs === null) return null;

  const isCritical = remainingMs <= 15_000;
  const isWarning = !isCritical && remainingMs <= 60_000;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-1.5 text-xs border-b transition-colors',
        isCritical && 'bg-destructive/10 border-destructive/30 text-destructive',
        isWarning && 'bg-warning/10 border-warning/30 text-warning-foreground',
        !isCritical && !isWarning && 'bg-muted/40 border-border text-muted-foreground'
      )}
    >
      <div className="flex items-center gap-2">
        {isCritical ? (
          <AlertTriangle className="w-3.5 h-3.5" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
        )}
        <span>
          Signed in as <span className="font-medium text-foreground">{user?.email}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        <span>
          Auto sign-out in{' '}
          <span className={cn('font-mono font-medium', !isWarning && !isCritical && 'text-foreground')}>
            {formatDuration(remainingMs)}
          </span>
          <span className="hidden sm:inline text-muted-foreground/80">
            {' '}/ {Math.round(timeoutMs / 60000)}m idle limit
          </span>
        </span>
      </div>
    </div>
  );
}
