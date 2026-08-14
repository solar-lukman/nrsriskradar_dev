# RiskRadar — On-Premise Upgrade Runbook

Formal procedure for rolling new releases into a self-hosted RiskRadar
instance. Pair this with `docs/onprem/DATABASE-MIGRATIONS.md` (initial
install) — this document covers **upgrades only**.

---

## 1. Versioning convention

Delta bundles ship as:

```
supabase/migrations-onprem/riskradar-onprem-delta-<YYYY-MM-DD>.sql
```

Each delta contains every `supabase/migrations/*.sql` added since the
previous cut, in filename (timestamp) order, wrapped in one transaction.

Applied filenames are recorded in a ledger table:

```sql
CREATE TABLE public._onprem_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
```

The ledger is created automatically by the delta bundle if missing. To
inspect what your DB has already seen:

```sql
SELECT filename, applied_at
FROM public._onprem_migrations
ORDER BY filename;
```

### Cut changelog

| Delta file | Migrations included | Notes |
|------------|--------------------|-------|
| (initial full install — `riskradar-onprem.sql`, 2026-04-30) | files #1..#91 | First on-prem cut |
| `riskradar-onprem-delta-2026-07-26.sql` | files #92..#111 (20 migrations) | Whistleblow attachments, RLS hardening, appetite re-eval RPC, BCP version history, avatars/control-documents storage tightening, incident owner history |

Append a new row here for every future cut.

---

## 2. Pre-flight

1. **Announce a maintenance window.** Migrations run inside one
   transaction; long ones can hold locks on `risks`, `profiles`,
   `whistleblow_cases`.
2. **Backup:**
   ```bash
   pg_dump -Fc -d riskradar -f "riskradar-preupgrade-$(date +%F).dump"
   ```
3. **Free disk:** ensure at least 2x the database size is free before
   applying migrations.
4. **Extensions installed:** `pgcrypto`, `uuid-ossp`, `pg_trgm`,
   `pg_stat_statements`, and (if you use scheduled jobs) `pg_cron`,
   `pg_net`. Check with:
   ```sql
   SELECT extname FROM pg_extension ORDER BY 1;
   ```
5. **Storage buckets exist.** Delta 2026-07-26 attaches policies to the
   buckets below. They must already exist in your storage backend
   (Supabase Storage self-hosted, MinIO, S3, etc.). The migrations
   create the *policies*; they do not create the buckets.

   | Bucket | Visibility |
   |---|---|
   | `avatars` | public read on own folder only |
   | `control-documents` | private, department-scoped |
   | `risk-attachments` | private, risk-scoped |
   | `whistleblow-evidence` | private, service-role writes only |
   | `onprem-exports` | private, ADMIN-only |
   | `bcp-documents` | private, department-scoped |

6. **Edge function environment variables ready** (see §5).

---

## 3. Apply the database delta

```bash
# 1. Confirm current ledger state
psql -d riskradar -c 'SELECT count(*) FROM public._onprem_migrations;'

# 2. Apply the delta (single transaction)
psql -h <host> -U postgres -d riskradar -v ON_ERROR_STOP=1 \
     -f supabase/migrations-onprem/riskradar-onprem-delta-2026-07-26.sql

# 3. Verify
psql -d riskradar -f supabase/migrations-onprem/999_verify_install.sql
```

The verifier must report **zero** tables in sections 3 (missing GRANTs),
4 (RLS disabled), and 5 (RLS on but no policies).

### If the delta fails

The whole transaction rolls back — the ledger is unchanged, schema is
unchanged. Fix the underlying issue and re-run. If a specific migration
is already applied out-of-band, insert its filename into
`public._onprem_migrations` first, then remove it from the delta file,
then re-run.

---

## 4. Frontend redeploy

```bash
bun install
bun run build
# publish dist/ to your web tier (nginx / IIS / Cloudflare Tunnel / etc.)
```

Check `.env` for any new `VITE_*` keys since your last cut. As of
2026-07-26 the required keys are unchanged from the initial install:

```
VITE_SUPABASE_URL=https://api.riskradar.internal
VITE_SUPABASE_PUBLISHABLE_KEY=<on-prem anon JWT>
VITE_SUPABASE_PROJECT_ID=<internal ref>
```

---

## 5. Edge function redeploy

Redeploy every function under `supabase/functions/` — safest to redeploy
all, since imports and shared modules (`_shared/cors.ts`) have changed.

