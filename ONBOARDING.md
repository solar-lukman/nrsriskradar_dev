# RiskRadar — New Member Onboarding Guide

> **Audience:** Engineers, QA analysts, and risk-domain contributors joining the project for the first time.

---

## 1. What Is RiskRadar?

**RiskRadar** is an enterprise risk management (ERM) platform aligned to **ISO 31000:2018**. It replaces disconnected spreadsheets and siloed tools with a single, role-secured web application that covers:

| Module | Purpose |
|---|---|
| **Risk Register** | Full lifecycle risk management with AI-powered scoring and approval workflows |
| **Risk Matrix** | Interactive 5×5 heatmaps with inherent / residual views and department filters |
| **Business Continuity** | BCP register, Business Impact Analysis, recovery objectives, and test scheduling |
| **Executive Dashboards** | Real-time analytics, trend charts, and board report generation |
| **Incidents** | Logging and tracking of realised risk events |
| **Whistleblowing** | Architecturally anonymous reporting with investigator workflows and full audit trails |
| **Document Management** | Version-controlled policy repository |
| **User Management** | Role-based access control, Active Directory SSO, and audit logs |

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Frontend framework** | React 18 + TypeScript |
| **Build tool** | Vite |
| **UI components** | shadcn/ui (Radix UI primitives) |
| **Styling** | Tailwind CSS |
| **Backend / DB** | Supabase (PostgreSQL 15, Row-Level Security, Edge Functions) |
| **State / data fetching** | TanStack Query v5 |
| **Package manager** | Bun (use `bun` / `bunx` instead of `npm` / `npx`) |
| **Unit testing** | Vitest + Testing Library |
| **E2E testing** | Playwright |
| **PDF generation** | jsPDF + jspdf-autotable |
| **Charts** | Recharts + custom Mermaid diagrams |

---

## 3. Repository Layout

```
nrsriskradar/
├── src/
│   ├── components/         # All UI components, organised by domain
│   │   ├── bcp/            # Business Continuity Planning
│   │   ├── board-reports/  # Board report generation
│   │   ├── incidents/      # Incident / risk event tracking
│   │   ├── risk-register/  # Risk register CRUD and approval workflow
│   │   ├── risk-matrix/    # 5×5 heatmap
│   │   ├── settings/       # App settings
│   │   ├── user-management/# User & role management
│   │   └── ui/             # Shared design-system primitives (shadcn)
│   ├── pages/              # Route-level page components
│   ├── hooks/              # Custom React hooks (data fetching, feature logic)
│   ├── contexts/           # React context providers (Auth, Notifications)
│   ├── integrations/
│   │   └── supabase/       # Supabase client, generated types, helpers
│   └── lib/                # Pure utility functions and business-logic helpers
├── supabase/
│   ├── migrations/         # PostgreSQL schema migrations (cloud)
│   ├── migrations-onprem/  # Migrations for on-premise deployments
│   └── functions/          # Deno edge functions
├── e2e/                    # Playwright end-to-end / UAT tests
├── docs/                   # Architecture, guides, proposals, checklists
└── scripts/                # Custom lint scripts (ISO 31000, DB safety)
```

---

## 4. Getting Started Locally

### Prerequisites

- **Node.js** ≥ 20 (for tooling compatibility)
- **Bun** ≥ 1.1 — `npm install -g bun`
- A Supabase project URL and anon key (ask the team lead)

### Setup

```bash
# 1. Clone
git clone <REPO_URL>
cd nrsriskradar

# 2. Install dependencies
bun install

# 3. Set environment variables
cp .env.example .env          # then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 4. Start the dev server
bun run dev
```

The app will be available at `http://localhost:8080` (or the port Vite assigns).

