# RiskRadar — End-to-End Acceptance Tests

Playwright suite covering the acceptance flows in `docs/uat-test-plan.md`:

- **auth.spec.ts** — login for every configured role + invalid-credential rejection (UAT-AUTH-01)
- **role-landing.spec.ts** — verifies each role lands on its assigned home when
  hitting `/` (mirrors the `roleHome()` map in `LandingPage.tsx`)
- **sidebar-access.spec.ts** — for every role, opens every allowed path and
  confirms every forbidden path is denied or redirected (UAT-AUTH-05 / -06)
- **negative-rbac.spec.ts** — CRO ⛔ `/user-management`, read-only roles cannot
  see the "Add Risk" action, RC cannot PATCH someone else's risk via the Data
  API (RLS check), and non-supervisor roles cannot open Whistleblowing cases

Every test tags itself with the UAT case ID via `testInfo.annotations`, and the
custom `reporters/uat-report.ts` collates results into a Markdown execution
report that maps directly to `docs/uat-test-plan.md`.

## Setup

```bash
# once
bunx playwright install chromium

# create your credentials file (git-ignored)
cp e2e/.env.example e2e/.env
# fill in one email/password per role you want to cover
```

Tests for roles without credentials are automatically skipped, so you can
start with just ADMIN/RMD/CRO/RC and expand later.

## Run

```bash
# against a local dev server (default baseURL http://localhost:8080)
bun run dev  # in another terminal
bunx dotenv -e e2e/.env -- bunx playwright test -c e2e/playwright.config.ts

# against a deployed environment
E2E_BASE_URL=https://riskradar.codeware.com.ng \
  bunx dotenv -e e2e/.env -- bunx playwright test -c e2e/playwright.config.ts
```

Add `--headed` for a visible browser or `--ui` for the Playwright inspector.

## Browser & viewport matrix

The config defines five Playwright projects:

| Project         | Browser  | Viewport            | Scope                                 |
| --------------- | -------- | ------------------- | ------------------------------------- |
| `chromium`      | Chromium | Desktop 1280×900    | Full suite (auth, RBAC, landing, nav) |
| `firefox-rbac`  | Firefox  | Desktop Firefox     | Role landing + sidebar access only    |
| `webkit-rbac`   | WebKit   | Desktop Safari      | Role landing + sidebar access only    |
| `tablet-rbac`   | WebKit   | iPad (gen 7)        | Role landing + sidebar access only    |
| `mobile-rbac`   | Chromium | Pixel 5             | Role landing + sidebar access only    |

The `-rbac` projects are scoped via `grep: /UAT-AUTH-(01|05|06)/` so cross-browser
and responsive runs stay fast while still exercising every role on every form
factor.

```bash
# install every engine once
bunx playwright install chromium firefox webkit

# run the full matrix
bunx dotenv -e e2e/.env -- bunx playwright test -c e2e/playwright.config.ts

# run only the responsive/cross-browser landing + sidebar checks
bunx dotenv -e e2e/.env -- bunx playwright test -c e2e/playwright.config.ts \
  --project=firefox-rbac --project=webkit-rbac \
  --project=tablet-rbac --project=mobile-rbac
```


## Outputs

After a run you get:

- `e2e/report/uat-execution-report.md` — pass/fail table grouped by UAT ID with
  links to screenshots, traces and videos for failed tests
- `e2e/report/uat-execution-report.json` — same data as JSON for CI parsing
- `e2e/report/html/index.html` — full Playwright HTML report (`bunx playwright show-report e2e/report/html`)
- `e2e/report/results.json` — raw Playwright JSON

## CI

The suite is single-worker and safe to run serially. Minimal GitHub Actions
snippet:

```yaml
- run: bunx playwright install --with-deps chromium
- run: bunx playwright test -c e2e/playwright.config.ts
  env:
    E2E_BASE_URL: ${{ vars.E2E_BASE_URL }}
    E2E_ADMIN_EMAIL: ${{ secrets.E2E_ADMIN_EMAIL }}
    E2E_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}
    # …repeat for each role you seed…
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: uat-report
    path: e2e/report
```

## Adding coverage

1. Write a spec under `e2e/tests/`.
2. Annotate the test so it maps back to the UAT plan:
   ```ts
   testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-01' });
   testInfo.annotations.push({ type: 'role', description: 'RC' });
   ```
3. Screenshots emitted through `testInfo.outputPath('name.png')` are auto-linked
   from the Markdown report as evidence.
