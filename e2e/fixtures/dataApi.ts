import type { Page } from '@playwright/test';

/**
 * Raw Supabase Data API helpers.
 *
 * These run inside the browser page so they reuse the *logged-in user's* JWT.
 * That makes them a true RLS probe: the server, not the UI, decides the answer.
 */

export interface ApiResult {
  status: number;
  body: string;
}

async function callDataApi(
  page: Page,
  init: { path: string; method: string; body?: unknown; prefer?: string },
): Promise<ApiResult> {
  return page.evaluate(async (opts) => {
    const env = (import.meta as unknown as { env: Record<string, string> }).env || {};
    const url = env.VITE_SUPABASE_URL;
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const session = Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .map((k) => {
        try {
          return JSON.parse(localStorage.getItem(k) || '{}');
        } catch {
          return {};
        }
      })[0];
    const token = session?.access_token;
    if (!url || !key || !token) return { status: 0, body: 'no-session' };

    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (opts.prefer) headers.Prefer = opts.prefer;

    const res = await fetch(`${url}/rest/v1/${opts.path}`, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: await res.text() };
  }, init);
}

/** SELECT one row from a table (limit 1). */
export function apiSelect(page: Page, table: string, query = 'select=*&limit=1') {
  return callDataApi(page, { path: `${table}?${query}`, method: 'GET' });
}

/** INSERT a row. Always used with rows that are rolled back or harmless. */
export function apiInsert(page: Page, table: string, row: Record<string, unknown>) {
  return callDataApi(page, {
    path: table,
    method: 'POST',
    body: row,
    prefer: 'return=representation',
  });
}

/** UPDATE a row that is guaranteed not to exist — proves policy, not data. */
export function apiUpdate(
  page: Page,
  table: string,
  filter: string,
  patch: Record<string, unknown>,
) {
  return callDataApi(page, {
    path: `${table}?${filter}`,
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  });
}

export function apiDelete(page: Page, table: string, filter: string) {
  return callDataApi(page, {
    path: `${table}?${filter}`,
    method: 'DELETE',
    prefer: 'return=representation',
  });
}

/** True when PostgREST allowed the call (2xx). */
export function isAllowed(r: ApiResult) {
  return r.status >= 200 && r.status < 300;
}

/**
 * True when the request was refused by RLS/grants.
 * A 200 with an empty result set for a write also counts as "refused":
 * PostgREST returns `[]` when the USING clause matched no rows.
 */
export function isDenied(r: ApiResult) {
  if (r.status === 401 || r.status === 403 || r.status === 404) return true;
  if (r.status === 400 && /permission denied|row-level security/i.test(r.body)) return true;
  return r.status === 200 && (r.body === '[]' || r.body === '');
}
