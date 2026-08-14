import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";

const events = [
  {
    id: "e1", reference_number: "INC-001", title: "Core banking outage",
    event_date: new Date().toISOString(), severity: "Critical", status: "Open",
    risk_posture: "Elevated", reported_by: "u1", owner_id: "u1", financial_impact: 250000,
    risks: { title: "System availability", category: "Operational", department: "IT" },
  },
  {
    id: "e2", reference_number: "INC-002", title: "Phishing attempt",
    event_date: new Date().toISOString(), severity: "Medium", status: "Resolved",
    risk_posture: "Stable", reported_by: "u2", owner_id: "u2", financial_impact: 0,
    risks: { title: "Cyber threat", category: "Cyber", department: "IT" },
  },
];

const profiles = [
  { user_id: "u1", full_name: "Ada Okafor", email: "ada@test.local" },
  { user_id: "u2", full_name: "Bola Ade", email: "bola@test.local" },
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
import IncidentsDashboard from "@/pages/IncidentsDashboard";

h.fixtures.risk_events = events;
h.fixtures.profiles = profiles;
const supabaseMock = supabase as unknown as { __calls: { table: string; method: string }[] };

describe("IncidentsDashboard page", () => {
  beforeEach(() => {
    supabaseMock.__calls.length = 0;
  });

  it("fetches incidents with their linked risks and hydrated owner profiles", async () => {
    renderWithProviders(<IncidentsDashboard />, { role: "RMD" });
    expect(await screen.findByText("Core banking outage")).toBeInTheDocument();

    const selects = supabaseMock.__calls.filter((c) => c.method === "select");
    expect(selects.some((c) => c.table === "risk_events")).toBe(true);
    expect(selects.some((c) => c.table === "profiles")).toBe(true);
    expect(await screen.findAllByText("Ada Okafor")).not.toHaveLength(0);
  });

  it("renders both incidents in the table", async () => {
    renderWithProviders(<IncidentsDashboard />, { role: "RMD" });
    expect(await screen.findByText("Core banking outage")).toBeInTheDocument();
    expect(screen.getByText("Phishing attempt")).toBeInTheDocument();
  });

  it("shows the Add Incident action for roles that may edit risks", async () => {
    renderWithProviders(<IncidentsDashboard />, { role: "RMD" });
    await screen.findByText("Core banking outage");
    expect(screen.getByRole("button", { name: /Add Incident/i })).toBeInTheDocument();
  });

  it("hides the Add Incident action for view-only roles", async () => {
    renderWithProviders(<IncidentsDashboard />, { role: "EC" });
    await screen.findByText("Core banking outage");
    expect(screen.queryByRole("button", { name: /Add Incident/i })).not.toBeInTheDocument();
  });

  it("filters incidents by severity", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IncidentsDashboard />, { role: "RMD" });
    await screen.findByText("Core banking outage");

    const trigger = screen.getAllByRole("combobox").find((el) =>
      /All severities|Severity|Critical|Medium/i.test(el.textContent || ""),
    )!;
    await user.click(trigger);
    const option = await screen.findByRole("option", { name: "Critical" });
    await user.click(option);

    expect(screen.getByText("Core banking outage")).toBeInTheDocument();
    expect(screen.queryByText("Phishing attempt")).not.toBeInTheDocument();
  });

  it("deep-links straight into an incident when ?view= is supplied", async () => {
    renderWithProviders(<IncidentsDashboard />, { role: "RMD", route: "/incidents?view=e1" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/INC-001|Core banking outage/)).toBeInTheDocument();
  });
});
