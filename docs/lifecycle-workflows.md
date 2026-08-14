# NRS Risk Management Portal — Lifecycle Workflows

This document describes the end-to-end lifecycle for each managed entity in the portal: **Risks** (Institutional and Compliance), **Business Continuity Plans (BCP)**, and **Whistle-blowing Cases**. It is the single source of truth for status transitions, role responsibilities, and audit expectations.

For the normative per-state checklist — allowed transitions, guards and required fields for risks, incidents, whistleblowing and BCP, with state diagrams for each — see [`state-transition-spec.md`](./state-transition-spec.md).

---

## 1. Risk Lifecycle (Institutional & Compliance)

Risks follow two parallel state machines:

- **`status`** — the lifecycle state of the risk itself (Draft → … → Mitigated/Crystallized).
- **`approval_status`** — the governance/approval pipeline (Draft → Submitted → Under Review → Approved/Returned).

Both are persisted on the `risks` table and updated atomically through the `apply_workflow_transition` RPC. Every transition writes an entry to `approval_history` and `risk_history` for audit.

### 1.1 Roles

| Role | Code | Lifecycle Responsibility |
|------|------|--------------------------|
| Risk Champion | RC | Identifies and drafts risks in their department |
| Risk Owner | RO | Owns the risk; maintains controls and treatment |
| Risk Reviewer | RR | Claims submitted risks for first-pass review |
| Risk Management Dept. | RMD | Power-user: review, approve, escalate |
| Supervisor | SUPERVISOR | Final approver for departmental risks |
| Chief Risk Officer | CRO | Approves/escalates enterprise-wide risks |
| Admin | ADMIN | Override on any transition |

### 1.2 Stages

| Stage | `status` | `approval_status` | Description |
|-------|----------|-------------------|-------------|
| 1. Draft | `Draft` | `Draft` | Created via the **4-step Risk Wizard**. Editable by submitter. |
| 2. Submitted | `Submitted` | `Submitted` | Submitter sends for review. Core fields lock. |
| 3. Under Review | `Submitted` | `Under Review` | A reviewer **claims** the risk (claim-lock prevents conflicts). |
| 4. Returned | restored to pre-submission | `Returned` | Reviewer returns with mandatory comments; submitter revises and resubmits. |
| 5. Approved | `Approved` → `New` | `Approved` | Risk enters the active register and is available for treatment. |
| 6. In Review (periodic) | `In Review` | `Approved` | Triggered by the periodic review cadence (`review_frequency`). |
| 7. Mitigated | `Mitigated` | `Approved` | All linked mitigation tasks complete and residual rating ≤ appetite. |
| 8. Escalated | `Escalated` | — | Raised to executive attention; reason is required. De-escalation restricted to ADMIN/CRO/RMD. |
| 9. Crystallized (terminal) | `Crystallized` | — | The risk has materialized — logged via the **Report Crystallized** dialog and creates a linked Incident. |

### 1.3 Allowed Transitions

```
Draft ──submit──▶ Submitted ──review──▶ Under Review ──approve──▶ Approved (New)
  ▲                  │  │                    │                         │
  │                  │  └──withdraw──────────┘                         │
  │                  └──return──┐                                      │
  └──────────────────── Returned ◀──return──┘                          │
                                                                       │
            ┌──────────────────────────────────────────────────────────┤
            ▼                                                          │
        In Review (periodic) ──treatment complete──▶ Mitigated         │
            │                                                          │
            └──escalate──▶ Escalated ──deescalate──▶ Approved          │
                                                                       │
                                          materialized ──▶ Crystallized
```

### 1.4 Action Permissions (`canPerformWorkflowAction`)

| Action | Allowed Roles | Pre-conditions |
|--------|---------------|----------------|
| `submit` | RC, RO, RMD, ADMIN | `approval_status` ∈ {Draft, Returned} |
| `review` (claim) | RR, RMD, CRO, ADMIN | `approval_status = Submitted` |
| `approve` | SUPERVISOR, CRO, RMD, ADMIN | Submitted or Under Review |
| `return` | RR, RMD, CRO, ADMIN, SUPERVISOR | Submitted or Under Review; comment required |
| `withdraw` | Submitter or ADMIN | Submitted **and** no reviewer claimed |
| `escalate` | SUPERVISOR, CRO, RMD, ADMIN | Not Approved/Mitigated/Crystallized; reason required |
| `deescalate` | ADMIN, CRO, RMD | Lifecycle = Escalated; reason required |
| `report crystallized` | RO, RMD, CRO, ADMIN | Approved; opens incident dialog |

