# Architecture Decision Records (ADRs)

An ADR captures **one significant architectural decision**: the context that forced it, the
option chosen, and the consequences we accepted. ADRs are append-only history — we do not
rewrite an accepted ADR when we change our minds; we write a new one that supersedes it.

## Why we keep them

- Code review answers "is this correct?", ADRs answer "why is it like this at all?".
- New maintainers can reconstruct intent without archaeology through migrations and chat logs.
- Auditors (ISO 31000 / security review) ask for documented rationale on access control and
  data-handling choices. These records are that evidence.

## Index

| ID | Title | Status | Area |
| --- | --- | --- | --- |
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted | Process |
| [0002](./0002-supabase-postgres-as-the-security-boundary.md) | Postgres + RLS is the security boundary | Accepted | Security |
| [0003](./0003-auth-flow-and-account-lockout.md) | Auth flow, session hydration and account lockout | Accepted | Auth |
| [0004](./0004-three-layer-permissions-model.md) | Three-layer permissions model with a separate `user_roles` table | Accepted | Access control |
| [0005](./0005-orthogonal-risk-state-machines.md) | Orthogonal risk lifecycle and approval state machines | Accepted | Domain |
| [0006](./0006-workflow-transitions-via-security-definer-rpc.md) | Workflow transitions run in one `SECURITY DEFINER` RPC | Accepted | Domain / Security |
| [0007](./0007-lookup-tables-over-postgres-enums.md) | Lookup tables (categories, departments) over hand-edited enums | Accepted | Data model |
| [0008](./0008-domain-schema-and-normalization.md) | Postgres schema shape for risks, incidents, whistleblowing and continuity | Accepted | Data model |
| [0009](./0009-authorization-guardrails.md) | Authorization guardrails from navigation down to individual buttons | Accepted | Access control / Security |
| [0010](./0010-audit-logging-and-evidence-retention.md) | Audit logging, evidence retention and who-did-what traceability | Accepted | Security / Compliance |
| [0011](./0011-notification-generation-and-delivery.md) | Notification generation and delivery from risk state transitions | Accepted | Domain / Integration |

## Status values

- **Proposed** — under discussion, not yet built.
- **Accepted** — in force; the codebase reflects it.
- **Superseded by ADR-NNNN** — replaced; kept for history.
- **Deprecated** — no longer applies, nothing replaced it.

## Writing a new ADR

1. Copy [`template.md`](./template.md) to `NNNN-kebab-case-title.md`, next free number.
2. Fill in Context / Decision / Consequences. Keep it to one page — link to
   `docs/architecture.md` for the implementation detail rather than duplicating it.
3. Add a row to the index above in the same pull request.
4. Changing an existing decision? Write a new ADR, set the old one's status to
   *Superseded by ADR-NNNN*, and link both ways.
