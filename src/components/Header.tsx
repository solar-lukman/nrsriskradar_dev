
import React, { useState } from 'react';
import { Search, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { GlobalSearch } from '@/components/GlobalSearch';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import { useNavigate } from 'react-router-dom';

export function Header() {
  const { user, signOut } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();

  if (!user) return null;

  const initials = user.name
    ? user.name.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
    : user.email.substring(0, 2).toUpperCase();

  const confirmLogout = async () => {
    try {
      setSigningOut(true);
      await signOut();
      setLogoutOpen(false);
      navigate('/', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header className="bg-background border-b border-border shadow-sm sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 lg:px-6 h-16">
        {/* Left side - Logo and search */}
        <div className="flex items-center space-x-4 flex-1">
          <div className="flex items-center space-x-2">
            <img 
              src="/nrs-logo.jpg" 
              alt="NRS Risk Management Portal" 
              className="h-8 object-contain"
            />
            <span className="font-semibold text-lg hidden sm:block">NRS RMP</span>
          </div>
          
          <div className="relative max-w-md flex-1 ml-4 hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <button 
              onClick={() => setSearchOpen(true)}
              className="w-full text-left pl-10 pr-4 py-2 text-sm border border-input bg-background rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Search risks, BCPs, documents...
            </button>
          </div>
        </div>

        {/* Right side - Actions and user menu */}
        <div className="flex items-center space-x-2">
          {/* Search icon for mobile */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-4 h-4" />
          </Button>

          {/* Notifications */}
          <NotificationCenter />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar} alt={user.name || user.email} />
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.name || user.email}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.department || 'General'}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user.role === 'ADMIN' && (
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <span>Settings</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/help')}>
                <span>Help & Support</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setLogoutOpen(true);
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Global Search Dialog */}
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Logout confirmation */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of NRS RMP?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be returned to the landing page and any unsaved changes
              on this screen will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmLogout();
              }}
              disabled={signingOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
