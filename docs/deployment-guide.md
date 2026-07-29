# RiskRadar — Deployment Guide

**Version 1.0 · Audience: CIO, CTO, Head of Infrastructure, Risk Management Department, Procurement & Security Officers**

---

## 1. Purpose

This guide helps key decision makers select and execute the right deployment model for **RiskRadar**, the ISO 31000 compliant Enterprise Risk Management platform. It covers the **three supported deployment options**, their architecture, cost, security, operational implications, and the **CI/CD pipeline** that automates releases for each.

---

## 2. Executive Summary

| Option | Best For | Time to Live | Relative TCO (3 yr) | Operational Burden |
|--------|----------|--------------|---------------------|---------------------|
| **A. Managed Cloud (SaaS on Lovable Cloud)** | Fast rollout, minimal IT effort, standard compliance | 1–2 weeks | **1.0× (baseline)** | Lowest — vendor managed |
| **B. Cloud VM (self-managed on AWS / Azure / GCP)** | Data residency in chosen region, custom networking, BYO Supabase | 3–6 weeks | 1.4× | Medium — your DevOps owns infra |
| **C. On-Premise (private datacenter / private cloud)** | Strict data sovereignty, air-gapped or regulated environments | 6–12 weeks | 2.1× | Highest — full ownership of stack |

All three options support an optional **CI/CD pipeline** (GitHub Actions / GitLab CI / Azure DevOps) for automated build, test, security scan, and zero-downtime deploy.

---

## 3. Solution Architecture (Logical View)

RiskRadar is a **client-rendered React SPA** backed by a **Postgres + Edge Functions** platform. The same logical architecture applies to all deployment options — only the *hosting substrate* changes.

```
┌──────────────────────────────────────────────────────────────────┐
│                          End Users                               │
│   (RC, RR, RO, RMD, CRO, ERMSC, EC, RCB, Admins, Whistleblowers) │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS (TLS 1.3)
                               ▼
                ┌──────────────────────────────┐
                │   CDN / Reverse Proxy        │
                │   (Cloudflare / NGINX / ALB) │
                └──────────────┬───────────────┘
                               │
        ┌──────────────────────┼─────────────────────────┐
        ▼                      ▼                         ▼
┌──────────────────┐ ┌──────────────────────┐ ┌────────────────────┐
│  React SPA       │ │  Edge Functions      │ │  Auth Service      │
│  (Vite build)    │ │  (Deno runtime)      │ │  JWT, OAuth, SAML  │
│  Static assets   │ │  - AI Gateway proxy  │ │                    │
│                  │ │  - Report generator  │ │                    │
│                  │ │  - Whistleblow svc   │ │                    │
│                  │ │  - Scheduled jobs    │ │                    │
└──────────────────┘ └──────────┬───────────┘ └─────────┬──────────┘
                                │                       │
                                ▼                       ▼
                ┌─────────────────────────────────────────────┐
                │          PostgreSQL 15 + RLS                │
                │   (risks, user_roles, risk_history,         │
                │    bcp, risk_events, whistleblow_cases…)    │
                │   pg_cron · pg_net · pgvector               │
                └─────────────────────────────────────────────┘
                                │
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
        ┌─────────────┐ ┌──────────────┐ ┌────────────────┐
        │ Object      │ │ AI Gateway   │ │ Email / SMTP   │
        │ Storage     │ │ (Gemini 2.5) │ │ Notifications  │
        │ (S3-compat) │ │              │ │                │
        └─────────────┘ └──────────────┘ └────────────────┘
                                │
                                ▼
                ┌─────────────────────────────────┐
                │  Enterprise Integrations        │
                │  M-Files · CSDD · Active Dir    │
                │  Backup System · SIEM           │
                └─────────────────────────────────┘
```

### Components

