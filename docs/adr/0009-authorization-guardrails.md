# ADR-0009: Authorization guardrails from navigation down to individual buttons

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, CRO
- **Area:** Access control / Security

## Context

[ADR-0004](./0004-three-layer-permissions-model.md) settles *where* roles live and that RLS is
the boundary. It does not settle the day-to-day question that causes most review comments: a
developer adds a page or an action button and has to decide what to gate, where, and whether a
server-side check is also required. Getting this wrong shows up in two ways:

- **Too loose** — a button renders, the user clicks it, PostgREST returns a 403 and the UI shows
  a raw Postgres error. This is what happened with the RMD "Add New Risk" button.
- **Too tight** — a route guard denies what the sidebar advertises. CRO once saw a
  `/user-management` link that then rejected them.

Both are the same defect: three surfaces (sidebar, route, action) encoding the same rule by hand.

Diagram: [`docs/diagrams/role-navigation.mmd`](../diagrams/role-navigation.mmd).

## Decision

**Guardrails are declared once per capability and consumed at three grain sizes.**

1. **Navigation grain** — `rolePermissions` in `src/contexts/AuthContext.tsx` maps role →
   permission strings. `Sidebar.tsx` renders an entry only when `hasPermission(p)` is true.
2. **Route grain** — `ProtectedRoute` establishes *authentication*; the page component then
   gates on the same permission string and renders `<AccessDenied />` rather than redirecting,
   so a deep link produces an explainable page instead of a bounce loop.
3. **Action grain** — buttons that mutate are gated by a *predicate about the row*, not by role
   alone. `canPerformWorkflowAction(action, approvalStatus, role, ctx)` in
   `src/lib/riskWorkflow.ts` is the single source for the register's verbs; it also encodes
   state (`Submitted` only), ownership (`isSubmitter`) and the reviewer claim-lock.

**Every client guardrail has a named server counterpart.** The rule for review: for each gated
control, state which policy or `SECURITY DEFINER` function refuses the same request when the
button is bypassed. Workflow verbs land in `apply_workflow_transition()`
([ADR-0006](./0006-workflow-transitions-via-security-definer-rpc.md)); reads land in RLS
policies; privileged writes land in edge functions that verify the JWT themselves. A control
with no named counterpart is a bug, regardless of how well it is hidden.

**Consistency is asserted, not reviewed.** `src/lib/navAccessConsistency.ts` enumerates every
route with its sidebar rule and its guard rule and fails when they disagree for any of the
eleven roles. It runs in the dev console from `main.tsx` and as a Vitest case
(`src/test/navAccessConsistency.test.ts`), alongside hard invariants — ADMIN reaches everything,
CRO never reaches `/user-management`. Negative RBAC is covered end-to-end in
`e2e/tests/negative-rbac.spec.ts` and `e2e/tests/sidebar-access.spec.ts`, which sign in as each
role and assert the denial, not just the absence of a link.

**Failure is explained, never raw.** Server rejections are mapped to field-level or dialog-level
messages (`src/lib/bcpServerErrors.ts` for trigger rejections, tagged errors such as
`CLAIM_CONFLICT:` from the workflow RPC). Users see what to do next; they never see SQLSTATEs.

## Alternatives considered

- **Role checks inlined at each call site (`role === 'ADMIN' || role === 'RMD'`)** — rejected:
  the eleven-role matrix drifts within one sprint and cannot be tested as a whole.
- **Hiding controls only, with no server check** — rejected: the client is attacker-controlled
  ([ADR-0002](./0002-supabase-postgres-as-the-security-boundary.md)).
- **Server-only checks, always render the button** — rejected: turns a permissions model into a
  parade of 403 toasts, and executives read those as outages.
- **Deriving navigation by probing each route's RLS** — rejected: a request per route per load,
  and it still cannot answer button-level questions.

## Consequences

- Adding a capability means adding a permission string, a route entry in
  `navAccessConsistency.ts`, and the matching policy or RPC — three edits, one test that catches
  the common miss.
- The consistency test verifies sidebar ↔ route agreement only. It cannot prove the RLS policy
  matches the UI intent; that stays a human review question.
- `AccessDenied` reveals that a page exists. Accepted: route names are not confidential, and a
  redirect would make support harder.
- Action-grain predicates are pure functions, so `src/test/riskWorkflow.test.ts` can enumerate
  role × state combinations without a browser.
