# Whistleblowing Module — User Guide

## Overview

The Whistleblowing Module enables employees, contractors, and external parties to report misconduct, fraud, policy violations, or ethical concerns **completely anonymously**. The system ensures reporter anonymity while providing investigators with structured workflows for thorough case management through to resolution.

---

## Table of Contents

1. [For Reporters (Anonymous)](#1-for-reporters-anonymous)
   - [Submitting a Report](#11-submitting-a-report)
   - [Following Up on Your Case](#12-following-up-on-your-case)
2. [For Investigators (RMD / CRO / Admin)](#2-for-investigators-rmd--cro--admin)
   - [Accessing the Investigation Dashboard](#21-accessing-the-investigation-dashboard)
   - [Reviewing a Case](#22-reviewing-a-case)
   - [Communicating with the Reporter](#23-communicating-with-the-reporter)
   - [Changing Status & Priority](#24-changing-status--priority)
   - [Escalating a Case](#25-escalating-a-case)
   - [Resolving & Closing a Case](#26-resolving--closing-a-case)
3. [Case Lifecycle & Workflow](#3-case-lifecycle--workflow)
4. [Anonymity & Security Guarantees](#4-anonymity--security-guarantees)
5. [Notifications & Automation](#5-notifications--automation)
6. [FAQ](#6-faq)

---

## 1. For Reporters (Anonymous)

### 1.1 Submitting a Report

**URL:** `/whistleblow` (accessible from the login page via the "Report Misconduct Anonymously" link)

**No login is required.** Your identity is never recorded.

#### Steps:

1. **Step 1 — Incident Classification**
   - Select a **category**: Fraud, Corruption, Harassment, Safety, Policy Violation, Financial Misconduct, or Other.
   - Optionally provide the **date of incident** and **location/department**.

2. **Step 2 — Incident Details**
   - Enter a brief **subject line** (required).
   - Provide a **detailed description** of the concern (required, up to 5,000 characters).
   - Optionally list **individuals involved** (names, roles, or positions).

3. **Step 3 — Evidence & Supporting Information**
   - Describe any **supporting evidence** (documents, emails, records, etc.).
   - You can share additional evidence later via the follow-up page.

4. **Step 4 — Passphrase & Review**
   - Review your submission summary.
   - Create a **passphrase** (minimum 6 characters). This is your key to follow up on the case later.
   - Confirm the passphrase and submit.

5. **Success Screen**
   - You will receive a **case reference code** (e.g., `WB-2026-00042`).
   - **⚠️ Save both your case reference and passphrase securely.** These cannot be recovered if lost.

### 1.2 Following Up on Your Case

**URL:** `/whistleblow/status`

1. Enter your **case reference** and **passphrase**.
2. On successful verification, you will see:
   - **Case status** (e.g., Submitted, Under Review, Investigation, Resolved)
   - **Case timeline** showing key status changes
   - **Messages** from the Investigation Team
3. You can **send new messages** to the investigation team directly from this page.
4. Investigator names are never shown — all messages appear as "Investigation Team."
5. Click **"Sign Out of Case"** when finished to clear your session.

---

## 2. For Investigators (RMD / CRO / Admin)

### 2.1 Accessing the Investigation Dashboard

**URL:** `/whistleblow/cases` (requires authentication)

Navigate via the sidebar under **Ethics & Compliance → Whistleblowing**.

> **Access is restricted to:** RMD (Risk Management Department), CRO (Chief Risk Officer), and ADMIN roles.

The dashboard displays:
- **KPI Cards**: Total Cases, Open Cases, Escalated Cases, Average Resolution Time
- **Case Table**: Searchable and filterable list of all whistleblow cases
- **Filters**: By status, category, and free-text search

### 2.2 Reviewing a Case

Click **"View"** on any case row to open the **Case Detail View** (`/whistleblow/cases/:id`).

The detail view is split into two panels:

**Left Panel — Report Details (read-only):**
- Category, submission date, incident date, location
- Full description of the incident
- Individuals involved and evidence description
- Escalation reason (if escalated)
- Resolution summary (if resolved)

**Right Panel — Investigation Workspace (tabbed):**
- **Messages** — Communication thread with the anonymous reporter
- **Timeline** — Full audit trail of all actions taken on the case
- **Actions** — Status changes, priority assignment, escalation, and resolution controls

### 2.3 Communicating with the Reporter

From the **Messages** tab in the case detail view:

1. Type your message in the text area.
2. Click **Send** (arrow icon).
3. Your message will appear on the reporter's follow-up page as coming from "Investigation Team."
4. When the reporter replies, you will receive an in-app notification.

> **Note:** Investigator identities are hidden from the reporter. Messages appear as "Investigation Team" on the reporter's side.

### 2.4 Changing Status & Priority

From the **Actions** tab:

- **Status**: Click any status button to transition the case. Available statuses:
  - `Submitted` → `Under Review` → `Investigation` → `Resolved` → `Closed`
  - Cases can also be `Escalated` or `Dismissed` from any active status.

- **Priority**: Set to `Low`, `Medium`, `High`, or `Critical`. Priority is visible to the reporter on their follow-up page.

All changes are automatically logged in the audit trail.

### 2.5 Escalating a Case

1. Click **"Escalated"** in the status buttons (Actions tab).
2. An **Escalation Dialog** appears requiring a mandatory **reason**.
3. On confirmation:
   - Status changes to **Escalated**
   - The reason is recorded and visible in the case details
   - **CRO and ADMIN users** receive an in-app notification
   - The escalation is logged in the audit trail
   - The reporter sees the status change on their follow-up page

### 2.6 Resolving & Closing a Case

**Resolving:**
1. Click **"Resolved"** in the status buttons.
2. A **Resolution Dialog** appears requiring a **resolution summary**.
3. On confirmation:
   - Status changes to **Resolved**
   - Resolution date and summary are recorded
   - The reporter can see the resolution summary on their follow-up page

**Closing:**
- After resolution, click **"Closed"** to archive the case.
- Closed cases remain in the system for audit purposes but no further actions can be taken.

---

## 3. Case Lifecycle & Workflow

```
Submitted ──→ Under Review ──→ Investigation ──→ Resolved ──→ Closed
                    │                  │
                    │                  ├──→ Escalated ──→ Investigation
                    │                  │
                    └──→ Dismissed     └──→ Dismissed
```

| Status | Description |
|--------|-------------|
| **Submitted** | Report received, awaiting initial review |
| **Under Review** | Investigator has begun preliminary assessment |
| **Investigation** | Active investigation underway |
| **Escalated** | Case referred to senior leadership (CRO) with documented reason |
| **Resolved** | Investigation complete, resolution summary documented |
| **Closed** | Case archived after resolution |
| **Dismissed** | Case determined to be non-actionable, with documented reason |

Every status transition generates:
1. An **audit log entry** with timestamp and actor
2. An **in-app notification** to relevant investigators
3. A **status update** visible to the reporter via the follow-up page

---

## 4. Anonymity & Security Guarantees

| Protection | Implementation |
|-----------|----------------|
| **No login required** | The submission and follow-up pages are fully public — no authentication needed |
| **No IP logging** | The system does not record the reporter's IP address, browser, or device info |
| **No session tracking** | No cookies or session identifiers are stored for reporters |
| **Passphrase hashing** | The reporter's passphrase is hashed (SHA-256 with salt) before storage — it is never stored in plaintext |
| **Data isolation** | Reporter-submitted data is stored separately from user accounts — there is no technical link between a report and any user identity |
| **Investigator anonymity** | Investigators' names are never shown to the reporter — messages appear as "Investigation Team" |
| **Role-based access** | Only RMD, CRO, and ADMIN roles can access the investigation dashboard and case data |
| **Full audit trail** | Every investigator action is logged for compliance and accountability |

---

## 5. Notifications & Automation

### Automatic Notifications

| Event | Recipients |
|-------|-----------|
| New case submitted | All RMD and ADMIN users |
| Case escalated | CRO and ADMIN users |
| Reporter sends a message | Assigned investigator |
| Investigator sends a message | Visible on reporter's follow-up page (no push notification) |

### Automated Deadline Monitoring

| Condition | Action |
|-----------|--------|
| Case unassigned for **>14 days** | Alert sent to all RMD and ADMIN users |
| Case under investigation for **>60 days** | Alert sent to CRO and ADMIN users for review |

These checks run on the same daily schedule as risk deadline monitoring.

---

## 6. FAQ

**Q: What if I lose my case reference or passphrase?**
A: Unfortunately, for security reasons, these cannot be recovered. The system is designed so that no one — including administrators — can retrieve your passphrase. If lost, you may submit a new report referencing your original concern.

**Q: Can investigators find out who submitted a report?**
A: No. The system does not collect any identifying information. There is no technical mechanism to trace a report back to a specific person.

**Q: Can I submit evidence files?**
A: Currently, you can describe your evidence in the submission form. File upload capability for anonymous reporters will be available in a future update. Investigators can upload files to the case from the investigation dashboard.

**Q: Who can see whistleblow cases?**
A: Only users with **RMD**, **CRO**, or **ADMIN** roles can access the investigation dashboard and case details. Other users cannot see or access whistleblow data.

**Q: Can a case be reopened after it's closed?**
A: Closed cases are archived. If new information emerges, a new case should be submitted referencing the original case reference for context.

**Q: Is there a limit to how many reports I can submit?**
A: No. You may submit as many reports as necessary. Each report generates a unique case reference.

**Q: How do I know my report is being investigated?**
A: Check your case status at `/whistleblow/status` using your case reference and passphrase. You will see status updates, timeline events, and any messages from the investigation team.