### 1.5 Compliance vs. Institutional Risks

Both risk types share the same workflow. The differentiator is `risks.risk_type`:
- **Institutional** — strategic/operational/financial; mapped to a Strategic Objective.
- **Compliance** — regulatory/legal; usually requires evidence attachments in the Document Vault and may auto-flag for audit (`flagged_for_audit = true`).

Compliance risks typically have shorter `review_frequency` and require a CRO approver rather than a departmental Supervisor.

### 1.6 Audit & Notifications

- Every transition appends to `approval_history` (who, when, action, reason, prior status).
- The `risk_history` trigger captures field-level diffs for ISO 31000 evidence.
- Notifications are emitted to the next responsible role at each transition (e.g., reviewers on submit, submitter on return).

---

## 2. Business Continuity Plan (BCP) Lifecycle

BCPs follow two independent dimensions:

- **`status`** — readiness state of the plan document.
- **`test_status`** — outcome of the most recent BCP test/drill.

Managed by **Critical Department Heads** (own the plan), with **RMD** for oversight and **CRO/ADMIN** for sign-off.

### 2.1 Plan Status

| Status | Meaning | Typical Trigger |
|--------|---------|-----------------|
| `Needs Review` | Newly created or due for periodic refresh | New BCP, or `next_review_date` reached |
| `Ready` | Reviewed, approved, and current | RMD/CRO sign-off after BIA refresh |
| `Outdated` | Past due review or fails post-test validation | Missed review SLA or failed test |

### 2.2 Test Status

| Status | Meaning |
|--------|---------|
| `Not Tested` | New plan or no test logged yet |
| `Passed` | Most recent drill met all RTO/RPO targets |
| `Failed` | Drill missed targets — triggers remediation tasks |
| `Overdue` | Test cadence exceeded without a new drill |

### 2.3 Lifecycle Stages

1. **Create** — Department Head adds a plan via **Add BCP** dialog. Captures scope, RTO, RPO, dependencies, owner. Initial state: `Needs Review` / `Not Tested`.
2. **BIA (Business Impact Assessment)** — Complete the BIA section: critical processes, financial/operational impact, recovery resources.
3. **Review & Approve** — RMD reviews completeness; CRO/ADMIN sets `status = Ready`.
4. **Test (Drill)** — Department Head runs a drill, records results in **Test Details**. Test status updates to `Passed` or `Failed`.
5. **Remediation** (if failed) — Tasks created against the plan; status reverts to `Needs Review` until passed.
6. **Periodic Review** — On `next_review_date`, the system flags the plan `Needs Review`. Untreated plans become `Outdated` after the SLA.
7. **Retire** — Plans no longer applicable are archived (soft-delete) with reason and audit entry.

### 2.4 Roles

| Role | Permissions |
|------|-------------|
| Critical Department Head | Create, edit, run tests on **own** plans |
| RMD | Edit any plan; coordinate enterprise-wide drills |
| CRO / ADMIN | Approve `Ready` status; archive |
| Executives (EC, Risk Committee) | View-only via BCP dashboard and BIA Summary widget |

### 2.5 Audit & Exports

- Every plan edit and test result writes to `system_audit_logs`.
- The **Export BCP** menu generates CSV/PDF for compliance evidence.
- The **BIA Summary widget** on the dashboard surfaces gaps (missing RTOs, untested plans).

---

## 3. Whistle-blowing Case Lifecycle

Whistle-blowing cases preserve **reporter anonymity** while giving authorized investigators a controlled workflow. Cases live in `whistleblow_cases`; messages, audit, and attachments live in dedicated child tables. All reporter interaction happens on **public, unauthenticated routes** (`/whistleblow`, `/whistleblow/status`) authenticated by **case reference + passphrase**.

### 3.1 Roles

