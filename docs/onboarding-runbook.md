# Developer Onboarding Runbook

Everything a new engineer needs to get RiskRadar (NRS Risk Management Portal)
running locally, build it, and triage the failure modes that actually occur in
this codebase.

Read `docs/architecture.md` first for the "why". This document is the "how".

---

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20 LTS or newer | `nvm install 20 && nvm use 20` |
| npm | 10+ (ships with Node 20) | `bun` also works locally; CI/on-prem uses npm |
| Git | any recent | |
| Chromium/Firefox/WebKit | via Playwright | only needed for E2E: `npx playwright install` |

No local Postgres is required. The app talks to a hosted backend (Lovable Cloud
in dev/prod, an on-prem Postgres + API host for the NRS deployment). Nothing in
`src/` starts a server of its own.

---

## 2. Local setup

```bash
git clone <repo-url> nrsriskradar
cd nrsriskradar

npm install          # use `npm ci` only when the lockfile is known-good
cp .env.example .env # if absent, create .env with the three vars in §3
npm run dev          # http://localhost:8080
```

Dev server binds to `::` on port 8080 (see `vite.config.ts`). To expose it on a
LAN box: `npm run dev -- --host 0.0.0.0 --port 8080`.

### Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server + HMR |
| `npm run build` | Production bundle into `dist/` |
| `npm run build:dev` | Production bundle with development mode flags |
| `npm run preview` | Serve the built `dist/` locally (smoke-test the real artifact) |
| `npm run lint` | ESLint |
| `npm run lint:iso` | ISO 31000 naming conventions linter |
| `npm run lint:db-safety` | Migration/RLS safety linter |
| `npm run lint:review` | All three — run before opening a PR |
| `npm test` | Vitest unit tests |
| `bunx playwright test -c e2e/playwright.config.ts` | E2E/UAT suite (see `e2e/README.md`) |

---

## 3. Environment variables

All frontend config is **build-time**. Vite inlines `import.meta.env.VITE_*`
into the bundle; there is no runtime server reading `.env`. Changing `.env`
therefore requires a **rebuild**, not just a restart of Nginx.

`.env` at the project root:

```
VITE_SUPABASE_URL="https://<project>.supabase.co"      # or https://api.nrs.internal on-prem
VITE_SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"
VITE_SUPABASE_PROJECT_ID="<project ref>"
```

Rules:

- These three are **public by design**. The anon key is meant to ship in the
  browser bundle; Row Level Security is what protects the data. Never blank
  them to "fix" a deploy.
- The `service_role` key and the database password **never** appear in `.env`,
  in `src/`, or in any client bundle. They belong only to server-side edge
  functions.
- Server-side secrets (Turnstile secret key, mail credentials, `ALLOWED_ORIGINS`,
  AI keys) live in the backend's function secrets, not here.
- On-prem: `ALLOWED_ORIGINS` on the API host must include the app server's
  public origin, or every edge-function call fails CORS preflight.

Quick check that the values were actually baked into a build:

```bash
grep -o 'https://[a-z0-9.-]*supabase[a-z.]*' dist/assets/index-*.js | head
```

Empty output means the build ran without a `.env` — rebuild.

---

## 4. Build and preview

```bash
npm run build      # writes dist/
npm run preview    # serves dist/ at http://localhost:4173
```

`npm run dev` and `npm run build` are separate workflows: `build` does not start
a server, and `dev` does not use `dist/`. Never serve production traffic from
`npm run dev` — it ships the unminified bundle, an open HMR websocket, and the
dev-only nav-consistency check in `src/main.tsx`.

Production serving is Nginx pointed at `dist/`, with an SPA fallback
(`try_files $uri /index.html`) so deep links and refreshes resolve.

---

## 5. Common failure scenarios

### `npm ci` — "Missing: <pkg> from lock file"
The lockfile is out of sync with `package.json` (typically a transitive
`esbuild`/`rollup` platform binary). Fix: `npm install --no-audit --no-fund`
and commit the regenerated `package-lock.json`. Do not hand-edit the lockfile.

### `sh: 1: vite: Permission denied`
`node_modules/.bin` shims lost their execute bit — common after copying a
release folder or unpacking an archive without permissions.
```bash
chmod +x node_modules/.bin/*
# or bypass the shim:
node node_modules/vite/bin/vite.js build
```

### Blank white page after deploy
Almost always a missing/incorrect `.env` at **build** time: the Supabase client
initializes with `undefined` and the first data call throws before anything
renders. See §6 for the triage sequence.

### 404 on refresh of a deep link
Nginx (or whatever serves `dist/`) is missing the SPA fallback. Lovable hosting
does this automatically; on-prem does not.

### Edge function calls fail with a CORS error
The calling origin isn't in the allowlist. `supabase/functions/_shared/cors.ts`
allows a fixed default set plus `ALLOWED_ORIGINS`. Add the origin there (or to
the env var) and redeploy the function. Note: a disallowed origin gets **no**
`Access-Control-Allow-Origin` header at all — that's deliberate fail-closed
behaviour, not a bug.

