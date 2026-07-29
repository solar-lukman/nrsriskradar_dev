import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

interface AccessDeniedProps {
  /** Custom denial message. */
  message?: string;
  /** When true, the wrapped fallback shows instead of "Access Denied" while auth resolves. */
  fallback?: React.ReactNode;
}

/**
 * Standardized access-denied placeholder. Suppresses the message while the
 * auth context is still resolving so users don't see a misleading flash on
 * page reload or after sign-in.
 */
export function AccessDenied({
  message = "You don't have permission to access this page.",
  fallback,
}: AccessDeniedProps) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      fallback ?? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Verifying access…</p>
          </div>
        </div>
      )
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-warning" />
            Access Denied
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
