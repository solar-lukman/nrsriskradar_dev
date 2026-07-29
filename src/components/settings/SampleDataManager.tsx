import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Database, Download, Trash2, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Status = {
  installed: boolean;
  total: number;
  counts: Record<string, number>;
};

const ENTITY_LABELS: Record<string, string> = {
  risks: 'Risks',
  business_continuity_plans: 'Business Continuity Plans',
  control_documents: 'Control Documents',
  risk_events: 'Risk Events',
  forum_discussions: 'Forum Discussions',
  departments: 'Departments',
  strategic_objectives: 'Strategic Objectives',
};

export function SampleDataManager() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const formatErrors = (errors: string[]) =>
    errors
      .map((entry) => {
        const [area, ...rest] = entry.split(':');
        const label = ENTITY_LABELS[area] || area;
        const detail = rest.join(':').trim();
        return detail ? `${label}: ${detail}` : label;
      })
      .join(' • ');

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('sample-data-manager', {
        body: { action: 'status' },
      });
      if (error) throw error;
      setStatus(data as Status);
    } catch (err: any) {
      toast.error('Failed to load sample data status', {
        description: err.message,
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const { data, error } = await supabase.functions.invoke('sample-data-manager', {
        body: { action: 'install' },
      });
      if (error) throw error;
      const result = data as { success: boolean; total: number; errors: string[] };
      if (result.success) {
        toast.success('Sample data installed', {
          description: `Inserted ${result.total} records across the system.`,
        });
      } else {
        toast.error('Sample data installed with warnings', {
          description: formatErrors(result.errors),
        });
      }
      await loadStatus();
    } catch (err: any) {
      toast.error('Sample data install failed', {
        description: err.message,
      });
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async () => {
    setUninstalling(true);
    try {
      const { data, error } = await supabase.functions.invoke('sample-data-manager', {
        body: { action: 'uninstall' },
      });
      if (error) throw error;
      const result = data as { success: boolean; total: number; errors: string[] };
      if (result.success) {
        toast.success('Sample data removed', {
          description: `Removed ${result.total} records.`,
        });
      } else {
        toast.error('Sample data removed with warnings', {
          description: formatErrors(result.errors),
        });
      }
      await loadStatus();
    } catch (err: any) {
      toast.error('Sample data uninstall failed', {
        description: err.message,
      });
    } finally {
      setUninstalling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" /> Sample Data
        </CardTitle>
        <CardDescription>
          Populate the application with realistic demonstration data across risks, BCPs, documents,
          incidents, departments, and the learning forum. All records are tagged with{' '}
          <code className="px-1 bg-muted rounded text-xs">[SAMPLE]</code> and can be removed cleanly.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {loadingStatus ? (
              <Badge variant="outline" className="gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Checking…
              </Badge>
            ) : status?.installed ? (
              <Badge variant="default" className="gap-1 bg-success text-success-foreground">
                <CheckCircle2 className="w-3 h-3" /> Installed ({status.total} records)
              </Badge>
            ) : (
              <Badge variant="secondary">Not installed</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={loadStatus} disabled={loadingStatus}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingStatus ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {status && status.total > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.entries(status.counts).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between px-3 py-2 border rounded-md bg-muted/30">
                <span className="text-muted-foreground">{ENTITY_LABELS[key] || key}</span>
                <span className="font-mono font-medium">{count}</span>
              </div>
            ))}
          </div>
        )}

        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-xs">
            Sample data is intended for demos and onboarding. Trigger functions (audit logs, notifications,
            history) will fire normally. Uninstall removes only records tagged <code>[SAMPLE]</code>;
            real data is never touched.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={installing || uninstalling}>
                <Download className="w-4 h-4 mr-2" />
                {installing ? 'Installing…' : 'Install Sample Data'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Install sample data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will insert demo records (risks, BCPs, documents, incidents, forum posts,
                  departments, strategic objectives) into the live database. Records are clearly tagged
                  and can be removed at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleInstall}>Install</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={installing || uninstalling || !status?.installed}>
                <Trash2 className="w-4 h-4 mr-2" />
                {uninstalling ? 'Removing…' : 'Uninstall Sample Data'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove all sample data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete every record tagged <code>[SAMPLE]</code> across all
                  modules. Real, user-created data is preserved. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleUninstall} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Yes, remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