### Useful Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start Vite dev server with HMR |
| `bun run build` | Production build |
| `bun run lint` | ESLint (React + TypeScript rules) |
| `bun run lint:iso` | ISO 31000 glossary lint — **must pass before PR** |
| `bun run lint:db-safety` | Supabase / SQL safety lint — **must pass before PR** |
| `bun run lint:review` | Run all three lints in sequence |
| `bunx vitest run` | Unit tests (single run, for CI) |
| `bunx vitest` | Unit tests in watch mode |
| `bunx vitest --ui` | Unit tests with browser UI |

---

## 5. User Roles

RiskRadar uses a strict role-based access control (RBAC) model enforced at both the UI and database (Row-Level Security) layers.

| Role code | Full name | Typical access |
|---|---|---|
| `RC` | Risk Champion | Submit risks, view own department data |
| `RR` | Risk Reviewer | Review and return submitted risks |
| `RO` | Risk Officer | Approve risks, manage mitigations |
| `RMD` | Risk Management Department | Full risk register access, bulk operations |
| `CRO` | Chief Risk Officer | Executive dashboards, board reports; no user management |
| `ERMSC` | ERM Steering Committee | Read-only executive view |
| `EC` | Ethics & Compliance | Whistleblowing case management |
| `RCB` | Risk & Compliance Board | Board-level read-only access |
| `Admin` | Administrator | Full system access including user management |

New accounts are provisioned by an Admin. During local development, seed data and test credentials are provided in `e2e/fixtures/users.ts`.

---

## 6. Key Conventions to Know Before Writing Code

### 6.1 ISO 31000 Terminology (enforced by linter)

The codebase enforces ISO 31000 vocabulary everywhere — field names, variable names, UI labels, and migration columns.

| Use | Do NOT use |
|---|---|
| `likelihood` | `probability`, `chance` |
| `impact` | `severity` (reserved for incidents) |
| `inherent_*` | `raw_*`, `gross_*` |
| `residual_*` | `net_*`, `post_*` |
| `risk_appetite` | `risk_hunger` |
| `treatment` | `mitigation` (as a strategy name) |
| `Draft / Submitted / Under Review / Returned / Approved` | free-form status labels |

Run `bun run lint:iso` locally. CI blocks PRs that introduce disallowed synonyms. See [docs/iso31000-naming.md](docs/iso31000-naming.md) for the full glossary and current lint exceptions.

### 6.2 Database / Supabase Safety Rules

- **Always use RLS** — never disable Row-Level Security on user-facing tables.
- **No raw user input in SQL strings** — use parameterised queries or Supabase client methods.
- **Migrations are append-only** — never edit an already-merged migration file; write a new one instead.
- See [docs/secure-db-guidelines.md](docs/secure-db-guidelines.md) for full rules.

### 6.3 React Patterns

- **One feature hook per domain concern** — data fetching lives in `src/hooks/`, not in components.
- **No business logic in JSX** — extract to helpers in `src/lib/`.
- Consult [docs/react-review-checklist.md](docs/react-review-checklist.md) before submitting a PR.

---

## 7. Branching & Code Review

| Rule | Detail |
|---|---|
| Protected branch | `main` — no direct pushes |
| Merge strategy | Squash merge for a clean linear history |
| PR required approvers | 1–2 depending on change type (see table below) |
| CI must be green | `lint:iso`, `lint:db-safety`, `eslint`, `typecheck`, `test` |

**Approver requirements by change type:**

| Change type | Min. approvers |
|---|---|
| Docs only | 1 reviewer |
| Frontend UI / presentation | 1 frontend reviewer |
| Risk-domain logic (workflow, scoring, approvals) | 1 frontend + 1 risk-domain reviewer |
| Database migrations | 1 backend + 1 DBA reviewer |
| Security / RLS / auth | 1 backend + 1 maintainer |

Run the full local review suite before opening a PR:

```bash
bun run lint:review   # ISO lint + DB safety lint + ESLint
bunx vitest run       # Unit tests
```

Full policy: [docs/peer-code-review.md](docs/peer-code-review.md).

---