| Role | Permissions |
|------|-------------|
| Anonymous Reporter | Submit a case, follow up via reference + passphrase, exchange messages |
| RMD / CRO / ADMIN | Investigation Workspace: triage, assign, message reporter, change status, escalate, resolve |
| Executive Chairman / Risk Committee | Read-only access to escalated/resolved cases |

### 3.2 Statuses

| Status | Meaning |
|--------|---------|
| `Submitted` | Case created by reporter; awaiting triage |
| `Under Review` | Investigator is performing initial assessment |
| `Investigation` | Active investigation ongoing |
| `Escalated` | Raised to executive level; requires reason and assignee |
| `Resolved` | Outcome determined; resolution summary recorded and shared with reporter |
| `Closed` | Final state after resolution acceptance |
| `Dismissed` | Determined unfounded after review; reason logged |

### 3.3 Lifecycle Stages

1. **Submit** — Reporter completes the public form (`/whistleblow`). The `whistleblow-submit` edge function creates the case, generates a unique **case reference**, hashes the **passphrase**, and returns both to the reporter (shown once).
2. **Acknowledgement** — System auto-confirms submission. Audit log records `case_submitted`.
3. **Triage (Under Review)** — RMD/CRO opens the Investigation Workspace, sets `assigned_to`, optionally raises priority. Status moves to `Under Review`.
4. **Investigation** — Investigator gathers evidence, exchanges anonymous messages with the reporter via `whistleblow_messages`, attaches internal notes. Status `Investigation`.
5. **Escalate (optional)** — If misconduct involves senior personnel or breaches a threshold, status moves to `Escalated` (reason required). Notifies CRO and Risk Committee.
6. **Resolve** — Investigator records a `resolution_summary` and `resolution_date`; status set to `Resolved`. The summary becomes visible to the reporter via the follow-up portal.
7. **Close** — After reporter acknowledgement window, RMD sets status to `Closed`. Case archived but retained for audit retention period.
8. **Dismiss** (alternate terminal) — If unfounded, status `Dismissed` with documented rationale.

### 3.4 Anonymity Guarantees

- Reporter identity is **never stored**. Only `reporter_passphrase_hash` (salted with service-role key prefix) is kept to authenticate follow-up.
- The `whistleblow-follow-up` edge function returns sanitized data only — investigator identities are hidden behind the label "Investigation Team".
- All access by investigators is logged in `whistleblow_audit_log`.

### 3.5 Communication Channel

- Two-way messaging via `whistleblow_messages` (`sender_type` = `reporter` | `investigator`).
- Reporter messages auto-notify the assigned investigator.
- Investigator messages appear to the reporter as "Investigation Team".

### 3.6 Audit Trail

Every status change, assignment, message, and escalation writes to `whistleblow_audit_log`. The reporter's follow-up view shows a sanitized timeline (`case_submitted`, `status_changed`, `case_escalated`, `case_resolved`).

---

## 4. Incident Lifecycle

Incidents capture **materialized risk events** — anything from operational disruptions and control failures to crystallized risks reported via the Risk Register. Records live in the `risk_events` table; field-level audit is handled by the `trg_risk_events_audit` trigger which writes diffs to `system_audit_logs`.

### 4.1 Roles

| Role | Code | Incident Responsibility |
|------|------|--------------------------|
| Any authenticated user | — | Report a new incident (Dashboard quick action or `/incidents`) |
| Risk Owner / Risk Champion | RO, RC | Provide context, root cause input on incidents in their department |
| Risk Reviewer | RR | Investigate, update status, capture impacts |
| Risk Management Dept. | RMD | Coordinate investigation, assign owners, validate root cause |
| Supervisor / CRO / ADMIN | — | Approve closure, set final risk posture, sign off lessons learned |

### 4.2 Statuses (`risk_events.status`)

| Status | Meaning |
|--------|---------|
| `Open` | Newly reported; awaiting triage |
| `Under Investigation` | Assigned investigator is gathering facts, root cause, and impact data |
| `Resolved` | Containment and corrective actions complete; `resolution_date` and `resolved_at` auto-stamped |
| `Closed` | Final review complete; lessons learned recorded; risk posture set to `Stable` |

Severity is tracked separately on the `severity` field: `Low`, `Medium`, `High`, `Critical`.

