# RiskRadar — Testing Guide

Two complementary layers ship with the app:

1. **Developer unit tests** — Vitest + Testing Library. Fast, run on every commit.
2. **User Acceptance Tests (UAT)** — see `docs/uat-test-plan.md`. Manual, role-based, run before go-live.

---

## 0. Coverage at a glance

Last measured: **2026-08-07** (`npm run test:coverage`, `npm run test:edge`, `npm run test:e2e`).
The coverage scope now also includes `src/pages/**/*.tsx`, so the global percentages
are lower than the pre-`src/pages` baseline while page-level tests are being added.
Regenerate with `npm run test:all`; the numbers below come from `coverage/lcov.info`.

### Totals

| Layer | Suites | Tests | Status |
|-------|--------|-------|--------|
| Unit + component (Vitest, jsdom) | 51 files | 293 | All passing |
| Edge functions (Deno) | 17 files | 83 | All passing |
| End-to-end / functional (Playwright) | 11 specs | 37 scenarios | All passing |
| **Total automated checks** | **79 files** | **413** | — |

### Line coverage (Vitest v8, `src/` excluding `components/ui`, `integrations`, `test`)

Scope: `src/lib/**`, `src/hooks/**`, `src/components/**`, `src/contexts/**`, `src/pages/**`.

| Metric | Coverage | Ratchet in `vitest.config.ts` |
|--------|----------|-------------------------------|
| Lines | **26.2%** (2,481 / 9,487) | 25% |
| Statements | **25.2%** (2,734 / 10,841) | 24% |
| Functions | **22.8%** (629 / 2,756) | 21% |
| Branches | **20.3%** (1,904 / 9,361) | 19% |
| `src/lib/permissions.ts` (security boundary) | **93.8% lines** | 90% lines / 78% statements |

### Line coverage by area

| Area | Lines covered | % |
|------|---------------|---|
| `src/lib/**` (pure logic) | 313 / 394 | 79.4% |
| `src/hooks/**` | 598 / 770 | 77.7% |
| `src/contexts/**` | 115 / 192 | 59.9% |
| `src/components/**` | 1,191 / 5,515 | 21.6% |
| `src/pages/**` (newly in scope) | 264 / 2,616 | 10.1% |

### Coverage by app module

Percentages below are for the `src/lib`, `src/hooks`, `src/contexts` and
`src/components` portion of each module; the `src/pages/**` route shells are
reported separately in the Pages table further down. Buckets are by *feature*,
not by folder — e.g. `settings/RiskAppetiteManager.tsx` counts toward Mitigation
& treatment, not Settings.

| Module | Line coverage | Covered / total |
|--------|---------------|-----------------|
| Permissions & access control | **62.7%** | 232 / 370 |
| Notifications | **54.1%** | 153 / 283 |
| Platform / shell & settings | **39.2%** | 294 / 750 |
| Mitigation & treatment | **37.8%** | 209 / 553 |
| Risk register & workflow | **30.5%** | 505 / 1,657 |
| Dashboards & reporting | **29.8%** | 480 / 1,612 |
| Business continuity (BCP) | **25.1%** | 177 / 706 |
| Incidents | **33.2%** | 206 / 621 |
| Risk assessment & controls | **3.6%** | 18 / 496 |
| Whistleblowing (pages) | **60.4%** | 144 / 232 |

#### Permissions & access control — 62.7% (232 / 370)

| File | % | Lines |
|------|---|-------|
| `src/lib/permissions.ts` | 94% | 30 / 32 |
| `src/components/Sidebar.tsx` | 100% | 24 / 24 |
| `src/components/user-management/AddEditUserDialog.tsx` | 88% | 50 / 57 |
| `src/hooks/useAutoLogout.ts` | 86% | 44 / 51 |
| `src/lib/navAccessConsistency.ts` | 71% | 22 / 31 |
| `src/contexts/AuthContext.tsx` | 70% | 62 / 89 |
| `src/components/LoginPage.tsx` | 0% | 0 / 64 |
| `src/components/SessionBanner.tsx` | 0% | 0 / 11 |
| `src/components/ProtectedRoute.tsx` | 0% | 0 / 7 |
| `src/components/AccessDenied.tsx` | 0% | 0 / 4 |