## 8. Testing

### Unit Tests (Vitest)

Tests live in `src/test/`. Key suites:

| Suite | File | What it covers |
|---|---|---|
| Class merger | `src/test/utils.test.ts` | Tailwind class merge behaviour |
| Assessment progress | `src/test/assessmentProgress.test.ts` | Draft / In Review / Completed derivation |
| Risk workflow | `src/test/riskWorkflow.test.ts` | Role-based action permissions, enum guards |
| BCP server errors | `src/test/bcpServerErrors.test.ts` | Postgres trigger error → UI field mapping |
| Nav / route guard consistency | `src/test/navAccessConsistency.test.ts` | Sidebar links match route guards for every role |

### End-to-End / UAT Tests (Playwright)

Located in `e2e/tests/`. Run against a live or staging Supabase instance. See [docs/testing-guide.md](docs/testing-guide.md) and [docs/uat-test-plan.md](docs/uat-test-plan.md).

---

## 9. Deployment Options

RiskRadar supports three deployment targets:

| Option | Best for | Time to live |
|---|---|---|
| **Managed Cloud (SaaS)** | Fast rollout, minimal ops | 1–2 weeks |
| **Cloud VM (self-managed)** | Data residency in chosen region | 3–6 weeks |
| **On-Premise** | Air-gapped or regulated environments | 6–12 weeks |

CI/CD is provided via GitHub Actions / GitLab CI / Azure DevOps. Full details: [docs/deployment-guide.md](docs/deployment-guide.md).

---

## 10. Key Documentation

| Document | Location | Purpose |
|---|---|---|
| Business Proposal | [docs/business-proposal.md](docs/business-proposal.md) | Product vision, market, and ROI |
| Executive Summary | [docs/executive-summary-one-pager.md](docs/executive-summary-one-pager.md) | One-page platform overview |
| Deployment Guide | [docs/deployment-guide.md](docs/deployment-guide.md) | Hosting options and CI/CD |
| ISO 31000 Naming | [docs/iso31000-naming.md](docs/iso31000-naming.md) | Canonical terminology glossary |
| Secure DB Guidelines | [docs/secure-db-guidelines.md](docs/secure-db-guidelines.md) | Supabase / SQL safety rules |
| React Review Checklist | [docs/react-review-checklist.md](docs/react-review-checklist.md) | Frontend code review checklist |
| Peer Code Review Policy | [docs/peer-code-review.md](docs/peer-code-review.md) | PR process and approver matrix |
| Testing Guide | [docs/testing-guide.md](docs/testing-guide.md) | Unit and E2E test instructions |
| UAT Test Plan | [docs/uat-test-plan.md](docs/uat-test-plan.md) | User Acceptance Testing plan |
| Whistleblowing User Guide | [docs/whistleblowing-user-guide.md](docs/whistleblowing-user-guide.md) | Anonymous reporting module guide |
| Lifecycle Workflows | [docs/lifecycle-workflows.md](docs/lifecycle-workflows.md) | Risk approval state machine |
| Integration Requirements | [docs/integration-requirements.md](docs/integration-requirements.md) | External system integrations |
| Fit-Gap Analysis | [docs/fit-gap-analysis.md](docs/fit-gap-analysis.md) | Feature coverage vs. requirements |
| On-Prem DB Migrations | [docs/onprem/DATABASE-MIGRATIONS.md](docs/onprem/DATABASE-MIGRATIONS.md) | Migration runbook for on-prem |

---

## 11. Getting Help

- **Risk-domain questions** — consult the RMD representative; they have final say on terminology and workflow semantics.
- **Architecture / infrastructure** — tag the maintainer assigned to `supabase/` in your PR or Slack channel.
- **Urgent issues** — emergency hotfixes may ship with 1 approver; open a follow-up PR within 24 hours.

---

*Welcome to the team. Read the ISO 31000 naming guide first — the linter will thank you.*
