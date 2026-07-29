// Embedded documentation content. Each entry maps to /docs/:slug.
// Headings get auto-generated anchor ids (e.g. ## Creating risks -> #creating-risks).

export type DocRole =
  | 'RC' | 'RR' | 'RO' | 'RMD' | 'CRO' | 'ERMSC' | 'EC' | 'RCB' | 'ADMIN' | 'USER';

export const ALL_DOC_ROLES: DocRole[] = ['RC', 'RR', 'RO', 'RMD', 'CRO', 'ERMSC', 'EC', 'RCB', 'ADMIN', 'USER'];

export const DOC_ROLE_LABELS: Record<DocRole, string> = {
  RC: 'Risk Champion',
  RR: 'Risk Reviewer',
  RO: 'Risk Owner',
  RMD: 'Risk Management Dept.',
  CRO: 'Chief Risk Officer',
  ERMSC: 'ERM Steering Committee',
  EC: 'Executive Chairman',
  RCB: 'Risk Committee of Board',
  ADMIN: 'Administrator',
  USER: 'General User',
};

const ROLE_BY_SLUG: Record<string, DocRole> = {
  'role-guide-rc': 'RC',
  'role-guide-rr': 'RR',
  'role-guide-ro': 'RO',
  'role-guide-rmd': 'RMD',
  'role-guide-cro': 'CRO',
  'role-guide-ermsc': 'ERMSC',
  'role-guide-ec': 'EC',
  'role-guide-rcb': 'RCB',
  'role-guide-admin': 'ADMIN',
  'role-guide-user': 'USER',
};

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  group: 'Getting Started' | 'Role-Based Guides' | 'Modules' | 'Operations' | 'Reference';
  content: string;
  roles?: DocRole[];
}

export function getPageRoles(page: DocPage): DocRole[] {
  if (page.roles && page.roles.length) return page.roles;
  const mapped = ROLE_BY_SLUG[page.slug];
  return mapped ? [mapped] : [];
}