| Layer | Technology | Notes |
|-------|------------|-------|
| **Frontend** | React 18 + Vite + TypeScript + Tailwind | Static bundle, ~1.2 MB gzipped |
| **API / Compute** | Supabase Edge Functions (Deno) | Stateless, auto-scaling |
| **Database** | PostgreSQL 15 with RLS | Security-definer functions enforce role-based access |
| **AI** | Gemini 2.5 Flash via Lovable AI Gateway | Used for scoring, recommendations, report drafting |
| **Storage** | S3-compatible bucket (`risk-attachments`) | Signed URLs |
| **Scheduler** | `pg_cron` + `pg_net` | Daily 8am workflow, hourly report archive |
| **Auth** | Email/password + Google OAuth + optional SAML SSO | JWTs, 5-minute auto-logout |

---

## 4. Deployment Option A — Managed Cloud (Recommended Default)

### 4.1 Architecture

```
   Users ──▶ Lovable CDN ──▶ Static SPA
                         └─▶ Lovable Cloud (managed Supabase)
                                   ├─ Postgres
                                   ├─ Edge Functions
                                   ├─ Storage
                                   └─ AI Gateway
```

### 4.2 What Lovable Manages

- Provisioning, patching, scaling
- Daily backups (PITR, 7-day retention; 30-day on Enterprise)
- TLS certificates (auto-renewing)
- 99.9% SLA
- DDoS protection, WAF
- AI Gateway billing & rate limiting

### 4.3 What You Manage

- Custom domain DNS
- User provisioning (or SAML SSO federation)
- Application configuration (risk categories, appetite, departments)

### 4.4 Pros & Cons

| ✅ Pros | ⚠ Cons |
|--------|--------|
| Fastest rollout (1–2 weeks) | Data resides in vendor cloud |
| Lowest TCO | Less control over network topology |
| No DevOps required | Custom infra integrations require edge functions |
| Auto patching & scaling | |

### 4.5 When to Choose
Standard enterprise risk programs without strict on-prem mandates. **Recommended for ~80% of customers.**

---

## 5. Deployment Option B — Cloud VM (Self-Managed)

### 5.1 Architecture

```
   Users ──▶ Cloud Load Balancer (ALB / App Gateway / GLB)
                       │
            ┌──────────┼─────────┐
            ▼          ▼         ▼
        VM-1       VM-2       VM-3       (NGINX serving SPA + reverse proxy)
            │          │         │
            └──────────┼─────────┘
                       ▼
               Self-hosted Supabase Cluster
               (managed Postgres or RDS/Cloud SQL,
                Edge Functions on Deno Deploy or Docker,
                S3 / Blob Storage,
                Redis for cache)
```

### 5.2 Reference Sizing (≤500 concurrent users)

| Component | Spec | Qty |
|-----------|------|-----|
| Web/App VM | 4 vCPU, 8 GB RAM | 2–3 (HA) |
| Postgres (managed) | 4 vCPU, 16 GB RAM, 200 GB SSD | 1 primary + 1 replica |
| Object storage | S3 / Azure Blob / GCS | 500 GB to start |
| Load balancer | Standard tier | 1 |
| Bastion / Jump | 2 vCPU, 4 GB RAM | 1 |

### 5.3 Supported Targets
**AWS** (EC2 + RDS Postgres + S3 + ALB + CloudFront) · **Azure** (VMSS + Azure DB for Postgres + Blob + App Gateway + Front Door) · **GCP** (Compute Engine MIG + Cloud SQL + GCS + GLB + Cloud CDN)

### 5.4 Pros & Cons

| ✅ Pros | ⚠ Cons |
|--------|--------|
| Choose region for data residency | DevOps team owns patching, scaling, backups |
| Bring-your-own VPC, security groups, KMS keys | Higher TCO than SaaS |
| Integrate directly with on-prem AD via VPN | 3–6 week setup |
| Use existing cloud commitments | |

### 5.5 When to Choose
Regulated industries (energy, financial services) with cloud-first strategies and an existing DevOps capability.

---

## 6. Deployment Option C — On-Premise

### 6.1 Architecture

