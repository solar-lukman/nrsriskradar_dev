# RiskRadar — On-Premise Database Migrations

Everything needed to stand up the RiskRadar database on a self-hosted
PostgreSQL 15/16 instance (with or without Supabase self-hosted).
**All artefacts are plain `.sql` files — no shell scripts required.**

## Contents

| File | Purpose |
|------|---------|
| `supabase/migrations-onprem/000_bootstrap_prereqs.sql` | Extensions, Postgres roles (`anon`, `authenticated`, `service_role`, `authenticator`), `auth.uid()` shim, default privileges. **Run first, once, as superuser.** |
| `supabase/migrations-onprem/riskradar-onprem.sql` | **Single deployable bundle** — bootstrap + all 91 application migrations + verification, wrapped in one transaction. Apply this if you want a one-shot install. |
| `supabase/migrations-onprem/998_load_snapshot.sql` | Loads a data snapshot exported from the managed backend (see Option D). Runs between the migrations and the verifier. |
| `supabase/migrations-onprem/999_verify_install.sql` | Post-install verification: extensions, roles, GRANTs, RLS coverage, critical tables. |
| `supabase/migrations/*.sql` | The 91 application migrations (ISO-timestamp sortable). Use these if you prefer per-file CI/CD. |

## Deployment options

### Option A — Single bundled file (simplest)

```bash
psql -h <onprem-host> -U postgres -d riskradar -v ON_ERROR_STOP=1 \
  -f supabase/migrations-onprem/riskradar-onprem.sql
```

This file contains the bootstrap, every application migration, and the
verification block. Everything runs inside one transaction — a failure
rolls the database back to its pre-install state.

### Option B — Per-file (recommended for CI/CD)

```bash
# 1. Bootstrap (superuser, once)
psql -U postgres -d riskradar -v ON_ERROR_STOP=1 \
  -f supabase/migrations-onprem/000_bootstrap_prereqs.sql

# 2. Application migrations, in filename order
for f in supabase/migrations/*.sql; do
  psql -U postgres -d riskradar -v ON_ERROR_STOP=1 -f "$f"
done

# 3. Verify
psql -U postgres -d riskradar \
  -f supabase/migrations-onprem/999_verify_install.sql
```

### Option C — Supabase CLI (if you use Supabase self-hosted)

```bash
supabase db push --db-url postgres://postgres:PASSWORD@onprem-db:5432/postgres
```
Run `000_bootstrap_prereqs.sql` manually first if your stack does not
already provide the Supabase roles.

### Option D — Schema + full data clone from the managed backend

Use this when you need on-prem to start with an exact copy of the current
production data, not an empty schema. The managed Supabase backend cannot
be `pg_dump`ed directly (no dashboard, no DB password, no CLI token —
that is by design on Lovable Cloud), so data is exported through an
admin-only edge function instead.

1. **Export in prod.** As an ADMIN user, open
   **Auth Verification → On-prem export** in the app and click *Run export*.
   The edge function `export-onprem-snapshot` writes one NDJSON file per
   table into the private `onprem-exports` storage bucket, plus
   `manifest.json` and `auth_users.ndjson`. Signed download URLs are
   returned (1-hour TTL). Every invocation is logged in
   `system_audit_logs` at severity `high`.
2. **Download and encrypt.** Download every file from the returned links,
   then encrypt for transfer:
   ```bash
   tar czf snapshot.tar.gz *.ndjson manifest.json
   gpg --symmetric --cipher-algo AES256 snapshot.tar.gz
   ```
   Move `snapshot.tar.gz.gpg` to the on-prem host over a trusted channel.
3. **Convert NDJSON → CSV** on the on-prem host (requires `jq`):
   ```bash
   gpg --decrypt snapshot.tar.gz.gpg | tar xz
   for f in *.ndjson; do
     jq -r '[.[]] | @csv' "$f" > "${f%.ndjson}.csv"
   done
   ```
4. **Run bootstrap + migrations** exactly as Option B (bundle or per-file).
5. **Seed auth users.** `auth_users.csv` contains id / email / metadata
   only — no password hashes. Either insert directly into `auth.users`
   with a superuser-owned migration, or POST each row to the on-prem
   GoTrue admin API. Then trigger a password-reset email for every user
   so they set a fresh password on first login.
