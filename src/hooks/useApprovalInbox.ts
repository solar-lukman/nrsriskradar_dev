import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InboxRow {
  id: string;
  risk_reference: string | null;
  title: string;
  category: string;
  risk_type: string;
  department: string | null;
  residual_score: number;
  status: string;
  approval_status: string;
  submitted_at: string | null;
  returned_at: string | null;
  age_days: number;
  submitter_name: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  bucket: 'awaiting_review' | 'awaiting_approval' | 'returned_to_me' | 'reviewing' | null;
}

export type InboxBucket = NonNullable<InboxRow['bucket']>;

// Module-level registry: one realtime channel per user, shared across all hook instances.
type Entry = {
  channel: ReturnType<typeof supabase.channel>;
  refCount: number;
  listeners: Set<() => void>;
};
const registry = new Map<string, Entry>();

function subscribe(userId: string, onChange: () => void): () => void {
  let entry = registry.get(userId);
  if (!entry) {
    const listeners = new Set<() => void>();
    const channel = supabase.channel(`approval-inbox-${userId}`);
    channel
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'risks' },
        () => {
          listeners.forEach((fn) => fn());
        }
      )
      .subscribe();
    entry = { channel, refCount: 0, listeners };
    registry.set(userId, entry);
  }
  entry.listeners.add(onChange);
  entry.refCount += 1;

  return () => {
    const e = registry.get(userId);
    if (!e) return;
    e.listeners.delete(onChange);
    e.refCount -= 1;
    if (e.refCount <= 0) {
      supabase.removeChannel(e.channel);
      registry.delete(userId);
    }
  };
}

export function useApprovalInbox() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('get_approval_inbox' as any);
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data as any[] as InboxRow[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Shared per-user realtime subscription
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribe(user.id, () => {
      fetch();
    });
    return unsubscribe;
  }, [user, fetch]);

  return { rows, loading, error, refetch: fetch };
}

export function useApprovalInboxCount() {
  const { rows, loading } = useApprovalInbox();
  const actionable = rows.filter((r) => r.bucket && r.bucket !== 'reviewing').length;
  return { count: actionable, loading };
}