```
   Corporate LAN / Intranet
            │
            ▼
   F5 / NGINX Ingress (HA pair)
            │
   ┌────────┴─────────┐
   ▼                  ▼
 Kubernetes Cluster (3 control plane + N workers)
   │
   ├─ SPA Pods (NGINX)
   ├─ Edge Function Pods (Deno containers)
   ├─ Postgres Operator (Patroni / CloudNativePG)
   ├─ MinIO (S3-compatible storage)
   └─ Redis (cache)
            │
            ▼
   On-prem services: Active Directory, M-Files, CSDD,
   Enterprise Backup (Veeam / Commvault), SIEM (Splunk / QRadar)
```

### 6.2 Minimum Hardware (≤500 users, HA)

| Role | Spec | Qty |
|------|------|-----|
| K8s Control Plane | 4 vCPU, 8 GB RAM | 3 |
| K8s Worker | 8 vCPU, 32 GB RAM | 3 |
| Postgres Node | 8 vCPU, 32 GB RAM, 500 GB NVMe | 3 (Patroni cluster) |
| Storage (MinIO) | 8 vCPU, 16 GB RAM, 2 TB | 4 (erasure-coded) |
| Load Balancer | F5 / HAProxy HA | 2 |

### 6.3 Software Stack
- Kubernetes ≥1.28 (RKE2 / OpenShift / vanilla)
- PostgreSQL 15 via CloudNativePG operator
- MinIO for S3-compatible storage
- Deno for edge function runtime
- cert-manager + internal CA for TLS
- Prometheus + Grafana + Loki for observability

### 6.4 AI Capability Options
- **Hybrid** (default): allow outbound HTTPS to Lovable AI Gateway / Gemini for scoring & report drafting
- **Air-gapped**: disable AI features, or self-host an open-source model (Llama 3 / Mistral) behind the same edge function interface

### 6.5 Pros & Cons

| ✅ Pros | ⚠ Cons |
|--------|--------|
| Full data sovereignty | Highest TCO and longest setup |
| Air-gap possible | Requires K8s + Postgres operations skills |
| Direct intranet integration | Customer owns patching, DR, capacity |
| Aligns with strict regulator mandates | AI features may be limited if air-gapped |

### 6.6 When to Choose
Government, defense, central banks, or organizations with explicit on-prem-only data policies.

---

## 7. CI/CD Pipeline (Optional, Recommended for B & C)

### 7.1 Pipeline Overview

```
 Developer push ──▶ GitHub / GitLab ──▶ CI Runner
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                       Lint &          Unit &          Security
                       Typecheck       E2E Tests       Scan (Snyk,
                                                       Trivy, gitleaks)
                          │
                          ▼
                       Build (vite build) ──▶ Artifact Registry
                          │
                          ▼
                       Migrate DB (supabase migrations / sqitch)
                          │
                          ▼
                Deploy to Staging ──▶ Smoke tests / Lighthouse
                          │
                          ▼  (manual approval gate)
                Deploy to Production
                          │
                          ▼
                Post-deploy: cache purge, Slack/Teams notify,
                Sentry release, Datadog deployment marker
```

### 7.2 Tooling Matrix

| Stage | Recommended Tool |
|-------|------------------|
| Source control | GitHub / GitLab / Azure Repos |
| CI runner | GitHub Actions / GitLab CI / Azure DevOps |
| Container registry | GHCR / ECR / ACR / GCR / Harbor |
| Artifact storage | S3 / Blob / Artifactory |
| Secret management | GitHub Encrypted Secrets · HashiCorp Vault · AWS Secrets Manager |
| Quality gates | ESLint, TypeScript, Vitest, Playwright |
| Security scans | Snyk, Trivy, gitleaks, Dependabot, OWASP ZAP (DAST) |
| Deploy mechanism | Lovable CLI (Option A) · Terraform + Ansible (B) · Argo CD / Flux (C) |
| Observability | Sentry, Datadog, Prometheus + Grafana, Loki |

### 7.3 Branch & Environment Strategy

| Branch | Environment | Auto-deploy |
|--------|-------------|-------------|
| `feature/*` | Ephemeral preview | On push |
| `develop` | Staging | On merge |
| `main` | Production | On tag, with approval |
| `hotfix/*` | Production (fast-track) | On tag, with approval |

