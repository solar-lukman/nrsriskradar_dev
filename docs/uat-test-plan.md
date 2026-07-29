# RiskRadar — User Acceptance Test (UAT) Plan

**Release:** Production Cut-over
**Owner:** Risk Management Department (RMD) with sign-off by CRO / ERMSC
**Standard:** ISO 31000-aligned enterprise risk management platform
**Environment:** UAT tenant seeded with anonymised sample data. Real data must NOT be entered during UAT.

---

## 1. Objectives

1. Confirm the system meets documented functional requirements per persona.
2. Validate ISO 31000 workflow (Identify → Assess → Treat → Monitor → Report) end-to-end.
3. Verify role-based access, data isolation, and audit traceability.
4. Confirm non-functional acceptance: performance, availability, session security, backup, notifications.
5. Formal go/no-go sign-off by RMD, CRO, and IT Security.

## 2. Roles Under Test

| Code | Role | Primary UAT Owner |
|------|------|-------------------|
| RC | Risk Champion | Departmental representative |
| RR | Risk Reviewer | RMD delegate |
| RO | Risk Owner | Line manager |
| RMD | Risk Management Dept | Risk Manager |
| CRO | Chief Risk Officer | CRO |
| ERMSC | ERM Steering Committee | ERMSC Chair |
| EC | Executive Chairman | EC office |
| RCB | Risk Committee (Board) | Board Secretary |
| ADMIN | System Administrator | IT |

Each role must have at least one dedicated UAT test account.

## 3. Entry Criteria

- UAT build deployed and smoke-tested by IT.
- Unit-test suite passes (`bunx vitest run`).
- Sample data loaded (categories, departments, users, appetite config).
- All UAT testers have credentials and have completed 30-min walkthrough.
- Backup and DR runbooks reviewed with IT Operations.

## 4. Exit Criteria

- 100% of Priority-1 test cases pass.
- ≥ 95% of Priority-2 cases pass with agreed workarounds for the rest.
- Zero open Severity-1 defects; ≤ 3 open Severity-2 with an owner and target date.
- Sign-off recorded (Section 10).

---

## 5. Test Case Catalogue

Numbering: `UAT-<Module>-<n>`. Priority: **P1** = blocking, **P2** = important, **P3** = nice-to-have.

### 5.1 Authentication & Access Control

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-AUTH-01 | P1 | Any | Log in with valid credentials | Lands on role-appropriate dashboard within 5s |
| UAT-AUTH-02 | P1 | Any | Log in with wrong password 5× | Account is locked; `admin-invite`/reset flow required |
| UAT-AUTH-03 | P1 | Any | Idle for 5 minutes | Auto-logout occurs, session banner shown |
| UAT-AUTH-04 | P1 | Any | Use "Forgot password" link | Reset email delivered; new password logs in |
| UAT-AUTH-05 | P1 | CRO | Attempt to open `/user-management` | Access Denied page shown |
| UAT-AUTH-06 | P1 | RMD/ADMIN | Open `/user-management` | Page loads with user list |
| UAT-AUTH-07 | P2 | ADMIN | Invite user with role RC | User receives invite email; can complete signup |

### 5.2 Risk Register (Identify + Assess)

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-REG-01 | P1 | RC | Create risk via 4-step wizard | Risk saved as Draft, appears in "My Risks" |
| UAT-REG-02 | P1 | RC | Submit draft risk | Status → Submitted; RR/RMD inbox notified |
| UAT-REG-03 | P1 | RMD | Create risk as RMD | Risk saved successfully (regression: prior submit error) |
| UAT-REG-04 | P1 | Any writer | Category dropdown | Reflects live `risk_categories` table (no stale enum) |
| UAT-REG-05 | P1 | Any writer | Department dropdown | Reflects live `departments` table |
| UAT-REG-06 | P2 | RC | Bulk upload risks (CSV) | Rows validated, invalid rows itemised, valid rows imported |
| UAT-REG-07 | P2 | RC | Upload attachment to a risk | File appears in Risk Document Vault; signed URL opens |
| UAT-REG-08 | P1 | RMD | Batch AI analysis on 5 risks | Scores + rationales stored; no rate-limit crash |

### 5.3 Approvals (Review / Approve / Return / Escalate)

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-APP-01 | P1 | RR | Claim a Submitted risk | Status → Under Review; claim-lock prevents second RR claiming |
| UAT-APP-02 | P1 | CRO | Approve Under Review risk | Status → Approved; approval_history entry recorded |
| UAT-APP-03 | P1 | RR | Return risk with comment | Status → Returned; submitter notified with comment |
| UAT-APP-04 | P1 | RC | Withdraw before RR claims | Status returns to Draft |
| UAT-APP-05 | P1 | RC | Attempt to withdraw after RR claims | Action blocked with explanatory toast |
| UAT-APP-06 | P2 | CRO | Escalate an Approved risk | Status → Escalated; executive users notified |
| UAT-APP-07 | P2 | ADMIN | De-escalate | Status returns to prior lifecycle |

### 5.4 Treatment & Mitigation

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-TRT-01 | P1 | RO | Add mitigation task with budget in NGN | Saved; appears in Mitigation Tasks panel |
| UAT-TRT-02 | P1 | RO | Complete all mitigation tasks | Risk transitions to Mitigated |
| UAT-TRT-03 | P2 | RMD | Request AI mitigation recommendations | Recommendations returned within 30s |
| UAT-TRT-04 | P2 | RO | Budget utilisation crosses 75% / 90% | Colour flips yellow / red; alert generated |

