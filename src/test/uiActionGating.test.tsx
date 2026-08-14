import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import {
  ALL_ROLES,
  canPerformAction,
  canSeeInSidebar,
  ROUTE_ACCESS,
  type UserRole,
} from "@/lib/permissions";
import { canPerformWorkflowAction } from "@/lib/riskWorkflow";

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { supabase: createSupabaseMock() };
});


vi.mock("@/hooks/useSidebarCounts", () => ({
  useSidebarCounts: () => ({ risks: 0, bcps: 0, reports: 0, incidents: 0, users: 0, calendarUpcoming: 0 }),
}));

vi.mock("@/hooks/useApprovalInbox", () => ({
  useApprovalInboxCount: () => ({ count: 0 }),
  useApprovalInbox: () => ({ items: [], loading: false, refetch: vi.fn() }),
}));

import { Sidebar } from "@/components/Sidebar";
import { RiskWorkflowActions } from "@/components/risk-register/RiskWorkflowActions";

/**
 * Tier 2 of the role-permission enforcement strategy: the rendered UI must
 * agree with the declared matrix for every role. Tier 1 freezes the matrix;
 * this suite proves the components actually consume it.
 */
describe("UI action gating — sidebar renders exactly the declared routes", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  for (const role of ALL_ROLES) {
    it(`[${role}] sidebar links match canSeeInSidebar()`, () => {
      const { container } = renderWithProviders(<Sidebar />, { role });
      const hrefs = new Set(
        Array.from(container.querySelectorAll("a[href]")).map((a) =>
          (a.getAttribute("href") || "").replace(/^#/, ""),
        ),
      );

      for (const route of ROUTE_ACCESS) {
        if (route.hiddenFromSidebar) continue;
        const expected = canSeeInSidebar(role, route.path);
        expect(
          hrefs.has(route.path),
          `${role}: ${route.path} should ${expected ? "" : "NOT "}appear in the sidebar`,
        ).toBe(expected);
      }
    });
  }
});

describe("UI action gating — risk workflow buttons", () => {
  const cases: Array<{
    role: UserRole;
    approvalStatus: "Draft" | "Submitted" | "Under Review" | "Approved" | "Returned";
    action: string;
    label: RegExp;
  }> = [
    { role: "RC", approvalStatus: "Draft", action: "submit", label: /submit for review/i },
    { role: "USER", approvalStatus: "Draft", action: "submit", label: /submit for review/i },
    { role: "RR", approvalStatus: "Submitted", action: "review", label: /claim for review/i },
    { role: "RC", approvalStatus: "Submitted", action: "review", label: /claim for review/i },
    { role: "CRO", approvalStatus: "Under Review", action: "approve", label: /approve/i },
    { role: "RO", approvalStatus: "Under Review", action: "approve", label: /approve/i },
  ];

  for (const c of cases) {
    const allowed = canPerformWorkflowAction(c.action as any, c.approvalStatus, c.role, {});
    it(`[${c.role}] ${c.action} on ${c.approvalStatus} is ${allowed ? "offered" : "hidden"}`, () => {
      renderWithProviders(
        <RiskWorkflowActions
          riskId="risk-1"
          status="Draft"
          approvalStatus={c.approvalStatus}
          createdBy={`user-${c.role.toLowerCase()}`}
          variant="buttons"
        />,
        { role: c.role },
      );
      const matches = screen.queryAllByRole("button", { name: c.label });
      expect(matches.length > 0).toBe(allowed);
    });
  }
});

describe("UI action gating — declared action matrix stays coherent", () => {
  it("roles that can approve can also open the approval inbox", () => {
    for (const role of ALL_ROLES) {
      if (canPerformAction(role, "risk.approve") && role !== "ADMIN") {
        expect(
          canPerformAction(role, "risk.claim") || role === "CRO" || role === "RMD",
          `${role} can approve but cannot reach the inbox`,
        ).toBe(true);
      }
    }
  });

  it("roles that can create a risk can also submit it", () => {
    for (const role of ALL_ROLES) {
      if (canPerformAction(role, "risk.create")) {
        expect(canPerformAction(role, "risk.submit"), role).toBe(true);
      }
    }
  });

  it("no role can assign an incident investigator without incident visibility", () => {
    for (const role of ALL_ROLES) {
      if (canPerformAction(role, "incident.assign")) {
        expect(canPerformAction(role, "incident.create"), role).toBe(true);
      }
    }
  });
});
