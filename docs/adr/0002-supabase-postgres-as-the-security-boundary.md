# ADR-0002: Postgres + Row Level Security is the security boundary

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, CRO
- **Area:** Security

## Context

The portal is a Vite/React single-page application talking directly to Supabase (managed in the
cloud, self-hosted on-premises). There is no bespoke application server in between. Anything
shipped to the browser — role checks, filters, hidden buttons — is attacker-controlled, yet the
data includes whistleblowing reports, board papers and audit logs.

We also had to survive a vulnerability assessment and support an air-gapped on-prem install,
which rules out designs that depend on a proprietary hosted middle tier.

## Decision

Postgres is the only place authorization is *enforced*. Every table in `public` has RLS enabled
with explicit policies, explicit `GRANT`s per role, and role checks made through the
`SECURITY DEFINER` helper `public.has_role(uuid, app_role)` so policies never recurse through
`profiles` or `risks`. Client-side permission checks exist only to shape the UI. Edge functions
that must bypass RLS (whistleblowing intake, admin invite, scheduled reports) verify the JWT
themselves and are the sole holders of elevated privilege.

Rules are codified in `docs/secure-db-guidelines.md` and enforced by `npm run lint:db-safety`.

## Alternatives considered

- **Node/Express API in front of Postgres** — rejected: duplicates the authorization model in a
  second place, adds a service to operate on-prem, and historically the duplicate is the one
  that drifts.
- **Filtering in the React client only** — rejected: not a boundary at all; any user can call
  PostgREST directly with their own token.
- **Service-role key in the browser for "trusted" roles** — rejected outright; it hands full
  database access to whoever opens devtools.

## Consequences

- Every new table needs `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY` → policies in the
  *same* migration; a missing `GRANT` surfaces as a runtime permission error, not a build error.
- Dashboard metric bugs are usually RLS-visibility bugs, so read policies must be reviewed
  per-role, not just per-table.
- Debugging requires reading SQL policies, which is a real learning curve for frontend-only
  developers — mitigated by the guidelines doc and the RLS test edge functions.
