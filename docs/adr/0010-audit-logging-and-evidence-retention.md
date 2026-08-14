# ADR-0010: Audit logging, evidence retention and who-did-what traceability

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, RMD, CRO
- **Area:** Security / Compliance

## Context

ISO 31000 review and the security assessment both ask the same question of every record: who
changed this, when, from what to what, and can the answer be altered afterwards. The portal
holds board papers, whistleblowing reports and the risk register, so "the app logs it" is not
sufficient — a user with write access to a table must not be able to write or edit its history.

The application is also a Vite SPA talking straight to Postgres. There is no middle tier that
could observe mutations, so any logging performed in React is optional from the database's point
of view: a crafted PostgREST call skips it entirely.

## Decision

**Auditing happens in the database, on triggers, not in the client.**

- Risk mutations → `create_risk_audit_log()` / `log_risk_status_change()` write
  `risk_audit_logs`; full before-state snapshots go to `risk_history.snapshot` (`jsonb`).
- Approval verbs → `log_approval_action()` inside `apply_workflow_transition()`, so the
  transition and its `approval_history` row commit in one transaction
  ([ADR-0006](./0006-workflow-transitions-via-security-definer-rpc.md)).
- Continuity → `create_bcp_audit_log()` plus field-level diffs in `bcp_version_history`
  (`changed_fields`, `before_values`, `after_values`).
- Identity and access → `log_profile_role_change()`, `log_user_role_change()`,
  `user_login_history`, `auth_failed_attempts`, and the general-purpose `log_system_audit()`.
- Whistleblowing → `whistleblow_audit_log`, written by the edge functions that hold the elevated
  privilege; case content itself is never copied into general audit tables.

**Audit tables are append-only by policy.** `risk_audit_logs`, `approval_history`,
`risk_history`, `bcp_audit_logs`, `bcp_version_history`, `system_audit_logs`,
`user_activity_logs`, `user_login_history` and `whistleblow_audit_log` grant no `UPDATE` or
`DELETE` to any application role. Rows arrive only through `SECURITY DEFINER` triggers and
functions, so even the actor cannot rewrite their own trail.

**The actor is taken from `auth.uid()`, never from a client-supplied field.** Where a helper
accepts a `performed_by` argument it exists for edge-function callers that have already verified
the JWT themselves.

**Diffs are `jsonb`, not per-field rows**, so a later column rename or drop leaves history
readable rather than orphaned or migrated-away.

**Evidence is referenced, not inlined.** Attachments live in storage buckets
(`risk-attachments`, `whistleblow-evidence`) with private access and signed URLs;
`risk_attachments` / `whistleblow_attachments` keep the path, size, type, uploader and time.
Deleting a domain row does not silently destroy the file, and the audit row survives the file.

**Retention is deliberate, not incidental.** Operational noise (`notifications`,
`ai_predictions`) carries `expires_at`. Compliance trails have no expiry and no delete path;
they leave the system only through a database backup or the on-prem snapshot export.

**Traceability is a product surface, not a DBA task.** `/audit-logs` exposes system, risk and
BCP history to ADMIN, RMD and CRO with search, column sorting, date-range filters, pagination
and persisted preferences, and each risk exposes its own history in `AuditLogDialog`. An audit
trail nobody can read gets ignored until the auditor arrives.

## Alternatives considered

- **Logging from React before/after each mutation** — rejected: bypassable, and it lies during
  partial failures (log written, write rolled back).
- **Postgres logical decoding / a CDC stream into an external store** — rejected: a second
  system to operate on an air-gapped on-prem host, and the trail would be unavailable in-app.
- **Mutable audit rows with a "corrected by" flag** — rejected: makes tampering a supported
  feature.
- **Storing evidence as bytea in the row** — rejected: bloats the register, breaks the backup
  window, and puts whistleblowing files inside a table other roles may one day be granted.
- **Blanket retention purge after N days** — rejected: ISO 31000 evidence must outlive the risk
  it belongs to.

## Related

- ERDs showing the audit/history tables in context:
  [risk register](../diagrams/erd-risk-register.mmd),
  [incidents](../diagrams/erd-incidents.mmd),
  [whistleblowing](../diagrams/erd-whistleblowing.mmd),
  [business continuity](../diagrams/erd-business-continuity.mmd).
- [Migration playbook](../migration-playbook.md) — why audit tables are never corrected by
  hand-editing rows.

## Consequences

- Audit tables grow without bound; the on-prem runbook must size disk for them, and a defensible
  archival policy is outstanding follow-up work.
- Triggers add write overhead on hot tables (`risks` in particular) — accepted, as the register
  is read-heavy.
- Because triggers fire regardless of caller, bulk operations (imports, sample-data seeding)
  produce large volumes of history; importers should note the batch id in `details`.
- `jsonb` diffs must be rendered defensively — historical rows may reference columns that no
  longer exist.
- Anything that legitimately bypasses RLS (edge functions with elevated privilege) is obliged to
  write its own audit row; there is no trigger to save it.