### "permission denied for table X"
RLS is enabled but the `GRANT`s are missing, or the role has no matching policy.
Both are required. Check the migration that created the table for the
`GRANT ... TO authenticated / service_role` block.

### Sidebar shows a link the route then denies (or vice versa)
`src/lib/navAccessConsistency.ts` runs in dev and logs the mismatch to the
console. The fix is to align the permission in `src/contexts/AuthContext.tsx`
with the guard in `src/components/ProtectedRoute.tsx` — never to hide the error.

### Dashboard numbers differ between two roles
Expected only where a role filter is documented. Otherwise it's an RLS SELECT
policy that's narrower for one role. Reproduce by querying the same table as
both users before touching frontend code.

---

## 6. Triaging blank pages and CSP blocks

Work top to bottom; stop at the first thing that reproduces.

**Step 1 — open DevTools Console (F12).** A blank page always leaves a trace.
Classify the first red error:

| Console message | Meaning | Fix |
| --- | --- | --- |
| `Failed to construct 'URL': Invalid URL` / `supabaseUrl is required` | `VITE_SUPABASE_URL` was undefined at build time | rebuild with a correct `.env` (§3) |
| `Refused to connect to '…' because it violates … connect-src` | CSP blocked the backend origin | add the origin to `connect-src` in `index.html` |
| `Refused to load the script '…' … script-src` | CSP blocked a bundle/CDN script | add the origin, or drop the CDN dependency |
| `Uncaught SyntaxError: Unexpected token '<'` on a `.js` request | the server returned `index.html` for an asset — wrong `base`/root or broken Nginx alias | fix the static root |
| `Rendered more hooks than during the previous render` | Rules-of-Hooks violation: a hook after an early `return` | move all hooks above every conditional return |

**Step 2 — check the Network tab.** Filter to `Fetch/XHR`.
- Requests to `undefined/rest/v1/...` → env var problem.
- `401/403` on every request → session not hydrated, or RLS denies the role.
- Preflight `OPTIONS` failing → CORS (§5).

**Step 3 — CSP specifics.** The policy lives in a `<meta http-equiv="Content-Security-Policy">` in `index.html`.

- `frame-ancestors` and `upgrade-insecure-requests` are **ignored** in a meta
  CSP by spec. The console warning about them is informational, not the cause
  of a blank page. Enforce clickjacking protection server-side instead:
  ```nginx
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Content-Security-Policy "frame-ancestors 'self'" always;
  ```
- On-prem backends served over plain `http:` need `http:` present in
  `connect-src`, otherwise every API call is blocked silently from the app's
  perspective.
- To confirm CSP is the culprit rather than a red herring: temporarily comment
  out the CSP meta tag, rebuild, reload. If the page renders, it's CSP —
  re-add the tag with the specific origin allowed. Never ship with the tag
  removed.

**Step 4 — isolate build vs. runtime.** Run `npm run preview` against the same
`dist/`. If it renders locally but not on the server, the problem is the server
(Nginx config, headers, MIME types), not the bundle.

**Step 5 — component-level crashes.** If the shell renders but one route is
blank, the route is throwing. `src/components/ErrorBoundary.tsx` wraps the
riskier routes and shows the message instead of a white screen — wrap the new
route the same way rather than debugging blind.

---

## 7. Where things live

```
src/pages/          route-level screens
src/components/     feature components, grouped by module
src/components/ui/  shadcn primitives — style via tokens, don't fork
src/contexts/       AuthContext (session + permissions), NotificationContext
src/hooks/          data hooks (React Query) — one per domain concern
src/lib/            pure helpers: workflow rules, PDF, consistency checks
src/integrations/supabase/  generated client + types — never hand-edit
supabase/migrations*/       schema history (additive, guarded)
supabase/functions/         edge functions (Deno)
docs/                       architecture, ADRs, diagrams, runbooks
e2e/                        Playwright UAT suite
```

Design tokens are defined in `src/index.css` and `tailwind.config.ts`. Never
hardcode colour utilities in components — it breaks theming.

---

## 8. First-week checklist

1. Get `npm run dev` rendering the login page locally.
2. Sign in as each seeded role and note where `/` lands you (`LandingPage.tsx`).
3. Read `docs/architecture.md` §authorization, then trace one permission from
   sidebar → route guard → RLS policy.
4. Skim `docs/adr/README.md`; read ADR-0002, -0004, -0005.
5. Run `npm run lint:review` and `npm test` — both must be green before a PR.
6. Run the E2E suite once against local (`e2e/README.md`).

---

## Related documents

- `docs/architecture.md` — system design and rationale
- `docs/adr/README.md` — architecture decision records
- `docs/deployment-guide.md` — hosting options and topology
- `docs/onprem/UPGRADE-RUNBOOK.md` — on-prem release procedure
- `docs/migration-playbook.md` — schema change process
- `docs/testing-guide.md` — unit and acceptance testing
