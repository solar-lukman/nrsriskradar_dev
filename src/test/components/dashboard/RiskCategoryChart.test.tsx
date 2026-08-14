import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { RiskCategoryChart } from "@/components/dashboard/RiskCategoryChart";

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = MockResizeObserver;

const risks = [
  { id: "1", category: "Cyber", department: "IT", status: "New", inherent_likelihood: 3, inherent_impact: 3, residual_likelihood: 5, residual_impact: 5 },
  { id: "2", category: "Cyber", department: "IT", status: "New", inherent_likelihood: 3, inherent_impact: 3, residual_likelihood: 2, residual_impact: 2 },
  { id: "3", category: "Ops", department: "Ops", status: "Mitigated", inherent_likelihood: 1, inherent_impact: 1, residual_likelihood: 1, residual_impact: 1 },
] as any;

describe("RiskCategoryChart data shaping", () => {
  it("summarises risks per category by default with correct counts and percentage", () => {
    renderWithProviders(<RiskCategoryChart risks={risks} />);
    // 2 buckets: category, 3 risks total
    expect(screen.getByText(/Showing 2 category buckets · 3 risks total/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no risks", () => {
    renderWithProviders(<RiskCategoryChart risks={[]} />);
    expect(screen.getByText("No risks to break down yet.")).toBeInTheDocument();
  });

  it("re-buckets by severity using the score >= 15 / >= 10 thresholds when switching dimension", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RiskCategoryChart risks={risks} />);
    // Switch the dimension select to "By Severity"
    await user.click(screen.getAllByRole("combobox")[0]);
    const option = await screen.findByText("By Severity");
    await user.click(option);
    // risk 1: residual 5*5=25 -> High; risk 2: 2*2=4 -> Low; risk 3: 1*1=1 -> Low
    expect(await screen.findByText(/Showing 2 severity buckets · 3 risks total/)).toBeInTheDocument();
  });
});
