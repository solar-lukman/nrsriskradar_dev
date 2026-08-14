import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { createSupabaseMock, type RecordedCall } from "@/test/mocks/supabase";

let calls: RecordedCall[] = [];
let mockSupabase: ReturnType<typeof createSupabaseMock>;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    get from() { return mockSupabase.from; },
    get rpc() { return mockSupabase.rpc; },
  },
}));

function setup(fixtures: Record<string, any[]> = {}, errors?: Record<string, { message: string }>) {
  calls = [];
  mockSupabase = createSupabaseMock(
    { profiles: [{ user_id: "u1", full_name: "Amaka Obi", email: "amaka@test.local" }], ...fixtures },
    { calls, errors },
  );
  return mockSupabase;
}

import { MitigationTasksPanel } from "@/components/risk-register/MitigationTasksPanel";

describe("MitigationTasksPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state when a risk has no tasks", async () => {
    setup({ risk_mitigation_tasks: [] });
    renderWithProviders(<MitigationTasksPanel riskId="r1" />);
    expect(await screen.findByText(/No mitigation tasks yet/i)).toBeInTheDocument();
  });

  it("renders existing tasks with assignee and overdue badge", async () => {
    setup({
      risk_mitigation_tasks: [
        {
          id: "t1", risk_id: "r1", title: "Patch firewall", description: null,
          assigned_to: "u1", status: "pending", priority: "high",
          due_date: "2000-01-01", completed_at: null, completed_by: null,
          evidence_notes: null, created_by: "u1", created_at: "2024-01-01", updated_at: "2024-01-01",
        },
      ],
    });
    renderWithProviders(<MitigationTasksPanel riskId="r1" />);
    expect(await screen.findByText("Patch firewall")).toBeInTheDocument();
    expect(screen.getByText("Amaka Obi")).toBeInTheDocument();
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThan(0);
  });

  it("adds a new task with the entered title", async () => {
    setup({ risk_mitigation_tasks: [] });
    const user = userEvent.setup();
    renderWithProviders(<MitigationTasksPanel riskId="r1" />);
    await screen.findByText(/No mitigation tasks yet/i);

    await user.click(screen.getByRole("button", { name: /Add Task/i }));
    await user.type(screen.getByPlaceholderText("Task title"), "Rotate credentials");
    await user.click(screen.getByRole("button", { name: /^Add Task$/i }));

    await waitFor(() => {
      const insertCall = calls.find((c) => c.table === "risk_mitigation_tasks" && c.method === "insert");
      expect(insertCall).toBeTruthy();
      expect(insertCall!.args[0]).toMatchObject({ risk_id: "r1", title: "Rotate credentials", status: "pending" });
    });
  });

  it("opens a note dialog and confirms a valid status transition via RPC", async () => {
    setup({
      risk_mitigation_tasks: [
        {
          id: "t1", risk_id: "r1", title: "Patch firewall", description: null,
          assigned_to: "u1", status: "pending", priority: "medium",
          due_date: null, completed_at: null, completed_by: null,
          evidence_notes: null, created_by: "u1", created_at: "2024-01-01", updated_at: "2024-01-01",
        },
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<MitigationTasksPanel riskId="r1" />);
    await screen.findByText("Patch firewall");

    await user.click(screen.getByRole("combobox", { name: /Task status/i }));
    await user.click(await screen.findByRole("option", { name: "In Progress" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Confirm/i }));

    await waitFor(() => {
      const rpcCall = calls.find((c) => c.table === "rpc:update_mitigation_task_status");
      expect(rpcCall).toBeTruthy();
      expect(rpcCall!.args[0]).toMatchObject({ _task_id: "t1", _new_status: "in_progress" });
    });
  });
});
