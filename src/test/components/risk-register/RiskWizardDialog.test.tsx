import { describe, it, expect, vi, beforeAll } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { createSupabaseMock, type RecordedCall } from "@/test/mocks/supabase";

// Radix Select relies on pointer-capture / scroll APIs jsdom doesn't implement.
beforeAll(() => {
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (Element.prototype as any).scrollIntoView ??= () => {};
});

let calls: RecordedCall[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    get from() {
      return mockSupabase.from;
    },
    get rpc() {
      return mockSupabase.rpc;
    },
  },
}));

// The mock object is built lazily per-test via a module-level indirection so each
// test can swap fixtures without re-mocking. We proxy through a mutable holder.
let mockSupabase: ReturnType<typeof createSupabaseMock>;

function setupSupabase(overrides: Record<string, any[]> = {}) {
  calls = [];
  mockSupabase = createSupabaseMock(
    {
      profiles: [],
      departments: [],
      strategic_objectives: [],
      risk_categories: [],
      treatment_strategy_status_map: [],
      risks: [],
      ...overrides,
    },
    { calls },
  );
  return mockSupabase;
}

import { RiskWizardDialog } from "@/components/risk-register/RiskWizardDialog";

// Wizard Select triggers are unlabelled; identify them by their placeholder text.
async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  placeholder: string,
  optionName: RegExp,
) {
  const trigger = screen.getByText(placeholder).closest("button")!;
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

// Deliberately keyword-free so the auto-suggest heuristic does not preselect a category.
const NEUTRAL_TITLE = "Delayed taxpayer onboarding queue";
const NEUTRAL_DESC = "Backlog of pending taxpayer enrolment records across the branch.";

async function fillStepOne(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/Cybersecurity breach/i), NEUTRAL_TITLE);
  await user.type(screen.getByPlaceholderText(/Describe what could go wrong/i), NEUTRAL_DESC);
  await selectOption(user, "Select category", /^Technology$/i);
}

describe("RiskWizardDialog (add-risk wizard)", () => {
  it("keeps Next disabled on step 1 until title, description, and category are filled", async () => {
    setupSupabase();
    const user = userEvent.setup();
    renderWithProviders(
      <RiskWizardDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />,
      { role: "RC" },
    );

    expect(screen.getByText(/Step 1 of 4/i)).toBeInTheDocument();
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Cybersecurity breach/i), NEUTRAL_TITLE);
    expect(nextBtn).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Describe what could go wrong/i), NEUTRAL_DESC);
    expect(nextBtn).toBeDisabled(); // category still missing

    await selectOption(user, "Select category", /^Technology$/i);
    await waitFor(() => expect(nextBtn).not.toBeDisabled());
  });

  it("blocks step 2 -> 3 until an inherent likelihood and impact are picked, then computes the score", async () => {
    setupSupabase();
    const user = userEvent.setup();
    renderWithProviders(
      <RiskWizardDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />,
      { role: "RC" },
    );

    await fillStepOne(user);
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText(/Step 2 of 4/i)).toBeInTheDocument();
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDisabled();

    // Click the likelihood=5, impact=5 matrix cell -> inherent score 25 (Critical, >= 15 high).
    await user.click(screen.getByRole("button", { name: "25" }));
    expect(nextBtn).not.toBeDisabled();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("requires a mitigation plan for the Mitigate strategy before advancing from step 3", async () => {
    setupSupabase();
    const user = userEvent.setup();
    renderWithProviders(
      <RiskWizardDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />,
      { role: "RC" },
    );

    await fillStepOne(user);
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: "25" }));
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText(/Step 3 of 4/i)).toBeInTheDocument();
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDisabled(); // no treatment strategy chosen yet

    await user.click(screen.getByText("Mitigate"));
    expect(nextBtn).toBeDisabled(); // plan still required

    await user.type(screen.getByPlaceholderText(/Describe the actions to reduce/i), "Deploy additional firewall controls.");
    expect(nextBtn).not.toBeDisabled();
  });

  it("submits the expected payload shape on step 4, with residual scoring and NGN budget", async () => {
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    setupSupabase();
    const user = userEvent.setup();
    renderWithProviders(
      <RiskWizardDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} />,
      { role: "RC" },
    );

    await fillStepOne(user);
    await user.click(screen.getByRole("button", { name: /Next/i }));

    await user.click(screen.getByRole("button", { name: "25" })); // inherent 5x5 = 25
    await user.click(screen.getByRole("button", { name: /Next/i }));

    await user.click(screen.getByText("Mitigate"));
    await user.type(screen.getByPlaceholderText(/Describe the actions to reduce/i), "Deploy additional firewall controls.");
    await user.type(screen.getAllByPlaceholderText("0.00")[0], "500000");
    // Residual matrix appears once a treatment strategy is chosen; pick 2x2 = 4 (low).
    const residualCells = screen.getAllByRole("button", { name: "4" });
    await user.click(residualCells[residualCells.length - 1]);
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText(/Step 4 of 4/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Create Risk/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insertCall = calls.find((c) => c.table === "risks" && c.method === "insert");
    expect(insertCall).toBeTruthy();
    const payload = insertCall!.args[0];
    expect(payload).toMatchObject({
      title: NEUTRAL_TITLE,
      category: "Technology",
      inherent_likelihood: 5,
      inherent_impact: 5,
      treatment_strategy: "Mitigate",
      mitigation_budget: 500000,
      mitigation_budget_currency: "NGN",
    });
    expect(payload.residual_likelihood * payload.residual_impact).toBe(4);
  });
});
