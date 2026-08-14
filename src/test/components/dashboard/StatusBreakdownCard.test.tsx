import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { StatusBreakdownCard } from "@/components/dashboard/StatusBreakdownCard";

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = MockResizeObserver;

const risks = [
  { id: "1", status: "New", category: "Cyber", department: "IT", title: "A", inherent_likelihood: 3, inherent_impact: 3, residual_likelihood: 2, residual_impact: 2 },
  { id: "2", status: "New", category: "Cyber", department: "IT", title: "B", inherent_likelihood: 3, inherent_impact: 3, residual_likelihood: 2, residual_impact: 2 },
  { id: "3", status: "Mitigated", category: "Ops", department: "Ops", title: "C", inherent_likelihood: 1, inherent_impact: 1, residual_likelihood: 1, residual_impact: 1 },
];

describe("StatusBreakdownCard", () => {
  it("groups risks by status and shows the total count", () => {
    renderWithProviders(<StatusBreakdownCard risks={risks as any} />);
    expect(screen.getByText("(3 risks)")).toBeInTheDocument();
  });

  it("shows a no-data message for an empty risk list", () => {
    renderWithProviders(<StatusBreakdownCard risks={[]} />);
    expect(screen.getByText("No data.")).toBeInTheDocument();
    expect(screen.getByText("(0 risks)")).toBeInTheDocument();
  });
});
