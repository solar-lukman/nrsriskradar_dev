# RiskRadar — Production Deployment Runbook

Authoritative procedure for shipping a release to production, in **Lovable Cloud**
and in the **on-premise** topology (separate app host and database host).

Companion documents:
- [`onboarding-runbook.md`](./onboarding-runbook.md) — local setup and blank-page/CSP triage
- [`migration-playbook.md`](./migration-playbook.md) — how migrations are authored and versioned
- [`onprem/UPGRADE-RUNBOOK.md`](./onprem/UPGRADE-RUNBOOK.md) — on-prem delta bundle mechanics
- [`deployment-guide.md`](./deployment-guide.md) — topology options and infrastructure

---

## 0. Roles and hosts

| Host | Owns | Does **not** own |
| --- | --- | --- |
| App host (`NRS-HQ-ERM-APP1`) | `.env`, `bun install`, `bun run build`, Nginx, release symlink | No DB role, no edge functions |
| Database / API host | Migrations, `GRANT`s, RLS, `pg_cron`, storage buckets, edge functions | No frontend build |
| Lovable Cloud | Migrations applied on approval; frontend published from the editor | — |

Two people minimum: one to apply the database delta, one to cut the frontend over.
The order is fixed — **schema first, frontend second** (§3.4 of the migration playbook).

---

## 1. Pre-flight checklist

Complete **all** of these before touching production.

- [ ] Change ticket open, with the release tag/date and the migration filenames it contains.
- [ ] Maintenance window announced. Migrations run in one transaction and can lock
      `risks`, `profiles`, `whistleblow_cases`.
- [ ] **Database backup taken and its path recorded in the ticket:**
      ```bash
      pg_dump -Fc -d riskradar -f "riskradar-preupgrade-$(date +%F-%H%M).dump"
      ```
- [ ] Free disk ≥ 2× database size on the DB host.
- [ ] Previous release directory and its `dist/` still present on the app host (this is
      the frontend rollback artefact — do not delete it).
- [ ] Extensions present on the DB host: `pgcrypto`, `uuid-ossp`, `pg_trgm`,
      `pg_stat_statements`, and `pg_cron` + `pg_net` if scheduled jobs are used.
      ```sql
      SELECT extname FROM pg_extension ORDER BY 1;
      ```
- [ ] Storage buckets exist (migrations create *policies*, never buckets):
      `avatars`, `control-documents`, `risk-attachments`, `whistleblow-evidence`,
      `bcp-documents`, `onprem-exports`.
- [ ] Edge-function secrets available for this cut (§4).
- [ ] Release notes reviewed for new `VITE_*` keys (§2.2).

---

## 2. Environment configuration

### 2.1 Frontend (build-time, app host)

Vite inlines `VITE_*` at **build time**. There is no runtime env on the app host —
changing `.env` after a build changes nothing until you rebuild.

`.env` in the release root, before `bun run build`:

```
VITE_SUPABASE_URL=https://api.riskradar.internal
VITE_SUPABASE_PUBLISHABLE_KEY=<on-prem anon JWT>
VITE_SUPABASE_PROJECT_ID=<internal ref>
```

These three values are **public by design** — the anon key is protected by RLS, not by
secrecy. Never place a service-role key in `.env`; it would ship in the browser bundle.

Carry `.env` forward from the previous release rather than retyping it:

```bash
cp ~/riskradar/current/.env ~/riskradar/releases/<new>/.env
```

Missing or blank values produce a **blank page with no error message** — the generated
client initialises with `undefined`. See §7.1.

### 2.2 New keys

Diff the release's `.env.example` (or release notes) against the live `.env`:

```bash
comm -23 <(grep -o '^VITE_[A-Z_]*' .env.example | sort) \
         <(grep -o '^VITE_[A-Z_]*' .env | sort)
```

Any output is a key you must add before building.

### 2.3 Backend secrets (DB/API host only)

Set on the function runtime, never in the repo:

