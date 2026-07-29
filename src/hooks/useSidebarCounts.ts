import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SidebarCounts {
  risks: number;
  bcps: number;
  incidents: number;
  reports: number;
  calendarUpcoming: number;
  whistleblow: number;
  users: number;
}

const EMPTY: SidebarCounts = {
  risks: 0,
  bcps: 0,
  incidents: 0,
  reports: 0,
  calendarUpcoming: 0,
  whistleblow: 0,
  users: 0,
};

export function useSidebarCounts() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY);

  const fetchCounts = async () => {
    if (!user) {
      setCounts(EMPTY);
      return;
    }

    const today = new Date();
    const in14 = new Date();
    in14.setDate(today.getDate() + 14);

    const [risks, bcps, incidents, reports, reviews, profiles] = await Promise.all([
      supabase.from('risks').select('id', { count: 'exact', head: true }),
      supabase.from('business_continuity_plans').select('id', { count: 'exact', head: true }),
      supabase.from('risk_events').select('id', { count: 'exact', head: true }),
      supabase.from('board_report_archives').select('id', { count: 'exact', head: true }),
      supabase
        .from('risks')
        .select('id', { count: 'exact', head: true })
        .gte('review_date', today.toISOString().split('T')[0])
        .lte('review_date', in14.toISOString().split('T')[0]),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);

    setCounts({
      risks: risks.count ?? 0,
      bcps: bcps.count ?? 0,
      incidents: incidents.count ?? 0,
      reports: reports.count ?? 0,
      calendarUpcoming: reviews.count ?? 0,
      whistleblow: 0,
      users: profiles.count ?? 0,
    });
  };

  useEffect(() => {
    fetchCounts();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const suffix = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`sidebar-counts-${user.id}-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'risks' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_continuity_plans' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'risk_events' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_report_archives' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchCounts)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return counts;
}
