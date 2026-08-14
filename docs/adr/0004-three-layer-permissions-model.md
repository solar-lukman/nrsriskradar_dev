# ADR-0004: Three-layer permissions model with a separate `user_roles` table

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, RMD, CRO
- **Area:** Access control

## Context

RiskRadar has eleven roles (RC, RR, RO, RMD, CRO, ERMSC, EC, RCB, SUPERVISOR, ADMIN, USER) whose
needs differ along two independent axes: what they may *see in the navigation*, and what rows
they may *read or write*. Early iterations stored a `role` column on `profiles`, which meant any
user who could update their own profile row could grant themselves `ADMIN` — a textbook
privilege-escalation path. Separately, the sidebar and the route guards were maintained by hand
and drifted apart (CRO once saw a `/user-management` link that the guard then denied).

Diagrams: [`docs/diagrams/role-navigation.mmd`](../diagrams/role-navigation.mmd),
[`docs/diagrams/erd-role-permissions.mmd`](../diagrams/erd-role-permissions.mmd).

## Decision

Roles live in a dedicated `public.user_roles` table (`user_id`, `role app_role`, unique per
pair). Nothing writes a role through a user-editable table; `profiles.role` is legacy fallback
only. Policies test roles exclusively through the `SECURITY DEFINER` function
`public.has_role(auth.uid(), 'ROLE')`.

Authorization is then applied in three layers, in this order:

1. **Route guard** — `ProtectedRoute` checks that a session exists. Authentication only.
2. **UI permissions** — `rolePermissions` in `src/contexts/AuthContext.tsx` maps role →
   permission strings (`view_risks`, `use_approval_inbox`, `manage_users`, `*` for ADMIN);
   `hasPermission()` decides which nav items and buttons render. **Cosmetic only.**
3. **RLS** — the actual boundary, per [ADR-0002](./0002-supabase-postgres-as-the-security-boundary.md).

To stop layer 2 drifting from the route table, `src/lib/navAccessConsistency.ts` asserts that
each role's visible sidebar entries exactly equal the routes that role can reach. It runs in the
dev console and as a Vitest case (`src/test/navAccessConsistency.test.ts`).

## Alternatives considered

- **`role` column on `profiles`** — rejected: privilege escalation via self-update, and RLS
  policies reading `profiles` recurse into `profiles`' own policies.
- **Multiple simultaneous active roles** — rejected for now: the register, inbox and dashboards
  assume one effective role. `user_roles` already stores multiple rows, so the primary role is
  the most recently assigned one; widening this later needs no schema change.
- **Deriving nav purely from RLS probes** — rejected: a request per route on every page load.

## Consequences

- Adding a role means editing `app_role`, `rolePermissions`, the route map, and the RLS
  policies. The consistency test catches the common miss (nav vs route), not the RLS one.
- Hiding a button is never a security control; reviewers must ask "what stops a crafted request?"
- Role changes take effect on the next profile hydration, i.e. immediately on reload, because
  roles are read from the database rather than the token.
