import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Activity, Plus, Pencil, Trash2, AlertTriangle, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface IncidentTimelineProps {
  incidentId: string;
  /** When set, scroll that audit-log entry into view and briefly highlight it. */
  highlightEntryId?: string;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  status: 'Status',
  severity: 'Severity',
  risk_posture: 'Risk Posture',
  event_date: 'Event Date',
  discovered_date: 'Discovery Date',
  resolution_date: 'Resolution Date',
  financial_impact: 'Financial Impact',
  event_description: 'Description',
  root_cause: 'Root Cause',
  immediate_response: 'Immediate Response',
  operational_impact: 'Operational Impact',
  reputational_impact: 'Reputational Impact',
  lessons_learned: 'Lessons Learned',
  impact_amount: 'Impact Amount',
  impact_description: 'Impact Description',
  resolution_notes: 'Resolution Notes',
  owner_id: 'Incident Owner',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatValue(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') {
    if (v.length > 80) return v.slice(0, 80) + '…';
    return v;
  }
  return String(v);
}

export function IncidentTimeline({ incidentId, highlightEntryId }: IncidentTimelineProps) {
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['incident-audit', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_audit_logs')
        .select('id, action, severity, performed_at, user_id, details')
        .eq('resource_type', 'incident')
        .eq('resource_id', incidentId)
        .order('performed_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const userIds = new Set<string>();
      (data || []).forEach((e: any) => {
        if (e.user_id) userIds.add(e.user_id);
        const changes = e.details?.changes || {};
        const owner = changes.owner_id;
        if (owner) {
          if (typeof owner.from === 'string' && UUID_RE.test(owner.from)) userIds.add(owner.from);
          if (typeof owner.to === 'string' && UUID_RE.test(owner.to)) userIds.add(owner.to);
        }
        if (typeof e.details?.owner_id === 'string' && UUID_RE.test(e.details.owner_id)) {
          userIds.add(e.details.owner_id);
        }
      });
      const userMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (userIds.size) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', Array.from(userIds));
        (profs || []).forEach((p: any) => {
          userMap[p.user_id] = { full_name: p.full_name, email: p.email };
        });
      }
      return (data || []).map((e: any) => ({
        ...e,
        actor: e.user_id ? userMap[e.user_id] || null : null,
        _userMap: userMap,
      }));
    },
    enabled: !!incidentId,
  });

  useEffect(() => {
    if (!highlightEntryId || entries.length === 0) return;
    const el = rowRefs.current[highlightEntryId];
    if (!el) return;
    // let the ScrollArea layout settle
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-warning', 'rounded-md');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-warning', 'rounded-md'), 2500);
    }, 150);
    return () => window.clearTimeout(t);
  }, [highlightEntryId, entries.length]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
        No activity recorded yet.
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[420px] pr-2">
      <ol className="relative border-l border-border ml-3 space-y-4">
        {entries.map((e: any) => {
          const isCreate = e.action === 'incident_created';
          const isDelete = e.action === 'incident_deleted';
          const isOwnerChange = e.action === 'incident_owner_changed';
          const isUpdate = e.action === 'incident_updated' || isOwnerChange;
          const Icon = isCreate ? Plus : isDelete ? Trash2 : isOwnerChange ? UserCog : isUpdate ? Pencil : AlertTriangle;
          const iconColor = isCreate
            ? 'bg-success text-success-foreground'
            : isDelete
              ? 'bg-destructive text-destructive-foreground'
              : isOwnerChange
                ? 'bg-warning text-warning-foreground'
                : 'bg-primary text-primary-foreground';
          const changes = (e.details?.changes || {}) as Record<string, { from: any; to: any }>;
          const changeKeys = Object.keys(changes);
          const actorName = e.actor?.full_name || e.actor?.email || 'System';
          const userMap = e._userMap as Record<string, { full_name: string | null; email: string | null }>;
          const resolveName = (v: any) => {
            if (typeof v === 'string' && UUID_RE.test(v) && userMap?.[v]) {
              return userMap[v].full_name || userMap[v].email || v.slice(0, 8);
            }
            return formatValue(v);
          };

          return (
            <li key={e.id} ref={(el) => { rowRefs.current[e.id] = el; }} className="ml-6 transition-shadow">
              <span className={cn('absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background', iconColor)}>
                <Icon className="w-3 h-3" />
              </span>
              <div className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="text-sm">
                    <span className="font-medium">{actorName}</span>{' '}
                    <span className="text-muted-foreground">
                      {isCreate && 'reported the incident'}
                      {isOwnerChange && 'reassigned the incident owner'}
                      {isUpdate && !isOwnerChange && 'updated the incident'}
                      {isDelete && 'removed the incident'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwnerChange && <Badge className="text-[10px] bg-warning text-warning-foreground">Owner change</Badge>}
                    {e.severity === 'high' && !isOwnerChange && <Badge variant="destructive" className="text-[10px]">High</Badge>}
                    <time className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(e.performed_at), 'dd MMM yyyy, HH:mm')}
                    </time>
                  </div>
                </div>

                {isUpdate && changeKeys.length > 0 && (
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {changeKeys.map((k) => {
                      const isOwnerField = k === 'owner_id';
                      return (
                        <li key={k} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-foreground">{FIELD_LABELS[k] || k}:</span>
                          <span className="text-muted-foreground line-through">
                            {isOwnerField ? resolveName(changes[k].from) : formatValue(changes[k].from)}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-foreground">
                            {isOwnerField ? resolveName(changes[k].to) : formatValue(changes[k].to)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {isCreate && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {e.details?.reference_number && <span className="font-mono mr-2">{e.details.reference_number}</span>}
                    {e.details?.severity && <span>Severity: {e.details.severity}</span>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </ScrollArea>
  );
}
