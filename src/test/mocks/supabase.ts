/**
 * Chainable mock for the Supabase client used by component and hook tests.
 *
 * Usage:
 *   vi.mock("@/integrations/supabase/client", () => ({
 *     supabase: createSupabaseMock({ risk_categories: [{ id: "1", name: "Cyber" }] }),
 *   }));
 *
 * The builder records the filters applied so tests can assert query shape, and
 * resolves to `{ data, error }` like PostgREST does.
 */

export interface TableFixtures {
  [table: string]: any[];
}

export interface RecordedCall {
  table: string;
  method: string;
  args: any[];
}

export function createSupabaseMock(
  fixtures: TableFixtures = {},
  opts: { errors?: Record<string, { message: string }>; calls?: RecordedCall[] } = {},
) {
  const calls = opts.calls ?? [];

  function makeBuilder(table: string) {
    const result = () => {
      const error = opts.errors?.[table] ?? null;
      return { data: error ? null : (fixtures[table] ?? []), error, count: (fixtures[table] ?? []).length };
    };

    const builder: any = {
      // Every filter/modifier returns the builder so chains of any length work.
      ...Object.fromEntries(
        [
          'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
          'lt', 'lte', 'like', 'ilike', 'is', 'in', 'not', 'or', 'contains',
          'order', 'limit', 'range', 'returns', 'match', 'filter', 'abortSignal',
        ].map((method) => [
          method,
          (...args: any[]) => {
            calls.push({ table, method, args });
            return builder;
          },
        ]),
      ),
      single: async () => {
        calls.push({ table, method: 'single', args: [] });
        const r = result();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      maybeSingle: async () => {
        calls.push({ table, method: 'maybeSingle', args: [] });
        const r = result();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      then: (resolve: (v: any) => any, reject?: (e: any) => any) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  }

  const channel = () => {
    const ch: any = {
      on: () => ch,
      subscribe: () => ch,
      unsubscribe: () => Promise.resolve('ok'),
    };
    return ch;
  };

  return {
    __calls: calls,
    from: (table: string) => makeBuilder(table),
    rpc: async (fn: string, args?: any) => {
      calls.push({ table: `rpc:${fn}`, method: 'rpc', args: [args] });
      return { data: fixtures[`rpc:${fn}`] ?? null, error: opts.errors?.[`rpc:${fn}`] ?? null };
    },
    channel,
    removeChannel: () => Promise.resolve('ok'),
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
      signOut: async () => ({ error: null }),
      signUp: async (args?: any) => {
        calls.push({ table: 'auth', method: 'signUp', args: [args] });
        return { data: { user: { id: 'new-user-id' }, session: null }, error: null };
      },
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'mock/path' }, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/signed' }, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    functions: {
      invoke: async (name: string, payload?: any) => {
        calls.push({ table: `fn:${name}`, method: 'invoke', args: [payload] });
        return { data: fixtures[`fn:${name}`] ?? null, error: opts.errors?.[`fn:${name}`] ?? null };
      },
    },
  };
}
