# ADR-0008: Postgres schema shape for risks, incidents, whistleblowing and continuity

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, RMD, CRO
- **Area:** Data model

## Context

Four domains share one database: the risk register, incidents (crystallized risk events),
whistleblowing intake, and business continuity planning. They have very different access
profiles — the register is read by most authenticated roles, whistleblowing must be writable by
an *unauthenticated* reporter yet readable by almost nobody — but they must join for reporting
(a whistleblowing case can escalate into a risk; an incident always points back at a risk).

Earlier iterations pushed everything onto `risks` as extra nullable columns (event dates,
BIA fields, evidence blobs). That produced a 90-column table where half the columns were NULL
for any given row, and any RLS change to `risks` silently changed who could read incident data.

Migrations also run twice: against Lovable Cloud, and as a hand-applied delta bundle on an
on-prem Postgres ([`docs/onprem/UPGRADE-RUNBOOK.md`](../onprem/UPGRADE-RUNBOOK.md)). Anything
irreversible or environment-specific in a migration becomes an outage on the on-prem host.

## Decision

**One aggregate root per domain, child tables for anything 1:N.**

- `risks` is the root of the register. Assessments (`risk_assessments`), controls
  (`risk_controls`), treatment tasks (`risk_mitigation_tasks`), files (`risk_attachments`) and
  snapshots (`risk_history`) are child tables keyed by `risk_id`, not JSON columns — they are
  queried, filtered and counted independently.
- `risk_events` is the incident table and holds a **nullable** `risk_id`. Nullable because an
  incident can be reported before anyone has registered the underlying risk; the link is set
  later rather than forcing a placeholder risk row.
- Whistleblowing is a separate island: `whistleblow_cases` plus `whistleblow_messages`,
  `whistleblow_attachments`, `whistleblow_audit_log`. It has **no foreign key to `auth.users`**
  on the reporter side — anonymity is a schema property, not a policy toggle. Reporter identity
  is a `follow_up_token` + passphrase hash, never a user id.
- `business_continuity_plans` keeps BIA and test fields inline (they are strictly 1:1 with the
  plan and always edited together), with change traceability in `bcp_version_history`.

**Normalization stops at the reporting boundary.** Third normal form for anything that is
filtered, joined or aggregated. Deliberate denormalization where a value is a point-in-time
*record* rather than a reference:

- `risks.residual_likelihood/impact` are stored, not derived from the latest assessment — the
  register must show the score that was agreed, even after the matrix is re-tuned.
- `risk_history.snapshot` and `*_audit_log.changes` are `jsonb` on purpose: they must survive
  later schema changes without a migration rewriting history. See
  [ADR-0010](./0010-audit-logging-and-evidence-retention.md).
- `mitigation_actions`, `test_findings`, `steps` are `jsonb` — free-form, never filtered on.

**Lookup tables, not enums, for anything a user administers** (`risk_categories`, `departments`,
`strategic_objectives`) — see [ADR-0007](./0007-lookup-tables-over-postgres-enums.md). Enums
survive only for values the *code* branches on: `risk_status`, `approval_status`, `user_role`,
`bcp_status`, `document_status`, `risk_type`.

**Migration rules** (enforced by `npm run lint:db-safety`):

1. Every `CREATE TABLE public.*` is followed, in the same migration, by `GRANT` → `ENABLE ROW
   LEVEL SECURITY` → policies. A missing `GRANT` is a runtime 403, not a build failure.
2. Additive only in normal operation: add columns nullable or with a default, backfill in a
   second statement, tighten to `NOT NULL` in a later migration. Never `DROP COLUMN` in the same
   release that stops writing it — the on-prem host may still be running the previous build.
3. No `CHECK` constraints on time-dependent expressions (`expire_at > now()`); those are
   `BEFORE INSERT OR UPDATE` triggers such as `validate_bcp_bia_test_fields()`, so restores of
   old data don't fail.
4. Reference numbers come from `number_sequences` via `generate_reference_number()` and triggers
   (`assign_bcp_reference`, `generate_risk_reference`), never from client-side counting.

## Alternatives considered

- **Single wide `risks` table with typed sub-sections** — rejected: unreadable RLS, NULL
  sprawl, and every incident query paid the cost of the register's policies.
- **Whistleblowing in the same tables as risks with an `is_confidential` flag** — rejected
  outright: one policy mistake exposes reporter identity. Physical separation fails closed.
- **Fully normalized audit trail (one row per changed field)** — rejected: joins for every
  history view, and column renames orphan historical rows. `jsonb` diffs keep history readable
  after the schema moves on.
- **Derived scores computed in views** — rejected: re-tuning the scoring matrix would silently
  rewrite historical risk ratings, which an ISO 31000 audit treats as tampering.

## Entity relationship diagrams

Rendered views of the four domains this ADR describes (Mermaid `erDiagram` sources):

- [Risk register](../diagrams/erd-risk-register.mmd) — `risks` aggregate, assessments,
  controls, treatment tasks, templates and the append-only history/approval trail.
- [Incidents](../diagrams/erd-incidents.mmd) — `risk_events`, the nullable link back to
  `risks`, ownership and notification deep-links.
- [Whistleblowing](../diagrams/erd-whistleblowing.mmd) — physically separated case, message,
  attachment and audit tables plus the rate-limit table.
- [Business continuity](../diagrams/erd-business-continuity.mmd) — BCP root with BIA/test
  fields, version history, and the backup/restore/checklist chain.
- [Controls](../diagrams/erd-controls.mmd) — `risk_controls`, the control document repository
  and acknowledgment receipts.
- [Learning forum](../diagrams/erd-learning-forum.mmd) — categories, threaded posts, votes,
  moderation logs and CSDD training modules.
- [Roles & permissions](../diagrams/erd-role-permissions.mmd) — `auth.users` → `profiles` →
  `user_roles` and how policies consume them via `has_role()`.

Procedures for changing any of these tables are in the
[Migration playbook](../migration-playbook.md).

## Consequences

- Cross-domain reporting needs explicit joins (`risk_events.risk_id`), and the nullable link
  means every incident aggregate must handle orphan incidents.
- `jsonb` history columns are not constrained by the schema; readers must tolerate missing keys.
- Adding a column to a domain root means touching the Cloud migration *and* the on-prem delta
  bundle; the runbook's verifier (`999_verify_install.sql`) is what catches drift.
- The register table is still wide (workflow, AI scoring and appetite fields live inline).
  Splitting AI columns into a child table is deliberate follow-up work, not an accident.
