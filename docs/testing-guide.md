# RiskRadar — Testing Guide

Two complementary layers ship with the app:

1. **Developer unit tests** — Vitest + Testing Library. Fast, run on every commit.
2. **User Acceptance Tests (UAT)** — see `docs/uat-test-plan.md`. Manual, role-based, run before go-live.

---

## 1. Developer Unit Tests

### Stack
- [Vitest](https://vitest.dev) test runner (jsdom environment)
- [@testing-library/react](https://testing-library.com/) for component tests
- Setup file: `src/test/setup.ts`
- Config: `vitest.config.ts`

### Run

```bash
bunx vitest run          # single run (CI)
bunx vitest              # watch mode
bunx vitest --ui         # browser UI
bunx vitest --coverage   # coverage report (install @vitest/coverage-v8 first)
```

### What is covered today

| Suite | File | Focus |
|-------|------|-------|
| `cn` class merger | `src/test/utils.test.ts` | Tailwind class merge behaviour |
| Assessment progress | `src/test/assessmentProgress.test.ts` | Draft / In Review / Completed derivation |
| Risk workflow | `src/test/riskWorkflow.test.ts` | Role-based `canPerformWorkflowAction` matrix, enum guards, badge variants |
| BCP server errors | `src/test/bcpServerErrors.test.ts` | Postgres trigger error → field-level UI mapping |
| Nav ↔ route guard consistency | `src/test/navAccessConsistency.test.ts` | Sidebar and route guards match for every role (incl. CRO ⛔ /user-management) |

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