### 7.4 Database Migrations
- Source of truth: `supabase/migrations/*.sql`
- Apply via `supabase db push` (Option A) or `sqitch` / `flyway` (B & C)
- Rule: every PR that touches schema must include a forward migration; destructive changes need a rollback script

### 7.5 Release Cadence
- **Weekly** patch releases to Production (Tuesdays)
- **Bi-weekly** feature releases
- **Hotfixes** within 4 hours of detection for Sev-1

---

## 8. Security Architecture (All Options)

| Control | Implementation |
|---------|----------------|
| Encryption in transit | TLS 1.3 everywhere |
| Encryption at rest | AES-256 (cloud KMS or HSM) |
| Authentication | Email/password, Google OAuth, optional SAML SSO with AD/Entra ID |
| Authorization | RLS using security-definer functions over `user_roles` table |
| Session | JWT, 5-minute idle auto-logout, rotating refresh tokens |
| Audit | `risk_history` JSONB snapshots, audit log viewer for RMD/CRO |
| Whistleblowing anonymity | Service-role edge functions, no auth headers persisted |
| Secrets | Cloud KMS / Vault — never in repo |
| Vulnerability management | Weekly Snyk + Trivy scans, monthly pen-test (recommended) |
| Compliance posture | ISO 31000 aligned, ISO 27001 ready, GDPR ready, SOX-supportive |

---

## 9. Backup, DR & Business Continuity

| Metric | Option A | Option B | Option C |
|--------|----------|----------|----------|
| **RPO** | 5 min (PITR) | 15 min (managed DB PITR) | 15 min (Patroni + WAL archive to MinIO/S3) |
| **RTO** | 1 hour | 2 hours | 4 hours |
| Backup frequency | Continuous WAL + daily snapshot | Continuous WAL + daily snapshot | Daily full + hourly incremental |
| Retention | 7 / 30 days | Customer-defined (typ. 35 days) | Customer-defined |
| DR drill cadence | Annual (vendor) | Semi-annual | Quarterly |
| Cross-region failover | Optional (Enterprise tier) | Multi-AZ active-passive | Secondary datacenter |

---

## 10. Networking & Integration Requirements

| Integration | Direction | Protocol | Notes |
|-------------|-----------|----------|-------|
| Active Directory / Entra ID | Inbound | SAML 2.0 / OIDC | For SSO and group-to-role mapping |
| M-Files EDRMS | Outbound | REST / M-Files Web Service | Document linking |
| CSDD Learning Portal | Outbound | REST / iframe SSO | Forum integration |
| Email / SMTP | Outbound | SMTP-TLS or SES/SendGrid | Notifications, weekly digests |
| Enterprise Backup | Outbound | S3 API or NFS | Off-site backup target |
| SIEM | Outbound | Syslog / HTTP webhook | Audit log streaming |
| AI Gateway | Outbound | HTTPS | Required unless air-gapped |

**Firewall egress required:** `*.lovable.app`, `*.supabase.co`, `generativelanguage.googleapis.com`, your SMTP host, M-Files endpoint, CSDD endpoint.

---

## 11. Observability & SLOs

| SLO | Target |
|-----|--------|
| Page load (p95) | < 5 s |
| API latency (p95) | < 800 ms |
| Uptime | 99.9% (Option A SLA) / 99.5% (B & C self-managed) |
| Error rate | < 0.5% of requests |

**Stack:** Sentry (frontend errors), Datadog or Prometheus + Grafana (metrics), Loki or CloudWatch (logs), PagerDuty or Opsgenie (on-call).

---

## 12. Cost & Sizing (Indicative, USD / month)

| Item | Option A | Option B (AWS) | Option C (On-prem amortized) |
|------|----------|----------------|------------------------------|
| Hosting / SaaS | $2,500 – $7,500 | $1,800 – $3,200 | $4,500 – $7,000 |
| AI usage | Included (fair use) | $200 – $600 | $200 – $600 (or self-hosted) |
| Storage | Included | $50 – $150 | Capex-based |
| Backup off-site | Included | $80 – $200 | $300 – $500 |
| DevOps effort | None | 0.3 FTE | 1.0 FTE |
| **Year-1 total (est.)** | **$30K – $90K** | **$80K – $140K** | **$180K – $260K** |

