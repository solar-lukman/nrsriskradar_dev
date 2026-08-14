import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { DashboardWidgets } from "@/components/dashboard/DashboardWidgets";

const baseRisk = {
  id: "1",
  status: "New",
  inherent_likelihood: 3,
  inherent_impact: 3,
  residual_likelihood: 2,
  residual_impact: 2,
  created_at: "2024-01-01",
};

describe("DashboardWidgets metric cards", () => {
  it("computes totals, open count and avg residual score", () => {
    const risks = [
      baseRisk,
      { ...baseRisk, id: "2", status: "Mitigated", residual_likelihood: 1, residual_impact: 1 },
    ];
    renderWithProviders(<DashboardWidgets risks={risks} />);
    // 1 open (status !== Mitigated) of 2 total
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2 total risks")).toBeInTheDocument();
    // avg residual score = ((2*2) + (1*1)) / 2 = 2.5
    expect(screen.getByText("2.5")).toBeInTheDocument();
  });

  it("treats a score of 15 or more as high priority (ISO 31000 threshold)", () => {
    const risks = [
      { ...baseRisk, id: "1", inherent_likelihood: 5, inherent_impact: 3 }, // 15 -> high
      { ...baseRisk, id: "2", inherent_likelihood: 4, inherent_impact: 3 }, // 12 -> not high
    ];
    renderWithProviders(<DashboardWidgets risks={risks} />);
    expect(screen.getByText("High Priority Risks")).toBeInTheDocument();
    // exactly one risk qualifies as high (score >= 15)
    const highCard = screen.getByText("High Priority Risks").closest("div")!.parentElement!.parentElement!;
    expect(highCard.textContent).toContain("1");
  });

  it("renders zero-value cards for an empty risk list", () => {
    renderWithProviders(<DashboardWidgets risks={[]} />);
    expect(screen.getByText("0 total risks")).toBeInTheDocument();
    // avg risk score with no risks is 0
    expect(screen.getByText("Avg Risk Score")).toBeInTheDocument();
  });
});
