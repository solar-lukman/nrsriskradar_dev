import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Plus, 
  BarChart3, 
  BookOpen, 
  Settings,
  Bell,
  Search,
  Calendar,
  FileText,
  Target,
  Activity,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth, getRoleDisplayName } from '@/contexts/AuthContext';
import { AddIncidentDialog } from '@/components/incidents/AddIncidentDialog';

export function Dashboard() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);

  if (!user) return null;

  // Role-specific dashboard widgets
  const getRoleSpecificWidgets = () => {
    const commonWidgets = [
      {
        title: "Risk Overview",
        description: "Current risk landscape",
        icon: Shield,
        content: (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">High Risk Items</span>
              <Badge variant="destructive">5</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Medium Risk Items</span>
              <Badge className="bg-warning text-warning-foreground">12</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Low Risk Items</span>
              <Badge className="bg-success text-success-foreground">28</Badge>
            </div>
          </div>
        )
      }
    ];

    const roleSpecificWidgets = {
      'ADMIN': [
        {
          title: "System Health",
          description: "Platform performance metrics",
          icon: Activity,
          content: (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">System Uptime</span>
                <span className="text-sm font-medium">99.9%</span>
              </div>
              <Progress value={99.9} className="h-2" />
              <div className="text-xs text-muted-foreground">Last 30 days</div>
            </div>
          )
        },
        {
          title: "User Management",
          description: "Active users and roles",
          icon: Users,
          content: (
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">247</div>
                <div className="text-xs text-muted-foreground">Active Users</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">15</div>
                <div className="text-xs text-muted-foreground">Pending Access</div>
              </div>
            </div>
          )
        }
      ],
      'CRO': [
        {
          title: "Executive Summary",
          description: "Top risks requiring attention",
          icon: TrendingUp,
          content: (
            <div className="space-y-2">
              <div className="text-sm">
                <div className="font-medium">Cyber Security Risk</div>
                <div className="text-xs text-muted-foreground">Severity: High | Due: 2 days</div>
              </div>
              <div className="text-sm">
                <div className="font-medium">Market Volatility</div>
                <div className="text-xs text-muted-foreground">Severity: Medium | Due: 1 week</div>
              </div>
            </div>
          )
        },
        {
          title: "Board Reporting",
          description: "Upcoming reports and presentations",
          icon: FileText,
          content: (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Monthly Risk Report</span>
                <Badge variant="outline">Due Tomorrow</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Board Presentation</span>
                <Badge variant="outline">Next Week</Badge>
              </div>
            </div>
          )
        }
      ],
      'RC': [
        {
          title: "My Risk Items",
          description: "Risks assigned to you",
          icon: Target,
          content: (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Open Items</span>
                <Badge>3</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Under Review</span>
                <Badge variant="outline">2</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Completed</span>
                <Badge className="bg-success text-success-foreground">8</Badge>
              </div>
            </div>
          )
        }
      ]
    };

    return [...commonWidgets, ...(roleSpecificWidgets[user.role as keyof typeof roleSpecificWidgets] || [])];
  };

  // Role-specific action buttons
  const getRoleActions = () => {
    const actions: Array<{
      label: string;
      icon: any;
      variant: any;
      description: string;
      onClick: () => void;
    }> = [];

    if (hasPermission('add_risk')) {
      actions.push({
        label: 'Add New Risk',
        icon: Plus,
        variant: 'enterprise' as const,
        description: 'Register a new risk in the system',
        onClick: () => navigate('/risk-register?action=new'),
      });
    }

    // Report / log an incident — available to anyone who can author or manage risks
    if (hasPermission('add_risk') || hasPermission('edit_risks') || hasPermission('manage_continuity') || hasPermission('*')) {
      actions.push({
        label: 'Report Incident',
        icon: Zap,
        variant: 'destructive' as const,
        description: 'Log a crystallized risk event',
        onClick: () => setShowIncidentDialog(true),
      });
    }

    if (hasPermission('view_reports')) {
      actions.push({
        label: 'View Risk Matrix',
        icon: BarChart3,
        variant: 'premium' as const,
        description: 'Analyze risk heat maps and trends',
        onClick: () => navigate('/risk-matrix'),
      });
    }

    if (hasPermission('manage_continuity')) {
      actions.push({
        label: 'Business Continuity',
        icon: Shield,
        variant: 'default' as const,
        description: 'Manage continuity plans',
        onClick: () => navigate('/business-continuity'),
      });
    }

    actions.push({
      label: 'Learning Forum',
      icon: BookOpen,
      variant: 'outline' as const,
      description: 'Access training and knowledge sharing',
      onClick: () => navigate('/learning-forum'),
    });

    return actions;
  };

  const widgets = getRoleSpecificWidgets();
  const actions = getRoleActions();

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-header text-primary-foreground rounded-lg p-6 shadow-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Welcome back, {user.name}
            </h1>
            <p className="text-primary-foreground/80 mt-1">
              {getRoleDisplayName(user.role)} • {user.department}
            </p>
          </div>
          <div className="hidden md:flex items-center space-x-4">
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              <Calendar className="w-4 h-4 mr-2" />
              Today's Schedule
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant={action.variant}
            onClick={action.onClick}
            className="h-auto p-4 flex flex-col items-start text-left"
          >
            <action.icon className="w-5 h-5 mb-2" />
            <div className="font-medium">{action.label}</div>
            <div className="text-xs opacity-80 mt-1">{action.description}</div>
          </Button>
        ))}
      </div>

      <AddIncidentDialog
        open={showIncidentDialog}
        onOpenChange={setShowIncidentDialog}
      />

      {/* Dashboard Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {widgets.map((widget, index) => (
          <Card key={index} className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
                <CardDescription className="text-xs">{widget.description}</CardDescription>
              </div>
              <widget.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {widget.content}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-destructive rounded-full mt-2"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">High-priority risk identified in Cybersecurity</p>
                <p className="text-xs text-muted-foreground">2 hours ago • Requires immediate attention</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-success rounded-full mt-2"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Monthly risk assessment completed</p>
                <p className="text-xs text-muted-foreground">1 day ago • Report generated successfully</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-warning rounded-full mt-2"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Business continuity plan updated</p>
                <p className="text-xs text-muted-foreground">3 days ago • Version 2.1 published</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}