Also enforced outside Vitest: `permissionMatrix.test.ts` snapshot, `uiActionGating.test.tsx`
(11 roles), `e2e/tests/negative-rbac.spec.ts`, `sidebar-access.spec.ts`, `role-landing.spec.ts`,
and `rls-matrix.spec.ts` (server-side truth table). `LoginPage`/`ProtectedRoute` are 0% under
Vitest because they are covered exclusively by `e2e/tests/auth.spec.ts`.

#### Risk register & workflow — 30.5% (505 / 1,657)

| File | % | Lines |
|------|---|-------|
| `src/components/risk-register/ClickableRiskMatrix.tsx` | 100% | 21 / 21 |
| `src/hooks/useApprovalInbox.ts` | 96% | 45 / 47 |
| `src/hooks/useRiskCategories.ts` | 94% | 17 / 18 |
| `src/hooks/useRisks.ts` | 91% | 29 / 32 |
| `src/components/risk-register/AuditLogDialog.tsx` | 86% | 73 / 85 |
| `src/components/risk-register/RiskWorkflowActions.tsx` | 80% | 36 / 45 |
| `src/hooks/useRealtimeRisks.ts` | 76% | 41 / 54 |
| `src/lib/riskWorkflow.ts` | 64% | 21 / 33 |
| `src/components/risk-register/RiskWizardDialog.tsx` | 57% | 219 / 383 |
| `src/components/risk-register/AppetiteMatchPanel.tsx` | 5% | 1 / 20 |
| `src/components/risk-register/RiskAttachmentsPanel.tsx` | 1% | 1 / 70 |
| `src/components/risk-register/ReportCrystallizedDialog.tsx` | 1% | 1 / 111 |
| `src/components/risk-register/ViewRiskDialog.tsx` | 0% | 0 / 141 |
| `src/components/risk-register/LoBDataImportDialog.tsx` | 0% | 0 / 102 |
| `src/components/risk-register/ExportRisksMenu.tsx` | 0% | 0 / 84 |
| `src/components/risk-register/BulkUploadDialog.tsx` | 0% | 0 / 64 |
| `src/components/risk-register/BulkApprovalBar.tsx` | 0% | 0 / 44 |
| `src/components/risk-register/AIScoreIndicator.tsx` | 0% | 0 / 42 |
| `src/components/risk-register/RiskEventsSection.tsx` | 0% | 0 / 36 |
| `src/components/risk-register/BatchAIAnalysisButton.tsx` | 0% | 0 / 32 |
| `src/components/risk-register/PendingAgeBadge.tsx` | 0% | 0 / 7 |
| `src/components/risk-matrix/ExportMenu.tsx` | 0% | 0 / 107 |
| `src/components/risk-matrix/RiskHeatmap.tsx` | 0% | 0 / 68 |
| `src/components/risk-matrix/RiskFilters.tsx` | 0% | 0 / 11 |

Complemented by `e2e/tests/risk-journey.spec.ts` (5 scenarios: 4-step wizard, submit,
claim-lock, approve, return-for-revision) and the `risk-scoring-engine` /
`risk-ai-analysis` / `lob-data-import` Deno suites (16 tests).

#### Mitigation & treatment — 37.8% (209 / 553)

| File | % | Lines |
|------|---|-------|
| `src/hooks/useBudgetForecast.ts` | 99% | 79 / 80 |
| `src/hooks/useRiskAppetite.ts` | 91% | 40 / 44 |
| `src/components/risk-register/MitigationTasksPanel.tsx` | 82% | 89 / 108 |
| `src/components/risk-register/PostControlReassessmentSection.tsx` | 3% | 1 / 38 |
| `src/components/settings/RiskAppetiteManager.tsx` | 0% | 0 / 125 |
| `src/components/settings/AppetiteBreachTrendChart.tsx` | 0% | 0 / 49 |
| `src/components/settings/TreatmentStrategyMappingManager.tsx` | 0% | 0 / 42 |
| `src/hooks/useMitigationRecommendations.ts` | 0% | 0 / 34 |
| `src/components/risk-register/MitigationRecommendationsDialog.tsx` | 0% | 0 / 33 |

Complemented by the `mitigation-recommender` Deno suite (5 tests) and the treatment
step of `risk-journey.spec.ts` (strategy selection, NGN budget, residual scoring).