| Secret | Used by |
| --- | --- |
| `LOVABLE_API_KEY` (or local LLM endpoint) | `risk-ai-analysis`, `mitigation-recommender`, `ai-report-generator`, `lob-data-import` |
| `TURNSTILE_SECRET_KEY` / `TURNSTILE_SITE_KEY` | `whistleblow-submit`, `whistleblow-follow-up`, `whistleblow-config` |
| SMTP settings | `send-notification-email`, `admin-invite-user` |
| `ALLOWED_ORIGINS` | every function (CORS allowlist) |

`ALLOWED_ORIGINS` is a comma-separated list of **exact** frontend origins. Wildcards are
rejected since the 2026-07-26 hardening; a missing origin here presents as every
authenticated call failing CORS in the browser while `curl` succeeds.

---

## 3. Build

On the app host, always into a **fresh dated directory** — never overwrite a live release.

```bash
cd ~/riskradar/releases
mkdir -p 2026-08-06-1030 && cd 2026-08-06-1030
# unpack the release archive here
cp ~/riskradar/current/.env .

bun install          # or: npm ci
bun run build        # emits dist/
```

Verify the env actually baked in before going further:

```bash
grep -o 'https://[a-z0-9.-]*supabase[a-z.]*' dist/assets/index-*.js | head -3
grep -c 'undefined/auth/v1' dist/assets/index-*.js   # must be 0
```

