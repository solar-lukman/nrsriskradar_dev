import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const TICK_INTERVAL = 1000; // refresh countdown every second

interface UseAutoLogoutReturn {
  /** Milliseconds remaining before automatic logout. Null when not authenticated. */
  remainingMs: number | null;
  /** Total inactivity timeout in ms. */
  timeoutMs: number;
}

export function useAutoLogout(): UseAutoLogoutReturn {
  const { signOut, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [remainingMs, setRemainingMs] = useState<number | null>(
    isAuthenticated ? INACTIVITY_TIMEOUT : null
  );

  const handleLogout = useCallback(async () => {
    try {
      await supabase.rpc('log_system_audit', {
        p_user_id: (await supabase.auth.getUser()).data.user?.id,
        p_action: 'auto_logout',
        p_category: 'authentication',
        p_details: { reason: 'inactivity_timeout', timeout_minutes: 5 },
        p_severity: 'low',
      });

      await signOut();
    } catch (error) {
      console.error('Error during auto-logout:', error);
      await signOut();
    } finally {
      // Client-side navigation to landing page
      navigate('/', { replace: true });
    }
  }, [signOut, navigate]);

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (isAuthenticated) {
      timeoutRef.current = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_TIMEOUT);
    }
  }, [isAuthenticated, handleLogout]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setRemainingMs(null);
      return;
    }

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      resetTimeout();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, true);
    });

    resetTimeout();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isAuthenticated, resetTimeout]);

  // Countdown ticker — updates remainingMs every second so banner can show it
  useEffect(() => {
    if (!isAuthenticated) return;

    const tick = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, INACTIVITY_TIMEOUT - elapsed);
      setRemainingMs(remaining);

      if (remaining === 0) {
        handleLogout();
      }
    };

    tick();
    const interval = setInterval(tick, TICK_INTERVAL);
    return () => clearInterval(interval);
  }, [isAuthenticated, handleLogout]);

  return { remainingMs, timeoutMs: INACTIVITY_TIMEOUT };
}
