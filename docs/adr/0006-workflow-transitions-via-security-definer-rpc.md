# ADR-0006: Workflow transitions run in one `SECURITY DEFINER` RPC

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, CRO
- **Area:** Domain / Security

## Context

Approving a risk is not one write. It updates `risks.status` and `risks.approval_status`,
enforces the reviewer claim-lock, restores `pre_submission_status` on a return, and appends an
`approval_history` entry. When the client performed these as separate PostgREST calls we saw
three failure modes: partial application after a dropped connection (a status change with no
audit entry), two reviewers claiming the same item in a race, and the need for broad `UPDATE`
grants on `risks` so the browser could write status columns directly — grants that a determined
user could aim at any column.

## Decision

All transitions go through a single database function, `apply_workflow_transition(p_risk_id,
p_action, p_reason)`, declared `SECURITY DEFINER` with a pinned `search_path`. It re-checks
authority server-side (mirroring `canPerformWorkflowAction`), performs the claim-lock check,
updates both status columns and writes the history row in one transaction, and returns the
resulting `{status, approval_status, action}`.

The client wrapper is `applyRiskWorkflowTransition()` in `src/lib/riskWorkflow.ts`. It surfaces
tagged errors — notably `CLAIM_CONFLICT: …` when another reviewer got there first — so the UI
can show a specific message instead of a generic failure. Direct `UPDATE` on the workflow
columns is not granted to `authenticated`.

## Alternatives considered

- **Client-side multi-step writes with optimistic UI** — rejected: the partial-write and race
  conditions above are exactly what we observed in practice.
- **An edge function** — rejected: it would need elevated credentials and a network hop to do
  what the database can do transactionally; the RPC keeps the rule next to the data.
- **A row-level advisory lock taken from the client** — rejected: relies on the client behaving.

## Consequences

- Authority rules exist twice — TypeScript for the UI, PL/pgSQL for enforcement. They must be
  changed together; `src/test/riskWorkflow.test.ts` covers the client half and reviewers check
  the RPC diff alongside it.
- Debugging a rejected transition means reading the function, not the network tab.
- New workflow actions require a migration, not just a frontend change — deliberate friction on
  a governance-critical path.
