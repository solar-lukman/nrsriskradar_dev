import React from 'react';
import { 
  Shield, 
  BarChart3, 
  Users, 
  Settings, 
  BookOpen, 
  AlertTriangle,
  FileText,
  Target,
  Briefcase,
  Calendar,
  TrendingUp,
  Database,
  Zap,
  ScrollText,
  Inbox
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebarCounts } from '@/hooks/useSidebarCounts';
import { useApprovalInboxCount } from '@/hooks/useApprovalInbox';
import { QuickInsights } from './QuickInsights';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const counts = useSidebarCounts();
  const { count: approvalCount } = useApprovalInboxCount();

  if (!user) return null;

  const fmt = (n: number) => (n > 999 ? `${Math.floor(n / 1000)}k+` : String(n));

  const menuItems = [
    {
      title: 'Dashboard',
      icon: BarChart3,
      href: '/app',
      permission: 'view_dashboard'
    },
    {
      title: 'Risk Register',
      icon: AlertTriangle,
      badge: fmt(counts.risks),
      href: '/risk-register',
      permission: 'view_risks'
    },
    {
      title: 'Approval Inbox',
      icon: Inbox,
      badge: approvalCount > 0 ? fmt(approvalCount) : undefined,
      href: '/approvals',
      permission: 'use_approval_inbox'
    },
    {
      title: 'Risk Matrix',
      icon: Target,
      href: '/risk-matrix',
      permission: 'view_reports'
    },
    {
      title: 'Business Continuity',
      icon: Shield,
      badge: fmt(counts.bcps),
      href: '/business-continuity',
      permission: 'manage_continuity'
    },
    {
      title: 'Reports',
      icon: FileText,
      badge: fmt(counts.reports),
      href: '/reports',
      permission: 'view_reports'
    },
    {
      title: 'Incidents',
      icon: Zap,
      badge: fmt(counts.incidents),
      href: '/incidents',
      permission: 'view_risks'
    },
    {
      title: 'Learning Forum',
      icon: BookOpen,
      href: '/learning-forum',
      permission: 'view_risks'
    },
    {
      title: 'Calendar',
      icon: Calendar,
      badge: fmt(counts.calendarUpcoming),
      href: '/calendar',
      permission: 'view_dashboard'
    },
    {
      title: 'Help & FAQ',
      icon: BookOpen,
      href: '/help',
      permission: 'view_dashboard'
    }
  ];

  const adminItems = [
    {
      title: 'User Management',
      icon: Users,
      badge: fmt(counts.users),
      href: '/user-management',
      permission: 'manage_users'
    },
    {
      title: 'System Settings',
      icon: Settings,
      href: '/settings',
      permission: '*'
    },
    {
      title: 'Data Management',
      icon: Database,
      href: '/data-management',
      permission: '*'
    },
    {
      title: 'Audit Logs',
      icon: ScrollText,
      href: '/audit-logs',
      permission: '*',
      alwaysVisibleForRoles: ['RMD','CRO']
    } as any,
    {
      title: 'BCP Schema Checks',
      icon: ScrollText,
      href: '/bcp-schema-checks',
      permission: '*',
      alwaysVisibleForRoles: ['RMD','CRO']
    } as any
  ];

  const executiveItems = [
    {
      title: 'Executive Summary',
      icon: TrendingUp,
      href: '/executive-summary',
      permission: 'strategic_overview'
    },
    {
      title: 'Board Reports',
      icon: Briefcase,
      href: '/board-reports',
      permission: 'board_oversight'
    }
  ];

  const complianceItems = [
    {
      title: 'Whistleblowing',
      icon: Shield,
      href: '/whistleblow/cases',
      permission: 'manage_whistleblow'
    }
  ];

  const visibleMenuItems = menuItems.filter(item => hasPermission(item.permission));
  const visibleAdminItems = adminItems.filter((item: any) =>
    hasPermission(item.permission) ||
    (item.alwaysVisibleForRoles && item.alwaysVisibleForRoles.includes(user?.role))
  );
  const visibleExecutiveItems = executiveItems.filter(item => hasPermission(item.permission));
  const visibleComplianceItems = complianceItems.filter(item => hasPermission(item.permission));

  return (
    <div className={cn(
      "bg-card border-r border-border flex flex-col transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Role indicator */}
      {!collapsed && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-success rounded-full"></div>
            <span className="text-xs text-muted-foreground font-medium">
              {user.role === 'ADMIN' ? 'System Administrator' :
               user.role === 'CRO' ? 'Chief Risk Officer' :
               user.role === 'ERMSC' ? 'ERM Steering Committee' :
               user.role === 'EC' ? 'Executive Chairman' :
               user.role === 'RCB' ? 'Risk Committee Board' :
               user.role === 'SUPERVISOR' ? 'Compliance Supervisor' :
               'Risk Management'}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {/* Main navigation */}
        <div className="space-y-1">
          {visibleMenuItems.map((item, index) => {
            const isActive = location.pathname === item.href;
            return (
              <Button
                key={index}
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  collapsed ? "px-2" : "px-3"
                )}
                asChild
              >
                <Link to={item.href}>
                  <item.icon className={cn("w-4 h-4", collapsed ? "" : "mr-3")} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.title}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="ml-auto">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              </Button>
            );
          })}
        </div>

        {/* Executive section */}
        {visibleExecutiveItems.length > 0 && (
          <div className="pt-4">
            {!collapsed && (
              <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Executive
              </p>
            )}
            <div className="space-y-1">
              {visibleExecutiveItems.map((item, index) => {
                const isActive = item.href && location.pathname === item.href;
                return (
                  <Button
                    key={index}
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      collapsed ? "px-2" : "px-3"
                    )}
                    asChild
                  >
                    <Link to={item.href}>
                      <item.icon className={cn("w-4 h-4", collapsed ? "" : "mr-3")} />
                      {!collapsed && (
                        <span className="flex-1 text-left">{item.title}</span>
                      )}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Compliance section */}
        {visibleComplianceItems.length > 0 && (
          <div className="pt-4">
            {!collapsed && (
              <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Ethics & Compliance
              </p>
            )}
            <div className="space-y-1">
              {visibleComplianceItems.map((item, index) => {
                const isActive = item.href && location.pathname.startsWith(item.href);
                return (
                  <Button
                    key={index}
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      collapsed ? "px-2" : "px-3"
                    )}
                    asChild
                  >
                    <Link to={item.href}>
                      <item.icon className={cn("w-4 h-4", collapsed ? "" : "mr-3")} />
                      {!collapsed && (
                        <span className="flex-1 text-left">{item.title}</span>
                      )}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin section */}
        {visibleAdminItems.length > 0 && (
          <div className="pt-4">
            {!collapsed && (
              <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Administration
              </p>
            )}
            <div className="space-y-1">
              {visibleAdminItems.map((item, index) => {
                const isActive = item.href && location.pathname === item.href;
                return (
                  <Button
                    key={index}
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      collapsed ? "px-2" : "px-3"
                    )}
                    asChild={!!item.href}
                  >
                    {item.href ? (
                      <Link to={item.href}>
                        <item.icon className={cn("w-4 h-4", collapsed ? "" : "mr-3")} />
                        {!collapsed && (
                          <span className="flex-1 text-left">{item.title}</span>
                        )}
                      </Link>
                    ) : (
                      <>
                        <item.icon className={cn("w-4 h-4", collapsed ? "" : "mr-3")} />
                        {!collapsed && (
                          <span className="flex-1 text-left">{item.title}</span>
                        )}
                      </>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Quick insights with real data */}
      {!collapsed && <QuickInsights />}
    </div>
  );
}