| Function | New/changed since baseline | Required secrets |
|---|---|---|
| `whistleblow-submit` | Multi-file evidence upload | `TURNSTILE_SECRET_KEY` |
| `whistleblow-follow-up` | Rate limiting | `TURNSTILE_SECRET_KEY` |
| `whistleblow-config` | Serves public Turnstile site key | `TURNSTILE_SITE_KEY` |
| `export-onprem-snapshot` | NDJSON snapshot export | (uses service role) |
| `admin-invite-user` | CORS allowlist, JWT verify | SMTP settings |
| `risk-ai-analysis` | Gemini via Lovable AI Gateway | `LOVABLE_API_KEY` (or local LLM endpoint) |
| `mitigation-recommender` | AI recommendations | `LOVABLE_API_KEY` |
| `ai-report-generator` | Executive PDFs | `LOVABLE_API_KEY` |
| `lob-data-import` | CSV/Excel with AI scoring | `LOVABLE_API_KEY` |
| `check-deadlines` | Daily pg_cron | (service role) |
| `scheduled-reports` | Hourly pg_cron | (service role) |
| `send-notification-email` | Notifications | SMTP settings |
| `backup-operations`, `backup-scheduler` | Backup lifecycle | (service role) |
| `risk-scoring-engine`, `sample-data-manager`, `risk-categories-rls-tests` | Support functions | (service role) |

CORS allowlist: set `ALLOWED_ORIGINS` (comma-separated) to your on-prem
frontend origin(s). Wildcards are no longer accepted since the security
hardening in delta 2026-07-26.

If you run functions on the Supabase self-hosted Deno runtime:

```bash
supabase functions deploy --project-ref <local-ref> \
  whistleblow-submit whistleblow-follow-up whistleblow-config \
  export-onprem-snapshot admin-invite-user risk-ai-analysis \
  mitigation-recommender ai-report-generator lob-data-import \
  check-deadlines scheduled-reports send-notification-email \
  backup-operations backup-scheduler risk-scoring-engine \
  sample-data-manager risk-categories-rls-tests
```

---

## 6. Post-upgrade verification

Run these checks against the live on-prem instance:

1. **Sign in** as an ADMIN, RMD, and CRO user — each landing page loads
   without a red banner.
2. **Dashboard** shows real numbers (not placeholders) and BCP % is
   consistent across roles.
3. **Whistleblow → Submit** works end-to-end with a 2-file evidence
   upload (max 10 MB each) and produces a case with a follow-up token.
4. **Audit Logs → Risk Changes** tab renders for RMD/CRO/ADMIN with
   pagination, sort, and date filters.
5. **Risk Appetite → Re-evaluate all** completes without error.
6. **BCP → edit an existing plan** → version history panel shows the
   new revision.
7. **Verifier**: `psql -f 999_verify_install.sql` reports clean.

---

## 7. Rollback

1. Redeploy the previous frontend build (keep the previous `dist/`
   tarball).
2. Redeploy the previous edge function bundle.
3. Restore the pre-upgrade DB snapshot:
   ```bash
   dropdb riskradar
   createdb riskradar
   pg_restore -d riskradar riskradar-preupgrade-YYYY-MM-DD.dump
   ```
   The restore brings back the pre-upgrade `public._onprem_migrations`
   contents, so the next attempt starts from a known state.

If you cannot restore the full DB, you may hand-revert individual
migrations, but this is fragile — most contain policy and grant changes
that touch the same rows. **Prefer the snapshot restore.**

---

## 8. Producing the next delta

When a new set of migrations is ready:

```bash
# List everything applied on the target on-prem instance
psql -d riskradar -Atc 'SELECT filename FROM public._onprem_migrations' | sort > /tmp/applied.txt

# List everything in the repo
ls supabase/migrations/ | sort > /tmp/repo.txt

# Compute the delta
comm -23 /tmp/repo.txt /tmp/applied.txt > /tmp/delta.txt

# Build the bundle
DATE=$(date +%Y-%m-%d)
DELTA="supabase/migrations-onprem/riskradar-onprem-delta-${DATE}.sql"
{
  echo "-- RiskRadar delta ${DATE}"
  echo "BEGIN;"
  echo "CREATE TABLE IF NOT EXISTS public._onprem_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"
  while read -r f; do
    echo "-- Migration: $f"
    cat "supabase/migrations/$f"
    echo "INSERT INTO public._onprem_migrations(filename) VALUES ('$f') ON CONFLICT DO NOTHING;"
  done < /tmp/delta.txt
  echo "COMMIT;"
} > "$DELTA"
```

Record the new file in the changelog table in §1.