#### Business continuity (BCP) — 25.1% (177 / 706)

| File | % | Lines |
|------|---|-------|
| `src/lib/bcpServerErrors.ts` | 100% | 8 / 8 |
| `src/lib/bcpSchemaCheck.ts` | 96% | 22 / 23 |
| `src/hooks/useBCPData.ts` | 93% | 25 / 27 |
| `src/components/bcp/BCPTable.tsx` | 73% | 98 / 134 |
| `src/components/bcp/TestDetailsSection.tsx` | 68% | 15 / 22 |
| `src/components/bcp/BIASection.tsx` | 64% | 9 / 14 |
| `src/components/bcp/AddBCPDialog.tsx` | 0% | 0 / 150 |
| `src/components/bcp/EditBCPDialog.tsx` | 0% | 0 / 142 |
| `src/components/bcp/ExportBCPMenu.tsx` | 0% | 0 / 62 |
| `src/components/bcp/BCPFilters.tsx` | 0% | 0 / 48 |
| `src/components/bcp/ViewBCPDialog.tsx` | 0% | 0 / 32 |
| `src/components/bcp/BIASummaryWidget.tsx` | 0% | 0 / 23 |
| `src/components/bcp/BCPVersionHistoryPanel.tsx` | 0% | 0 / 21 |

Complemented by `e2e/tests/bcp-journey.spec.ts` (5 scenarios: create, BIA ratings and
mitigation actions, test log, inline server-validation errors, version history) plus
`bcpCsvExport.test.ts` for export shaping.

#### Whistleblowing & Incidents pages — now in Vitest line coverage

`src/pages/**/*.tsx` is part of the coverage `include` list, and the whistleblowing
and incidents route components have dedicated component tests:

| Page | Line coverage | Test file |
|------|---------------|-----------|
| `src/pages/WhistleblowFollowUp.tsx` | **98%** (42 / 43) | `src/test/pages/WhistleblowFollowUp.test.tsx` (6 tests) |
| `src/pages/WhistleblowCases.tsx` | **95%** (39 / 41) | `src/test/pages/WhistleblowCases.test.tsx` (6 tests) |
| `src/pages/IncidentsDashboard.tsx` | **68%** (120 / 177) | `src/test/pages/IncidentsDashboard.test.tsx` (6 tests) |
| `src/pages/WhistleblowSubmit.tsx` | **43%** (63 / 148) | `src/test/pages/WhistleblowSubmit.test.tsx` (5 tests) |
| `src/pages/WhistleblowCaseDetail.tsx` | 0% (0 / 81) | still e2e-only |

What the page tests assert:

- **WhistleblowCases** — backend fetch, KPI maths (total / open / escalated / average
  resolution days), status + search filtering, empty state, refresh.
- **WhistleblowFollowUp** — anonymous lookup validation, edge-function payload shape,
  case + timeline + message rendering, error handling that leaks no case data,
  message send, sign-out of case.
- **WhistleblowSubmit** — 4-step wizard gating, subject/description inline validation,
  back navigation, attachment type rejection.
- **IncidentsDashboard** — incident + owner-profile hydration, severity filtering,
  `?view=` deep link, and role gating of the "Add Incident" action.

Testing notes: the whistleblowing pages talk to edge functions through `fetch` /
`XMLHttpRequest` rather than the Supabase client, so those tests stub the global
`fetch`; attachment rejection uses `fireEvent.change` because `userEvent.upload`
applies the input's `accept` filter before component validation runs.

These remain complemented by the server-side layers, which are where anonymity is
actually enforced:

- **Deno edge tests — 15:** `whistleblow-submit` (4), `whistleblow-follow-up` (6),
  `whistleblow-config` (5) — service-role isolation, token hashing, rate limiting,
  input sanitisation.
- **Playwright — 4 scenarios:** `e2e/tests/whistleblow-journey.spec.ts` — unauthenticated
  submission, multi-file attachment upload, follow-up token retrieval, case triage by RMD.
- **RLS matrix:** `e2e/tests/rls-matrix.spec.ts` asserts no role can read raw reporter
  identity columns.

Remaining page gap: `WhistleblowCaseDetail.tsx` (investigation workspace) is still
covered only by Playwright.

#### Other buckets

