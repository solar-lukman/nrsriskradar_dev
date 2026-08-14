# State Transition Specification

Normative, per-state reference for every managed entity: **allowed transitions**, **guards**
(who may act and what must be true), and **required fields** at each state. Narrative context
lives in [`lifecycle-workflows.md`](./lifecycle-workflows.md); this file is the checklist a
reviewer or implementer works from.

Diagrams (Mermaid sources, rendered in the in-app docs viewer):

- [`diagrams/risk-lifecycle.mmd`](./diagrams/risk-lifecycle.mmd) — `risks.status`
- [`diagrams/risk-approval.mmd`](./diagrams/risk-approval.mmd) — `risks.approval_status`
- [`diagrams/incident-lifecycle.mmd`](./diagrams/incident-lifecycle.mmd) — `risk_events.status`
- [`diagrams/whistleblow-lifecycle.mmd`](./diagrams/whistleblow-lifecycle.mmd) — `whistleblow_cases.status`
- [`diagrams/bcp-lifecycle.mmd`](./diagrams/bcp-lifecycle.mmd) — `bcp_status` × `test_status`

**Rule:** every guard listed here has a server-side counterpart (RLS policy, `SECURITY DEFINER`
RPC, or `BEFORE` trigger). Client-side gating is convenience only — see
[ADR-0009](./adr/0009-authorization-guardrails.md).

---

## 1. Risk — approval pipeline (`risks.approval_status`)

Authority: `canPerformWorkflowAction()` in `src/lib/riskWorkflow.ts`, mirrored server-side by
`apply_workflow_transition()`.

| State | Allowed transitions | Guards | Required fields before leaving the state |
|-------|--------------------|--------|------------------------------------------|
| `Draft` | → `Submitted` (`submit`) | Role ∈ RC, RO, RMD, ADMIN | title, description, category, risk_type, department, owner_id, inherent_likelihood, inherent_impact, residual_likelihood, residual_impact |
| `Submitted` | → `Under Review` (`review`)<br/>→ `Approved` (`approve`)<br/>→ `Returned` (`return`)<br/>→ `Draft` (`withdraw`) | `review`: RR, RMD, CRO, ADMIN — claim-lock sets `current_reviewer_id`, second claimant gets `CLAIM_CONFLICT`<br/>`approve`: RR, SUPERVISOR, CRO, RMD, ADMIN<br/>`return`: reviewers or approvers<br/>`withdraw`: submitter or ADMIN **and** `current_reviewer_id IS NULL` | `approve`/`return`: comment ≥ 5 chars (`last_review_comment`) |
| `Under Review` | → `Approved` (`approve`)<br/>→ `Returned` (`return`) | Same role sets as above; withdraw is no longer available | comment ≥ 5 chars |
| `Returned` | → `Submitted` (`submit`) | Role ∈ RC, RO, RMD, ADMIN | Lifecycle status restored from `pre_submission_status`; author must address `last_review_comment` |
| `Approved` | terminal for the pipeline | — | `approved_at`, `approved_by` stamped by the RPC |

Every transition appends to `approval_history` (`action`, `from_status`, `to_status`,
`actor_id`, `actor_role`, `comments`).

## 2. Risk — lifecycle (`risks.status`)

| State | Allowed transitions | Guards | Required fields |
|-------|--------------------|--------|-----------------|
| `Draft` | → `Submitted` | Wizard step 4 completed | See pipeline `Draft` row |
| `Submitted` | → `Approved`, → `Draft`, → `Escalated` | Mirrors the approval pipeline | — |
| `Approved` → `New` | → `In Review` | Automatic on approval; entering the active register | review_date / review_frequency |
| `New` | → `In Review`, → `Crystallized` | Assessment started, or a risk event is reported | — |
| `In Review` | → `Mitigated`, → `Escalated`, → `Crystallized` | `Mitigated` requires all `risk_mitigation_tasks` in `Completed`; `escalate` requires reason ≥ 5 chars | treatment_strategy, mitigation_plan, treatment_owner_id, residual scores |
| `Escalated` | → `In Review` (`deescalate`) | Role ∈ ADMIN, CRO, RMD; reason required | escalation reason in `approval_history` |
| `Mitigated` | terminal | `escalate` blocked | post-control assessment (`post_control_likelihood/impact`, assessed_by/at) |
| `Crystallized` | terminal | Created via **Report Crystallized** dialog | `crystallized_at`, `actual_impact_amount`, linked `risk_events` row |

Appetite guard: `enforce_risk_appetite()` runs `BEFORE INSERT OR UPDATE` and applies the
configured escalation action when the residual score breaches `risk_appetite_config`.

## 3. Incident (`risk_events.status`)

