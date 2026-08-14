# Postgres Migration Playbook

How schema changes are versioned, how normalized constraints are enforced, and how we roll
forward or back — in Lovable Cloud *and* the on-prem deployment. Read alongside
[ADR-0008](./adr/0008-domain-schema-and-normalization.md) (schema shape) and
[ADR-0002](./adr/0002-supabase-postgres-as-the-security-boundary.md) (RLS as the boundary).

---

## 1. Versioning model

### 1.1 One directional history, two consumers

| Artefact | Path | Consumer |
| --- | --- | --- |
| Cloud migrations | `supabase/migrations/<timestamp>_<slug>.sql` | Lovable Cloud (applied on approval) |
| On-prem baseline | `supabase/migrations-onprem/riskradar-onprem.sql` | Fresh on-prem installs |
| On-prem delta bundle | `supabase/migrations-onprem/riskradar-onprem-delta-<date>.sql` | Existing on-prem hosts |
| Verifier | `supabase/migrations-onprem/999_verify_install.sql` | Post-apply drift check |

Migrations are **append-only and immutable once applied**. A migration that has run anywhere —
Cloud, staging, or a customer's on-prem box — is never edited. Fixing it means writing the next
migration. Editing history is how two environments silently diverge.

Numbering is the UTC timestamp prefix Supabase generates. It is the *only* ordering authority;
do not renumber to "tidy" a branch.

### 1.2 What belongs in a migration

Schema and configuration only: `CREATE`/`ALTER TABLE`, indexes, `GRANT`, `ENABLE ROW LEVEL
SECURITY`, policies, functions, triggers, enum additions, `pg_cron` schedules.

Data changes (`INSERT`/`UPDATE`/`DELETE` on live rows) are *not* migrations — they run as data
operations. Exception: seeding a brand-new lookup table in the migration that created it, and
backfills that are part of a column's rollout (§3.2).

### 1.3 Mandatory shape for a new public table

Order is non-negotiable, because PostgREST has no default privileges on `public`: RLS without
`GRANT` yields a permission error, and `GRANT` without RLS yields a data leak.

```sql
-- 1. structure
CREATE TABLE public.example (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. privileges (drop anon unless a policy genuinely allows anonymous reads)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.example TO authenticated;
GRANT ALL ON public.example TO service_role;

-- 3. the boundary
ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;

-- 4. the rules
CREATE POLICY "Owners manage their rows" ON public.example
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 5. housekeeping
CREATE TRIGGER example_updated_at BEFORE UPDATE ON public.example
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Role checks inside policies always go through a `SECURITY DEFINER` helper
(`public.has_role()` / `public.user_has_role()`), never a direct `SELECT` on `user_roles` or
`profiles` — that is what causes RLS recursion.

Every `SECURITY DEFINER` function must pin `SET search_path = public`. A definer function
without a pinned search path is a privilege-escalation vector and fails code review.

---

## 2. Enforcing normalized constraints

### 2.1 Pick the right enforcement tool

| Rule | Mechanism | Why |
| --- | --- | --- |
| Referential integrity | `FOREIGN KEY` | Cheap, declarative, restore-safe |
| Uniqueness / natural keys | `UNIQUE` index | e.g. `user_roles (user_id, role)` |
| Immutable value rules | `CHECK` | Only for expressions that are truly immutable |
| Time- or state-dependent rules | `BEFORE INSERT OR UPDATE` trigger | `CHECK` must be immutable; `expire_at > now()` breaks restores |
| Cross-table invariants | Trigger or `SECURITY DEFINER` RPC | A `CHECK` cannot see another table |
| Multi-step workflow transitions | RPC (`apply_workflow_transition`) | Atomic: status change + history + notification in one transaction |

The rule of thumb: **`CHECK` constraints are re-evaluated during `pg_restore`**. Anything whose
truth depends on `now()`, another table, or the current user goes in a trigger — this is why
BIA/test validation lives in `validate_bcp_bia_test_fields()` rather than table constraints.

### 2.2 Lookup tables over enums

Taxonomies users manage (`risk_categories`, `departments`, `strategic_objectives`) live in
tables — see [ADR-0007](./adr/0007-lookup-tables-over-postgres-enums.md). The legacy
`risk_category` enum is kept in sync by `sync_risk_category_enum()` so old rows and old builds
keep working. Practical consequences for migrations:

- Adding a category is a **data** operation, not a migration.
- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block with other statements that
  use the new value; the sync trigger handles it, so never hand-write enum additions.
- Never `DROP` an enum value. Postgres does not support it; retire the row instead
  (`is_active = false`).

### 2.3 Defaults and nullability

New columns land **nullable or with a default**, always. `NOT NULL` on an existing table
rewrites it and fails if any row violates it mid-deploy. Tighten in a later migration after the
backfill has demonstrably completed (§3.2).

---

## 3. Roll-forward procedures

### 3.1 The default: forward-only

We do not maintain `down` migrations. Postgres DDL is transactional, so a *failed* migration
rolls itself back; an *applied* migration is corrected by a new one. This matches the on-prem
reality: a customer may be several deltas behind, and a down-migration chain that nobody
rehearses is fiction.

### 3.2 Expand → backfill → contract

Any change that would break a running build is split across releases, because the on-prem host
serves the previous bundle until the symlink flips.

```
Release N     ADD COLUMN new_col text;                     -- nullable, both builds fine
              (app writes both old_col and new_col)