### 5.5 Dashboard, Matrix & Reports

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-DSH-01 | P1 | CRO / RCB | Compare BCP % Coverage on same day | Values match across roles (consistency fix) |
| UAT-DSH-02 | P1 | Any viewer | Click "High Severity" card | Drawer opens filtered to score ≥ 15 |
| UAT-DSH-03 | P1 | Any viewer | Open Risk Matrix | Heatmap renders < 2s with correct counts |
| UAT-DSH-04 | P2 | CRO | Generate AI executive summary | PDF opens with current metrics |
| UAT-DSH-05 | P2 | RCB | Generate all 5 board reports | Each PDF downloads and prints correctly |
| UAT-DSH-06 | P3 | Any | Export dashboard PDF/PNG | File opens intact |

### 5.6 Business Continuity (BCP + BIA)

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-BCP-01 | P1 | RMD | Create BCP with today's BIA date | Saved; BIA date defaults to today |
| UAT-BCP-02 | P1 | RMD | Save BCP with invalid impact rating | Inline field error shown, save blocked |
| UAT-BCP-03 | P1 | RMD | Edit BCP → change RTO | Entry appears in Version History panel |
| UAT-BCP-04 | P2 | RMD | Log a test with results & findings | Persists; retrievable in Test Details |
| UAT-BCP-05 | P2 | ADMIN | Open `/bcp-schema-checks` | Filterable log of startup verifications |

### 5.7 Incidents & Crystallised Risks

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-INC-01 | P1 | RO | Report crystallised risk | Event stored; executives notified |
| UAT-INC-02 | P2 | RMD | Incident timeline for a risk | Chronological events render correctly |

### 5.8 Whistleblowing

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-WB-01 | P1 | Anonymous | Submit case (no login) | Case ID + follow-up code issued |
| UAT-WB-02 | P1 | Anonymous | Return with follow-up code | Reads status / adds reply, submitter identity NOT visible |
| UAT-WB-03 | P1 | RMD/CRO | Investigation workspace | Case shows SLA age; >14d unassigned auto-flag |
| UAT-WB-04 | P2 | RMD | Close case with outcome | Status = Closed; audit trail complete |

### 5.9 Audit Logs

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-AUD-01 | P1 | RMD/CRO | Open `/audit-logs` → Risk Changes | List of diffs (who/when/what) shown |
| UAT-AUD-02 | P1 | RMD | Apply date-range + sort + page size, then refresh | Preferences persist |
| UAT-AUD-03 | P2 | RC | Attempt to open `/audit-logs` | Access Denied |

### 5.10 Notifications

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-NTF-01 | P1 | RC | Task due in ≤ 7 days | Notification arrives at 08:00 |
| UAT-NTF-02 | P1 | RO | Task overdue | Escalation notification received |
| UAT-NTF-03 | P2 | Any | Notification bell | Unread count matches unread list |

### 5.11 Settings & Administration

| ID | Priority | Role | Steps | Expected Result |
|----|----------|------|-------|-----------------|
| UAT-SET-01 | P1 | ADMIN | Add new risk category | Appears in dropdown immediately (enum-sync trigger) |
| UAT-SET-02 | P1 | ADMIN | Edit risk appetite thresholds | Reflected in dashboard breach indicators |
| UAT-SET-03 | P2 | ADMIN | Load / clear sample data | Operations succeed with confirmation |

## 6. Non-Functional Acceptance

| ID | Criterion | Target | Method |
|----|-----------|--------|--------|
| NFR-01 | Landing page load | < 5s (P95) | Manual timing, 10 samples |
| NFR-02 | Matrix render | < 2s (P95) | Manual timing |
| NFR-03 | Availability | 24/7 during UAT window | Uptime probe log |
| NFR-04 | Auto-logout | 5 min idle | AUTH-03 |
| NFR-05 | Backup restore rehearsal | Full DB restore < 1h | Ops DR drill |
| NFR-06 | Browser matrix | Latest Chrome, Edge, Firefox, Safari | Manual spot-check per module |
| NFR-07 | Mobile | Dashboard + Register readable at 375-430px | Manual check |

## 7. Defect Severity Guide

- **S1 (Critical)** — data loss, security breach, blocked workflow, wrong role sees data.
- **S2 (High)** — feature unusable but has manual workaround.
- **S3 (Medium)** — cosmetic / minor UX issue.
- **S4 (Low)** — nice-to-have.

## 8. Test Data Reset

Before each cycle: ADMIN → Settings → Sample Data → **Reset**.
Never enter real personal, financial, or PII data in UAT.

## 9. Cut-over Checklist (Go-Live)

- [ ] Backup taken before deployment.
- [ ] Migrations applied (schema + on-prem bundle if self-hosted).
- [ ] Category, department, appetite, role tables seeded.
- [ ] All UAT P1 cases pass.
- [ ] DR runbook rehearsed in last 30 days.
- [ ] Support desk briefed; FAQ updated.
- [ ] Communication sent to end users (login URL, SSO steps, support channel).

## 10. Sign-Off

| Signatory | Role | Signature | Date |
|-----------|------|-----------|------|
|  | Risk Manager (RMD) |  |  |
|  | Chief Risk Officer |  |  |
|  | IT Security Lead |  |  |
|  | Executive Sponsor |  |  |