| State | Allowed transitions | Guards | Required fields |
|-------|--------------------|--------|-----------------|
| `Open` | → `Under Investigation`, → `Resolved` | Create: any authenticated user. Triage: RR, RMD, RO, ADMIN | title, event_date, discovered_date, event_description, severity; `reference_number` assigned by `assign_risk_event_reference()`; `reported_by` auto-stamped |
| `Under Investigation` | → `Resolved`, back to `Open` (re-triage) | `owner_id` must be set before moving on | root_cause, financial_impact (+ currency), operational_impact, immediate_response |
| `Resolved` | → `Closed`, → `Under Investigation` (reopen) | Root cause and `corrective_actions` non-empty | resolution_notes, resolution_date, resolved_at |
| `Closed` | terminal | Sign-off by SUPERVISOR, CRO, RMD, ADMIN | lessons_learned, risk_posture |

`risk_id` is nullable by design (an incident may precede the registered risk) but is mandatory
for events created from a crystallized risk. Field-level diffs are written by
`log_risk_event_audit()`.

## 4. Whistleblowing case (`whistleblow_cases.status`)

Reporter-side transitions run through the `whistleblow-submit` / `whistleblow-follow-up` edge
functions using the service role — never the browser client.

| State | Allowed transitions | Guards | Required fields |
|-------|--------------------|--------|-----------------|
| `Submitted` | → `Under Review`, → `Dismissed` | Intake: unauthenticated + Turnstile + `check_whistleblow_rate_limit()` | category, subject, description; server-generated `case_reference`, `follow_up_token`, `reporter_passphrase_hash` |
| `Under Review` | → `Investigation`, → `Dismissed` | Role ∈ RMD, CRO, ADMIN | assigned_to, assigned_at, priority |
| `Investigation` | → `Escalated`, → `Resolved` | Assigned investigator or RMD/CRO/ADMIN | evidence_description, individuals_involved, incident/location details where known |
| `Escalated` | → `Resolved` | Reason logged to `whistleblow_audit_log`; notifies CRO + Risk Committee | escalation reason, assignee |
| `Resolved` | → `Closed` | `resolution_notes` non-empty | resolution_notes, resolved_at |
| `Dismissed` | terminal | Documented rationale required | resolution_notes (rationale) |
| `Closed` | terminal | RMD/ADMIN after the acknowledgement window | — |

Invariants: reporter identity is never persisted for anonymous cases; SLA flags
(`flagged_unassigned` > 14 days, `flagged_stagnant` > 60 days) are derived, not user-set.

## 5. Business continuity plan

Two orthogonal dimensions on `business_continuity_plans`.

### 5.1 `status` (`bcp_status`)

`status` is **rule-driven**: the `derive_bcp_status()` `BEFORE INSERT OR UPDATE` trigger
recomputes it on every save (including saves cascaded by `sync_bcp_plan_from_tests()`), so the
wizard renders the field read-only with the derivation reason. Precedence:

1. latest test `Failed` → `Needs Review`
2. BIA incomplete → `Needs Review`
3. `test_status = 'Overdue'` or `next_test_date < today` → `Outdated`
4. no `signed_off_at` → `Needs Review`
5. `test_status <> 'Passed'` → `Needs Review`
6. otherwise → `Ready`

Sign-off (`signed_off_by` / `signed_off_at`) is restricted to RMD, CRO and ADMIN and is
automatically revoked when a later change breaks BIA completeness or records a failed test.

**Override:** ADMIN and CRO only, via `status_override` + a mandatory
`status_override_reason` (stamped with `status_override_by` / `status_override_at`). While the
override is on, the derivation is skipped; clearing it re-derives on the next save. The client
mirror of these rules lives in `src/lib/bcpStatus.ts` (preview only — the trigger is the
authority).

| State | Allowed transitions | Guards | Required fields |
|-------|--------------------|--------|-----------------|
| `Needs Review` | → `Ready`, → `Outdated` | `Ready` requires RMD/CRO/ADMIN sign-off, a complete BIA and a passed test | title, department, business_function, owner_id, recovery_time_objective, recovery_point_objective, dependencies |
| `Ready` | → `Needs Review`, → `Outdated` | Reverts on a failed test, a broken BIA, or a lapsed `next_test_date` | last_updated_date, next_test_date |
| `Outdated` | → `Needs Review`, → `Ready` | New test logged / plan refreshed | updated BIA + test dates |


BIA completeness = `bia_criticality_rating`, `bia_financial_impact`, `bia_operational_impact`,
`bia_reputational_impact`, `bia_regulatory_impact`, `bia_max_tolerable_downtime`,
`bia_assessment_date` (defaults to today in the UI).

### 5.2 `test_status`

| State | Allowed transitions | Guards | Required fields |
|-------|--------------------|--------|-----------------|
| `Not Tested` | → `Passed`, → `Failed` | Drill logged by the plan owner or RMD | test_type, test_scope, last_tested_date, test_results |
| `Passed` | → `Overdue`, → `Failed` | `Overdue` when `next_test_date` elapses | next_test_date |
| `Failed` | → `Passed` | Remediation tasks recorded; plan status forced to `Needs Review` | test_findings |
| `Overdue` | → `Passed`, → `Failed` | New drill logged | as per `Not Tested` |

Server guard: `validate_bcp_bia_test_fields()` rejects partial BIA/test payloads; the message is
mapped to inline field errors by `src/lib/bcpServerErrors.ts`. Every change is versioned in
`bcp_version_history` by `record_bcp_version_history()`.