Release N+1   UPDATE ... SET new_col = ... WHERE new_col IS NULL;   -- data op, batched
              (app reads new_col, still writes both)
Release N+2   ALTER COLUMN new_col SET NOT NULL;
              (app stops writing old_col)
Release N+3   DROP COLUMN old_col;                          -- only once no build references it
```

Never compress these into one release. Column drops in particular must lag at least one full
deploy cycle behind the last build that referenced them.

### 3.3 Idempotent, guarded DDL for on-prem deltas

On-prem hosts apply deltas that may partially overlap what they already have. Every statement in
a delta bundle must be safe to run twice and safe to run against an older schema:

```sql
CREATE TABLE IF NOT EXISTS ...;
ALTER TABLE public.x ADD COLUMN IF NOT EXISTS y text;
CREATE INDEX IF NOT EXISTS ...;
DROP POLICY IF EXISTS "name" ON public.x;   -- then CREATE POLICY
CREATE OR REPLACE FUNCTION ...;

-- Referencing a column that may not exist yet? Guard it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name  = 'whistleblow_cases'
      AND column_name = 'follow_up_token'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS whistleblow_cases_token_idx
             ON public.whistleblow_cases (follow_up_token)';
  END IF;
END $$;
```

A bare `REVOKE`/`CREATE POLICY`/index referencing a maybe-missing column is the single most
common cause of a failed on-prem apply. Wrap it.

### 3.4 Apply order

1. **Back up first.** `pg_dump -Fc` the target database; record the file path in the change ticket.
2. Apply the delta on the **database host** (the app host has no DB role).
3. Run the verifier — sections 3–5 of `999_verify_install.sql` must return **zero rows**.
4. Redeploy edge functions (they share the DB, not the app host).
5. Build and cut over the app release, then reload Nginx.

Steps 2–3 precede step 5 because the schema is additive: the old build tolerates new columns,
but a new build will not tolerate missing ones.

---

## 4. Rollback procedures

Choose the cheapest option that restores service.

| Scenario | Action | Data loss |
| --- | --- | --- |
| Bad frontend build, schema fine | Point the `current` symlink at the previous release, reload Nginx | None |
| Bad migration, caught before commit | Nothing — the transaction rolled back | None |
| Bad migration, applied, additive only | Leave it; ship a corrective forward migration | None |
| Bad migration, applied, destructive | Restore from the §3.4 pre-migration dump | Everything since the dump |
| Bad policy / grant | Forward migration that `DROP POLICY IF EXISTS` + recreates | None |
| Bad function or trigger | `CREATE OR REPLACE` with the previous body | None |

**Never** roll back by hand-editing rows in production to "undo" a trigger. Audit tables
(`risk_audit_logs`, `approval_history`, `bcp_version_history`, `whistleblow_audit_log`) are
append-only and hold the ISO 31000 evidence trail; deleting from them to tidy a mistake destroys
the traceability the control depends on. Correct forward and let the trail show the correction.

### 4.1 Point-in-time restore (on-prem)

The continuity module tracks this explicitly: `backup_configurations` defines schedule and
retention, `backup_logs` records each run with a checksum, and
`backup_restore_operations` links a restore to the `recovery_checklists` row that guided it and
the approver who authorised it. A production restore without a `backup_restore_operations` row
is an undocumented change and will be flagged in review.

---

## 5. Review checklist

Before a migration merges, confirm every line:

- [ ] Append-only — no previously applied file was edited.
- [ ] Every new `public` table has `GRANT` **and** RLS **and** at least one policy.
- [ ] `anon` granted only where a policy genuinely allows anonymous access.
- [ ] Every `SECURITY DEFINER` function has `SET search_path = public`.
- [ ] Policies use `has_role()` helpers, not direct reads of `profiles` / `user_roles`.
- [ ] No `CHECK` on a time-, user-, or cross-table-dependent expression.
- [ ] New columns nullable or defaulted; no same-release `NOT NULL` tightening.
- [ ] No `DROP COLUMN` for anything the current build still references.
- [ ] `updated_at` column + `update_updated_at_column()` trigger on mutable tables.
- [ ] Delta bundle statements are `IF EXISTS` / `IF NOT EXISTS` guarded.
- [ ] Verifier updated if the change adds a table, column, or policy it should assert.
- [ ] Corresponding TypeScript types regenerated and the calling code updated.
- [ ] ADR written or amended if the change alters a documented decision.

---

## 6. Reference ERDs

- [Risk register](./diagrams/erd-risk-register.mmd)
- [Incidents](./diagrams/erd-incidents.mmd)
- [Whistleblowing](./diagrams/erd-whistleblowing.mmd)
- [Business continuity](./diagrams/erd-business-continuity.mmd)
