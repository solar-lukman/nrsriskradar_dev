# ADR-0003: Auth flow, session hydration and account lockout

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, CRO
- **Area:** Auth

## Context

Government-facing security standards required credential-stuffing resistance (lockout after
repeated failures), inactivity logout, and no client-trusted identity claims. The application
has no server tier of its own (see [ADR-0002](./0002-supabase-postgres-as-the-security-boundary.md)),
so lockout state cannot live in application memory, and it must be shared across browsers and
devices for the same account.

Diagram: [`docs/diagrams/auth-flow.mmd`](../diagrams/auth-flow.mmd).

## Decision

Email/password sign-in via GoTrue, wrapped by `src/contexts/AuthContext.tsx`:

1. Before authenticating, call the `is_account_locked(_email)` RPC and refuse early with a
   `423 AccountLocked` error if the ledger says the account is locked.
2. On credential failure, call `record_failed_login(_email, _ip)`. A database trigger locks the
   account at 5 failures within 15 minutes; the RPC returns whether the lock just fired.
3. On success, call `clear_failed_login_attempts(_email)`.
4. Identity is hydrated from the database, never from the JWT payload or client storage:
   `onAuthStateChange` triggers a fetch of `user_roles` (primary role, most recently assigned)
   then `profiles` (name, department). The profile fetch is deferred with `setTimeout(0)` so it
   never blocks or re-enters the auth callback.
5. `useAutoLogout` signs the user out after inactivity; `ProtectedRoute` only checks *session
   presence* and redirects to the landing page while `isLoading` renders a spinner.

The pre-check in step 1 fails open on error — the credential attempt behind it is still the real
gate, and a transient RPC failure must not lock everyone out of the portal.

## Alternatives considered

- **Lockout counted in the browser** — rejected: trivially bypassed by clearing storage.
- **Roles read from JWT custom claims** — rejected: claims go stale after a role change until
  the token refreshes, and role revocation must take effect immediately.
- **CAPTCHA instead of lockout on the staff login** — rejected for internal sign-in (kept for
  the anonymous whistleblowing form, which has no account to lock).

## Consequences

- Sign-in costs up to three extra round-trips; acceptable for an internal portal.
- A locked account needs an administrator to clear it — an intentional support cost that also
  makes brute-force attempts visible.
- `AuthContext` is the single hydration point; components must read role and profile from
  `useAuth()` rather than re-querying, or the "primary role" rule gets reimplemented wrongly.