Known build failures:

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm ci` — "Missing: X from lock file" | lockfile out of sync with `package.json` | `npm install --no-audit --no-fund`, commit the lockfile |
| `sh: 1: vite: Permission denied` | execute bit lost in transit (zip/scp) | `chmod +x node_modules/.bin/*` |
| Build OK, page blank | `.env` absent at build time | recopy `.env`, rebuild |

Do **not** serve production with `npm run dev`. For a smoke test of the built bundle use
`npx vite preview --host 0.0.0.0 --port 8080`; Nginx serves the real thing.

---

## 4. Database migrations

Run on the **database host**. The app host has no DB role.

### 4.1 Lovable Cloud

Migrations are applied on approval through the editor. Confirm the linter is clean and
the new tables have `GRANT` + RLS + at least one policy before approving.

### 4.2 On-premise

```bash
# 1. What has this instance already seen?
psql -d riskradar -Atc 'SELECT filename FROM public._onprem_migrations ORDER BY 1' > /tmp/applied.txt

# 2. What does the release contain?
ls supabase/migrations/ | sort > /tmp/repo.txt
comm -23 /tmp/repo.txt /tmp/applied.txt > /tmp/delta.txt   # review this list

# 3. Apply the bundle — one transaction, stop on first error
psql -h <db-host> -U postgres -d riskradar -v ON_ERROR_STOP=1 \
     -f supabase/migrations-onprem/riskradar-onprem-delta-<DATE>.sql

# 4. Verify
psql -d riskradar -f supabase/migrations-onprem/999_verify_install.sql
```

**Acceptance:** sections 3 (missing `GRANT`), 4 (RLS disabled) and 5 (RLS with zero
policies) must each return **zero rows**. Anything else is a stop-the-line condition —
do not cut the frontend over.

If the delta fails, the whole transaction rolls back: schema and ledger are unchanged.
Fix the statement, rebuild the bundle, re-run. If a migration was applied out of band,
insert its filename into `public._onprem_migrations` and drop it from the bundle first.

### 4.3 Edge functions

Redeploy **all** functions after a delta — shared modules (`_shared/cors.ts`) change
between cuts and partial redeploys leave mismatched CORS behaviour.

```bash
supabase functions deploy --project-ref <ref> \
  whistleblow-submit whistleblow-follow-up whistleblow-config \
  export-onprem-snapshot admin-invite-user risk-ai-analysis \
  mitigation-recommender ai-report-generator lob-data-import \
  check-deadlines scheduled-reports send-notification-email \
  backup-operations backup-scheduler risk-scoring-engine \
  sample-data-manager risk-categories-rls-tests
```

---

## 5. Cutover

Schema is additive, so the old build tolerates the new schema — which is exactly why the
frontend flips **last**.

```bash
cd ~/riskradar
ln -sfn releases/2026-08-06-1030 current.new && mv -Tf current.new current
sudo nginx -t && sudo systemctl reload nginx
```

`ln -sfn` + `mv -T` makes the swap atomic — no window where `current` is missing.

Nginx must own the headers a `<meta>` CSP cannot deliver:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

location / { try_files $uri $uri/ /index.html; }   # SPA deep links
```

`frame-ancestors` and `upgrade-insecure-requests` are **ignored** in a meta tag — they
belong here, not in `index.html`.

---

## 6. Post-deployment verification

Run every check; record results in the ticket.

1. Sign in as **ADMIN**, **RMD**, and **CRO** — each landing page renders with no red banner.
2. Sidebar for each role matches its route guards (no visible link leads to Access Denied).
3. Dashboard shows real figures, and the **BCP completion %** is identical across roles
   (a divergence means an RLS `SELECT` policy regressed).
4. Risk Register → create a risk through the wizard → it appears with an audit entry.
5. Audit Logs → **Risk Changes** tab renders for RMD/CRO/ADMIN with pagination and date filters.
6. Whistleblow → submit anonymously with a 2-file evidence upload → follow-up token issued
   and usable on the follow-up page.
7. Incidents → owner assignment writes a timeline entry; a notification arrives in-app.
8. Risk Appetite → **Re-evaluate all** completes without error.
9. BCP → edit a plan → version history shows the new revision.
10. Browser console clean: no CSP violations, no `undefined/auth/v1` requests, no CORS errors.
11. Scheduled jobs: confirm `pg_cron` entries are present and next-run times are in the future.
    ```sql
    SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
    ```

---

## 7. Rollback

Pick the cheapest action that restores service. Frontend and database roll back
independently — an additive schema does not need reverting just because the UI did.

| Scenario | Action | Data loss |
| --- | --- | --- |
| Bad frontend build, schema fine | Point `current` at the previous release, reload Nginx | None |
| Migration failed mid-apply | Nothing — the transaction rolled back | None |
| Migration applied, additive only | Leave it; ship a corrective forward migration | None |
| Migration applied, destructive | Restore the §1 pre-upgrade dump | Everything since the dump |
| Bad policy or grant | Forward migration: `DROP POLICY IF EXISTS` + recreate | None |
| Bad function or trigger | `CREATE OR REPLACE` with the previous body | None |
| Edge function regression | Redeploy the previous function bundle | None |

Frontend-only rollback (seconds):

```bash
cd ~/riskradar
ln -sfn releases/<previous> current.new && mv -Tf current.new current
sudo systemctl reload nginx
```

Full database restore (last resort):

```bash
dropdb riskradar && createdb riskradar
pg_restore -d riskradar riskradar-preupgrade-<DATE>.dump
```

The restore also restores `public._onprem_migrations`, so the next attempt starts from a
known ledger state. Log the restore in `backup_restore_operations` with the approver and
the `recovery_checklists` row that guided it — an undocumented production restore fails
review.

**Never** hand-edit rows to "undo" a trigger. `risk_audit_logs`, `approval_history`,
`bcp_version_history` and `whistleblow_audit_log` are append-only ISO 31000 evidence.
Correct forward and let the trail show the correction.

### 7.1 Blank page after cutover

Almost always a build-time env problem, not a server one:

1. `grep -c 'undefined' dist/assets/index-*.js` on the Supabase URL → env missing at build.
2. Console CSP violation → the directive belongs in Nginx (§5), not the meta tag.
3. Network calls to the wrong host → `.env` still points at Cloud instead of on-prem.

Fix `.env`, rebuild, re-cut. Rolling the symlink back restores service while you do.

---

## 8. Sign-off

The release is complete when: the verifier returns zero rows in sections 3–5, all eleven
§6 checks pass, the backup path and delta filename are recorded in the ticket, and the
previous release directory is retained for at least one further cycle.
