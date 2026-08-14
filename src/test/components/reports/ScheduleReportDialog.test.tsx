import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { createSupabaseMock } from "@/test/mocks/supabase";

let mock: ReturnType<typeof createSupabaseMock>;

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock;
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ScheduleReportDialog } from "@/components/board-reports/ScheduleReportDialog";
import { toast } from "sonner";

describe("ScheduleReportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock = createSupabaseMock({});
  });

  it("defaults the report type from props", () => {
    renderWithProviders(
      <ScheduleReportDialog open onOpenChange={() => {}} onScheduleCreated={vi.fn()} defaultType="kri" />,
    );
    expect(screen.getByText("Key Risk Indicators")).toBeInTheDocument();
  });

  it("adds and removes email recipients", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ScheduleReportDialog open onOpenChange={() => {}} onScheduleCreated={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/email@company.com/i), "board@test.local");
    await user.click(screen.getByRole("button", { name: "" })); // the "+" icon button
    expect(await screen.findByText("board@test.local")).toBeInTheDocument();
  });

  it("creates a schedule and reports success", async () => {
    const user = userEvent.setup();
    const onScheduleCreated = vi.fn();
    renderWithProviders(
      <ScheduleReportDialog open onOpenChange={() => {}} onScheduleCreated={onScheduleCreated} />,
      { role: "RMD" },
    );
    await user.click(screen.getByRole("button", { name: /Create Schedule/i }));
    await waitFor(() => {
      expect(mock.__calls.some((c) => c.table === "report_schedules" && c.method === "insert")).toBe(true);
    });
    expect(toast.success).toHaveBeenCalledWith("Report schedule created");
    expect(onScheduleCreated).toHaveBeenCalled();
  });

  it("surfaces an error toast when schedule creation fails", async () => {
    mock = createSupabaseMock({}, { errors: { report_schedules: { message: "insert blocked" } } });
    const user = userEvent.setup();
    renderWithProviders(<ScheduleReportDialog open onOpenChange={() => {}} onScheduleCreated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Create Schedule/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("insert blocked"));
    });
  });
});
