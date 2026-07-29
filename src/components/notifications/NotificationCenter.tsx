import React, { useMemo, useState } from 'react';
import {
  Bell, X, CheckCheck, Check, Settings, ExternalLink, Gauge, AlertTriangle,
  Activity, Search, ArrowDownUp, VolumeX, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useNotifications } from '@/contexts/NotificationContext';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

type SortMode = 'newest' | 'oldest' | 'severity' | 'unread_first';

const NotificationCenter = () => {
  const {
    notifications,
    unreadCount,
    preferences,
    isMuted,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    updatePreferences,
  } = useNotifications();

  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'alerts' | 'events' | 'appetite'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [hideMuted, setHideMuted] = useState(true);
  const navigate = useNavigate();

  const isAppetiteNotification = (n: any) =>
    /appetite|exceed|tolerance|escalat/i.test(`${n.title} ${n.message}`) ||
    !!n?.metadata?.tolerance_level ||
    !!n?.metadata?.threshold_score;

  const ACTION_SEVERITY: Record<string, number> = { flag_audit: 3, escalate: 2, notify: 1 };
  const TYPE_SEVERITY: Record<string, number> = { error: 4, warning: 3, info: 2, success: 1 };

  const toleranceDistance = (n: any): number => {
    const score = Number(n?.metadata?.score ?? n?.metadata?.residual_score);
    const threshold = Number(n?.metadata?.threshold_score);
    if (Number.isFinite(score) && Number.isFinite(threshold)) return score - threshold;
    return 0;
  };

  const isAlertNotification = (n: any) => n.type === 'warning' || n.type === 'error';

  const EVENT_CATEGORIES = new Set(['risk_update', 'bcp_change', 'document_upload', 'approval', 'user_action']);
  const isEventNotification = (n: any) =>
    EVENT_CATEGORIES.has(n.category) && !isAppetiteNotification(n) && !isAlertNotification(n);

  const sortList = (list: any[]) => {
    const copy = [...list];
    const byNewest = (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    switch (sort) {
      case 'oldest':
        copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'severity':
        copy.sort((a, b) => {
          const aApp = isAppetiteNotification(a);
          const bApp = isAppetiteNotification(b);
          if (aApp !== bApp) return aApp ? -1 : 1;
          if (aApp && bApp) {
            const aSev = ACTION_SEVERITY[a?.metadata?.escalation_action] ?? 0;
            const bSev = ACTION_SEVERITY[b?.metadata?.escalation_action] ?? 0;
            if (aSev !== bSev) return bSev - aSev;
            const aD = toleranceDistance(a);
            const bD = toleranceDistance(b);
            if (aD !== bD) return bD - aD;
          }
          const at = TYPE_SEVERITY[a.type] ?? 0;
          const bt = TYPE_SEVERITY[b.type] ?? 0;
          if (at !== bt) return bt - at;
          return byNewest(a, b);
        });
        break;
      case 'unread_first':
        copy.sort((a, b) => {
          if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
          return byNewest(a, b);
        });
        break;
      case 'newest':
      default:
        copy.sort(byNewest);
    }
    return copy;
  };

  const filteredNotifications = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = notifications.filter((n) => {
      if (hideMuted && isMuted(n)) return false;
      if (filter === 'unread' && n.is_read) return false;
      if (filter === 'appetite' && !isAppetiteNotification(n)) return false;
      if (filter === 'alerts' && !isAlertNotification(n)) return false;
      if (filter === 'events' && !isEventNotification(n)) return false;
      if (q) {
        const hay = `${n.title} ${n.message} ${n.category} ${n.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortList(base);
  }, [notifications, filter, search, sort, hideMuted, isMuted]);

  const appetiteCount = useMemo(() => notifications.filter(isAppetiteNotification).length, [notifications]);
  const alertsCount = useMemo(() => notifications.filter(isAlertNotification).length, [notifications]);
  const eventsCount = useMemo(() => notifications.filter(isEventNotification).length, [notifications]);

  const openResource = (n: any) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.resource_type === 'risk' && n.resource_id) {
      navigate(`/risk-register?view=${n.resource_id}`);
    } else if (n.resource_type === 'bcp' && n.resource_id) {
      navigate(`/business-continuity?view=${n.resource_id}`);
    } else if (n.resource_type === 'incident' && n.resource_id) {
      const isOwnerChange =
        /reassigned|owner/i.test(`${n.title} ${n.message}`) ||
        n?.metadata?.action === 'incident_owner_changed';
      const tab = isOwnerChange ? 'history' : 'details';
      const entryId = n?.metadata?.audit_log_id;
      const parts = [`view=${n.resource_id}`, `tab=${tab}`];
      if (entryId) parts.push(`entry=${entryId}`);
      navigate(`/incidents-dashboard?${parts.join('&')}`);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error': return '🚨';
      case 'warning': return '⚠️';
      case 'success': return '✅';
      default: return 'ℹ️';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'risk_update': return 'Risk Update';
      case 'bcp_change': return 'BCP Change';
      case 'document_upload': return 'Document Upload';
      case 'user_action': return 'User Action';
      case 'approval': return 'Approval';
      default: return 'System';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md h-[85vh] max-h-[640px] p-0 flex flex-col">
        <div className="flex flex-col h-full min-h-0">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>Notifications</DialogTitle>
              <div className="flex gap-2">
                {unreadCount > 0 && !showSettings && (
                  <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
                    <CheckCheck className="h-4 w-4 mr-1" />
                    Mark all read
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            <Tabs value={showSettings ? 'settings' : 'notifications'} className="h-full flex flex-col">
              <TabsContent value="notifications" className="flex-1 min-h-0 m-0 flex flex-col">
                {/* Search + sort */}
                <div className="px-4 pt-3 pb-2 border-b space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search notifications…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-7 h-8 text-xs"
                      />
                    </div>
                    <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                      <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Sort notifications">
                        <ArrowDownUp className="w-3 h-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest first</SelectItem>
                        <SelectItem value="oldest">Oldest first</SelectItem>
                        <SelectItem value="severity">Severity</SelectItem>
                        <SelectItem value="unread_first">Unread first</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button size="sm" variant={filter === 'all' ? 'default' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setFilter('all')}>
                      All ({notifications.length})
                    </Button>
                    <Button size="sm" variant={filter === 'unread' ? 'default' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setFilter('unread')}>
                      Unread ({unreadCount})
                    </Button>
                    <Button size="sm" variant={filter === 'alerts' ? 'default' : 'ghost'} className="h-7 px-2 text-xs gap-1" onClick={() => setFilter('alerts')}>
                      <AlertTriangle className="w-3 h-3" />Alerts ({alertsCount})
                    </Button>
                    <Button size="sm" variant={filter === 'events' ? 'default' : 'ghost'} className="h-7 px-2 text-xs gap-1" onClick={() => setFilter('events')}>
                      <Activity className="w-3 h-3" />Events ({eventsCount})
                    </Button>
                    <Button size="sm" variant={filter === 'appetite' ? 'default' : 'ghost'} className="h-7 px-2 text-xs gap-1" onClick={() => setFilter('appetite')}>
                      <Gauge className="w-3 h-3" />Appetite ({appetiteCount})
                    </Button>
                    <button
                      type="button"
                      onClick={() => setHideMuted(v => !v)}
                      className={cn(
                        'ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border',
                        hideMuted ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground'
                      )}
                      title="Hide notifications from muted categories"
                    >
                      <VolumeX className="w-3 h-3" />
                      {hideMuted ? 'Hiding muted' : 'Show muted'}
                    </button>
                  </div>
                </div>

                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-3">
                    {filteredNotifications.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">
                          {search
                            ? 'No notifications match your search'
                            : filter !== 'all'
                              ? 'No notifications in this filter'
                              : 'No notifications yet'}
                        </p>
                      </div>
                    ) : filteredNotifications.map((notification) => {
                      const isAppetite = isAppetiteNotification(notification);
                      const canOpen = !!(notification.resource_id &&
                        (notification.resource_type === 'risk' ||
                          notification.resource_type === 'bcp' ||
                          notification.resource_type === 'incident'));
                      return (
                        <Card
                          key={notification.id}
                          className={cn(
                            'transition-all hover:shadow-md',
                            !notification.is_read && 'border-primary/50 bg-primary/5',
                            isAppetite && 'border-l-4 border-l-warning'
                          )}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              <div className="text-lg mt-1 flex-shrink-0">
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="font-medium text-sm truncate">{notification.title}</h4>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {isAppetite && (
                                      <Badge variant="outline" className="text-xs gap-1">
                                        <Gauge className="w-3 h-3" />
                                        Appetite
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="text-xs">
                                      {getCategoryLabel(notification.category)}
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                                      aria-label="Delete notification"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{notification.message}</p>
                                <div className="flex items-center justify-between gap-2 mt-2">
                                  <span className="text-xs text-muted-foreground">{formatTimeAgo(notification.created_at)}</span>
                                  <div className="flex items-center gap-2">
                                    {canOpen && (
                                      <Button
                                        size="sm" variant="ghost" className="h-6 px-2 gap-1 text-xs"
                                        onClick={(e) => { e.stopPropagation(); openResource(notification); }}
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        Open
                                      </Button>
                                    )}
                                    {!notification.is_read && (
                                      <>
                                        <Button
                                          size="sm" variant="ghost" className="h-6 px-2 gap-1 text-xs"
                                          onClick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                                          title="Mark as read"
                                        >
                                          <Check className="w-3 h-3" />
                                          Mark read
                                        </Button>
                                        <span className="w-2 h-2 bg-primary rounded-full" aria-label="Unread" />
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="settings" className="h-full m-0 overflow-y-auto">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
                      ← Back to notifications
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="font-medium">Delivery</h3>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="in-app-enabled" className="text-sm">In-app notifications</Label>
                      <Switch
                        id="in-app-enabled"
                        checked={preferences?.in_app_enabled ?? true}
                        onCheckedChange={(checked) => updatePreferences({ in_app_enabled: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="email-enabled" className="text-sm">Email notifications</Label>
                      <Switch
                        id="email-enabled"
                        checked={preferences?.email_enabled ?? true}
                        onCheckedChange={(checked) => updatePreferences({ email_enabled: checked })}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">In-app categories</h4>
                    <p className="text-xs text-muted-foreground -mt-2">Turn off any type you don't want to see or hear about in the app.</p>
                    {([
                      ['risk_updates_in_app', 'Risk updates'],
                      ['bcp_changes_in_app', 'BCP changes'],
                      ['document_uploads_in_app', 'Document uploads'],
                      ['approvals_in_app', 'Approvals'],
                      ['appetite_in_app', 'Risk appetite breaches'],
                      ['system_alerts_in_app', 'System alerts'],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <Label htmlFor={key} className="text-sm">{label}</Label>
                        <Switch
                          id={key}
                          checked={(preferences as any)?.[key] ?? true}
                          onCheckedChange={(checked) => updatePreferences({ [key]: checked } as any)}
                          disabled={preferences?.in_app_enabled === false}
                        />
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" /> Quiet hours
                        </h4>
                        <p className="text-xs text-muted-foreground">Suppress toasts within this window; notifications still appear in the panel.</p>
                      </div>
                      <Switch
                        id="quiet-hours-enabled"
                        checked={preferences?.quiet_hours_enabled ?? false}
                        onCheckedChange={(checked) => updatePreferences({ quiet_hours_enabled: checked })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="quiet-start" className="text-xs">Start</Label>
                        <Input
                          id="quiet-start"
                          type="time"
                          value={(preferences?.quiet_hours_start || '22:00').slice(0, 5)}
                          onChange={(e) => updatePreferences({ quiet_hours_start: e.target.value + ':00' })}
                          disabled={!preferences?.quiet_hours_enabled}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="quiet-end" className="text-xs">End</Label>
                        <Input
                          id="quiet-end"
                          type="time"
                          value={(preferences?.quiet_hours_end || '07:00').slice(0, 5)}
                          onChange={(e) => updatePreferences({ quiet_hours_end: e.target.value + ':00' })}
                          disabled={!preferences?.quiet_hours_enabled}
                          className="h-8"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Email categories</h4>
                    {([
                      ['risk_updates_email', 'Risk updates'],
                      ['bcp_changes_email', 'BCP changes'],
                      ['document_uploads_email', 'Document uploads'],
                      ['system_alerts_email', 'System alerts'],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <Label htmlFor={key} className="text-sm">{label}</Label>
                        <Switch
                          id={key}
                          checked={(preferences as any)?.[key] ?? true}
                          onCheckedChange={(checked) => updatePreferences({ [key]: checked } as any)}
                          disabled={!preferences?.email_enabled}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { NotificationCenter };
export default NotificationCenter;
