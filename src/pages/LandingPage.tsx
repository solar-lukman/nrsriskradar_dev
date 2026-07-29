import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import { useAuth, type UserRole } from '@/contexts/AuthContext';
import {
  Shield,
  FileText,
  Target,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  Lock,
  Eye,
  Calendar,
  BookOpen,
  Zap,
  TrendingUp,
  Briefcase,
  Database,
  Users,
  Settings,
} from 'lucide-react';

interface QuickLink {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  permission: string;
}

const ALL_LINKS: QuickLink[] = [
  { icon: BarChart3, title: 'Dashboard', description: 'View risk metrics and KPIs', href: '/app', permission: 'view_dashboard' },
  { icon: AlertTriangle, title: 'Risk Register', description: 'Log and manage risks', href: '/risk-register', permission: 'view_risks' },
  { icon: Target, title: 'Risk Matrix', description: 'Interactive heatmap view', href: '/risk-matrix', permission: 'view_reports' },
  { icon: Shield, title: 'Business Continuity', description: 'BCP plans and recovery', href: '/business-continuity', permission: 'manage_continuity' },
  { icon: FileText, title: 'Reports', description: 'Generate board-ready reports', href: '/reports', permission: 'view_reports' },
  { icon: Zap, title: 'Incidents', description: 'Track crystallized risks', href: '/incidents', permission: 'view_risks' },
  { icon: Calendar, title: 'Calendar', description: 'Deadlines and reviews', href: '/calendar', permission: 'view_dashboard' },
  { icon: BookOpen, title: 'Learning Forum', description: 'Training and resources', href: '/learning-forum', permission: 'view_risks' },
  { icon: TrendingUp, title: 'Executive Summary', description: 'Strategic overview', href: '/executive-summary', permission: 'strategic_overview' },
  { icon: Briefcase, title: 'Board Reports', description: 'Board-ready packets', href: '/board-reports', permission: 'board_oversight' },
  { icon: Shield, title: 'Whistleblowing Cases', description: 'Investigate reports', href: '/whistleblow/cases', permission: 'manage_whistleblow' },
  { icon: Users, title: 'User Management', description: 'Manage roles & access', href: '/user-management', permission: 'manage_users' },
  { icon: Database, title: 'Data Management', description: 'Backups & integrations', href: '/data-management', permission: '*' },
  { icon: Settings, title: 'System Settings', description: 'Configure the platform', href: '/settings', permission: '*' },
];

function roleHome(role: UserRole | undefined): string {
  switch (role) {
    case 'ADMIN':
    case 'RMD':
    case 'CRO':
      return '/app';
    case 'SUPERVISOR':
      return '/whistleblow/cases';
    case 'RC':
    case 'RO':
    case 'RR':
      return '/risk-register';
    case 'EC':
    case 'ERMSC':
    case 'RCB':
      return '/executive-summary';
    default:
      return '/app';
  }
}

const LandingPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, hasPermission } = useAuth();

  // Redirect authenticated users to their role-specific home
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      navigate(roleHome(user.role), { replace: true });
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  const visibleLinks = isAuthenticated
    ? ALL_LINKS.filter((l) => hasPermission(l.permission))
    : ALL_LINKS.slice(0, 8);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SeoHead
        title="Enterprise Risk Management"
        description="Nigeria Revenue Service enterprise risk management portal for risk identification, assessment, mitigation, and monitoring. ISO 31000 compliant."
        path="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Nigeria Revenue Service",
            url: "https://nrsrmp.codeware.com.ng/",
            logo: "https://nrsrmp.codeware.com.ng/nrs-logo.jpg",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "NRS Risk Management Portal",
            url: "https://nrsrmp.codeware.com.ng/",
          },
        ]}
      />
      {/* ── HEADER ── */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/nrs-logo.jpg"
              alt="Nigeria Revenue Service"
              className="h-12 object-contain"
            />
            <div className="hidden sm:block border-l border-border pl-3">
              <p className="text-sm font-semibold text-foreground leading-tight">Risk Management Portal</p>
              <p className="text-xs text-muted-foreground">Enterprise Risk Management System</p>
            </div>
          </div>
          <Button variant="enterprise" size="sm" onClick={() => navigate(isAuthenticated ? roleHome(user?.role) : '/app')}>
            {isAuthenticated ? 'Open Portal' : 'Sign In'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1">
        {/* Welcome section */}
        <section className="py-16 md:py-20 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 text-foreground">
              Welcome to the Risk Management Portal
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Centralized platform for risk identification, assessment, mitigation, and monitoring across the Nigeria Revenue Service. ISO 31000 compliant.
            </p>
            <Button size="lg" variant="enterprise" onClick={() => navigate(isAuthenticated ? roleHome(user?.role) : '/app')}>
              {isAuthenticated ? 'Continue to Portal' : 'Access Portal'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Quick Links Grid — filtered by permission for authenticated users */}
        <section className="py-12 px-4 bg-muted/30 border-y">
          <div className="container mx-auto">
            <h2 className="text-xl font-semibold mb-6 text-center">Quick Access</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {visibleLinks.map((link, i) => (
                <Card
                  key={i}
                  className="p-4 cursor-pointer border border-border/50 hover:shadow-card hover:border-primary/30 transition-all duration-200 group"
                  onClick={() => navigate(link.href)}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                    <link.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{link.title}</h3>
                  <p className="text-xs text-muted-foreground">{link.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Whistleblowing Section — /whistleblow/submit and /whistleblow/follow-up are intentionally public, unauthenticated routes (see App.tsx). Do not gate. */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-lg border border-warning/30 bg-warning/5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-1">Anonymous Whistleblowing</h3>
                  <p className="text-sm text-muted-foreground">
                    Report concerns securely and anonymously. No login required.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={() => navigate('/whistleblow/follow-up')}>
                  <Eye className="mr-2 h-4 w-4" />
                  Track Case
                </Button>
                <Button variant="warning" size="sm" onClick={() => navigate('/whistleblow/submit')}>
                  <Lock className="mr-2 h-4 w-4" />
                  Report
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="py-8 px-4 border-t bg-muted/10">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <img src="/nrs-logo.jpg" alt="NRS" className="h-8 object-contain" />
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 Nigeria Revenue Service. All rights reserved. Powered by CODEWARE.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            For internal use only. Unauthorized access is prohibited.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