> Numbers are indicative; final pricing depends on user count, data volume, region, and AI usage.

---

## 13. Decision Matrix

| Driver | Choose A | Choose B | Choose C |
|--------|----------|----------|----------|
| Speed to value (< 1 month) | ✅ | ⚠ | ❌ |
| Lowest TCO | ✅ | ⚠ | ❌ |
| Strict data residency | ⚠ | ✅ | ✅ |
| Air-gapped operation | ❌ | ❌ | ✅ |
| Existing K8s + DevOps maturity | n/a | ✅ | ✅ |
| Direct intranet system integration | ⚠ | ✅ | ✅ |
| Native AI features out-of-the-box | ✅ | ✅ | ⚠ |

---

## 14. Implementation Roadmap (Per Option)

### Option A — Managed Cloud (1–2 weeks)
1. Day 1–2: Provision tenant, custom domain, SSO config
2. Day 3–5: Configure roles, departments, risk appetite
3. Day 6–8: Data import (LoB CSV), training
4. Day 9–10: UAT and go-live

### Option B — Cloud VM (3–6 weeks)
1. Week 1: Landing zone, VPC, IAM, Terraform baseline
2. Week 2: Provision Postgres, storage, load balancer
3. Week 3: Deploy app + edge functions, configure CI/CD
4. Week 4: Integrations (AD, M-Files, SMTP), security hardening
5. Week 5: UAT, DR drill
6. Week 6: Go-live + handover

### Option C — On-Premise (6–12 weeks)
1. Weeks 1–2: Hardware procurement / VM provisioning
2. Weeks 3–4: Kubernetes, Postgres operator, MinIO, observability
3. Weeks 5–6: Application deploy, CI/CD via Argo CD, secret management
4. Weeks 7–8: AD, M-Files, CSDD, SIEM, backup integrations
5. Weeks 9–10: Security review, pen-test, DR drill
6. Weeks 11–12: UAT, training, go-live

---

## 15. Roles & Responsibilities (RACI Snapshot)

| Activity | Vendor | Customer IT | Customer Risk Team |
|----------|--------|-------------|---------------------|
| Application code | R | I | I |
| Infra provisioning (A) | R | I | I |
| Infra provisioning (B/C) | C | R | I |
| Database backups (A) | R | I | I |
| Database backups (B/C) | C | R | I |
| Identity / SSO setup | C | R | I |
| User & role configuration | C | C | R |
| Risk taxonomy & appetite | C | I | R |
| Incident response | C | R | C |
| Patching & upgrades (A) | R | I | I |
| Patching & upgrades (B/C) | C | R | I |

---

## 16. Recommendation

For most enterprises, **Option A (Managed Cloud)** delivers the fastest, lowest-risk path to ISO 31000-aligned risk management with native AI. Choose **Option B** when cloud-region data residency is mandated and a DevOps team is in place. Reserve **Option C** for organizations with explicit on-premise, air-gap, or regulator-driven mandates.

Whichever option is chosen, adopt the **CI/CD pipeline** from day one — it pays for itself within the first quarter through faster, safer releases and stronger audit evidence.

---

## 17. Appendix — Glossary

- **RLS**: Row Level Security — Postgres feature enforcing per-row access via policy functions
- **PITR**: Point-In-Time Recovery
- **RTO / RPO**: Recovery Time / Recovery Point Objective
- **SLO / SLA**: Service Level Objective / Agreement
- **HA**: High Availability
- **WAF**: Web Application Firewall
- **MIG / VMSS**: Managed Instance Group / VM Scale Set
- **SIEM**: Security Information & Event Management
- **EDRMS**: Electronic Document & Records Management System

---

*© 2026 RiskRadar. Commercial-in-confidence.*
