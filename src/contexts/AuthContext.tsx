import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';

export type UserRole = 
  | 'RC'         // Risk Champion
  | 'RR'         // Risk Reviewer  
  | 'RO'         // Risk Owner
  | 'RMD'        // Risk Management Department
  | 'CRO'        // Chief Risk Officer
  | 'ERMSC'      // ERM Steering Committee
  | 'EC'         // Executive Chairman
  | 'RCB'        // Risk Committee of the Board
  | 'SUPERVISOR' // Supervisor (Compliance)
  | 'ADMIN'      // Admin
  | 'USER';      // General Users

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  avatar?: string;
}

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signUp: (email: string, password: string, metadata?: { full_name?: string; role?: UserRole }) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Role-based permissions
const rolePermissions: Record<UserRole, string[]> = {
  'RC': ['view_risks', 'add_risk', 'edit_own_risks', 'view_dashboard'],
  'RR': ['view_risks', 'review_risks', 'approve_risks', 'use_approval_inbox', 'view_dashboard', 'view_reports'],
  'RO': ['view_risks', 'add_risk', 'edit_own_risks', 'view_dashboard', 'assign_risks'],
  'RMD': ['view_risks', 'add_risk', 'edit_risks', 'use_approval_inbox', 'view_dashboard', 'manage_continuity', 'view_reports', 'manage_users', 'manage_whistleblow'],
  'CRO': ['view_risks', 'add_risk', 'edit_risks', 'use_approval_inbox', 'view_dashboard', 'manage_continuity', 'view_reports', 'approve_all', 'manage_whistleblow'],
  'ERMSC': ['view_risks', 'view_dashboard', 'view_reports', 'strategic_overview'],
  'EC': ['view_risks', 'view_dashboard', 'view_reports', 'strategic_overview', 'executive_actions'],
  'RCB': ['view_risks', 'view_dashboard', 'view_reports', 'strategic_overview', 'board_oversight'],
  'SUPERVISOR': ['view_risks', 'view_dashboard', 'view_reports', 'use_approval_inbox', 'manage_whistleblow'],
  'ADMIN': ['*'], // All permissions
  'USER': ['view_risks', 'view_dashboard']
};

// Mock users for simulation
const mockUsers: Record<string, User> = {
  'admin@company.com': {
    id: '1',
    name: 'System Administrator',
    email: 'admin@company.com',
    role: 'ADMIN',
    department: 'IT Department'
  },
  'cro@company.com': {
    id: '2', 
    name: 'Chief Risk Officer',
    email: 'cro@company.com',
    role: 'CRO',
    department: 'Risk Management'
  },
  'champion@company.com': {
    id: '3',
    name: 'Risk Champion',
    email: 'champion@company.com', 
    role: 'RC',
    department: 'Operations'
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const debug = import.meta.env.DEV;
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (debug) console.log('Auth state change:', event);
        setSession(session);
        if (session?.user) {
          // Use setTimeout to prevent blocking the auth callback
          setTimeout(() => {
            fetchUserProfile(session.user.id);
          }, 0);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setProfile(null);
          setIsAuthenticated(false);
        }
        setIsLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (debug) console.log('Initial session check');
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    const debug = import.meta.env.DEV;
    try {
      // First, get user roles from user_roles table (primary source)
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role, assigned_at')
        .eq('user_id', userId)
        .order('assigned_at', { ascending: false });

      if (rolesError && debug) {
        console.warn('User roles fetch error:', rolesError);
      }

      // Then get profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError && debug) {
        console.warn('Profile fetch error:', profileError);
      }

      // Determine primary role: user_roles first, then profile, then fallback
      const primaryRole = userRoles && userRoles.length > 0
        ? userRoles[0].role
        : profile?.role || 'USER';

      if (profile) {
        setProfile(profile);

        const profileUser = {
          id: profile.user_id,
          name: profile.full_name || profile.email.split('@')[0],
          email: profile.email,
          role: primaryRole,
          department: profile.department || 'General',
          avatar: profile.avatar_url || undefined
        };
        setUser(profileUser);
      } else {
        // Profile is created by the handle_new_user() trigger on signup.
        // If missing (edge case), fall back to an in-memory user derived from auth.
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          const fallbackUser = {
            id: authUser.user.id,
            name: authUser.user.email?.split('@')[0] || 'User',
            email: authUser.user.email || '',
            role: primaryRole,
            department: 'General'
          };
          setUser(fallbackUser);
        }
      }
    } catch (error) {
      if (debug) console.error('Critical profile fetch error:', error);
      // Create emergency user to prevent app from breaking
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser.user) {
        const emergencyUser = {
          id: authUser.user.id,
          name: authUser.user.email?.split('@')[0] || 'User',
          email: authUser.user.email || '',
          role: 'USER' as UserRole,
          department: 'General'
        };
        setUser(emergencyUser);
      }
    }
  };


  const signUp = async (email: string, password: string, metadata?: { full_name?: string; role?: UserRole }) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: metadata
      }
    });
    
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    // 1. Refuse sign-in early if the account is already locked
    try {
      const { data: locked } = await supabase.rpc("is_account_locked", { _email: email });
      if (locked === true) {
        return {
          error: {
            message:
              "This account has been locked due to repeated failed sign-in attempts. Please contact an administrator to unlock it.",
            status: 423,
            name: "AccountLocked",
          },
        };
      }
    } catch {
      // fail-open on the pre-check; the credential attempt below still enforces auth
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // 2. Record the failed attempt; auto-lock trigger fires at 5 failures / 15 min
      try {
        const { data: result } = await supabase.rpc("record_failed_login", {
          _email: email,
          _ip: null,
        });
        const lockedNow = (result as any)?.locked === true;
        if (lockedNow) {
          return {
            error: {
              message:
                "Too many failed sign-in attempts. This account has been locked. Contact an administrator to unlock it.",
              status: 423,
              name: "AccountLocked",
            },
          };
        }
      } catch {
        /* swallow — do not block the auth error path */
      }
    } else {
      // 3. Successful sign-in: clear the failure ledger for this email
      try {
        await supabase.rpc("clear_failed_login_attempts", { _email: email });
      } catch {
        /* ignore */
      }
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setIsAuthenticated(false);
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    const userPermissions = rolePermissions[user.role];
    if (!userPermissions) return false;
    return userPermissions.includes('*') || userPermissions.includes(permission);
  };


  return (
    <AuthContext.Provider value={{
      user,
      profile,
      session,
      isAuthenticated,
      isLoading,
      signUp,
      signIn,
      signOut,
      hasPermission
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function getRoleDisplayName(role: UserRole): string {
  const roleNames: Record<UserRole, string> = {
    'RC': 'Risk Champion',
    'RR': 'Risk Reviewer',
    'RO': 'Risk Owner', 
    'RMD': 'Risk Management Department',
    'CRO': 'Chief Risk Officer',
    'ERMSC': 'ERM Steering Committee',
    'EC': 'Executive Chairman',
    'RCB': 'Risk Committee of the Board',
    'SUPERVISOR': 'Supervisor',
    'ADMIN': 'System Administrator',
    'USER': 'General User'
  };
  return roleNames[role];
}