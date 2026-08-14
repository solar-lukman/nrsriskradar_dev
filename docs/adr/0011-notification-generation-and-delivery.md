# ADR-0011: Notification generation and delivery from risk state transitions

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, RMD, CRO
- **Area:** Domain / Integration

## Context

Almost every obligation in the portal is time- or event-bound: a submitted risk needs a
reviewer, a returned risk needs its author, an overdue treatment task needs escalation, a BCP
test date passes. Users do not sit in the app waiting for these; RMD asked for "tell me, don't
make me look".

The constraint is the same one that shapes everything else here: there is no application server.
A Vite SPA talking straight to PostgREST cannot be trusted to emit notifications — if the client
inserts the notification row after the update, a crafted request (or a closed laptop) skips it
entirely, and the recipient is often *not* the person who made the change, so their session
cannot be the trigger. Delivery must also survive an air-gapped on-prem install with no outbound
SMTP.

## Decision

**Notifications are produced by database triggers on the state change itself, never by the
client.** The transition and its notification commit in the same transaction, so a notification
exists if and only if the change happened.

- `notify_risk_update()` on `risks` — lifecycle status changes, owner/assignee changes.
- `notify_approval_status_change()` on `risks.approval_status` — submit / claim / approve /
  return, fired by `apply_workflow_transition()`
  ([ADR-0006](./0006-workflow-transitions-via-security-definer-rpc.md)).
- `notify_bcp_change()` and `notify_document_upload()` for continuity and the document vault.
- Time-based events have no row change to hang a trigger on, so they come from the
  `check-deadlines` edge function on a daily `pg_cron` schedule (7-day warnings, overdue tasks,
  BCP review dates). Scheduled reports and appetite rescans follow the same pattern.

**One choke point writes the row.** Every producer calls the `SECURITY DEFINER` function
`send_notification(user_id, title, message, type, category, resource_type, resource_id,
metadata)`. Recipients are resolved *inside* the database from `risks.owner_id`,
`assigned_to_id`, `current_reviewer_id`, `submitted_by` and role membership via `has_role()` —
never from a list passed in by a caller. `notifications` grants no `INSERT` to application roles;
users may only read their own rows and flip `is_read`.

**Every notification is addressable.** `resource_type` + `resource_id` are mandatory, and the
UI turns them into a deep link (`/risk-register?risk=<id>`, `/incidents?incident=<id>`). A
notification that cannot be clicked through to the thing it describes is treated as a bug.

**In-app is the primary channel; email is a projection of it.** The client subscribes to
Postgres changes on `notifications` filtered by `user_id`, so the bell updates live without
polling. Email is delivered out-of-band by the `send-notification-email` edge function reading
the same rows — so an on-prem install with no mail relay degrades to a fully functional in-app
inbox rather than losing the event.

**Preferences are enforced at delivery, not at generation.** `notification_preferences` holds
per-category in-app and email switches plus quiet hours. The row is always written; the *fan-out*
respects the preference. This keeps history complete (an auditor can still see that the
notification was raised) and lets a user who re-enables a category see what they missed.

**Operational noise expires, compliance evidence does not.** `notifications` carries
`expires_at`; the durable trail lives in `risk_audit_logs`, `approval_history` and
`system_audit_logs` ([ADR-0010](./0010-audit-logging-and-evidence-retention.md)). Notifications
are a delivery mechanism, never the record of what happened.

## Alternatives considered

- **Emit from React after a successful mutation** — rejected: bypassable, invisible to
  server-side and scheduled changes, and the recipient usually has no session open.
- **Email as the primary channel** — rejected: undeliverable in air-gapped deployments, no read
  state, and no way to render the approval inbox from an inbox.
- **A message broker / outbox worker** — rejected: another service to operate on-prem for a
  volume that Postgres triggers and one cron'd function handle comfortably.
- **Polling the notifications table every N seconds** — rejected: realtime already exists and
  polling multiplies load by the number of open dashboards.
- **Suppressing the row when a preference is off** — rejected: it makes "did the system tell
  anyone?" unanswerable after the fact.

## Consequences

- Notification logic lives in SQL, which is less familiar than TSX; every new trigger needs a
  test that the row lands with the right `resource_id`.
- Bulk operations (imports, sample-data seeding, appetite rescans) can generate large fan-outs;
  importers should batch or suppress deliberately rather than discovering it in production.
- Recipient resolution is duplicated across trigger functions — consolidating it into one
  resolver is open follow-up work.
- Quiet hours delay email but not the in-app row, so the bell can be ahead of the inbox by
  design.
- Because emails are sent by a separate function, a mail outage is invisible in the app; delivery
  state has to be read from the function's logs.
