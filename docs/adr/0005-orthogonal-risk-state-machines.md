# ADR-0005: Orthogonal risk lifecycle and approval state machines

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, RMD
- **Area:** Domain

## Context

ISO 31000 describes a risk's *lifecycle* — identified, assessed, treated, mitigated, or
crystallised into an incident. Governance separately requires a *review and approval* trail:
who submitted an entry, who claimed it for review, who approved or returned it. Both were
initially squeezed into a single `risks.status` column, which produced impossible questions:
is a "Returned" risk still "In Review"? What happens to an approved risk that is later
escalated? Every new governance requirement forced another status value and another special
case in the register filters.

Diagrams: [`risk-lifecycle.mmd`](../diagrams/risk-lifecycle.mmd),
[`risk-approval.mmd`](../diagrams/risk-approval.mmd).

## Decision

Two independent columns on `risks`, modelled together in `src/lib/riskWorkflow.ts`:

- **`risks.status`** (`RiskStatus`) — the ISO 31000 lifecycle: `Draft → Submitted → Approved →
  New → In Review → Mitigated`, plus `Escalated` (reversible by ADMIN/CRO/RMD) and
  `Crystallized` (terminal, created alongside a `risk_events` row). `Mitigated` and
  `Crystallized` are terminal and block escalation.
- **`risks.approval_status`** (`ApprovalStatus`) — the governance pipeline: `Draft → Submitted →
  Under Review → Approved`, with `Returned` feeding back into `Submitted`.

Authority for each action is a single pure function, `canPerformWorkflowAction(action,
approvalStatus, role, { lifecycleStatus, isSubmitter, hasReviewer })`, so the UI, the tests
(`src/test/riskWorkflow.test.ts`) and the server rules describe the same transitions. Two
behaviours are deliberate: `review` claims the item for one reviewer (`hasReviewer` lock) so two
people cannot work it in parallel, and `return` restores `pre_submission_status` instead of
guessing a lifecycle state.

## Alternatives considered

- **One combined status enum** — rejected: the product of the two axes is large, and most
  combinations are meaningless, so filters and badges become special-case soup.
- **A separate `risk_approvals` table as the source of truth** — rejected for the current
  scale: the register lists thousands of risks and would need a join or a denormalised column
  on every query anyway. `approval_history` still records the audit trail.
- **Free-text status** — rejected: no ISO 31000 vocabulary enforcement, no safe filtering.

## Consequences

- Two columns must be kept coherent; that coherence is centralised in the transition RPC
  ([ADR-0006](./0006-workflow-transitions-via-security-definer-rpc.md)), not in components.
- Register queries and dashboards must be explicit about which axis they filter on — a common
  review comment.
- Adding a state means updating the enum, `VALID_RISK_STATUSES`, `canPerformWorkflowAction`,
  the badge variants, and the `.mmd` diagrams. The lint (`npm run lint:iso`) guards vocabulary.