| Module | % | Files |
|--------|---|-------|
| Risk assessment & controls (3.6%) | `lib/assessmentProgress.ts` 93%; all of `components/risk-assessment/**` and `settings/AssessmentTemplatesManager.tsx` at 0–9% | 12 |
| Incidents (33.2%) | `IncidentsTable.tsx` 79%, `IncidentsDashboard.tsx` 68%; `AddIncidentDialog.tsx`, `ExportIncidentsMenu.tsx`, `IncidentTimeline.tsx` at 0–4% | 5 |
| Dashboards & reporting (29.8%) | `chartUtils.ts` 100%, `DashboardWidgets.tsx` 100%, `nrsPdf.ts` 92%, `ScheduleReportDialog.tsx` 87%, `EnhancedDashboardWidgets.tsx` 88%, `StatusBreakdownCard.tsx` 88%, `docPdf.ts` 64%, `ReportArchivePanel.tsx` 63%, `RiskCategoryChart.tsx` 59%, `useBoardReports.ts` 58%; `ExportReportsMenu.tsx` 0% (416 lines — the single largest gap) | 25 |
| Notifications (54.1%) | `NotificationCenter.tsx` 55%, `NotificationContext.tsx` 51%, `use-toast.ts` 57% | 3 |
| Platform / shell & settings (39.2%) | `useSidebarCounts`/`useDepartments`/`useMatrixDimensions`/`utils` 100%, `useAIPredictions` 85%, `useAIScoring` 83%, `MatrixDimensionsManager` 86%, `RiskCategoriesManager` 70%, `GlobalSearch` 75%; `documents/**`, `ai/**`, `Header`, `ErrorBoundary` at 0% | 21 |



### Functional (e2e) scenario coverage

| Spec | Scenarios | Journey |
|------|-----------|---------|
| `auth.spec.ts` | 2 | Sign-in, lockout, session |
| `role-landing.spec.ts` | 1 | Role-based landing routes |
| `sidebar-access.spec.ts` | 2 | Nav visibility per role |
| `negative-rbac.spec.ts` | 4 | Forbidden routes and actions |
| `rls-matrix.spec.ts` | 3 | Server-side RLS truth table |
| `risk-journey.spec.ts` | 5 | 4-step wizard → submit → claim → approve |
| `bcp-journey.spec.ts` | 5 | BCP → BIA → test log → version history |
| `incident-journey.spec.ts` | 6 | Incident intake, ownership, timeline, CSV |
| `whistleblow-journey.spec.ts` | 4 | Anonymous submit, attachments, follow-up |
| `reporting-journey.spec.ts` | 3 | Dashboards, exports |
| `board-reports.spec.ts` | 2 | Report generation and archive |

### How to reproduce this report

```bash
npm run test:coverage   # totals + per-file table, writes coverage/lcov.info
npm run test:edge       # Deno edge function tests
npm run test:e2e        # Playwright functional journeys + UAT report
```

---


## 1. Developer Unit Tests

