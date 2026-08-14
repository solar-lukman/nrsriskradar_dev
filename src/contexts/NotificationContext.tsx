import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'risk_update' | 'bcp_change' | 'document_upload' | 'system' | 'user_action' | 'approval';
  resource_type?: string;
  resource_id?: string;
  is_read: boolean;
  created_at: string;
  expires_at?: string;
  metadata: any;
}

interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  risk_updates_email: boolean;
  bcp_changes_email: boolean;
  document_uploads_email: boolean;
  system_alerts_email: boolean;
  // In-app category toggles
  risk_updates_in_app: boolean;
  bcp_changes_in_app: boolean;
  document_uploads_in_app: boolean;
  system_alerts_in_app: boolean;
  approvals_in_app: boolean;
  appetite_in_app: boolean;
  // Quiet hours
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // "HH:MM:SS" or "HH:MM"
  quiet_hours_end: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  preferences: NotificationPreferences | null;
  isMuted: (n: Notification) => boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  refreshNotifications: () => Promise<void>;
  sendNotification: (userId: string, title: string, message: string, type?: string, category?: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const isAppetiteNotification = (n: Notification) =>
  /appetite|exceed|tolerance|escalat/i.test(`${n.title} ${n.message}`) ||
  !!n?.metadata?.tolerance_level ||
  !!n?.metadata?.threshold_score;

function inQuietHours(prefs: NotificationPreferences | null, now = new Date()): boolean {
  if (!prefs?.quiet_hours_enabled) return false;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map((x) => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(prefs.quiet_hours_start || '22:00');
  const end = toMinutes(prefs.quiet_hours_end || '07:00');
  if (start === end) return false;
  // Windows that cross midnight
  if (start > end) return cur >= start || cur < end;
  return cur >= start && cur < end;
}

function categoryAllowed(prefs: NotificationPreferences | null, n: Notification): boolean {
  if (!prefs) return true;
  if (isAppetiteNotification(n) && prefs.appetite_in_app === false) return false;
  switch (n.category) {
    case 'risk_update':
      return prefs.risk_updates_in_app !== false;
    case 'bcp_change':
      return prefs.bcp_changes_in_app !== false;
    case 'document_upload':
      return prefs.document_uploads_in_app !== false;
    case 'approval':
      return prefs.approvals_in_app !== false;
    case 'system':
      return prefs.system_alerts_in_app !== false;
    default:
      return true;
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  /**
   * The realtime subscription is installed once per session, so its INSERT handler
   * would otherwise close over the initial (null) preferences and ignore every later
   * mute / quiet-hours edit. Mirror preferences into a ref the handler reads live.
   */
  const preferencesRef = useRef<NotificationPreferences | null>(null);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);


  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchNotifications();
      fetchPreferences();
      const cleanup = setupRealtimeSubscription();
      return cleanup;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setNotifications((data as Notification[]) || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const fetchPreferences = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setPreferences(data as NotificationPreferences);
      } else {
        const { data: newPrefs, error: createError } = await supabase
          .from('notification_preferences')
          .insert({ user_id: user.id })
          .select()
          .single();
        if (createError) throw createError;
        setPreferences(newPrefs as NotificationPreferences);
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notification;
          setNotifications(prev => (prev.some(x => x.id === n.id) ? prev : [n, ...prev]));

          // Toast gate: respect in-app + category + quiet hours (read live, not closed over)
          const prefs = preferencesRef.current;
          if (
            prefs?.in_app_enabled !== false &&
            categoryAllowed(prefs, n) &&
            !inQuietHours(prefs)
          ) {

            toast({
              title: n.title,
              description: n.message,
              variant: n.type === 'error' ? 'destructive' : 'default'
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(prev => prev.map(n => (n.id === updated.id ? { ...n, ...updated } : n)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const removedId = (payload.old as { id?: string })?.id;
          if (!removedId) return;
          setNotifications(prev => prev.filter(n => n.id !== removedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user?.id);
      if (error) throw error;
      setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n)));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user?.id)
        .eq('is_read', false);
      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user?.id);
      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const updatePreferences = async (prefs: Partial<NotificationPreferences>) => {
    if (!user || !preferences) return;
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .update(prefs)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      setPreferences(data as NotificationPreferences);
      toast({ title: 'Preferences saved', description: 'Notification preferences updated.' });
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast({ title: 'Error', description: 'Failed to update preferences', variant: 'destructive' });
    }
  };

  const sendNotification = async (
    userId: string, title: string, message: string, type = 'info', category = 'system'
  ) => {
    try {
      const { error } = await supabase.rpc('send_notification', {
        p_user_id: userId, p_title: title, p_message: message, p_type: type, p_category: category
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  const isMuted = (n: Notification) => !categoryAllowed(preferences, n);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      preferences,
      isMuted,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      updatePreferences,
      refreshNotifications: fetchNotifications,
      sendNotification
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
