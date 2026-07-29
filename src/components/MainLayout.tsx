import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { SessionBanner } from '@/components/SessionBanner';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SessionBanner />

      <div className="flex">
        {/* Sidebar toggle button */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 -right-4 z-10 shadow-md bg-background border"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu className="w-4 h-4" />
          </Button>
          
          <Sidebar collapsed={sidebarCollapsed} />
        </div>

        {/* Main content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