### Stack
- [Vitest](https://vitest.dev) test runner (jsdom environment)
- [@testing-library/react](https://testing-library.com/) for component tests
- Setup file: `src/test/setup.ts`
- Config: `vitest.config.ts`

### Run

```bash
npm test                 # single run (CI)
npm run test:watch       # watch mode
npm run test:coverage    # coverage + thresholds (fails below the ratchet)
npm run test:e2e         # Playwright journeys + RBAC + RLS matrix
npm run test:e2e:rbac    # just the permission-enforcement specs
npm run test:edge        # Deno tests for Supabase edge functions
npm run test:all         # coverage + e2e
```

Coverage thresholds live in `vitest.config.ts`. They are a **ratchet**: set just
below the current numbers so a regression fails CI, and raised whenever coverage
improves. `src/lib/permissions.ts` is held to a much higher bar than the rest of
the codebase because it is the security boundary.

### What is covered today

**Pure logic**

| Suite | File | Focus |
|-------|------|-------|
| `cn` class merger | `src/test/utils.test.ts` | Tailwind class merge behaviour |
| Assessment progress | `src/test/assessmentProgress.test.ts` | Draft / In Review / Completed derivation |
| Risk workflow | `src/test/riskWorkflow.test.ts` | Role-based `canPerformWorkflowAction` matrix, enum guards, badge variants |
| State transitions | `src/test/stateTransitionSpec.test.ts` | Allowed transitions and guards for risks, incidents, BCP, whistleblowing |
| Chart / format utils | `src/test/chartUtils.test.ts` | ISO 31000 severity thresholds, currency and date formatting |
| BCP server errors | `src/test/bcpServerErrors.test.ts` | Postgres trigger error → field-level UI mapping |
| BCP CSV export | `src/test/bcpCsvExport.test.ts` | Column set, escaping, filter-aware rows |

**Permissions**

| Suite | File | Focus |
|-------|------|-------|
| Matrix truth table | `src/test/permissionMatrix.test.ts` | Snapshot of every role × route × action; no silent drift |
| Nav ↔ route guard consistency | `src/test/navAccessConsistency.test.ts` | Sidebar and route guards match for every role (incl. CRO ⛔ /user-management) |
| UI action gating | `src/test/uiActionGating.test.tsx` | Sidebar links and workflow buttons rendered per role |

**Components**

| Suite | File | Focus |
|-------|------|-------|
| Incidents table | `src/test/components/IncidentsTable.test.tsx` | Search, filters, pagination, CSV export, URL state |
| BCP table | `src/test/components/BCPTable.test.tsx` | Same controls for continuity plans |
| BIA section | `src/test/components/BIASection.test.tsx` | Inline validation, assessment-date default |
| Test details | `src/test/components/TestDetailsSection.test.tsx` | Inline validation for test type / scope / results |
| Workflow actions | `src/test/components/RiskWorkflowActions.test.tsx` | Which buttons each role sees at each approval status |
| Notification centre | `src/test/components/NotificationCenter.test.tsx` | Unread filter, search, mark-all-read, delete |
| Global search | `src/test/components/GlobalSearch.test.tsx` | Cross-entity query and navigation |

**Data hooks** — `src/test/hooks/`: `useRisks`, `useBCPData`, `useApprovalInbox`,
`useSidebarCounts`, `useBudgetForecast`, and the `risk_categories` / `departments`
lookups. These assert query keys, filter composition against the recorded
Supabase calls, and derived values (budget burn thresholds, severity banding).

### Test infrastructure

- `src/test/mocks/supabase.ts` — chainable PostgREST mock with per-table fixtures
  and a `RecordedCall[]` log, so a test can assert *what was queried*, not just
  what rendered.
- `src/test/renderWithProviders.tsx` — wraps a component in QueryClient, Router
  and an `AuthContext` primed with any role, which is what makes role-based
  component tests one line long.

---

## 1b. Role-permission enforcement — three tiers

The role matrix in `src/lib/permissions.ts` is the single source of truth. Three
independent tiers stop it from drifting away from reality:

| Tier | Where | Runs | Catches |
|------|-------|------|---------|
| 1 — Matrix truth table | `src/test/permissionMatrix.test.ts` | every commit, milliseconds | Accidental widening of a role; snapshot diff makes every change explicit and reviewable |
| 2 — UI action gating | `src/test/uiActionGating.test.tsx`, `navAccessConsistency.test.ts` | every commit | A sidebar link, button or route guard that disagrees with the matrix |
| 3 — Server RLS matrix | `e2e/tests/rls-matrix.spec.ts` + `e2e/fixtures/rlsMatrix.ts` | nightly / on demand | The only tier that matters to an attacker: whether the **database** refuses the request when the UI is bypassed |

Tier 3 signs in as each role, then calls the Data API directly with that role's
JWT for every table in `e2e/fixtures/rlsMatrix.ts`, asserting reads and writes
match the declared expectation. Append-only tables (`risk_audit_logs`,
`approval_history`, `bcp_version_history`, `whistleblow_messages`) must reject
UPDATE for *everyone*, including ADMIN. A dedicated case attempts privilege
escalation by inserting an `ADMIN` row into `user_roles` as a non-admin; it must
be rejected.

**When you change a permission**, expect three files to move together: the matrix,
the tier-1 snapshot, and — if the change touches data access — `rlsMatrix.ts`.
If only the snapshot changes, the server side was never actually updated.

---

## 1c. End-to-end journeys

`e2e/tests/` covers the feature journeys, each seeded and torn down per spec.
Current inventory — 11 spec files, 46 tests across all projects:

| Spec | UAT cases | Journey |
|------|-----------|---------|
| `risk-journey.spec.ts` | UAT-RISK-01…05 | 4-step wizard (Identify → Assess → Treat → Monitor), step gating on mandatory fields, early save, submit → claim → approve, return-for-revision with a mandatory comment → edit → resubmit → ordered approval history, read-only roles blocked |
| `bcp-journey.spec.ts` | UAT-BCP-01…05 | Create plan with RTO/RPO and mitigation actions → BIA validation inline → test log → version history diff (changed fields, author, timestamp ordering) → schema-check page access control |
| `incident-journey.spec.ts` | UAT-INC-01…06 | Table search/filter/URL state, CSV download, owner assignment and reassignment recorded on the activity timeline, notification deep-link into the incident, read-only roles blocked |
| `whistleblow-journey.spec.ts` | UAT-WB-01…04 | Anonymous submission without a session, category dropdown populated, follow-up with case reference + passphrase sends a message, wrong passphrase and bogus tokens rejected, supervisor-only triage |
| `board-reports.spec.ts` | UAT-BRPT-01…02 | Authorised role generates and downloads a board report; unauthorised role is denied the page |
| `reporting-journey.spec.ts` | UAT-RPT-* | Board report generate → archive, dashboard drill-down, executive summary access |
| `auth.spec.ts` | UAT-AUTH-01 | Sign-in, invalid-credential rejection |
| `role-landing.spec.ts` | UAT-AUTH-06 | Per-role landing page after login |
| `sidebar-access.spec.ts` | UAT-AUTH-05/06 | Sidebar navigation matches the role's route guards |
| `negative-rbac.spec.ts` | UAT-AUTH-05 | Role-based denials through the UI and the Data API |
| `rls-matrix.spec.ts` | UAT-RLS-* | Tier 3, above |

Specs auto-skip when credentials for the role are absent, so a partial
environment still produces a useful run rather than a wall of failures.
Credentials come from `e2e/.env` (git-ignored, see `e2e/.env.example`) or CI
secrets — never hardcoded.

Cross-browser (Firefox, WebKit) and responsive (tablet, mobile) projects run the
role-landing and sidebar-access specs; the heavier journeys stay on Chromium to
keep the nightly run inside its time budget.

### Run

Playwright must always be given the e2e config — the repo root also contains a
Vitest config, and a bare `playwright test` picks up the wrong one. Use the npm
scripts:

```bash
npm run test:e2e         # full journey + RBAC suite
npm run test:e2e:list    # enumerate specs without launching browsers
npm run test:e2e:rbac    # RLS matrix + negative RBAC only
```


---

## 1d. Edge function tests

Supabase functions are tested with Deno beside their source
(`supabase/functions/<name>/index_test.ts`), covering at least three branches
each: JWT/authorization rejection, an upstream-failure path, and the happy path,
plus a CORS preflight check. See `supabase/functions/README-tests.md` for the
harness and the per-function coverage table.

```bash
npm run test:edge
# = deno test --allow-env --allow-net --allow-read --no-check supabase/functions
```

### Running every layer

```bash
npm run test:all   # unit + coverage, then edge, then e2e
```




### Adding new tests

Place tests next to the source file or under `src/test/`:

```ts
// src/lib/myThing.test.ts
import { describe, it, expect } from "vitest";
import { myFn } from "@/lib/myThing";

describe("myFn", () => {
  it("does X", () => {
    expect(myFn(1)).toBe(2);
  });
});
```

For component tests, follow this pattern:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyComponent } from "@/components/MyComponent";

it("submits when button clicked", async () => {
  render(<MyComponent />);
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));
  expect(screen.getByText(/thanks/i)).toBeInTheDocument();
});
```

### Mocking Supabase in component tests

```ts
import { vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ data: [], error: null }) }),
    }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));
```

### CI integration

Add to your pipeline (GitHub Actions example):

```yaml
- run: bun install
- run: bunx vitest run --reporter=default --reporter=junit --outputFile=test-report.xml
```

---

## 2. User Acceptance Tests

See **`docs/uat-test-plan.md`** for the full catalogue: entry/exit criteria, role coverage, functional and non-functional cases, defect severity, cut-over checklist, and sign-off sheet.

UAT is executed against a dedicated tenant seeded via **Settings → Sample Data**; never enter production data during UAT.
