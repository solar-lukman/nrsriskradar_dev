import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { createSupabaseMock } from "@/test/mocks/supabase";

let mockSupabase: ReturnType<typeof createSupabaseMock>;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    get from() { return mockSupabase.from; },
  },
}));

function setup(fixtures: Record<string, any[]> = {}) {
  mockSupabase = createSupabaseMock({
    risk_audit_logs: [],
    risk_workflow_audit_view: [],
    ...fixtures,
  });
  return mockSupabase;
}

import { AuditLogDialog } from "@/components/risk-register/AuditLogDialog";

describe("AuditLogDialog", () => {
  it("shows a diff table of only user-meaningful before/after fields", async () => {
    setup({
      risk_audit_logs: [
        {
          id: "log1",
          action: "updated",
          performed_at: "2024-03-01T10:00:00Z",
          performed_by_profile: { full_name: "Bola Adeyemi", email: "bola@test.local" },
          changes: {
            before: { title: "Old title", updated_at: "2024-01-01T00:00:00Z" },
            after: { title: "New title", updated_at: "2024-03-01T10:00:00Z" },
          },
        },
      ],
    });
    renderWithProviders(<AuditLogDialog open onOpenChange={vi.fn()} riskId="r1" />);

    // Field-level changes live under the "Field Changes" tab; switch to it.
    const tab = await screen.findByRole("tab", { name: /Field Changes \(1\)/i });
    await userEvent.setup().click(tab);
    expect(await screen.findByText("UPDATED")).toBeInTheDocument();

    expect(await screen.findByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Old title")).toBeInTheDocument();
    expect(screen.getByText("New title")).toBeInTheDocument();
    // updated_at is a hidden/system field and must not leak into the diff.
    expect(screen.queryByText(/^Updated At$/i)).not.toBeInTheDocument();
  });

  it("orders workflow events newest-first on the Status Timeline tab", async () => {
    setup({
      risk_audit_logs: [
        {
          id: "log-created",
          action: "created",
          performed_at: "2024-01-01T09:00:00Z",
          performed_by_profile: { full_name: "Bola Adeyemi", email: "bola@test.local" },
          changes: { status: "New" },
        },
      ],
      risk_workflow_audit_view: [
        {
          id: "wf1", action: "submitted", from_status: "New", to_status: "Submitted",
          actor_id: "u1", actor_role: "RC", comments: null, metadata: null,
          created_at: "2024-01-02T09:00:00Z", actor_name: "Bola Adeyemi", actor_email: null, actor_department: null,
        },
        {
          id: "wf2", action: "approved", from_status: "Submitted", to_status: "Approved",
          actor_id: "u2", actor_role: "CRO", comments: "Looks good", metadata: null,
          created_at: "2024-01-05T09:00:00Z", actor_name: "Chidi Eze", actor_email: null, actor_department: null,
        },
      ],
    });
    renderWithProviders(<AuditLogDialog open onOpenChange={vi.fn()} riskId="r1" />);

    // Default tab is Status Timeline, combining created + workflow entries newest-first.
    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]).getByText("approved")).toBeInTheDocument();
    expect(within(items[1]).getByText("submitted")).toBeInTheDocument();
    expect(within(items[2]).getByText("created")).toBeInTheDocument();
  });
});
