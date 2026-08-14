# Edge Function Tests (Deno)

Supabase Edge Functions run on Deno, not Node, so they are **not** covered by
the Vitest suite in `src/test/`. They have their own hermetic test layer that
runs with the Deno CLI.

```bash
npm run test:edge
# equivalent to:
# deno test --allow-env --allow-net --allow-read --no-check supabase/functions
```

## How it works

`supabase/functions/_shared/test_harness.ts` provides three helpers:

| Helper | Purpose |
| --- | --- |
| `loadServeHandler(path, baseUrl)` | Imports a function module while capturing the callback passed to `Deno.serve`, and returns it as a plain `(req) => Response` function. No port is bound. |
| `installFetchStub(routes)` | Replaces `globalThis.fetch` with a router. Each route is `{ match(url), respond(req) }`. Returns a `restore()` you must call in a `finally`. |
| `jsonResponse(body, status?)` | Convenience JSON `Response` builder for stub routes. |
| `makeTestJwt(payload?)` | Builds a syntactically valid (but unsigned) JWT, for functions that call `getClaims()`, which rejects arbitrary strings with `AuthInvalidJwtError` before falling back to `getUser()`. |

Because the handler is invoked directly, tests are fast, offline, and require
no Supabase project, no service-role key, and no AI credits.

### Conventions

1. **Always pass `import.meta.url`** as the second argument to
   `loadServeHandler`, so the relative `./index.ts` resolves against the test
   file rather than the harness.
2. **Set `sanitizeOps: false` and `sanitizeResources: false`** on every
   `Deno.test`. `@supabase/supabase-js` starts token auto-refresh timers at
   module scope, which Deno otherwise reports as leaked ops.
3. **Restore the fetch stub in `finally`** so a failing assertion cannot leak a
   patched `fetch` into the next test.
4. **Cover three branches per function**: the auth/rejection path, an upstream
   or validation failure path, and the happy path. Add an `OPTIONS` preflight
   check where the function serves a browser.
5. Functions must use native `Deno.serve`, not the deprecated
   `std/http/server.ts` `serve()`, which binds a listener on import and cannot
   be tested in-process.

## Current coverage

| Function | # Tests | Notes |
| --- | --- | --- |
| `admin-invite-user` | 3 | non-admin rejection, invalid payload, happy path |
| `ai-report-generator` | 5 | missing token, invalid token, gateway 429 → `RATE_LIMIT`, happy path with computed stats, preflight |
| `backup-operations` | 5 | missing auth → 401, non-admin → 403, unknown configuration → 404, happy path, preflight |
| `backup-scheduler` | 5 | missing auth → 401, non-admin → 403, DB failure → 500, happy path, preflight |
| `check-deadlines` | 3 | RPC failure → 500, happy path, preflight |
| `export-onprem-snapshot` | 5 | missing auth → 401, non-admin → 403, table read failure → 500, happy path with signed URLs, preflight |
| `lob-data-import` | 5 | see file for branch coverage |
| `mitigation-recommender` | 4 | missing riskId → 400, AI gateway 429 → `RATE_LIMIT`, happy path, preflight |
| `risk-ai-analysis` | 4 | see file for branch coverage |
| `risk-scoring-engine` | 4 | see file for branch coverage |
| `sample-data-manager` | 2 | missing `Authorization` → 401, preflight |
| `scheduled-reports` | 4 | see file for branch coverage |
| `send-notification-email` | 4 | malformed body → 500, unknown user → 200 disabled, happy path, preflight |
| `whistleblow-config` | 4 | returns site key, never leaks secret key, empty when unset, preflight |
| `whistleblow-follow-up` | 5 | missing fields, unknown case → 404, wrong passphrase → 401, happy path, preflight |
| `whistleblow-submit` | 3 | Turnstile failure, input validation, happy path |
| `risk-categories-rls-tests` | 0 (unit) | **No hermetic unit tests.** Only the live, opt-in RLS integration suite described below (`RLS_INTEGRATION=1`); it is skipped by default in CI. |

Total: 65 hermetic Deno tests passing, plus 2 live/opt-in RLS integration
tests that are skipped unless `RLS_INTEGRATION=1` is set.

### Regression note

The `sample-data-manager` suite was written against a real production bug: the
module-level `json()` helper referenced `corsHeaders`, which was declared inside
the `Deno.serve` closure. Every request threw
`ReferenceError: corsHeaders is not defined` instead of returning a response.
The helper now lives inside the handler and the 401 test is the guard.

## Live RLS integration tests

`risk-categories-rls-tests/rls_test.ts` is a *live* integration suite: it
provisions real auth users and exercises RLS against a real project. It is
skipped by default and only runs when explicitly enabled:

```bash
RLS_INTEGRATION=1 \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_ANON_KEY=... \
npm run test:edge
```

Never point it at production — it creates and deletes users and
`risk_categories` rows.