export const DOC_PAGES: DocPage[] = [
  {
    slug: 'overview',
    title: 'Overview',
    description: 'Introduction to the NRS Risk Management Portal.',
    group: 'Getting Started',
    content: `# NRS RMP Documentation

Welcome to the **NRS Risk Management Portal** — your one-stop learning center.
This documentation walks you through every module of the platform, from your
first login to generating board-level reports.

## New to RiskRadar? Start here

1. [**Getting Started**](/docs/getting-started) — log in, learn the layout, and
   understand your role-based landing page.
2. [**Quick Tour**](/docs/quick-tour) — a 5-minute walkthrough that takes a
   risk from creation to executive dashboard.
3. [**Glossary**](/docs/glossary) — ISO 31000 and BCP terminology used across
   the app.
4. [**Role-Based Guides**](/docs/role-guides) — scene-by-scene walkthroughs for
   Risk Champions, Reviewers, Owners, and the Risk Management Department.

## Modules

- [Main Dashboard](/docs/dashboard) — your personalized landing page
- [Risk Register](/docs/risk-register) — log, review and manage risks
- [Risk Matrix](/docs/risk-matrix) — interactive heat map
- [Approval Inbox](/docs/approval-inbox) — reviewer workflow
- [Executive Dashboard](/docs/executive-dashboard) — KPIs and analytics
- [Executive Summary](/docs/executive-summary) — org-wide roll-up for boards
- [Business Continuity](/docs/business-continuity) — BCP and BIA
- [Incidents](/docs/incidents) — capture and track incidents
- [Whistleblowing](/docs/whistleblowing) — anonymous case management
- [Reports](/docs/reports) — board packs and AI narratives
- [Learning Forum](/docs/learning-forum) — training and knowledge sharing
- [Help & FAQ](/docs/help-faq) — self-service support

## Operations & Reference

Deployment, disaster-recovery, authentication and on-premise install guides
live under **Operations** and **Reference** in the sidebar.

## How to navigate

Use the sidebar on the left to jump between pages. Each page has an on-page
table of contents — you can deep-link to any section using the anchor
(e.g. \`/docs/risk-register#creating-risks\`).
`,

  },
  {
    slug: 'risk-register',
    title: 'Risk Register',
    description: 'Logging, reviewing and managing risks across the organisation.',
    group: 'Modules',
    content: `# Risk Register

The Risk Register is the central log of every identified risk across the
organisation. It supports the full ISO 31000 lifecycle: identification,
assessment, treatment, monitoring and review.

## Creating risks

There are three ways to create a risk:

1. **Risk Wizard** — a guided 4-step flow (Identify → Assess → Treat → Review)
   recommended for most users.
2. **Quick Add** — a single dialog for experienced users who already know the
   category, score and treatment strategy.
3. **Bulk Upload / LoB Import** — upload a CSV or Excel file. The AI importer
   will categorise and score each row before you confirm.

> **Tip:** New risks default to status *Pending Review* and require a Reviewer
> (RR) to approve before they appear in dashboards.

## Assessing risks

Each risk has a **likelihood** (1–5) and **impact** (1–5). The combined
inherent score = likelihood × impact. Scores ≥ **15** are flagged as
high-severity and trigger executive notifications.

After controls are applied, capture the **residual** likelihood and impact in
the Post-Control Reassessment section.

## Treatment strategies

| Strategy | When to use |
|----------|-------------|
| Avoid | Eliminate the activity that creates the risk |
| Mitigate | Apply controls to reduce likelihood or impact |
| Transfer | Insure or contract the risk to a third party |
| Accept | Acknowledge and monitor; no action |

Use **Mitigation Tasks** to break a treatment plan into trackable actions with
owners and due dates. Once all tasks are complete, the risk transitions to
*Mitigated*.

## Monitoring & review

- **Risk history** — every change is snapshotted in \`risk_history\` (JSONB).
- **Audit flag** — risks scoring high for three consecutive reviews are
  automatically flagged for escalation.
- **Document vault** — attach evidence and policies via the Attachments panel.

## Reporting crystallized risks

When a risk materialises into an actual incident, use **Report Crystallized
Risk** on the risk row. You'll capture the event date, description, root cause
and response. Executives are notified automatically.
`,
  },
  {
    slug: 'business-continuity',
    title: 'Business Continuity',
    description: 'BCP plans, dependencies and Business Impact Assessments.',
    group: 'Modules',
    content: `# Business Continuity

The BCP module helps Critical Department Heads document recovery plans and
maintain Business Impact Assessments (BIAs).

## BCP records

Each plan captures the process name, owner, dependencies, RTO/RPO targets and
recovery procedures.

## Business Impact Assessment

BIA scoring assigns a **criticality** rating (Low / Medium / High / Critical)
based on financial, operational, reputational and regulatory impact.

## Testing logs

Record tabletop exercises and live tests with outcomes, gaps and remediation
actions. Overdue tests appear on the dashboard.
`,
  },
  {
    slug: 'incidents',
    title: 'Incidents',
    description: 'Capturing and tracking incident events.',
    group: 'Modules',
    content: `# Incidents

Incidents are crystallized risk events — things that have actually happened.

## Logging an incident

Use **Add Incident** from the Incidents Dashboard or **Report Crystallized
Risk** from a row on the Risk Register. Both write to the \`risk_events\`
table with \`event_type = 'crystallized'\`.

## Required fields

- Event date (must not be in the future)
- Discovery date (on or after the event date)
- Description (≥ 20 characters)
- Root cause and response

## Timeline

Each incident has a chronological timeline of updates, attachments and
status changes.
`,
  },
  {
    slug: 'whistleblowing',
    title: 'Whistleblowing',
    description: 'Anonymous reporting workflow and investigation workspace.',
    group: 'Modules',
    content: `# Whistleblowing

A confidential channel for staff and external parties to report misconduct.

## Submission

Reports can be submitted **anonymously** at \`/whistleblow\` without signing
in. The system issues a follow-up code so the reporter can check status at
\`/whistleblow/status\`.

## Investigation workspace

Compliance staff manage cases at \`/whistleblow/cases\`. SLAs:

- Cases unassigned for **>14 days** are auto-flagged.
- Cases stagnant for **>60 days** are escalated.

## Lifecycle

Submitted → Triaged → Under Investigation → Resolved → Closed.
`,
  },
  {
    slug: 'reports',
    title: 'Reports',
    description: 'Executive summary, board reports and exports.',
    group: 'Modules',
    content: `# Reports

RiskRadar bundles three reporting surfaces. Use the [Executive
Dashboard](/docs/executive-dashboard) for live KPIs, the [Executive
Summary](/docs/executive-summary) for a one-page organisation-wide roll-up,
and **Board Reports** below for scheduled PDF packs.

## Executive Summary


A single-page roll-up of top risks, appetite breaches, mitigation progress and
crystallized events. Refreshes hourly via a scheduled edge function.

## Board Reports

Five built-in templates (PDF):

1. Top Risks Briefing
2. Appetite & Tolerance Review
3. Mitigation Progress
4. Incident & Crystallized Risk Summary
5. BCP Readiness

## AI Report Generator

Generates a markdown narrative from current data using Gemini 2.5 Flash, then
exports to PDF.
`,
  },
  {
    slug: 'lifecycle',
    title: 'Lifecycle Workflows',
    description: 'End-to-end workflow automation and notifications.',
    group: 'Operations',
    content: `# Lifecycle Workflows

## Daily automation (8am)

A pg_cron job runs each morning to:

- Send 7-day warnings for upcoming due dates
- Flag overdue mitigation tasks
- Re-score risks where AI predictions have shifted

## Approvals

Role-based inbox at \`/approvals\` shows risks awaiting review by RR, RMD or
CRO. Bulk approve/reject is supported.
`,
  },
  {
    slug: 'integrations',
    title: 'Integrations',
    description: 'M-Files, CSDD, Active Directory and backups.',
    group: 'Reference',
    content: `# Integrations

| System | Purpose |
|--------|---------|
| M-Files EDRMS | Control document repository |
| CSDD | Learning forum and knowledge sharing |
| Active Directory | SSO and user provisioning |
| Enterprise Backup | Daily incremental, weekly full |

See the integration requirements document for protocol details.
`,
  },
  {
    slug: 'roles',
    title: 'Roles & Permissions',
    description: 'The 8 system roles and what each can do.',
    group: 'Reference',
    content: `# Roles & Permissions

| Code | Role | Primary scope |
|------|------|---------------|
| RC | Risk Champion | Department-level risk input |
| RR | Risk Reviewer | Approves risks before publication |
| RO | Risk Owner | Accountable for treatment |
| RMD | Risk Management Dept | Power users across all modules |
| CRO | Chief Risk Officer | Strategic oversight |
| ERMSC | ERM Steering Committee | Cross-functional governance |
| EC | Executive Chairman | Board-level read-only |
| RCB | Risk Committee Board | Board-level read-only |

## Sidebar & Module Access Matrix

At-a-glance view of which sidebar/module each role can reach. Values are derived
from the same source of truth as the automated nav-access check
(**rolePermissions** and route rules in **src/lib/navAccessConsistency.ts**), so
this matrix and the running app stay in sync.

| Role | Dashboard | Risk Register | Approval Inbox | Risk Matrix | BCP | Reports | Exec Summary | Board Reports | Incidents | Whistleblowing | Audit Logs | User Mgmt | Settings / Data |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [RC](/docs/role-guide-rc)      | ✅ | ⚠️ | — | — | — | — | — | — | ⚠️ | — | — | — | — |
| [RR](/docs/role-guide-rr)      | ✅ | ⚠️ | ✅ | ✅ | — | ✅ | — | — | ⚠️ | — | — | — | — |
| [RO](/docs/role-guide-ro)      | ✅ | ⚠️ | — | — | — | — | — | — | ⚠️ | — | — | — | — |
| [RMD](/docs/role-guide-rmd)    | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ | ✅ | — |
| [CRO](/docs/role-guide-cro)    | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ | — | — |
| [ERMSC](/docs/role-guide-ermsc)| ✅ | ✅ | — | ✅ | — | ✅ | ✅ | — | ✅ | — | — | — | — |
| [EC](/docs/role-guide-ec)      | ✅ | ✅ | — | ✅ | — | ✅ | ✅ | — | ✅ | — | — | — | — |
| [RCB](/docs/role-guide-rcb)    | ✅ | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| [ADMIN](/docs/role-guide-admin)| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| [USER](/docs/role-guide-user)  | ✅ | ⚠️ | — | — | — | — | — | — | ⚠️ | — | — | — | — |

## Action Capability Matrix

Cross-role view of who can perform key CRUD and workflow actions.

| Role | Add Risk | Edit Own Risk | Edit Any Risk | Review / Approve | Final Approve | Manage BCP | Manage Users | Executive / Board Actions | Manage Whistleblowing |
|---|---|---|---|---|---|---|---|---|---|
| [RC](/docs/role-guide-rc)      | ✅ | ✅ | — | — | — | — | — | — | — |
| [RR](/docs/role-guide-rr)      | — | — | — | ✅ | — | — | — | — | — |
| [RO](/docs/role-guide-ro)      | ✅ | ✅ | — | — | — | — | — | — | — |
| [RMD](/docs/role-guide-rmd)    | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ |
| [CRO](/docs/role-guide-cro)    | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ⚠️ | ✅ |
| [ERMSC](/docs/role-guide-ermsc)| — | — | — | — | — | — | — | ⚠️ | — |
| [EC](/docs/role-guide-ec)      | — | — | — | — | — | — | — | ✅ | — |
| [RCB](/docs/role-guide-rcb)    | — | — | — | — | — | — | — | ✅ | — |
| [ADMIN](/docs/role-guide-admin)| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| [USER](/docs/role-guide-user)  | — | — | — | — | — | — | — | — | — |

## Legend

- ✅ **Full access** — the role can open the module or perform the action without restriction.
- ⚠️ **Limited / scoped** — access is allowed but narrowed by scope. In particular:
  - **RC, RR, RO** only see and act on risks in **their department** or **assigned to them** (Risk Register, Incidents).
  - **USER** has read-only visibility to the shared matrix and learning content.
  - **ERMSC** participates in strategic/executive discussions but cannot execute board sign-off actions.
  - **CRO** contributes to executive/board reviews but the final board pack is owned by RCB.
- — **No access** — the module is hidden from the sidebar and the route guard denies direct navigation.

Each role name links to its own guide, which contains the detailed per-role
permissions matrix and step-by-step workflow walkthroughs.

Permissions are stored in the \`user_roles\` table and enforced via
security-definer functions in RLS.
`,

  },
  {
    slug: 'deployment-architecture',
    title: 'Deployment Architecture',
    description: 'Architecture diagrams for Managed Cloud, Cloud VM and On-Premise.',
    group: 'Operations',
    content: `# Deployment Architecture

RiskRadar supports three deployment models. Each option below includes a
solution architecture diagram. See the full *Deployment Guide* PDF/DOCX for
cost, RACI and decision matrix details.

## Option A — Managed Cloud (SaaS)

Fully hosted by the vendor. Fastest to onboard; no infrastructure work for
the customer beyond identity federation and DNS.

\`\`\`mermaid
flowchart LR
  U[Users<br/>Browser] -->|HTTPS| CDN[Global CDN<br/>+ WAF]
  CDN --> SPA[React SPA<br/>Static Bundle]
  SPA -->|HTTPS / JWT| API[Managed API Gateway]
  API --> EF[Edge Functions<br/>Deno Runtime]
  API --> DB[(PostgreSQL<br/>RLS + PITR)]
  EF --> DB
  EF --> AI[Lovable AI Gateway<br/>Gemini 2.5]
  EF --> OBJ[(Object Storage<br/>S3-compatible)]
  IDP[Corporate IdP<br/>SAML/OIDC] -->|Federation| API
  subgraph Vendor Managed Cloud
    CDN
    SPA
    API
    EF
    DB
    OBJ
  end
\`\`\`

**Highlights**: Auto-scaling, managed backups (PITR 7–30 days), 99.9% SLA,
zero patching effort.

## Option B — Cloud VM (Self-Managed)

Deployed onto customer-owned VMs in AWS / Azure / GCP. Customer controls the
network and patching; vendor provides container images and migrations.

\`\`\`mermaid
flowchart TB
  U[Users] -->|HTTPS| LB[Cloud Load Balancer<br/>+ WAF]
  LB --> NGX[NGINX / Reverse Proxy<br/>VM or Container]
  NGX --> APP[App VMs<br/>SPA + Edge Runtime<br/>Auto-scaling Group]
  APP --> PG[(Managed PostgreSQL<br/>RDS / Azure DB)]
  APP --> S3[(Object Storage<br/>S3 / Blob)]
  APP --> AI[AI Gateway<br/>or Self-Hosted LLM]
  IDP[Corporate AD / SSO] --> APP
  CI[CI/CD Pipeline<br/>GitHub Actions] -->|Deploy| APP
  CI -->|Migrations| PG
  BKP[Backup Service<br/>Daily Snapshots] --> PG
  BKP --> S3
\`\`\`

**Highlights**: Full network control, BYO encryption keys (KMS), choice of
region, optional private link to corporate network.

## Option C — On-Premise (Air-Gapped Capable)

Runs entirely inside the customer datacenter on Kubernetes. Suitable for
strict data-residency or air-gapped environments.

\`\`\`mermaid
flowchart TB
  U[Internal Users] -->|HTTPS| F5[F5 / HAProxy<br/>Load Balancer]
  F5 --> ING[Ingress Controller<br/>NGINX / Traefik]
  subgraph K8s [Kubernetes Cluster]
    ING --> SPAP[SPA Pods]
    ING --> APIP[API / Edge Runtime Pods]
    APIP --> WORK[Worker Pods<br/>Cron / Reports]
  end
  APIP --> PG[(PostgreSQL HA<br/>Patroni + WAL-G)]
  APIP --> MIN[(MinIO<br/>S3-compatible)]
  APIP --> AD[Active Directory<br/>LDAPS]
  APIP --> MF[M-Files EDRMS]
  WORK --> SMTP[Internal SMTP Relay]
  BKP[Enterprise Backup<br/>Daily / Weekly] --> PG
  BKP --> MIN
  MON[Prometheus + Grafana<br/>+ Loki Logs] --> K8s
\`\`\`

**Highlights**: Air-gap capable, integrates with on-prem AD/M-Files, full
sovereignty over data and keys.

## Comparison at a glance

| Concern | A — Managed | B — Cloud VM | C — On-Premise |
|---------|-------------|--------------|----------------|
| Time to live | Days | 2–4 weeks | 8–12 weeks |
| Ops burden (customer) | Minimal | Moderate | Heavy |
| Data residency control | Region-only | Full (in cloud) | Full (in DC) |
| Air-gap support | No | Limited | Yes |
| Indicative TCO (3 yr) | $ | $$ | $$$ |
`,
  },
  {
    slug: 'dr-runbook',
    title: 'Disaster Recovery Runbook',
    description: 'Step-by-step restore procedures for each deployment option.',
    group: 'Operations',
    content: `# Disaster Recovery Runbook

This runbook defines the **step-by-step actions** to restore RiskRadar after a
disruptive event. Follow the section matching your deployment model.

## RPO / RTO targets

| Deployment | RPO | RTO |
|------------|-----|-----|
| Managed Cloud | 5 min (PITR) | 1 hour |
| Cloud VM | 15 min (snapshot) | 2 hours |
| On-Premise | 1 hour (WAL ship) | 4 hours |

## Severity classification

| Sev | Definition | Declare DR? |
|-----|------------|-------------|
| **SEV-1** | Total outage / data loss | Yes — execute full runbook |
| **SEV-2** | Major degradation, single region/AZ | Failover only |
| **SEV-3** | Partial feature unavailable | Standard incident, no DR |

## Roles during a DR event

- **Incident Commander (IC)** — coordinates, owns comms.
- **Tech Lead** — executes recovery steps below.
- **CRO / Compliance** — informs board, regulators if applicable.
- **Comms Lead** — user-facing status page updates every 30 minutes.

---

## Option A — Managed Cloud restore

Use when the managed backend reports data corruption, deletion or regional
outage.

1. **Declare the incident** in the on-call channel; open a status page entry.
2. **Confirm scope** — call \`cloud_status\` (Connectors → Lovable Cloud →
   Status) and capture the lifecycle state.
3. **Enable read-only mode** on the SPA via feature flag \`READ_ONLY=true\` to
   prevent further writes.
4. **Choose a restore point** — open *Database → Backups* and pick the most
   recent PITR timestamp **before** the incident.
5. **Trigger Point-In-Time Restore** to a *new* branch (never overwrite prod
   directly). Wait until status returns to \`ACTIVE_HEALTHY\`.
6. **Validate** by running the smoke-test SQL pack:
   \`\`\`sql
   select count(*) from public.risks;
   select max(created_at) from public.risk_history;
   select count(*) from public.user_roles;
   \`\`\`
7. **Cut over** — promote the restored branch to primary; rotate the anon key
   if leaks are suspected.
8. **Re-enable writes**, clear the feature flag, redeploy SPA.
9. **Post-incident**: file RCA within 5 business days, update this runbook.

## Option B — Cloud VM restore

Use when an app VM, database instance or AZ fails.

### B.1 — App tier failure

1. Confirm health-check failures in the load balancer dashboard.
2. The auto-scaling group should replace the unhealthy instance automatically.
   If not, terminate manually and wait for replacement.
3. If the *image* is at fault, roll back via CI/CD:
   \`\`\`bash
   gh workflow run deploy.yml -f environment=prod -f ref=<previous-good-sha>
   \`\`\`
4. Validate \`/healthz\` and a synthetic login.

### B.2 — Database failure

1. Open the managed Postgres console (RDS / Azure DB).
2. **Promote the standby replica** if a Multi-AZ deployment is in place.
3. If no replica is healthy, **restore from snapshot**:
   - Pick the latest automated snapshot prior to the incident.
   - Restore into a *new* instance; do not overwrite the failed one.
   - Update the app's \`DATABASE_URL\` secret and trigger a rolling restart.
4. Re-run pending migrations:
   \`\`\`bash
   supabase db push --db-url "$DATABASE_URL"
   \`\`\`
5. Run smoke-test SQL (see Option A step 6).
6. Update DNS / connection strings if the endpoint changed.

### B.3 — Region failure (full failover)

1. Activate the warm-standby region (Terraform \`workspace=dr\`).
2. Restore latest cross-region snapshot to the DR Postgres.
3. Update Route 53 / Traffic Manager weighted policy to send 100% traffic to DR.
4. Notify users via status page; SLA clock pauses on user acknowledgement.

## Option C — On-Premise restore

Use for datacenter, cluster or storage-level incidents.

### C.1 — Pod / node failure

1. Kubernetes self-heals. Verify with:
   \`\`\`bash
   kubectl -n riskradar get pods
   kubectl -n riskradar rollout status deploy/api
   \`\`\`
2. If a node is gone, drain and replace; ensure PVCs reattach.

### C.2 — PostgreSQL HA failover

1. Patroni should auto-promote a replica. Confirm with:
   \`\`\`bash
   patronictl -c /etc/patroni.yml list
   \`\`\`
2. Update the connection string in the \`postgres-svc\` Kubernetes Service if
   the leader changed.
3. Re-attach replicas:
   \`\`\`bash
   patronictl -c /etc/patroni.yml reinit <replica-name>
   \`\`\`

### C.3 — Full restore from backup

1. Provision a clean PostgreSQL cluster (or reuse, with empty data dir).
2. Restore base backup with WAL-G:
   \`\`\`bash
   wal-g backup-fetch /var/lib/postgresql/data LATEST
   touch /var/lib/postgresql/data/recovery.signal
   echo "restore_command='wal-g wal-fetch %f %p'" >> postgresql.conf
   systemctl start postgresql
   \`\`\`
3. Watch logs until \`archive recovery complete\` appears, then promote:
   \`\`\`bash
   pg_ctl promote -D /var/lib/postgresql/data
   \`\`\`
4. Restore object storage from MinIO mirror:
   \`\`\`bash
   mc mirror --overwrite backup/minio/ minio/riskradar/
   \`\`\`
5. Redeploy app via Helm:
   \`\`\`bash
   helm upgrade riskradar ./chart -f values-prod.yaml
   \`\`\`
6. Run smoke-test SQL and synthetic login.
7. Re-enable scheduled jobs (\`pg_cron\`) — verify with:
   \`\`\`sql
   select jobname, schedule, active from cron.job;
   \`\`\`

## Post-restore checklist (all options)

- [ ] All scheduled jobs (cron, edge functions) re-enabled
- [ ] Realtime channels reconnected
- [ ] Email/SMTP outbound test passed
- [ ] Last 24h audit log reviewed for anomalies
- [ ] Stakeholder comms sent (CRO + ERMSC)
- [ ] RCA scheduled within 5 business days
- [ ] Runbook updated with lessons learned
`,
  },
  {
    slug: 'auth-prod-hardening',
    title: 'Auth: Production Hardening',
    description: 'Checklist to harden email/password authentication for Options B and C.',
    group: 'Operations',
    content: `# Authentication — Production Hardening (Non-SSO)

This checklist applies to **self-hosted Supabase** deployments — Cloud VM (Option B)
and On-Premise (Option C). It does **not** apply to Managed Cloud (Option A),
which inherits Supabase platform defaults.

## Mandatory before go-live

- [ ] \`GOTRUE_DISABLE_SIGNUP=true\` — only admins can create users
- [ ] \`GOTRUE_MAILER_AUTOCONFIRM=false\` — email verification required
- [ ] \`GOTRUE_PASSWORD_MIN_LENGTH=12\` + character class requirements
- [ ] \`GOTRUE_SECURITY_PASSWORD_HIBP_ENABLED=true\`
- [ ] \`GOTRUE_REFRESH_TOKEN_ROTATION_ENABLED=true\`
- [ ] Rate limiting configured (see GoTrue config docs)
- [ ] HTTPS only with HSTS at the reverse proxy
- [ ] SMTP relay configured and tested for invite/reset/MFA emails
- [ ] All 11 demo accounts disabled (\`is_locked = true\`, role downgraded to USER)
- [ ] \`VITE_SHOW_DEMO_ACCOUNTS=false\` and \`VITE_DISABLE_PUBLIC_SIGNUP=true\` in prod build
- [ ] \`SUPABASE_SERVICE_ROLE_KEY\` stored in Vault (C) / Secrets Manager (B), never in browser
- [ ] Nightly \`pg_dump\` includes \`auth.*\` schema; quarterly restore drill executed
- [ ] Audit log retention ≥ 1 year; export to SIEM (Splunk on C, CloudWatch on B)
- [ ] Quarterly \`user_roles\` reconciliation against HR leavers list

## Recommended

- [ ] MFA (TOTP) enforced for ADMIN, CRO, RMD
- [ ] Account lockout after 5 failed attempts in 15 min (built-in via \`auth_failed_attempts\`)
- [ ] Password rotation: 90 days for ADMIN/CRO, 180 days for other roles

## Verification

Use **/admin/auth-verification** (ADMIN/CRO only) to inspect:

1. Your own session — profile role vs effective role consistency
2. All users — assigned roles, lock status, last sign-in time
3. Last 100 authentication events from \`system_audit_logs\`
`,
  },
  {
    slug: 'auth-gotrue-config-b-vm',
    title: 'Auth: GoTrue Config (Option B)',
    description: 'Sample GoTrue env file and Caddy/Nginx setup for Cloud VM deployments.',
    group: 'Operations',
    content: `# GoTrue Configuration — Option B (Cloud VM)

## Sample \`.env\` (drop into your \`docker-compose\` for the \`gotrue\` service)

\`\`\`bash
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:<pw>@db:5432/postgres

GOTRUE_SITE_URL=https://riskradar.nrs.gov.ng
GOTRUE_URI_ALLOW_LIST=https://riskradar.nrs.gov.ng/*

# Hardening
GOTRUE_DISABLE_SIGNUP=true
GOTRUE_MAILER_AUTOCONFIRM=false
GOTRUE_PASSWORD_MIN_LENGTH=12
GOTRUE_SECURITY_PASSWORD_HIBP_ENABLED=true
GOTRUE_JWT_EXP=3600
GOTRUE_REFRESH_TOKEN_ROTATION_ENABLED=true
GOTRUE_REFRESH_TOKEN_REUSE_INTERVAL=10
GOTRUE_MFA_ENABLED=true

# Rate limits (per IP per hour)
GOTRUE_RATE_LIMIT_HEADER=X-Forwarded-For
GOTRUE_RATE_LIMIT_EMAIL_SENT=10
GOTRUE_RATE_LIMIT_TOKEN_REFRESH=150
GOTRUE_RATE_LIMIT_VERIFY=30

# SMTP via SES
GOTRUE_SMTP_HOST=email-smtp.eu-west-1.amazonaws.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=<SES_SMTP_USER>
GOTRUE_SMTP_PASS=<SES_SMTP_PASS>
GOTRUE_SMTP_ADMIN_EMAIL=riskradar-noreply@nrs.gov.ng
GOTRUE_SMTP_SENDER_NAME=NRS RiskRadar

GOTRUE_JWT_SECRET=<from vault>
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_JWT_AUD=authenticated
\`\`\`

## Reverse proxy (Caddy)

\`\`\`caddy
riskradar.nrs.gov.ng {
  encode gzip
  header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  reverse_proxy /auth/* gotrue:9999
  reverse_proxy /rest/* postgrest:3000
  reverse_proxy /* app:3000
}
\`\`\`

## Backup

Schedule on the VM:
\`\`\`cron
0 2 * * * pg_dump -Fc -d postgres -n auth -n public | aws s3 cp - s3://riskradar-backups/$(date +\\%F).dump
\`\`\`
`,
  },
  {
    slug: 'auth-gotrue-config-c-onprem',
    title: 'Auth: GoTrue Config (Option C)',
    description: 'GoTrue env, internal SMTP relay, and NRS internal CA setup for on-prem.',
    group: 'Operations',
    content: `# GoTrue Configuration — Option C (On-Premise)

Same hardening flags as Option B, with these differences:

## SMTP — internal Exchange

\`\`\`bash
GOTRUE_SMTP_HOST=smtp.nrs.gov.ng
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=svc-riskradar
GOTRUE_SMTP_PASS=<from vault>
GOTRUE_SMTP_ADMIN_EMAIL=riskradar-noreply@nrs.gov.ng
\`\`\`

## TLS — NRS internal CA

Place \`nrs-internal-ca.crt\` into the GoTrue container and mount it. If your
SMTP server uses an internal CA cert, set:

\`\`\`bash
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/nrs-internal-ca.crt
\`\`\`

## Reverse proxy (Nginx) — extract real client IP

\`\`\`nginx
server {
  listen 443 ssl http2;
  server_name riskradar.nrs.gov.ng;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  location /auth/ {
    proxy_pass http://gotrue:9999/;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  location / { proxy_pass http://app:3000; }
}
\`\`\`

Set \`GOTRUE_RATE_LIMIT_HEADER=X-Real-IP\` so per-IP throttling uses the real client.

## Backup

\`\`\`cron
0 2 * * * pg_dump -Fc -d postgres -n auth -n public > /mnt/nrs-backup/riskradar/$(date +\\%F).dump
\`\`\`

Mirror to NRS backup vault per the corporate backup standard.
`,
  },
  {
    slug: 'auth-runbook',
    title: 'Auth: Operational Runbook',
    description: 'Day-2 procedures: invite, reset, lockout, role change, leaver offboarding.',
    group: 'Operations',
    content: `# Authentication & RBAC Runbook

## Invite a new user (ADMIN)

1. Open **/users**, click **Invite user**.
2. Enter email, full name, department, and one or more roles.
3. The system sends a recovery email; the user sets their password and lands signed in.
4. Verify in **/admin/auth-verification → All users**.

## Reset password (user)

1. On **/login**, click **Forgot your password?**.
2. Open the email link → \`/reset-password\` → set new password.

## Force password reset (ADMIN)

\`\`\`sql
-- via admin SQL or service-role call
select auth.admin.generate_link('recovery', '<email>');
\`\`\`

Send the returned link to the user out-of-band.

## Lock / unlock an account (ADMIN)

In **/admin/auth-verification → All users**, click the lock icon.
Or via SQL:

\`\`\`sql
select public.admin_set_user_locked('<user_uuid>', true, 'Suspected compromise');
\`\`\`

## Change a user's role (ADMIN)

1. **/users → Edit user → Change primary role**.
2. The \`log_user_role_change\` trigger writes a high-severity audit row.

## Reset MFA (ADMIN)

\`\`\`sql
delete from auth.mfa_factors where user_id = '<user_uuid>';
\`\`\`

User will be prompted to re-enroll on next login.

## Offboard a leaver

1. Lock account (above).
2. Revoke roles: \`delete from public.user_roles where user_id = '<uuid>';\`
3. Confirm in **/admin/auth-verification** that no roles remain.
4. After 30 days, soft-delete profile (\`update profiles set role='USER' where ...\`).

## Quarterly review

Export CSV from **/admin/auth-verification → All users**, reconcile against
the HR leavers list, and lock anyone who has departed.
`,
  },
  {
    slug: 'onprem-local-llm-hardware',
    title: 'On-Prem: Local LLM Hardware Matrix',
    description: 'GPU, CPU, RAM, and storage specifications for the on-prem AI Decision Support LLM.',
    group: 'Operations',
    content: `# On-Premise Local LLM — Hardware Specifications

The **Local LLM (AI Decision Support)** component powers AI risk scoring, mitigation
recommendations, AI report generation, and LoB data import classification when the
deployment cannot reach the Lovable AI Gateway (Option C — On-Premise).

It runs a self-hosted inference server (recommended: **vLLM**, **Ollama**, or **Text
Generation Inference / TGI**) behind an OpenAI-compatible \`/v1/chat/completions\` endpoint
that the edge functions call via the \`LOVABLE_AI_BASE_URL\` override.

## Reference model tiers

RiskRadar's AI workloads are short-context (≤ 8K tokens), tool-calling capable, and
latency-sensitive (target P95 < 8 s for a risk-score call). The matrix below assumes
**4-bit (AWQ / GPTQ / Q4_K_M)** quantization for GPU tiers and **Q4_K_M GGUF** for CPU-only.

### Tier 1 — Pilot / single department (≤ 25 concurrent users)

| Component   | Specification                                                  |
| ----------- | -------------------------------------------------------------- |
| Model       | Llama 3.1 8B Instruct / Qwen 2.5 7B Instruct (4-bit)           |
| GPU         | 1 × NVIDIA RTX 4090 (24 GB) **or** RTX A5000 (24 GB)           |
| vRAM in use | ~ 10–14 GB (model + KV cache for 4K context, batch 4)          |
| CPU         | 16 cores / 32 threads (AMD EPYC 7313P or Intel Xeon Silver 4314) |
| System RAM  | 64 GB ECC DDR4/DDR5                                            |
| Storage     | 1 TB NVMe (model weights ~ 5 GB + logs)                        |
| Network     | 1 GbE                                                          |
| PSU         | 850 W 80+ Gold                                                 |
| Throughput  | ~ 40–60 tokens/s, ~ 6–10 concurrent requests                   |

### Tier 2 — Enterprise (25–150 concurrent users) — **recommended for NRS**

| Component   | Specification                                                  |
| ----------- | -------------------------------------------------------------- |
| Model       | Llama 3.1 70B Instruct (4-bit AWQ) **or** Qwen 2.5 32B (FP16)  |
| GPU         | 2 × NVIDIA L40S (48 GB) **or** 2 × A100 40 GB (NVLink optional) |
| vRAM in use | ~ 40–46 GB per card with 8K context, batch 8                   |
| CPU         | 32 cores / 64 threads (AMD EPYC 9354 or Xeon Gold 6438Y+)      |
| System RAM  | 256 GB ECC DDR5                                                |
| Storage     | 2 × 2 TB NVMe RAID 1 (model weights ~ 40 GB)                   |
| Network     | 2 × 10 GbE (bonded)                                            |
| PSU         | Redundant 1600 W 80+ Platinum                                  |
| Throughput  | ~ 80–120 tokens/s aggregate, ~ 20–40 concurrent requests       |

### Tier 3 — Group-wide / multi-subsidiary (> 150 concurrent users)

| Component   | Specification                                                  |
| ----------- | -------------------------------------------------------------- |
| Model       | Llama 3.1 70B (FP8) or Mixtral 8x22B (4-bit)                   |
| GPU         | 4 × NVIDIA H100 80 GB SXM (NVLink/NVSwitch) **or** 8 × L40S    |
| vRAM in use | ~ 60–72 GB per H100 at 16K context                             |
| CPU         | 64 cores / 128 threads dual-socket EPYC 9554 / Xeon Platinum   |
| System RAM  | 512 GB – 1 TB ECC DDR5                                         |
| Storage     | 4 × 3.84 TB NVMe RAID 10 + 20 TB HDD pool for audit/backup     |
| Network     | 2 × 25 GbE + 1 × IPMI                                          |
| PSU         | Redundant 2400 W                                               |
| Throughput  | ~ 250–400 tokens/s aggregate, 80+ concurrent requests          |

### Tier 0 — CPU-only fallback (development / DR site)

| Component   | Specification                                                  |
| ----------- | -------------------------------------------------------------- |
| Model       | Llama 3.1 8B Q4_K_M GGUF (llama.cpp / Ollama)                  |
| CPU         | 32 cores / 64 threads (AVX-512 required)                       |
| System RAM  | 64 GB DDR5                                                     |
| Storage     | 500 GB NVMe                                                    |
| Throughput  | ~ 6–12 tokens/s, ~ 1–2 concurrent requests (not for prod)      |

## GPU driver and runtime stack

| Layer            | Version                                                     |
| ---------------- | ----------------------------------------------------------- |
| NVIDIA driver    | ≥ 550.54 (data-center branch for L40S / H100)               |
| CUDA toolkit     | 12.4+                                                       |
| cuDNN            | 9.x                                                         |
| Container runtime| Docker 24+ with \`nvidia-container-toolkit\` 1.15+          |
| Inference server | vLLM 0.6+ **or** Ollama 0.4+ **or** TGI 2.3+                |
| OS (Linux)       | Ubuntu 22.04 LTS / RHEL 9 / Rocky 9                         |
| OS (Windows)     | Windows Server 2022 + WSL2 (Ubuntu 22.04) for CUDA workloads|

## Sizing rule-of-thumb

- **vRAM (GB) ≈ params(B) × bytes-per-param + KV-cache**
  - 4-bit ≈ 0.5 B/param, FP16 ≈ 2 B/param
  - KV cache ≈ \`2 × layers × heads × head_dim × seq_len × batch × dtype_bytes\`
- Keep ≥ 4 GB headroom per card for fragmentation and CUDA graphs.
- For tool-calling JSON responses (used by \`risk-ai-analysis\`, \`mitigation-recommender\`),
  prefer models explicitly trained for function calling (Llama 3.1, Qwen 2.5, Mistral
  Large) over base models.

## Networking & placement

- Place the LLM host on the **same VLAN** as the application/edge-function hosts;
  target < 2 ms RTT.
- Expose only TCP 8000 (or 11434 for Ollama) to the app subnet; block from user VLANs.
- Terminate TLS at the internal reverse proxy (NGINX / HAProxy) with an internal CA cert.

## Monitoring

- Scrape \`nvidia-smi dmon\` or DCGM exporter → Prometheus.
- Alert on: GPU temp > 85 °C, vRAM > 90 %, request P95 latency > 12 s, queue depth > 32.

## Cost reference (CAPEX, 2026 Q2, USD ex-VAT)

| Tier   | Indicative build cost  |
| ------ | ---------------------- |
| Tier 0 | $4–6 K                 |
| Tier 1 | $9–14 K                |
| Tier 2 | $55–80 K               |
| Tier 3 | $180–260 K             |

Add ~ 15 % per year for power, cooling, and spares.
`,
  },
  {
    slug: 'onprem-install-linux',
    title: 'On-Prem Install Guide — Linux',
    description: 'Step-by-step on-premise install and configuration on Ubuntu 22.04 / RHEL 9.',
    group: 'Operations',
    content: `# On-Premise Installation Guide — Linux (Ubuntu 22.04 / RHEL 9)

This guide installs RiskRadar end-to-end on a hardened Linux host inside the NRS
network. It covers the application, self-hosted Supabase stack (Postgres + GoTrue
+ PostgREST + Edge Functions), the Local LLM, and the reverse proxy.

Target audience: NRS IT / Linux sysadmin. Estimated time: **4–6 hours** on a clean host.

## 0. Topology

\`\`\`text
[Users] → [F5 / NGINX TLS]  → [App host: web + edge functions]
                            → [DB host: Postgres + GoTrue + PostgREST]
                            → [LLM host: vLLM / Ollama]
                            → [Backup target: NAS / tape]
\`\`\`

Small deployments may collocate App + DB + LLM on a single 2-socket server.

## 1. Prerequisites

| Item              | Minimum                                                  |
| ----------------- | -------------------------------------------------------- |
| OS                | Ubuntu 22.04 LTS or RHEL/Rocky 9                         |
| CPU / RAM         | See \`onprem-local-llm-hardware\` for the LLM host       |
| App+DB host       | 16 vCPU, 64 GB RAM, 1 TB NVMe                            |
| Network           | Static IPs, internal DNS entries, NTP                    |
| TLS               | Internal CA-issued cert + key (PEM)                      |
| SMTP relay        | Reachable host:port + credentials (\`mail.nrs.gov.ng\`)  |
| Outbound          | None required (fully air-gappable)                       |
| Privileges        | sudo / root on all hosts                                 |

## 2. Base hardening (all hosts)

\`\`\`bash
sudo timedatectl set-timezone Africa/Lagos
sudo apt update && sudo apt -y upgrade        # or: sudo dnf -y upgrade
sudo apt -y install ufw fail2ban unattended-upgrades chrony curl jq git
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow from <admin-subnet> to any port 22
sudo ufw enable
sudo systemctl enable --now fail2ban chrony
\`\`\`

Disable root SSH, enforce key-only auth in \`/etc/ssh/sshd_config\`:
\`PermitRootLogin no\`, \`PasswordAuthentication no\`.

## 3. Install Docker & Compose (app + DB hosts)

\`\`\`bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo systemctl enable --now docker
docker compose version   # verify v2+
\`\`\`

## 4. Install Postgres + Supabase self-hosted (DB host)

\`\`\`bash
git clone --depth 1 https://github.com/supabase/supabase /opt/supabase
cd /opt/supabase/docker
cp .env.example .env
\`\`\`

Edit \`/opt/supabase/docker/.env\` and set:

\`\`\`env
POSTGRES_PASSWORD=<strong-32char>
JWT_SECRET=<openssl rand -hex 32>
ANON_KEY=<generate from JWT_SECRET>
SERVICE_ROLE_KEY=<generate from JWT_SECRET>
DASHBOARD_USERNAME=nrsadmin
DASHBOARD_PASSWORD=<strong>

SITE_URL=https://riskradar.nrs.gov.ng
API_EXTERNAL_URL=https://api.riskradar.nrs.gov.ng

SMTP_HOST=mail.nrs.gov.ng
SMTP_PORT=587
SMTP_USER=riskradar@nrs.gov.ng
SMTP_PASS=<smtp-password>
SMTP_SENDER_NAME="NRS RiskRadar"

DISABLE_SIGNUP=true
MAILER_AUTOCONFIRM=false
PASSWORD_MIN_LENGTH=12
GOTRUE_SECURITY_PASSWORD_HIBP_ENABLED=false   # set true only if HIBP reachable
GOTRUE_MFA_ENABLED=true
GOTRUE_JWT_EXP=3600
\`\`\`

Start the stack:

\`\`\`bash
docker compose pull
docker compose up -d
docker compose ps        # all healthy
\`\`\`

## 5. Apply RiskRadar database migrations

\`\`\`bash
git clone https://<internal-git>/nrs/riskradar.git /opt/riskradar
cd /opt/riskradar
for f in supabase/migrations/*.sql; do
  PGPASSWORD=$POSTGRES_PASSWORD psql -h db.internal -U postgres -d postgres -f "$f"
done
\`\`\`

Verify: \`psql ... -c "\\dt public.*"\` shows \`risks\`, \`profiles\`, \`user_roles\`,
\`bcp_*\`, \`whistleblow_*\`, \`system_audit_logs\`, etc.

## 6. Deploy Edge Functions

Self-hosted Supabase uses the \`functions\` container. Copy and reload:

\`\`\`bash
sudo cp -r supabase/functions/* /opt/supabase/volumes/functions/
docker compose restart functions
\`\`\`

Set per-function secrets in \`/opt/supabase/docker/.env\`:

\`\`\`env
LOVABLE_API_BASE_URL=http://llm.internal:8000/v1
LOVABLE_API_KEY=<internal-shared-secret>
\`\`\`

## 7. Install the Local LLM (LLM host)

Install NVIDIA driver + CUDA + container toolkit (Ubuntu shown):

\`\`\`bash
sudo apt -y install nvidia-driver-550 nvidia-cuda-toolkit
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \\
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt -y install nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
nvidia-smi   # verify GPU visible
\`\`\`

Run **vLLM** with Llama 3.1 8B (Tier 1) as an OpenAI-compatible server:

\`\`\`bash
docker run -d --restart unless-stopped --name vllm \\
  --gpus all -p 8000:8000 \\
  -v /opt/models:/models \\
  vllm/vllm-openai:latest \\
  --model /models/llama-3.1-8b-instruct-awq \\
  --served-model-name google/gemini-2.5-flash \\
  --quantization awq --max-model-len 8192
\`\`\`

(The \`served-model-name\` alias lets edge functions keep their existing
\`google/gemini-2.5-flash\` model string.)

Smoke test:

\`\`\`bash
curl http://localhost:8000/v1/chat/completions -H 'Content-Type: application/json' \\
  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"ping"}]}'
\`\`\`

## 8. Build & serve the web app (app host)

\`\`\`bash
sudo apt -y install nodejs npm
cd /opt/riskradar
cp .env.example .env
\`\`\`

Edit \`.env\`:

\`\`\`env
VITE_SUPABASE_URL=https://api.riskradar.nrs.gov.ng
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from step 4>
VITE_DISABLE_PUBLIC_SIGNUP=true
VITE_SHOW_DEMO_ACCOUNTS=false
\`\`\`

\`\`\`bash
npm ci
npm run build
sudo cp -r dist /var/www/riskradar
\`\`\`

## 9. NGINX reverse proxy + TLS (app host)

\`\`\`bash
sudo apt -y install nginx
sudo cp /path/to/nrs-internal-ca.crt /etc/ssl/certs/riskradar.crt
sudo cp /path/to/riskradar.key      /etc/ssl/private/riskradar.key
\`\`\`

\`/etc/nginx/sites-available/riskradar\`:

\`\`\`nginx
server {
  listen 443 ssl http2;
  server_name riskradar.nrs.gov.ng;
  ssl_certificate     /etc/ssl/certs/riskradar.crt;
  ssl_certificate_key /etc/ssl/private/riskradar.key;
  ssl_protocols TLSv1.2 TLSv1.3;
  add_header Strict-Transport-Security "max-age=63072000" always;
  add_header X-Frame-Options DENY;
  add_header X-Content-Type-Options nosniff;

  root /var/www/riskradar;
  index index.html;
  location / { try_files $uri /index.html; }
}

server {
  listen 443 ssl http2;
  server_name api.riskradar.nrs.gov.ng;
  ssl_certificate     /etc/ssl/certs/riskradar.crt;
  ssl_certificate_key /etc/ssl/private/riskradar.key;
  location / {
    proxy_pass http://db.internal:8000;   # Kong gateway from Supabase stack
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
\`\`\`

\`\`\`bash
sudo ln -s /etc/nginx/sites-available/riskradar /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 443/tcp
\`\`\`

## 10. First admin user

\`\`\`bash
psql -U postgres -d postgres <<'SQL'
select auth.admin.create_user(
  email := 'admin@nrs.gov.ng',
  password := 'TempStrongP@ssw0rd!',
  email_confirm := true
);
insert into public.user_roles(user_id, role)
select id, 'ADMIN' from auth.users where email='admin@nrs.gov.ng';
SQL
\`\`\`

Log in at \`https://riskradar.nrs.gov.ng\`, immediately rotate the password,
enable MFA at **/profile**, then invite the remaining users from **/users**.

## 11. Backups & monitoring

- Schedule \`pg_dump\` to NAS every 6 h + WAL archiving to a separate volume.
- Snapshot \`/opt/supabase/volumes/storage\` nightly.
- Export Docker + GPU metrics to Prometheus; alert per the LLM hardware doc.
- Test restore quarterly into a staging host.

## 12. Verification checklist

- [ ] \`/login\` loads over HTTPS with valid internal-CA cert
- [ ] Sign Up tab and demo accounts are hidden
- [ ] Admin can invite a user → recovery email arrives via internal SMTP
- [ ] **/risk-register** AI score button completes (proves edge fn → Local LLM path)
- [ ] **/admin/auth-verification** lists all users
- [ ] \`pg_dump\` job has produced a backup file on the NAS
- [ ] Firewall denies inbound from user VLAN to DB/LLM ports
`,
  },
  {
    slug: 'onprem-install-windows',
    title: 'On-Prem Install Guide — Windows',
    description: 'Step-by-step on-premise install and configuration on Windows Server 2022.',
    group: 'Operations',
    content: `# On-Premise Installation Guide — Windows Server 2022

This guide installs RiskRadar end-to-end on Windows Server 2022 hosts. Because the
Supabase stack and most inference servers are Linux-native, this guide uses
**Docker Desktop for Windows with the WSL2 backend** (or Docker CE inside WSL2 on
Windows Server). The Local LLM uses **WSL2 + CUDA** for GPU passthrough.

Target audience: NRS Windows sysadmin. Estimated time: **5–7 hours**.

## 0. Topology (same as Linux guide)

\`\`\`text
[Users] → [IIS / ARR TLS] → [App host (Win + WSL2)]
                          → [DB host  (Win + WSL2): Supabase stack]
                          → [LLM host (Win + WSL2 + NVIDIA): vLLM / Ollama]
\`\`\`

## 1. Prerequisites

| Item             | Minimum                                                |
| ---------------- | ------------------------------------------------------ |
| OS               | Windows Server 2022 Standard / Datacenter (fully patched) |
| Roles & features | Hyper-V, Containers, WSL                               |
| CPU / RAM        | App+DB host: 16 vCPU / 64 GB. LLM host per hardware doc |
| TLS              | PFX cert from NRS internal CA                          |
| Outbound         | Optional (air-gappable if WSL packages staged locally) |
| Account          | Local Administrator on each host                       |

## 2. Enable WSL2 + Hyper-V + Containers

In an elevated **PowerShell**:

\`\`\`powershell
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform           -All -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V                -All -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName Containers                       -All -NoRestart
Restart-Computer
\`\`\`

After reboot:

\`\`\`powershell
wsl --set-default-version 2
wsl --install -d Ubuntu-22.04
wsl --update
\`\`\`

Launch the Ubuntu shell once to create the Linux user.

## 3. Install Docker Desktop for Windows (WSL2 backend)

1. Download Docker Desktop 4.30+ from your internal mirror.
2. Install with **Use WSL 2 instead of Hyper-V** checked.
3. In **Settings → Resources → WSL Integration**, enable the \`Ubuntu-22.04\` distro.
4. Verify in PowerShell: \`docker version\` and \`docker compose version\`.

## 4. Install the Supabase self-hosted stack (DB host)

Open the Ubuntu (WSL2) shell:

\`\`\`bash
sudo apt update && sudo apt -y install git curl jq
git clone --depth 1 https://github.com/supabase/supabase /opt/supabase
cd /opt/supabase/docker
cp .env.example .env
\`\`\`

Edit \`.env\` exactly as in the Linux guide (step 4): \`POSTGRES_PASSWORD\`,
\`JWT_SECRET\`, \`ANON_KEY\`, \`SERVICE_ROLE_KEY\`, SMTP, \`DISABLE_SIGNUP=true\`,
\`MAILER_AUTOCONFIRM=false\`, \`GOTRUE_MFA_ENABLED=true\`.

Start it:

\`\`\`bash
docker compose pull
docker compose up -d
docker compose ps
\`\`\`

Forward TCP 8000 (Kong) from Windows host to WSL via PowerShell:

\`\`\`powershell
$wslIp = (wsl hostname -I).Trim().Split(' ')[0]
netsh interface portproxy add v4tov4 listenport=8000 listenaddress=0.0.0.0 \`
  connectport=8000 connectaddress=$wslIp
\`\`\`

## 5. Apply RiskRadar migrations

In the WSL shell:

\`\`\`bash
git clone https://<internal-git>/nrs/riskradar.git /opt/riskradar
cd /opt/riskradar
for f in supabase/migrations/*.sql; do
  PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U postgres -d postgres -f "$f"
done
sudo cp -r supabase/functions/* /opt/supabase/volumes/functions/
docker compose restart functions
\`\`\`

## 6. Local LLM on Windows (LLM host)

### 6.1 NVIDIA driver + CUDA for WSL2

1. Install the **NVIDIA Windows driver for WSL** (R550+) from NVIDIA.
2. Reboot.
3. In the Ubuntu WSL shell, verify: \`nvidia-smi\` shows the GPU.
4. Install the NVIDIA container toolkit inside WSL:

\`\`\`bash
distribution=ubuntu22.04
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt -y install nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
\`\`\`

In Docker Desktop **Settings → Resources → WSL Integration**, ensure the GPU
is enabled (Docker Desktop 4.30+ passes \`--gpus all\` through).

### 6.2 Run vLLM (Tier 1 example)

\`\`\`bash
docker run -d --restart unless-stopped --name vllm \\
  --gpus all -p 8000:8000 \\
  -v /mnt/d/models:/models \\
  vllm/vllm-openai:latest \\
  --model /models/llama-3.1-8b-instruct-awq \\
  --served-model-name google/gemini-2.5-flash \\
  --quantization awq --max-model-len 8192
\`\`\`

Smoke test from PowerShell:

\`\`\`powershell
Invoke-RestMethod -Uri http://localhost:8000/v1/chat/completions -Method Post \`
  -ContentType 'application/json' \`
  -Body '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"ping"}]}'
\`\`\`

## 7. Build & publish the web app (app host)

Install Node.js 20 LTS for Windows (MSI) **or** build inside WSL.

PowerShell, native:

\`\`\`powershell
cd C:\\opt\\riskradar
Copy-Item .env.example .env
\`\`\`

Edit \`.env\`:

\`\`\`env
VITE_SUPABASE_URL=https://api.riskradar.nrs.gov.ng
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from step 4>
VITE_DISABLE_PUBLIC_SIGNUP=true
VITE_SHOW_DEMO_ACCOUNTS=false
\`\`\`

\`\`\`powershell
npm ci
npm run build
\`\`\`

Copy \`dist\\\` to \`C:\\inetpub\\riskradar\\\`.

## 8. IIS + URL Rewrite + ARR reverse proxy (app host)

\`\`\`powershell
Install-WindowsFeature -Name Web-Server, Web-Mgmt-Console, Web-Asp-Net45, Web-Http-Redirect
# Download & install: URL Rewrite 2.1, Application Request Routing 3.0
\`\`\`

In **IIS Manager**:

1. Create site **RiskRadar** → physical path \`C:\\inetpub\\riskradar\` → host
   header \`riskradar.nrs.gov.ng\` → HTTPS (443) → import PFX.
2. Add **URL Rewrite** rule for SPA fallback to \`/index.html\` for any
   non-file/non-dir request.
3. Create site **RiskRadar-API** → empty folder → host header
   \`api.riskradar.nrs.gov.ng\` → HTTPS (443) → URL Rewrite reverse proxy to
   \`http://<db-host>:8000/{R:1}\`. In ARR, enable **proxy mode**.

\`web.config\` for SPA (RiskRadar site):

\`\`\`xml
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPA" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile"      negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <httpProtocol>
      <customHeaders>
        <add name="Strict-Transport-Security" value="max-age=63072000" />
        <add name="X-Content-Type-Options"    value="nosniff" />
        <add name="X-Frame-Options"           value="DENY" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
\`\`\`

Open Windows Firewall for 443:

\`\`\`powershell
New-NetFirewallRule -DisplayName "RiskRadar HTTPS" -Direction Inbound \`
  -Protocol TCP -LocalPort 443 -Action Allow
\`\`\`

## 9. First admin user

In the DB host WSL shell:

\`\`\`bash
psql -h localhost -U postgres -d postgres <<'SQL'
select auth.admin.create_user(
  email := 'admin@nrs.gov.ng',
  password := 'TempStrongP@ssw0rd!',
  email_confirm := true
);
insert into public.user_roles(user_id, role)
select id, 'ADMIN' from auth.users where email='admin@nrs.gov.ng';
SQL
\`\`\`

Log in, rotate the password, enable MFA, invite other users from **/users**.

## 10. Backups & monitoring (Windows specifics)

- Schedule **Windows Server Backup** of \`C:\\inetpub\\riskradar\` and the WSL
  \`ext4.vhdx\` files daily to a SAN/NAS share.
- Inside WSL, cron \`pg_dump\` every 6 h to \`/mnt/<backup-share>\`.
- Push Docker + GPU metrics to Prometheus via \`windows_exporter\` and
  \`dcgm-exporter\` running inside WSL.
- Apply Windows Update on the second Tuesday of each month after snapshotting.

## 11. Verification checklist

- [ ] \`https://riskradar.nrs.gov.ng\` loads with the internal-CA PFX cert
- [ ] Sign Up tab and demo accounts hidden
- [ ] \`docker ps\` (WSL) shows Supabase containers + \`vllm\` healthy
- [ ] \`nvidia-smi\` (WSL) shows the GPU under load when AI score is requested
- [ ] Admin invite email arrives via internal SMTP relay
- [ ] **/admin/auth-verification** lists all users and recent auth events
- [ ] Backup share contains today's \`pg_dump\` file
- [ ] Firewall denies inbound to TCP 5432 / 8000 from user VLAN
`,
  },
  {
    slug: 'getting-started',
    title: 'Getting Started',
    description: 'First login, layout tour and role-based landing pages.',
    group: 'Getting Started',
    content: `# Getting Started

This page gets a brand-new user from zero to productive in about ten minutes.

## 1. Signing in

1. Open the portal URL provided by your administrator.
2. Enter your work email and password. If you were invited by an admin,
   follow the invitation link to set your password first.
3. Forgot your password? Click **Forgot password?** on the login screen —
   a reset link will be emailed to you.

> **Session timeout:** you are automatically signed out after **5 minutes**
> of inactivity, per NRS security policy.

## 2. Your landing page

The page you see after login depends on your role:

| Role | Default landing page |
|------|----------------------|
| RC, RR, RO | Main Dashboard |
| RMD | Main Dashboard with full module access |
| CRO, ERMSC, EC, RCB | Executive Dashboard |
| ADMIN | Main Dashboard + Settings access |

See [Roles & Permissions](/docs/roles) for the full matrix.

## 3. The layout

- **Header** — logo, global search, notifications bell, profile menu.
- **Sidebar** — modules you have access to. Collapse it with the menu button.
- **Main area** — content for the current page.
- **Profile menu** — profile, help & support, and sign-out.

## 4. Global search

Press the search bar in the header (or the search icon on mobile) to jump to
any risk, BCP or document you have access to.

## 5. Notifications

The bell icon in the header opens the **Notification Center**. You'll see
approval requests, deadline reminders, appetite breaches and crystallized
risk alerts here.

## 6. Next step

Try the [Quick Tour](/docs/quick-tour) — it walks you through creating your
first risk and seeing it appear on the dashboard.
`,
  },
  {
    slug: 'quick-tour',
    title: 'Quick Tour',
    description: 'Create a risk, assess it, treat it, and watch it on the dashboard.',
    group: 'Getting Started',
    content: `# Quick Tour (5 minutes)

Follow this walkthrough to see how a risk flows through RiskRadar end-to-end.

## Step 1 — Create a risk

1. Sidebar → **Risk Register**.
2. Click **Add New Risk** (or **Risk Wizard** for a guided flow).
3. Fill in title, description, category, department and owner.
4. Choose an inherent **Likelihood** (1–5) and **Impact** (1–5).
5. Save. The new risk is created with status **Pending Review**.

## Step 2 — Review & approve

1. A reviewer (RR) opens **Approval Inbox** from the sidebar.
2. They review the details and click **Approve** — the risk becomes active.

See [Approval Inbox](/docs/approval-inbox) for the reviewer workflow.

## Step 3 — See it on the Risk Matrix

Sidebar → **Risk Matrix**. Your new risk appears in the heat map cell
matching its likelihood × impact score. Click the cell to drill in.

## Step 4 — Add a treatment plan

1. Open the risk from the register.
2. Choose a treatment strategy: **Avoid / Mitigate / Transfer / Accept**.
3. Add mitigation tasks with owners, due dates and budget (NGN).
4. Save.

## Step 5 — Watch it on the dashboard

- **Main Dashboard** — the new risk shows in *Recent Activities*.
- **Executive Dashboard** — it counts towards total risks, category
  distribution and (if score ≥ 15) high-severity KPIs.
- **Executive Summary** — refreshed hourly for board-ready roll-ups.

That's the full lifecycle. From here, explore the module pages for depth.
`,
  },
  {
    slug: 'glossary',
    title: 'Glossary',
    description: 'ISO 31000 and BCP terminology used across RiskRadar.',
    group: 'Getting Started',
    content: `# Glossary

| Term | Definition |
|------|------------|
| **Risk** | The effect of uncertainty on objectives (ISO 31000). |
| **Inherent risk** | The level of risk before any controls are applied. |
| **Residual risk** | The level of risk remaining after controls. |
| **Likelihood** | The chance of a risk event occurring, scored 1–5. |
| **Impact** | The severity of consequences if the risk occurs, scored 1–5. |
| **Risk score** | Likelihood × Impact. Scores ≥ **15** are high-severity. |
| **Risk appetite** | The amount of risk the organisation is willing to accept. |
| **Risk tolerance** | The acceptable variation around the appetite. |
| **Appetite breach** | A risk exceeding the configured appetite threshold. |
| **KRI** | Key Risk Indicator — a metric monitored for early warning. |
| **Control** | An action or safeguard that reduces likelihood or impact. |
| **Treatment strategy** | Avoid, Mitigate, Transfer or Accept. |
| **Mitigation task** | A trackable action within a treatment plan. |
| **Crystallized risk** | A risk that has materialised into an actual event. |
| **BCP** | Business Continuity Plan. |
| **BIA** | Business Impact Assessment — criticality analysis of a process. |
| **RTO** | Recovery Time Objective — max acceptable downtime. |
| **RPO** | Recovery Point Objective — max acceptable data loss. |
| **RLS** | Row-Level Security — database-enforced access rules. |
| **Audit log** | An immutable record of who changed what and when. |
| **Whistleblowing case** | An anonymously submitted concern under investigation. |
`,
  },
  {
    slug: 'dashboard',
    title: 'Main Dashboard',
    description: 'Your personalized landing page and hub for the portal.',
    group: 'Modules',
    content: `# Main Dashboard

The **Main Dashboard** is the first screen displayed after a successful
login. It is the central hub of the Risk Management Portal, giving you an
overview of important information and quick access to core modules.

The dashboard is personalised based on your role and permissions — you only
see information relevant to your responsibilities.

## Accessing the Main Dashboard

You are redirected here automatically after login, or from the sidebar:

**→ Dashboard**

## Dashboard components

### Quick Links

Shortcuts to the modules you use most, based on your role. Typical entries:

- Risk Register
- Executive Dashboard
- Reports
- Incident Management
- Business Continuity Planning
- Approval Inbox

### Recent Activities

The latest actions performed within the system, so you can quickly resume
ongoing work and monitor updates. Activities may include:

- Newly created risks
- Updated risk assessments
- Recent approvals
- Incident updates
- Report generation

### AI Insights

Intelligent recommendations and highlights generated from the current data
in the system. Designed to surface significant trends, potential risks and
actionable insights to support better decisions.

### Reports and Analytics

Direct entry points to reporting and analytical features:

- Organisation-wide risk metrics
- Trend and performance monitoring
- Executive reports
- Interactive dashboards

## Best practices

- Check the dashboard at the start of each working day.
- Act on notifications and pending approvals promptly.
- Use AI Insights as a prompt for deeper investigation, not a substitute
  for professional judgement.
`,
  },
  {
    slug: 'risk-matrix',
    title: 'Risk Matrix',
    description: 'Interactive heat map for visualising and prioritising risks.',
    group: 'Modules',
    content: `# Risk Matrix

The Risk Matrix provides a graphical representation of all identified risks
within the system. It automatically plots risks according to their
**Likelihood** and **Impact** scores, enabling you to quickly identify
high-priority risks that require immediate attention.

The matrix is interactive — click any cell to view the risks it contains.

## Accessing the Risk Matrix

Sidebar → **Risk Matrix (Heat Map)**

The matrix updates automatically whenever a risk assessment is completed or
modified.

## Key features

- Automatically categorises risks based on assessment scores.
- Displays risk concentration across impact and likelihood levels.
- Drill down into individual risks directly from the matrix.
- Interactive filtering by department, category and status.
- Updates dynamically as risks are created or reassessed.
- Export the matrix to PDF or PNG for reports.

## Viewing risk details

Selecting a cell displays the list of corresponding risks, including their
assessment details and current status. From the list you can open a risk to
review or take action.

## Colour bands

| Band | Score range | Meaning |
|------|-------------|---------|
| Green | 1 – 6 | Low — monitor |
| Yellow | 7 – 14 | Medium — active treatment |
| Red | 15 – 25 | High — executive attention (auto-notified) |

## Best practices

- Ensure every risk has an accurate **Likelihood** and **Impact** before
  submission.
- Regularly review the matrix to identify emerging high-risk areas.
- Reassess risks whenever significant changes occur so the matrix reflects
  the current profile.
- Combine the matrix with the [Executive Dashboard](/docs/executive-dashboard)
  and [Reports](/docs/reports) for a full picture.
`,
  },
  {
    slug: 'approval-inbox',
    title: 'Approval Inbox',
    description: 'Review, approve, reject or return workflow items.',
    group: 'Modules',
    content: `# Approval Inbox

The **Approval Inbox** provides a centralised view of all requests awaiting
your approval. Authorised users can review submitted records, verify the
information, and either approve, reject, or return them for updates before
they proceed through the workflow.

Only users with approval permissions (RR, RMD, CRO, ADMIN) can access and
process approval requests.

## Accessing the Approval Inbox

Sidebar → **Approval Inbox**

The page displays all pending approval requests assigned to you.

## Reviewing a request

Select a pending request to view its details. Review, where applicable:

- Request details
- Submitted information
- Supporting documents or attachments
- Approval comments and history
- Date submitted
- Request owner

Ensure the information is complete and accurate before taking action.

## Approval actions

- **Approve** — confirms the request and advances the workflow.
- **Reject** — declines the request; the requester is notified with your
  comments.
- **Request Changes** — sends the request back for corrections before it
  can be reconsidered.

Provide comments explaining your decision, especially for rejections and
change requests.

## Bulk actions

RMD and CRO users can select multiple items and approve or reject them in a
single action using the bulk approval bar at the top of the list.

## Tracking approval status

Requesters can monitor their submissions through the workflow. The system
records every decision, timestamp and comment, providing a complete audit
trail — visible in the [Audit Log](/docs/roles) for RMD, CRO and ADMIN.

## Best practices

- Review submitted information carefully before approving.
- Provide clear comments when rejecting or requesting changes.
- Process pending approvals promptly to avoid workflow delays.
- Ensure approval decisions comply with governance and approval policies.
- Monitor the inbox regularly so pending requests do not accumulate.
`,
  },
  {
    slug: 'executive-dashboard',
    title: 'Executive Dashboard',
    description: 'KPIs, trends and interactive analytics for management.',
    group: 'Modules',
    content: `# Executive Dashboard

The **Executive Dashboard** provides management with a centralised view of
the organisation's overall risk landscape. It presents key risk indicators,
trends and performance metrics in an easy-to-understand visual format,
enabling executives to identify critical risks quickly and make informed
decisions.

## Accessing the Executive Dashboard

Sidebar → **Executive Dashboard**

All dashboard components update automatically as risk data changes.

## Key components

- Top KPI cards (total risks, high-severity, appetite breaches, BCP
  coverage, mitigation progress).
- Interactive charts and graphs (category distribution, trend over time,
  status breakdown, top risks).
- Executive reports and analytics widgets.
- AI Predictive Risk Panel and AI Score cards.

## Filtering dashboard data

Refine the view using the filters:

- Department
- Risk Category
- Business Unit
- Date Range
- Risk Status

Filters let you focus on specific areas of interest and support deeper
analysis.

## Drill-down

Click any chart, graph or heat-map element to open the underlying list of
risks. From there you can open a risk to review or take action.

## Exporting

Use **Export Reports** in the top-right to download the current view as PDF
or Excel for meetings and offline analysis.

## Best practices

- Review the dashboard before executive meetings.
- Apply filters relevant to the audience (e.g. by department for a
  divisional briefing).
- Use trend charts to spot emerging patterns early.
- Combine with the [Executive Summary](/docs/executive-summary) and
  [Board Reports](/docs/reports) for a full reporting pack.
`,
  },
  {
    slug: 'executive-summary',
    title: 'Executive Summary',
    description: 'Auto-generated organisation-wide roll-up for boards.',
    group: 'Modules',
    content: `# Executive Summary

The **Executive Summary** gives management a high-level overview of
organisational risk through key metrics, reports and visual analytics.
Information is generated automatically from data captured across the
Risk Management Portal.

## Accessing the Executive Summary

Sidebar → **Reports → Executive Summary**

The page displays organisation-wide statistics based on your access
permissions.

## Key information

The Executive Summary provides an overview of:

- Total number of identified risks.
- Number of open and closed risks.
- High-priority risks requiring immediate attention.
- Risks currently under treatment.
- Mitigated and escalated risks.
- Average residual risk score.
- Risk distribution by category.
- Risk trend analysis over time.
- Interactive charts and performance indicators.

## Interactive reporting

You can interact with charts and summary widgets to:

- Drill down into specific risk records.
- Filter by department, category or period.
- Export the current view for board packs.

## Refresh cadence

The summary refreshes hourly via a scheduled edge function. You can also
regenerate on-demand using **AI Report Generator** for a narrative version.

## Best practices

- Use trend analysis to identify recurring risk patterns and support
  proactive management.
- Apply filters to focus on specific departments, business units or
  reporting periods.
- Export summary reports for board meetings, management reviews and
  compliance reporting.
`,
  },
  {
    slug: 'learning-forum',
    title: 'Learning Forum',
    description: 'Discussions, training modules and knowledge sharing.',
    group: 'Modules',
    content: `# Learning Forum

The **Learning Forum** gives users access to discussions, learning
resources, CSDD training modules and knowledge-sharing content to support
effective use of the Risk Management Portal.

## Accessing the Learning Forum

Sidebar → **Learning Forum**

Available to all authenticated users.

## What's inside

- Training materials and reference resources.
- Risk management best practices.
- System usage guidance.
- Announcements and learning updates.
- Discussion threads for peer-to-peer knowledge sharing.

## Using the forum

Browse available learning materials and select the relevant topic to view
detailed guidance. Resources are organised to make it easy to locate
information on specific modules or system functions.

## Contribution etiquette

- Keep discussions professional and on-topic.
- Do not post confidential risk data, personal information or credentials.
- Cite sources when sharing external material.
- Flag inappropriate content to your administrator.

## Best practices

- Complete introductory training before using the Risk Register for the
  first time.
- Revisit the forum periodically for updates and new best practices.
- Encourage team members to share lessons learned from real incidents.
`,
  },
  {
    slug: 'help-faq',
    title: 'Help & FAQ',
    description: 'Self-service answers, troubleshooting and support contacts.',
    group: 'Modules',
    content: `# Help & FAQ

The **Help & FAQ** module lets you resolve common issues without waiting
for the administrator or support team.

## Accessing Help & FAQ

Sidebar → **Help & FAQ**

Available to all users of the system.

## Key features

- Frequently Asked Questions.
- Step-by-step guidance on using the system.
- Answers to common user issues.
- System usage tips and best practices.
- Contact information for technical support.
- User assistance resources.

## Finding information

Browse the available help topics or search for answers on:

- Risk Management
- Incident Management
- Reports and Dashboards
- Business Continuity Planning
- User Access and Navigation
- General System Usage

## Common questions

**I can't sign in.** Use **Forgot password?** on the login screen. If your
account is locked after multiple failed attempts, contact your admin who
can unlock it from the Auth Verification dashboard.

**I don't see a menu item I expect.** Your role may not have access.
Check [Roles & Permissions](/docs/roles) or contact your admin.

**My risk isn't on the dashboard.** New risks are **Pending Review** until
a Reviewer approves them — see [Approval Inbox](/docs/approval-inbox).

**How do I change my password?** Profile menu → **Profile** → change
password.

**Who do I contact for help?** Use the support contact shown on the Help &
FAQ page or reach out to the Risk Management Department.

## Escalation path

1. Search Help & FAQ.
2. Ask in the [Learning Forum](/docs/learning-forum).
3. Contact your departmental Risk Champion.
4. Raise a support ticket with the administrator.
`,
  },
  {
    slug: 'role-guides',
    title: 'Role-Based Guides',
    description: 'Scene-by-scene user guides for each end-user role.',
    group: 'Role-Based Guides',
    content: `# Role-Based User Guides

These guides walk each end-user role through the exact clicks, expected
outcomes, and business value of a typical working session. They're adapted
from the NRS role-based demo scripts, so what you see here mirrors a live
walkthrough of the portal.

## Who each guide is for

| Role | Guide | Focus |
|---|---|---|
| Risk Champion (RC) | [RC Guide](/docs/role-guide-rc) | Capture and submit new risks |
| Risk Reviewer (RR) | [RR Guide](/docs/role-guide-rr) | Triage the reviewer queue, AI sanity checks |
| Risk Owner (RO) | [RO Guide](/docs/role-guide-ro) | Execute treatments, budget, crystallisation |
| Risk Management Dept (RMD) | [RMD Guide](/docs/role-guide-rmd) | Enterprise oversight, board reports, BCP |
| Chief Risk Officer (CRO) | [CRO Guide](/docs/role-guide-cro) | Final approvals, escalations, enterprise sign-off |
| ERM Steering Committee (ERMSC) | [ERMSC Guide](/docs/role-guide-ermsc) | Strategic oversight and portfolio review |
| Executive Chairman (EC) | [EC Guide](/docs/role-guide-ec) | Executive actions and top-risk visibility |
| Risk Committee of the Board (RCB) | [RCB Guide](/docs/role-guide-rcb) | Board oversight and quarterly reporting |
| Administrator (ADMIN) | [Admin Guide](/docs/role-guide-admin) | User management, settings, data & audit |
| General User (USER) | [User Guide](/docs/role-guide-user) | Read-only matrix, learning forum, FAQs |

See the [Roles & Permissions reference](/docs/roles) for the consolidated
Sidebar & Module Access Matrix and Action Capability Matrix comparing all roles
side by side.



## How to read a guide

Each guide is structured as short **scenes** (1–4 minutes each). Every step
uses these markers:

- 🖱 **Click** — the exact UI action
- 👀 **Look for** — the expected on-screen outcome
- 💬 **Value** — what to highlight or remember
- ⚠️ **Watch out** — common pitfalls

## Cross-role story

Across the four guides the *same risk* moves from a Champion's draft, through
a Reviewer's quality gate, into an Owner's execution and crystallisation, and
finally into RMD's board-level narrative — all on one platform, all auditable,
all role-appropriate.

## Next steps

- New to the app? Start with [Getting Started](/docs/getting-started) and the
  [Quick Tour](/docs/quick-tour).
- Need module reference? See the [Risk Register](/docs/risk-register),
  [Approval Inbox](/docs/approval-inbox), and [Executive Dashboard](/docs/executive-dashboard).
`,
  },
  {
    slug: 'role-guide-rc',
    title: 'Risk Champion (RC)',
    description: 'The eyes and ears in the department — capture and submit risks.',
    group: 'Role-Based Guides',
    content: `# Risk Champion (RC) — *The Eyes & Ears in the Department*

**Persona:** Departmental risk focal person. Identifies risks, drafts
entries, owns first-line controls.

**Goal:** Capture a new risk in under 3 minutes and track it through the
workflow.

## Scene 1 — Sign in & landing page

1. 🖱 Navigate to the portal URL → enter RC credentials → **Sign in**.
2. 👀 Land on **Dashboard (\`/app\`)** with widgets filtered to your department.
3. 💬 As a Risk Champion you see only what's relevant to your department — no information overload.

## Scene 2 — Capture a new institutional risk

1. 🖱 Sidebar → **Risk Register** → **+ New Risk**.
2. 👀 The 4-step **Risk Wizard** opens with Step 1 (Identification) active.
3. 🖱 Fill **Title**, **Description**, **Category** (e.g. *Operational*), **Strategic Objective**, **Department** (auto-filled). Click **Next**.
4. 🖱 Step 2 — pick **Inherent Likelihood** and **Inherent Impact** on the 5×5 matrix. Click **Next**.
5. 👀 The matrix highlights the cell and shows the colour-coded risk rating.
6. 🖱 Step 3 — add a **Mitigation Plan**, choose **Treatment Strategy = Mitigate**, set **Target Date**.
7. 🖱 Step 4 — review, then click **Save as Draft**.
8. 👀 New risk appears at the top of the register with an auto-generated reference (e.g. \`IR2604001\`) and status **Draft**.
9. 💬 Auto-numbering and the wizard mean every champion captures the same fields the same way — the register stays clean.

## Scene 3 — Submit for review

1. 🖱 Click the new risk → **View** → **Workflow Actions** panel → **Submit for Review**.
2. 👀 Status badge flips to **Under Review**; an entry appears in the **Approval History** tab.
3. 👀 Notification bell pulses (RR receives an in-app notification).
4. 💬 The risk is now in the reviewer's queue with full audit visibility.

## Scene 4 — Attach evidence

1. 🖱 Same risk view → **Attachments** tab → **Upload Document** → pick a PDF.
2. 👀 File appears with version 1.0 and uploader timestamp.
3. 💬 Every risk carries its own evidence pack — auditors love this.

## Scene 5 — Wrap

1. 🖱 Sidebar → **Notifications** → confirm the *"Risk submitted for review"* entry is logged.
2. 💬 **Value recap:** Standardised intake, auto-reference, evidence vault, and instant workflow handoff — all in under 5 minutes.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard | ✅ | View (own dept scope) |
| Risk Register | ✅ | View, **Add**, edit own risks |
| Approval Inbox | ❌ | No access |
| Risk Matrix | ❌ | Not shown (view via register) |
| Reports | ❌ | No access |
| Business Continuity | ❌ | No access |
| Whistleblowing cases | ❌ | No access |
| User Management / Settings | ❌ | No access |

## Watch-outs

- ⚠️ Don't skip Step 4 of the wizard — the **Save** button only appears after the review step.
- ⚠️ You cannot approve your own submissions — the RR/CRO/RMD will pick them up.

## Next steps

- [Risk Register](/docs/risk-register) — full module reference.
- [Approval Inbox](/docs/approval-inbox) — where your submission is picked up.
- [Glossary](/docs/glossary) — inherent vs residual, likelihood, impact.
`,
  },
  {
    slug: 'role-guide-rr',
    title: 'Risk Reviewer (RR)',
    description: 'The quality gate — triage, AI sanity check, return or approve.',
    group: 'Role-Based Guides',
    content: `# Risk Reviewer (RR) — *The Quality Gate*

**Persona:** Reviews submissions for completeness, scoring accuracy, and
adequate mitigation before they reach the supervisor / CRO.

**Goal:** Work the triage queue with AI-assisted scoring sanity checks and a
one-click return loop.

## Scene 1 — Reviewer queue

1. 🖱 Sign in as RR → Dashboard.
2. 🖱 Sidebar → **Risk Register** → **Status filter** = *Under Review*.
3. 👀 List narrows to risks awaiting review, including the one the RC submitted.
4. 💬 This is your worklist — focused and finite.

## Scene 2 — Open a submission

1. 🖱 Click the risk → **View Risk**.
2. 👀 Header shows reference, submitter, and submission timestamp.
3. 🖱 Expand **Approval History** → see the RC's submit action.
4. 💬 Full chain of custody from the moment it was drafted.

## Scene 3 — Run AI sanity check on the score

1. 🖱 In the **AI Score** panel → click **Run AI Score**.
2. 👀 Within seconds the panel shows the AI's recommended **likelihood**, **impact**, **confidence %**, and a written **explanation**.
3. 💬 You don't have to second-guess the score alone — Lovable AI compares the narrative against historical patterns.

## Scene 4 — Return for revision

1. 🖱 **Workflow Actions** → **Return for Revision** → enter comment *"Please add quantitative impact estimate."* → Confirm.
2. 👀 Status flips to **Returned**; the comment is recorded; the RC gets a notification.
3. 💬 No emails lost in inboxes — feedback is anchored to the risk record.

## Scene 5 — Approve a different risk

1. 🖱 Open another *Under Review* risk → **Approve & Forward to Supervisor**.
2. 👀 Status → **Pending Supervisor**; approval history updates.
3. 💬 **Value recap:** A curated queue, AI assistance, and a one-click return loop — quality without bottlenecks.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard | ✅ | View |
| Risk Register | ✅ | View, review, return, approve |
| Approval Inbox | ✅ | Full triage queue |
| Risk Matrix | ✅ | View (inherent & residual) |
| Reports | ✅ | View |
| Business Continuity | ❌ | No access |
| User Management / Settings | ❌ | No access |

## Watch-outs

- ⚠️ Approval is irreversible from this UI — use **Return** if in doubt.

## Next steps

- [Approval Inbox](/docs/approval-inbox) — full reviewer workflow reference.
- [Risk Register](/docs/risk-register) — filters, columns, bulk actions.
`,
  },
  {
    slug: 'role-guide-ro',
    title: 'Risk Owner (RO)',
    description: 'The accountable executor — treatment tasks, budget, crystallisation.',
    group: 'Role-Based Guides',
    content: `# Risk Owner (RO) — *The Accountable Executor*

**Persona:** Owns the risk and its treatment. Executes mitigation actions,
monitors budget, reports incidents.

**Goal:** Manage treatment tasks and budget, run AI mitigation
recommendations, reassess residual risk, and report crystallised events.

## Scene 1 — "My Risks" view

1. 🖱 Sign in as RO → Sidebar → **Risk Register** → filter **Owner = me**.
2. 👀 Personal portfolio of owned risks, each with status badges and next-review dates.
3. 💬 You see your full portfolio at a glance — no guesswork about what you're accountable for.

## Scene 2 — Manage treatment tasks

1. 🖱 Click an *Approved* risk → **Treatment Tasks** tab → **+ Add Task**.
2. 🖱 Fill task title, assignee, due date, budget allocation in **NGN** → Save.
3. 👀 Task appears with a progress bar and a budget bar.
4. 🖱 Toggle status to **In Progress** → record **Spent = ₦500,000**.
5. 👀 Budget bar shifts colour (green → amber as utilisation crosses 75%; red past 90%).
6. 💬 Money and progress live side by side.

## Scene 3 — Run AI mitigation recommendations

1. 🖱 **Mitigation Recommendations** button → wait for the AI panel.
2. 👀 Recommended actions appear; each can be **Add as Task** with one click.
3. 💬 The AI never replaces the owner — it accelerates them.

## Scene 4 — Post-control reassessment

1. 🖱 Scroll to **Post-Control Reassessment** → set new likelihood/impact → **Save Assessment**.
2. 👀 Residual rating recalculates; the risk's heatmap position shifts on the dashboard.
3. 💬 The story of the risk is told end-to-end: inherent → controls → residual.

## Scene 5 — Report a crystallised risk

1. 🖱 Header → **Report Crystallised** → enter actual impact amount, root cause, lessons learned → Submit.
2. 👀 Risk gains a **Crystallised** badge; an incident appears in \`/incidents\`.
3. 💬 **Value recap:** You can act, account, and report — all without leaving the risk record.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard | ✅ | View (own portfolio scope) |
| Risk Register | ✅ | View, **Add**, edit own risks, assign |
| Approval Inbox | ❌ | No access |
| Risk Matrix | ❌ | Not shown (view via register) |
| Reports | ❌ | No access |
| Business Continuity | ❌ | No access |
| User Management / Settings | ❌ | No access |

## Watch-outs

- ⚠️ Once a risk is crystallised it cannot be re-opened — confirm the implication before submitting.

## Next steps

- [Risk Register](/docs/risk-register) — treatment tab reference.
- [Incidents](/docs/incidents) — how crystallised risks flow into incidents.
- [Glossary](/docs/glossary) — crystallised risk, residual, budget colour thresholds.
`,
  },
  {
    slug: 'role-guide-rmd',
    title: 'Risk Management Dept (RMD)',
    description: 'The power user and storyteller — enterprise oversight, AI reports, BCP, audit trail.',
    group: 'Role-Based Guides',
    content: `# Risk Management Department (RMD) — *The Power User & Storyteller*

**Persona:** Daily oversight of the entire register, board-level reporting,
BCP coordination, AI analytics.

**Goal:** Enterprise-wide visibility, AI-generated board reports, BCP/BIA
management, and full audit trail — all in a single working session.

## Scene 1 — Enterprise dashboard

1. 🖱 Sign in as RMD → land on **Dashboard (\`/app\`)**.
2. 👀 Widgets show enterprise-wide totals: high-priority risks, open risks, BCP coverage, appetite breaches.
3. 🖱 Click the **High Priority Risks** card → drill into the filtered register.
4. 💬 Every metric on this dashboard is clickable — go from headline to detail in one click.

## Scene 2 — Risk Matrix interactive heatmap

1. 🖱 Sidebar → **Risk Matrix** → toggle **Inherent ↔ Residual**.
2. 👀 Heatmap re-paints; the matrix-size badge shows 5×5.
3. 🖱 Click a red cell → list of risks in that cell.
4. 💬 The matrix isn't just a picture — it's a navigation tool.

## Scene 3 — Appetite breach analytics

1. 🖱 Sidebar → **Settings** → **Risk Appetite** tab.
2. 👀 Appetite rules table plus a **Breach Trend Chart** over time.
3. 🖱 Edit a rule → lower the threshold → Save.
4. 👀 Affected risks immediately receive a **Breach** badge in the register.
5. 💬 Tune appetite live; the system enforces it instantly.

## Scene 4 — Generate an AI Board Report

1. 🖱 Sidebar → **Board Reports** → **+ Generate AI Report** → choose **Quarterly Risk Assessment** → Generate.
2. 👀 Within ~30 seconds an executive narrative + tables render in the preview dialog.
3. 🖱 **Save to Archive** → opens in the **Report Archive** panel.
4. 🖱 **Export → PDF**.
5. 💬 What used to take a week of analyst time is a 30-second click — and it's archived for audit.

## Scene 5 — Schedule a recurring report

1. 🖱 In **Board Reports** → **Schedule Report** → frequency = *Monthly*, recipients = CRO, EC → Save.
2. 👀 Schedule appears with \`next_run_at\`.
3. 💬 Reports send themselves on the right cadence.

## Scene 6 — Business Continuity & BIA

1. 🖱 Sidebar → **Business Continuity** → open a critical BCP.
2. 👀 RTO/RPO, dependencies, BIA section, and test history are visible.
3. 🖱 **Test Details** → record a successful test → Save.
4. 👀 Next-test reminder is auto-scheduled.
5. 💬 BCP, BIA, and testing live in one record — no spreadsheets.

## Scene 7 — Audit trail walkthrough

1. 🖱 Sidebar → **Audit Log Viewer** → filter by today.
2. 👀 Every action from RC, RR, RO, and RMD across the day is recorded with field-level diffs.
3. 💬 **Value recap:** RMD has the bird's-eye view, the AI co-pilot, the executive report, the BCP coordination, and the audit trail — one platform.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard | ✅ | Enterprise-wide |
| Risk Register | ✅ | View, **Add**, edit all, approve |
| Approval Inbox | ✅ | Full triage & approvals |
| Risk Matrix | ✅ | View (inherent & residual) |
| Reports / Board Reports | ✅ | View, generate, schedule |
| Business Continuity | ✅ | Full CRUD, BIA, testing |
| Whistleblowing cases | ✅ | Manage |
| Audit Logs / BCP schema checks | ✅ | View |
| User Management | ✅ | Manage users & roles |
| Settings / Data Management | ❌ | Admin-only |

## Watch-outs

- ⚠️ AI generation depends on the gateway — keep a backup pre-archived report ready in case of network latency during a live demo.

## Next steps

- [Executive Dashboard](/docs/executive-dashboard) and [Executive Summary](/docs/executive-summary) for board-facing views.
- [Business Continuity](/docs/business-continuity) — full BCP/BIA reference.
- [Reports](/docs/reports) — scheduling and archive details.
`,
  },
  {
    slug: 'role-guide-cro',
    title: 'Chief Risk Officer (CRO)',
    description: 'The enterprise risk decision-maker — final approvals, escalations, sign-off.',
    group: 'Role-Based Guides',
    content: `# Chief Risk Officer (CRO) — *Enterprise Sign-Off*

**Persona:** Owns enterprise risk posture. Final approver on escalated
and high-severity risks. Sponsor of the ERM programme.

**Goal:** Review the highest-severity items, approve or escalate, and
sign off on board-facing narratives.

## Scene 1 — Executive landing

1. 🖱 Sign in as CRO → land on **Dashboard**.
2. 👀 Enterprise-wide KPIs: top risks, breaches of appetite, open incidents.
3. 🖱 Click **Executive Summary** in the sidebar.
4. 💬 Everything scoped to executive decision-making — no data-entry noise.

## Scene 2 — Workflow: approve a high-severity risk

1. 🖱 Sidebar → **Approval Inbox** → filter **Severity ≥ 15**.
2. 🖱 Open a risk → review AI score, mitigation plan, owner comments.
3. 🖱 **Workflow Actions** → **Approve**.
4. 👀 Approval history captures your sign-off with timestamp.

## Scene 3 — Workflow: escalate / de-escalate

1. 🖱 On an ambiguous risk → **Escalate** → add rationale → Confirm.
2. 👀 Lifecycle status → **Escalated**; notification to ERMSC and EC.
3. 🖱 Later, on the same risk → **De-escalate** to return it to review.
4. 💬 CRO is one of the only roles allowed to de-escalate — use it deliberately.

## Scene 4 — Workflow: update status on an owned risk

1. 🖱 Risk Register → open a risk you own or sponsor.
2. 🖱 Edit lifecycle status (e.g. **In Review → Mitigated**) → Save.
3. 👀 Change appears in the audit log with your user id and old/new values.

## Scene 5 — Sign off on a board report

1. 🖱 Sidebar → **Board Reports** → open the latest quarterly draft.
2. 🖱 Review preview → **Save to Archive** → **Export PDF** for the board pack.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard / Executive Summary | ✅ | Enterprise-wide |
| Risk Register | ✅ | View, add, edit all, **approve all**, escalate/de-escalate |
| Approval Inbox | ✅ | Full |
| Risk Matrix | ✅ | View |
| Reports / Board Reports | ✅ | View, generate |
| Business Continuity | ✅ | Full |
| Whistleblowing cases | ✅ | Manage |
| Audit Logs / BCP schema checks | ✅ | View |
| **User Management** | ❌ | **Explicitly denied — ADMIN only** |
| Settings / Data Management | ❌ | Admin-only |

## Watch-outs

- ⚠️ CRO cannot manage users — request account changes from an ADMIN.
- ⚠️ Approvals are final; use **Return** or **Escalate** when in doubt.

## Next steps

- [Approval Inbox](/docs/approval-inbox) — reviewer/approver workflow.
- [Executive Summary](/docs/executive-summary) — CRO-facing view.
- [Board Reports](/docs/reports) — sign-off pack.
`,
  },
  {
    slug: 'role-guide-ermsc',
    title: 'ERM Steering Committee (ERMSC)',
    description: 'Strategic oversight — portfolio review, no data entry.',
    group: 'Role-Based Guides',
    content: `# ERM Steering Committee (ERMSC) — *Strategic Oversight*

**Persona:** Cross-functional committee that steers the ERM programme.
Consumes analytics; does not modify records.

**Goal:** Review the enterprise portfolio, appetite breaches, and
strategic-objective alignment.

## Scene 1 — Strategic dashboard

1. 🖱 Sign in as ERMSC → **Dashboard**.
2. 👀 Enterprise KPIs and heatmap tiles.
3. 🖱 **Executive Summary** for the narrative view.

## Scene 2 — Workflow: view risks by strategic objective

1. 🖱 Sidebar → **Risk Register** → filter by **Strategic Objective**.
2. 👀 Risks grouped by objective with severity chips.
3. 🖱 Click a risk → **View** (read-only) → inspect AI score & mitigation.

## Scene 3 — Workflow: portfolio review meeting prep

1. 🖱 **Reports** → export a heatmap PDF.
2. 🖱 **Risk Matrix** → toggle Inherent ↔ Residual → screenshot for the pack.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard / Executive Summary | ✅ | View |
| Risk Register | ✅ | **View-only** (no add / edit / approve) |
| Approval Inbox | ❌ | No access |
| Risk Matrix | ✅ | View |
| Reports | ✅ | View, export |
| Business Continuity | ❌ | View via reports only |
| User Management / Settings | ❌ | No access |

## Watch-outs

- ⚠️ Any workflow buttons (Approve, Submit) will not appear — this is by design.

## Next steps

- [Executive Summary](/docs/executive-summary)
- [Executive Dashboard](/docs/executive-dashboard)
`,
  },
  {
    slug: 'role-guide-ec',
    title: 'Executive Chairman (EC)',
    description: 'Top-risk visibility with executive actions.',
    group: 'Role-Based Guides',
    content: `# Executive Chairman (EC) — *Top-Risk Visibility*

**Persona:** Executive Chairman. Consumes top-risk narratives and
occasionally triggers executive actions.

**Goal:** Understand the top 10 enterprise risks and their trajectory in
under 5 minutes.

## Scene 1 — Executive summary landing

1. 🖱 Sign in as EC → **Executive Summary**.
2. 👀 One-page narrative: top risks, appetite, budget, incidents.

## Scene 2 — Workflow: review top risks

1. 🖱 **Dashboard** → click **Top Risks** widget → filtered register (severity ≥ 15).
2. 🖱 Open a risk → read AI-generated summary and mitigation status.

## Scene 3 — Workflow: acknowledge / act

1. 🖱 On a critical risk → optional executive action button (comment / acknowledge).
2. 👀 Action captured in the audit log with your user id.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard / Executive Summary | ✅ | View |
| Risk Register | ✅ | View-only |
| Approval Inbox | ❌ | No access |
| Risk Matrix | ✅ | View |
| Reports / Board Reports | ✅ | View |
| Business Continuity | ❌ | Via reports only |
| User Management / Settings | ❌ | No access |

## Watch-outs

- ⚠️ Executive actions are logged — treat them as formal statements of position.

## Next steps

- [Executive Summary](/docs/executive-summary)
- [Board Reports](/docs/reports)
`,
  },
  {
    slug: 'role-guide-rcb',
    title: 'Risk Committee of the Board (RCB)',
    description: 'Board oversight — quarterly reporting and archives.',
    group: 'Role-Based Guides',
    content: `# Risk Committee of the Board (RCB) — *Board Oversight*

**Persona:** Board-level risk committee. Reviews quarterly board
reports and challenges management on portfolio trends.

**Goal:** Consume the board pack, drill into any risk, and archive
committee-approved reports.

## Scene 1 — Board reports landing

1. 🖱 Sign in as RCB → **Board Reports**.
2. 👀 Archive of past reports plus the current draft.
3. 🖱 Open the latest report → **Preview**.

## Scene 2 — Workflow: view underlying risks

1. 🖱 From the report preview, click a referenced risk id.
2. 👀 Redirects to **Risk Register** with the risk open (read-only).
3. 🖱 Inspect approval history and AI score.

## Scene 3 — Workflow: export board pack

1. 🖱 **Board Reports** → **Export PDF** for each report in the pack.
2. 🖱 **Executive Summary** → export for the cover page.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard / Executive Summary | ✅ | View |
| Risk Register | ✅ | View-only |
| Approval Inbox | ❌ | No access |
| Risk Matrix | ✅ | View |
| Reports / Board Reports | ✅ | View, export |
| Business Continuity | ❌ | Via reports only |
| User Management / Settings | ❌ | No access |

## Watch-outs

- ⚠️ RCB should not attempt workflow transitions — they will be denied by the server.

## Next steps

- [Board Reports](/docs/reports)
- [Executive Summary](/docs/executive-summary)
`,
  },
  {
    slug: 'role-guide-admin',
    title: 'Administrator (ADMIN)',
    description: 'System steward — users, roles, settings, data, audit.',
    group: 'Role-Based Guides',
    content: `# Administrator (ADMIN) — *System Steward*

**Persona:** System administrator. Manages users, roles, matrix
configuration, integrations, and data operations.

**Goal:** Provision users correctly, maintain configuration, and keep
the audit trail healthy.

## Scene 1 — Admin landing

1. 🖱 Sign in as ADMIN → Dashboard shows enterprise view.
2. 👀 Sidebar includes **User Management**, **Settings**, **Data Management**,
   **Audit Logs**, and **BCP Schema Checks**.

## Scene 2 — Workflow: invite a new user & assign a role

1. 🖱 Sidebar → **User Management** → **+ Invite User**.
2. 🖱 Enter email, full name, department, role (e.g. **RC**) → Send invite.
3. 👀 User appears with status *Pending*; invite email dispatched.
4. 🖱 Once accepted, verify the role in the **user_roles** table via the UI.

## Scene 3 — Workflow: adjust matrix or appetite

1. 🖱 **Settings** → **Matrix Dimensions** → change 5×5 → 6×6 → Save.
2. 👀 Register and Risk Matrix immediately re-render.
3. 🖱 **Settings** → **Risk Appetite** → edit thresholds → Save.

## Scene 4 — Workflow: review audit trail

1. 🖱 **Audit Logs** → filter by date range and action type.
2. 👀 Field-level diffs across risks, users, and configuration.
3. 🖱 Export for compliance evidence.

## Scene 5 — Workflow: data management

1. 🖱 **Data Management** → sample data seeding, snapshot export.
2. 🖱 **BCP Schema Checks** → verify startup schema audit passed.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Every module | ✅ | **Full access (\`*\` permission)** |
| User Management | ✅ | Invite, edit role, deactivate |
| Settings | ✅ | Matrix, appetite, categories, integrations |
| Data Management | ✅ | Seeding, snapshot export |
| Audit Logs / BCP Schema Checks | ✅ | View, export |

## Watch-outs

- ⚠️ Role changes are audit-logged — always add a reason in the comment field.
- ⚠️ Do not edit \`src/integrations/supabase/client.ts\`, \`types.ts\`, or the
  auto-generated \`.env\` — they are managed by the platform.
- ⚠️ Deactivating a user does not delete their historical actions; the audit
  trail remains intact.

## Next steps

- [Deployment Guide](/docs/deployment-guide)
- [On-Prem Install (Linux)](/docs/onprem-install-linux)
- [Disaster Recovery Runbook](/docs/dr-runbook)
`,
  },
  {
    slug: 'role-guide-user',
    title: 'General User (USER)',
    description: 'Read-only participant — matrix, learning forum, FAQs.',
    group: 'Role-Based Guides',
    content: `# General User (USER) — *Read-Only Participant*

**Persona:** Staff member who consumes risk information but is not
accountable for any risk record.

**Goal:** Understand the enterprise risk picture at a glance and learn
via the forum and FAQs.

## Scene 1 — Landing

1. 🖱 Sign in → **Dashboard** (read-only view).
2. 👀 Enterprise KPIs and heatmap; no add/edit buttons.

## Scene 2 — Workflow: view risks

1. 🖱 Sidebar → **Risk Register** → browse the list.
2. 🖱 Open any risk → read-only detail view.

## Scene 3 — Workflow: learning & help

1. 🖱 **Learning Forum** → join a discussion thread.
2. 🖱 **Help / FAQ** → self-serve answers.
3. 🖱 **Calendar** → view scheduled reviews and awareness sessions.

## Permissions & access matrix

| Area | Sidebar link | Access |
|---|---|---|
| Dashboard | ✅ | View |
| Risk Register | ✅ | **View-only** |
| Approval Inbox | ❌ | No access |
| Risk Matrix | ❌ | Not shown (view via register) |
| Reports | ❌ | No access |
| Business Continuity | ❌ | No access |
| Learning Forum / Help / Calendar | ✅ | View, participate |
| User Management / Settings | ❌ | No access |

## Watch-outs

- ⚠️ You cannot submit new risks — contact your department's Risk Champion.
- ⚠️ Forum posts are visible enterprise-wide; keep them professional.

## Next steps

- [Learning Forum](/docs/learning-forum)
- [Help & FAQ](/docs/help-faq)
- [Glossary](/docs/glossary)
`,
  },
];



export const DOC_GROUPS = ['Getting Started', 'Role-Based Guides', 'Modules', 'Operations', 'Reference'] as const;
