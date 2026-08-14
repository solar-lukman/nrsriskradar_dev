import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { supabase: createSupabaseMock({ risk_events: [] }) };
});

// These hooks perform their own supabase fetching (tested elsewhere); stub them
// here so we can focus on metric computation and drill-down wiring.
vi.mock("@/hooks/useBCPData", () => ({
  useBCPData: () => ({ bcpData: { totalPlans: 4, readyPlans: 2, coverage: 50 }, loading: false }),
}));
vi.mock("@/hooks/useApprovalInbox", () => ({
  useApprovalInboxCount: () => ({ count: 3, loading: false }),
}));
vi.mock("@/hooks/useBudgetForecast", () => ({
  useBudgetForecast: () => ({ aggregateForecast: null, forecasts: [], loading: true }),
}));

import { EnhancedDashboardWidgets } from "@/components/dashboard/EnhancedDashboardWidgets";

// The component takes full `risks` rows (70+ generated columns); the widgets
// only read the scoring/status fields, so fixtures stay minimal and are cast
// to the prop's row type.
type DashboardRisk = React.ComponentProps<typeof EnhancedDashboardWidgets>["risks"][number];

const risk = (overrides: Partial<any> = {}) =>
  ({
    id: "r1",
    status: "New",
    inherent_likelihood: 3,
    inherent_impact: 3,
    inherent_score: 9,
    residual_likelihood: 2,
    residual_impact: 2,
    review_date: null,
    ...overrides,
  }) as unknown as DashboardRisk;


describe("EnhancedDashboardWidgets", () => {
  it("computes high-severity count using the ISO 31000 score >= 15 threshold", async () => {
    const risks = [
      risk({ id: "1", inherent_likelihood: 5, inherent_impact: 3 }), // 15 -> high
      risk({ id: "2", inherent_likelihood: 4, inherent_impact: 3 }), // 12 -> not high
    ];
    renderWithProviders(<EnhancedDashboardWidgets risks={risks} />);
    // flush the async "crystallized events" effect so no act() warning leaks out
    await screen.findByText("Crystallized (90d)");
    expect(screen.getByText("High Severity")).toBeInTheDocument();
    expect(screen.getByText("Score ≥ 15")).toBeInTheDocument();
    // exactly one risk crosses the threshold
    expect(screen.getByText("High")).toBeInTheDocument(); // destructive badge shown only when highRisks > 0
  });

  it("shows a loading placeholder for widgets whose backing hook is still loading", async () => {
    renderWithProviders(<EnhancedDashboardWidgets risks={[]} />);
    await screen.findByText("Crystallized (90d)");
    // Budget Utilisation card is wired to the (loading:true) useBudgetForecast mock
    expect(screen.getByText("Budget Utilisation")).toBeInTheDocument();
    const card = screen.getByText("Budget Utilisation").closest("div")!.parentElement!.parentElement!;
    expect(card.textContent).toContain("…");
  });

  it("renders zero totals for an empty risk list", async () => {
    renderWithProviders(<EnhancedDashboardWidgets risks={[]} />);
    await screen.findByText("Crystallized (90d)");
    expect(screen.getByText("Total Risks")).toBeInTheDocument();
    const card = screen.getByText("Total Risks").closest("div")!.parentElement!.parentElement!;
    expect(card.textContent).toContain("0");
  });

  it("invokes the drill-down handler with the right filter when a clickable card is clicked", async () => {
    const user = userEvent.setup();
    const onWidgetClick = vi.fn();
    const risks = [risk({ id: "1", inherent_likelihood: 5, inherent_impact: 3 })];
    renderWithProviders(<EnhancedDashboardWidgets risks={risks} onWidgetClick={onWidgetClick} />);
    await screen.findByText("Crystallized (90d)");
    await user.click(screen.getByText("High Severity"));
    expect(onWidgetClick).toHaveBeenCalledWith({ type: "severity", value: "high" });
  });

  it("does not attach a click handler to non-clickable cards", async () => {
    const user = userEvent.setup();
    const onWidgetClick = vi.fn();
    renderWithProviders(<EnhancedDashboardWidgets risks={[]} onWidgetClick={onWidgetClick} />);
    await screen.findByText("Crystallized (90d)");
    await user.click(screen.getByText("Total Risks"));
    expect(onWidgetClick).not.toHaveBeenCalled();
  });
});
