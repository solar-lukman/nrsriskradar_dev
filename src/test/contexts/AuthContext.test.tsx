import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import type { RecordedCall } from "@/test/mocks/supabase";

const { calls, errors, fixtures, authState } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  errors: {} as Record<string, { message: string }>,
  fixtures: {} as Record<string, any[]>,
  authState: {
    session: null as any,
    signInWithPasswordError: null as any,
    signOutSpy: vi.fn(async () => ({ error: null })),
    onAuthStateChangeCb: null as any,
  },
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  const mock = createSupabaseMock(fixtures, { calls, errors });
  return {
    supabase: {
      ...mock,
      auth: {
        ...mock.auth,
        getSession: async () => ({ data: { session: authState.session }, error: null }),
        getUser: async () => ({ data: { user: authState.session?.user ?? null }, error: null }),
        onAuthStateChange: (cb: any) => {
          authState.onAuthStateChangeCb = cb;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signInWithPassword: async () => ({
          data: { session: null, user: null },
          error: authState.signInWithPasswordError,
        }),
        signOut: (...args: unknown[]) => (authState.signOutSpy as (...a: unknown[]) => unknown)(...args),
      },
    },
  };
});

import { AuthProvider, useAuth, getRoleDisplayName } from "@/contexts/AuthContext";
import { useAutoLogout } from "@/hooks/useAutoLogout";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const mockSession = (userId = "u1", email = "user@test.local") => ({
  user: { id: userId, email },
  access_token: "token",
});

describe("AuthContext", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(errors)) delete errors[k];
    for (const k of Object.keys(fixtures)) delete fixtures[k];
    authState.session = null;
    authState.signInWithPasswordError = null;
    authState.signOutSpy = vi.fn(async () => ({ error: null }));
    authState.onAuthStateChangeCb = null;
  });

  it("starts loading and settles to unauthenticated with no session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("hydrates role from user_roles first, falling back to profile role", async () => {
    fixtures["user_roles"] = [{ role: "CRO", assigned_at: "2024-02-01" }];
    fixtures["profiles"] = [
      {
        user_id: "u1",
        email: "user@test.local",
        full_name: "Test User",
        department: "Risk",
        role: "USER",
        avatar_url: null,
      },
    ];
    authState.session = mockSession();

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.user?.role).toBe("CRO"));
    expect(result.current.profile?.email).toBe("user@test.local");
  });

  it("falls back to profile.role when no user_roles entry exists", async () => {
    fixtures["user_roles"] = [];
    fixtures["profiles"] = [
      {
        user_id: "u1",
        email: "user@test.local",
        full_name: null,
        department: null,
        role: "RC",
        avatar_url: null,
      },
    ];
    authState.session = mockSession();

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.role).toBe("RC"));
    expect(result.current.user?.name).toBe("user"); // derived from email prefix
    expect(result.current.user?.department).toBe("General");
  });

  it("hasPermission is derived from ROLE_PERMISSIONS and denies unknown users", async () => {
    fixtures["user_roles"] = [{ role: "ADMIN", assigned_at: "2024-01-01" }];
    fixtures["profiles"] = [
      { user_id: "u1", email: "admin@test.local", full_name: "Admin", department: "IT", role: "ADMIN", avatar_url: null },
    ];
    authState.session = mockSession();

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.role).toBe("ADMIN"));
    // ADMIN's wildcard '*' grants any permission string.
    expect(result.current.hasPermission("anything")).toBe(true);

    // No session -> no user -> every permission denied.
    authState.session = null;
    const { result: loggedOut } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(loggedOut.current.isLoading).toBe(false));
    expect(loggedOut.current.hasPermission("view_risks")).toBe(false);
  });

  it("signIn returns the raw supabase error on failed credentials", async () => {
    authState.signInWithPasswordError = { message: "Invalid login credentials" };
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let signInResult: any;
    await act(async () => {
      signInResult = await result.current.signIn("user@test.local", "wrong");
    });
    expect(signInResult.error.message).toBe("Invalid login credentials");
  });

  it("signIn succeeds with no error when credentials are valid", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let signInResult: any;
    await act(async () => {
      signInResult = await result.current.signIn("user@test.local", "correct");
    });
    expect(signInResult.error).toBeNull();
  });

  it("signOut clears user/session state", async () => {
    fixtures["user_roles"] = [{ role: "ADMIN", assigned_at: "2024-01-01" }];
    fixtures["profiles"] = [
      { user_id: "u1", email: "admin@test.local", full_name: "Admin", department: "IT", role: "ADMIN", avatar_url: null },
    ];
    authState.session = mockSession();

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });

    expect(authState.signOutSpy).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("getRoleDisplayName maps every role to a human label", () => {
    expect(getRoleDisplayName("ADMIN")).toBe("System Administrator");
    expect(getRoleDisplayName("RC")).toBe("Risk Champion");
  });
});

describe("useAutoLogout", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers();
  });

  it("does nothing when the user is not authenticated", () => {
    const { result } = renderHook(() => useAutoLogout(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <FakeAuthProvider isAuthenticated={false}>{children}</FakeAuthProvider>
        </MemoryRouter>
      ),
    });
    expect(result.current.remainingMs).toBeNull();
    vi.useRealTimers();
  });

  it("logs the user out after the inactivity timeout elapses", async () => {
    const signOut = vi.fn(async () => {});
    renderHook(() => useAutoLogout(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <FakeAuthProvider isAuthenticated signOut={signOut}>{children}</FakeAuthProvider>
        </MemoryRouter>
      ),
    });

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signOut).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// Minimal auth context stand-in so useAutoLogout can be exercised without a
// full AuthProvider round trip (it only needs isAuthenticated + signOut).
import { AuthContext } from "@/contexts/AuthContext";
import { makeAuthValue } from "@/test/renderWithProviders";

function FakeAuthProvider({
  children,
  isAuthenticated,
  signOut,
}: {
  children: React.ReactNode;
  isAuthenticated: boolean;
  signOut?: () => Promise<void>;
}) {
  const value = makeAuthValue(isAuthenticated ? "ADMIN" : null, signOut ? { signOut } : {});
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
