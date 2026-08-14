import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";

const cases = [
  {
    id: "c1",
    case_reference: "WB-2026-00001",
    subject: "Procurement irregularity",
    category: "Fraud",
    priority: "High",
    status: "Investigation",
    created_at: "2026-01-05T10:00:00Z",
    resolution_date: null,
  },
  {
    id: "c2",
    case_reference: "WB-2026-00002",
    subject: "Workplace harassment",
    category: "Harassment",
    priority: "Critical",
    status: "Escalated",
    created_at: "2026-02-01T10:00:00Z",
    resolution_date: null,
  },
  {
    id: "c3",
    case_reference: "WB-2026-00003",
    subject: "Expense claim padding",
    category: "Financial Misconduct",
    priority: "Low",
    status: "Resolved",
    created_at: "2026-01-01T00:00:00Z",
    resolution_date: "2026-01-11T00:00:00Z",
  },
];

const h = vi.hoisted(() => ({ fixtures: {} as Record<string, any[]> }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { supabase: createSupabaseMock(h.fixtures) };
});
vi.mock("@/components/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { supabase } from "@/integrations/supabase/client";
import WhistleblowCases from "@/pages/WhistleblowCases";

h.fixtures.whistleblow_cases = cases;
const supabaseMock = supabase as unknown as { __calls: { table: string; method: string }[] };

describe("WhistleblowCases page", () => {
  beforeEach(() => {
    supabaseMock.__calls.length = 0;
  });

  it("loads cases from the backend and renders them in the table", async () => {
    renderWithProviders(<WhistleblowCases />, { role: "RMD" });
    expect(await screen.findByText("WB-2026-00001")).toBeInTheDocument();
    expect(screen.getByText("Workplace harassment")).toBeInTheDocument();
    expect(
      supabaseMock.__calls.some((c) => c.table === "whistleblow_cases" && c.method === "select"),
    ).toBe(true);
  });

  it("computes KPI totals for open, escalated and average resolution days", async () => {
    renderWithProviders(<WhistleblowCases />, { role: "RMD" });
    await screen.findByText("WB-2026-00001");

    // Total cases = 3, open (not Closed/Dismissed/Resolved) = 2, escalated = 1
    const total = screen.getByText("Total Cases").parentElement!;
    expect(total).toHaveTextContent("3");
    const open = screen.getByText("Open Cases").parentElement!;
    expect(open).toHaveTextContent("2");
    const escalated = screen.getByText("Escalated", { selector: "p.text-sm" }).parentElement!;
    expect(escalated).toHaveTextContent("1");
    // Only c3 resolved: 10 days
    expect(screen.getByText("10d")).toBeInTheDocument();
  });

  it("filters the table by free-text search across reference, subject and category", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowCases />, { role: "RMD" });
    await screen.findByText("WB-2026-00001");

    await user.type(screen.getByPlaceholderText("Search cases..."), "harassment");
    expect(screen.getByText("Workplace harassment")).toBeInTheDocument();
    expect(screen.queryByText("Procurement irregularity")).not.toBeInTheDocument();
  });

  it("shows an empty state when no case matches the search", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowCases />, { role: "RMD" });
    await screen.findByText("WB-2026-00001");

    await user.type(screen.getByPlaceholderText("Search cases..."), "zzzz-no-match");
    expect(await screen.findByText("No cases found")).toBeInTheDocument();
  });

  it("links each row to its case detail route", async () => {
    renderWithProviders(<WhistleblowCases />, { role: "RMD" });
    await screen.findByText("WB-2026-00001");
    const links = screen.getAllByRole("link", { name: "View" });
    expect(links[0]).toHaveAttribute("href", "/whistleblow/cases/c1");
  });

  it("refetches cases when Refresh is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowCases />, { role: "RMD" });
    await screen.findByText("WB-2026-00001");
    const before = supabaseMock.__calls.filter((c) => c.table === "whistleblow_cases").length;

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(
        supabaseMock.__calls.filter((c) => c.table === "whistleblow_cases").length,
      ).toBeGreaterThan(before);
    });
  });
});