### 4.3 Lifecycle Stages

1. **Report** — Created via the **Report Incident** quick action on the main Dashboard or **Add Incident** on `/incidents`. Required fields: title, event date, discovered date, description, severity, status (defaults to `Open`). The `reported_by` field is auto-stamped with the current user.
2. **Triage** — RMD/RR opens the incident from the dashboard table (rows are click-to-edit for authorized roles), assigns an investigator, and moves status to `Under Investigation`.
3. **Investigate** — Investigator records **root cause**, **financial impact**, **operational impact**, and links to any parent risk (for crystallized events). Updates are tracked field-by-field in the **History** tab via the audit trigger.
4. **Resolve** — When containment and corrective actions are complete, status is set to `Resolved`. The system automatically stamps `resolution_date` (date) and `resolved_at` (timestamp) for resolution-time KPIs.
5. **Close** — RMD/CRO performs final review, captures **lessons learned**, sets risk posture to `Stable`, and moves status to `Closed`. The incident is now archived but remains queryable for trend analysis and board reporting.

### 4.4 Crystallized Risk → Incident Linkage

When a risk is reported as **Crystallized** via the Report Crystallized dialog (Section 1.4), the system automatically creates a linked incident in `risk_events` with the parent `risk_id` populated. This preserves the chain of custody between predicted risk and realized event for ISO 31000 evidence.

### 4.5 Audit, Timeline & Exports

- **Field-level audit** — The `log_risk_event_audit` trigger captures every `INSERT`, `UPDATE`, and `DELETE`, computing before/after diffs for `status`, `severity`, `financial_impact`, `risk_posture`, and other key fields.
- **Incident Timeline** — The `IncidentTimeline` component (History tab in the edit dialog) renders the audit trail with author, timestamp, and changed fields.
- **Exports** — The `ExportIncidentsMenu` allows compliance exports of the filtered incident list (CSV/PDF) and individual incident detail PDFs.
- **Notifications** — Status transitions notify the assigned investigator and risk owner.

### 4.6 Permissions

Reading incidents is open to all authenticated users for transparency. Editing (status changes, root cause, impacts) is restricted to **RR, RC, RO, RMD, CRO, SUPERVISOR, and ADMIN** roles via RLS on `risk_events`.

---

## 5. Cross-Module Touchpoints

| Event | Triggers |
|-------|----------|
| Risk approved | Adds to active register, dashboards, exports |
| Risk crystallized | Auto-creates an Incident in `risk_events`; opens incident workflow |
| Incident resolved | Stamps `resolution_date` / `resolved_at` for KPIs |
| BCP failed test | Creates remediation tasks; risk may be raised against affected processes |
| Whistle-blowing case escalated | Notifies CRO + Risk Committee; may spawn a linked Compliance risk |
| Any transition | Writes to `system_audit_logs` and emits notifications |

---

## 6. References

- `src/lib/riskWorkflow.ts` — risk workflow state machine and permission matrix
- `src/components/risk-register/RiskWorkflowActions.tsx` — UI for risk transitions
- `src/components/risk-register/ReportCrystallizedDialog.tsx` — terminal Crystallized step
- `src/components/incidents/AddIncidentDialog.tsx` — incident create/edit dialog with status flow
- `src/components/incidents/IncidentTimeline.tsx` — audit history rendering
- `src/components/incidents/ExportIncidentsMenu.tsx` — compliance exports (CSV/PDF)
- `src/pages/IncidentsDashboard.tsx` — incident list, filters, and click-to-edit table
- `src/components/bcp/AddBCPDialog.tsx`, `EditBCPDialog.tsx` — BCP status fields
- `src/pages/WhistleblowCaseDetail.tsx` — investigator workspace and status transitions
- `supabase/functions/whistleblow-submit/index.ts`, `whistleblow-follow-up/index.ts` — anonymous endpoints
- `docs/whistleblowing-user-guide.md` — reporter-facing guidance
- `docs/state-transition-spec.md` — per-state transitions, guards and required fields
- `docs/diagrams/incident-lifecycle.mmd`, `whistleblow-lifecycle.mmd`, `bcp-lifecycle.mmd` — state diagrams