6. **Load application data:**
   ```bash
   cd /path/to/snapshot
   psql -v ON_ERROR_STOP=1 -v snapshot_dir=`pwd` \
     -f /path/to/supabase/migrations-onprem/998_load_snapshot.sql
   ```
   The loader wraps everything in one transaction with
   `session_replication_role = replica` (defers FK checks) and resets all
   sequences at the end.
7. **Verify:** `psql -f supabase/migrations-onprem/999_verify_install.sql`.
8. **Delete the snapshot** from the `onprem-exports` bucket and shred the
   local files.

**Not included in the snapshot:** files in the `risk-attachments` storage
bucket. If attachments must move too, download them separately via the
Supabase Storage API and re-upload to your on-prem storage.



## Target stack matrix

| Component | Supabase self-hosted | Vanilla PostgreSQL |
|-----------|----------------------|--------------------|
| PostgreSQL | 15 or 16 (bundled) | 15 or 16 |
| `auth` schema | Provided by GoTrue | Created by bootstrap (stub) |
| `storage` schema | Provided by Storage API | Stub only — supply file storage separately |
| Roles (`anon`, `authenticated`, `service_role`, `authenticator`) | Provided | Created by bootstrap |
| PostgREST | Provided | Install separately |
| GoTrue (auth) | Provided | Install separately for real logins |
| Edge Functions | Provided (Deno) | Install `supabase/functions` runtime separately |

## Pre-flight checklist

1. **Postgres 15 or 16** installed; `shared_preload_libraries` includes
   `pg_stat_statements` and — if you want scheduled jobs — `pg_cron`.
2. Database created: `CREATE DATABASE riskradar;`
3. Superuser access (needed for `CREATE EXTENSION` and role creation).
4. Change the placeholder password in `000_bootstrap_prereqs.sql`
   (`CHANGE_ME_STRONG_PASSWORD` on the `authenticator` role) **before**
   applying either the bootstrap file or the bundle.
5. `ALTER DATABASE riskradar SET timezone TO 'UTC';`

## Post-install checklist

- `999_verify_install.sql` must report **zero** tables in sections 3
  (missing GRANTs), 4 (RLS disabled), and 5 (RLS on but no policies).
- Seed the first admin:
  ```sql
  INSERT INTO public.user_roles (user_id, role)
  VALUES ('<uuid-of-first-admin>', 'ADMIN');
  ```
- Point the frontend `.env` at your on-prem PostgREST / GoTrue endpoints:
  ```
  VITE_SUPABASE_URL=https://api.riskradar.internal
  VITE_SUPABASE_PUBLISHABLE_KEY=<your on-prem anon JWT>
  ```

## Rolling forward

New application migrations continue to land in `supabase/migrations/`.
For each release, apply only the **new** files (by filename timestamp)
against the on-prem database, then re-run `999_verify_install.sql`.

Track applied migrations with a simple ledger table:

```sql
CREATE TABLE IF NOT EXISTS public._onprem_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

## Regenerating the bundle

`riskradar-onprem.sql` is a plain concatenation of:
1. `000_bootstrap_prereqs.sql`
2. every file in `supabase/migrations/` in filename order
3. `999_verify_install.sql`

To regenerate after new migrations land, on any Unix host:

```bash
{ cat supabase/migrations-onprem/000_bootstrap_prereqs.sql;
  echo "BEGIN;";
  cat supabase/migrations/*.sql;
  echo "COMMIT;";
  cat supabase/migrations-onprem/999_verify_install.sql;
} > supabase/migrations-onprem/riskradar-onprem.sql
```

## Backup & rollback

- **Backup before every deploy:** `pg_dump -Fc -d riskradar > riskradar-$(date +%F).dump`
- **Rollback strategy:** migrations are additive; restore from the
  pre-deploy `pg_dump` snapshot to roll back.
- **PITR:** enable WAL archiving and take weekly `pg_basebackup` snapshots.
