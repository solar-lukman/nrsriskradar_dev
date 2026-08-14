import React, { type ReactElement, type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthContext, type AuthContextType, type UserRole, type User } from "@/contexts/AuthContext";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

export function makeTestUser(role: UserRole, overrides: Partial<User> = {}): User {
  return {
    id: `user-${role.toLowerCase()}`,
    name: `${role} Test User`,
    email: `${role.toLowerCase()}@test.local`,
    role,
    department: "Risk Management",
    ...overrides,
  };
}

/** Auth context value for a given role, using the real permission matrix. */
export function makeAuthValue(role: UserRole | null, overrides: Partial<AuthContextType> = {}): AuthContextType {
  const user = role ? makeTestUser(role) : null;
  return {
    user,
    profile: null,
    session: null,
    isAuthenticated: !!user,
    isLoading: false,
    signUp: async () => ({ error: null }),
    signIn: async () => ({ error: null }),
    signOut: async () => {},
    hasPermission: (permission: string) => {
      if (!role) return false;
      const perms = ROLE_PERMISSIONS[role] || [];
      return perms.includes("*") || perms.includes(permission);
    },
    ...overrides,
  };
}

export interface ProviderOptions extends Omit<RenderOptions, "wrapper"> {
  role?: UserRole | null;
  authOverrides?: Partial<AuthContextType>;
  route?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
  const { role = "ADMIN", authOverrides, route = "/", queryClient, ...rest } = options;

  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });

  const authValue = makeAuthValue(role, authOverrides);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <QueryClientProvider client={client}>
        <AuthContext.Provider value={authValue}>
          <TooltipProvider>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          </TooltipProvider>
        </AuthContext.Provider>
        </QueryClientProvider>
      </HelmetProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...rest }), queryClient: client, authValue };
}
