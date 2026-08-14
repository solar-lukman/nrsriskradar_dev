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

const saveMock = vi.fn();
vi.mock("jspdf", () => {
  class FakeJsPdf {
    internal = { pageSize: { width: 210, height: 297 } };
    save = saveMock;
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    text() {}
    setDrawColor() {}
    setLineWidth() {}
    line() {}
    addImage() {}
    splitTextToSize(t: string) { return [t]; }
    getNumberOfPages() { return 1; }
    setPage() {}
    addPage() {}
  }
  return { default: FakeJsPdf };
});
vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));
vi.mock("@/lib/nrsPdf", () => ({
  loadNrsLogo: async () => null,
  drawNrsHeader: () => {},
  drawNrsFooter: () => {},
  drawNrsSectionHeading: (_d: unknown, y: number) => y + 8,
  renderNrsKeyValueTable: (_d: unknown, y: number) => y + 20,
  ensureNrsSpace: (_d: unknown, y: number) => y,
}));

import { ReportArchivePanel } from "@/components/board-reports/ReportArchivePanel";
import { toast } from "sonner";

const archives = [
  {
    id: "a1",
    report_type: "quarterly",
    title: "Q1 Report",
    period: "Q1 2024",
    report_data: { summary: { total: 10 } },
    generated_by: "u1",
    generated_at: "2024-04-01T00:00:00Z",
    is_scheduled: false,
    metadata: {},
  },
];

const schedules = [
  {
    id: "s1",
    report_type: "quarterly",
    title: "Quarterly schedule",
    frequency: "monthly",
    recipients: ["a@test.local"],
    is_active: true,
    last_run_at: null,
    next_run_at: "2024-05-01T00:00:00Z",
  },
];

describe("ReportArchivePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock = createSupabaseMock({ board_report_archives: archives, report_schedules: schedules });
  });

  it("lists archived reports and active schedules", async () => {
    renderWithProviders(<ReportArchivePanel />);
    expect(await screen.findByText("Q1 Report")).toBeInTheDocument();
    expect(screen.getByText("Quarterly schedule")).toBeInTheDocument();
  });

  it("shows the empty state when there are no archives", async () => {
    mock = createSupabaseMock({ board_report_archives: [], report_schedules: [] });
    renderWithProviders(<ReportArchivePanel />);
    expect(await screen.findByText(/No reports have been archived yet/i)).toBeInTheDocument();
  });

  it("downloads a PDF for an archived report", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportArchivePanel />);
    await screen.findByText("Q1 Report");
    await user.click(screen.getByRole("button", { name: /Download PDF/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());

    expect(toast.success).toHaveBeenCalledWith("PDF downloaded");
  });

  it("pauses an active schedule", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportArchivePanel />);
    await screen.findByText("Quarterly schedule");
    await user.click(screen.getByRole("button", { name: /Pause/i }));
    await waitFor(() => {
      expect(mock.__calls.some((c) => c.table === "report_schedules" && c.method === "update")).toBe(true);
    });
  });

  it("deletes a schedule", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportArchivePanel />);
    await screen.findByText("Quarterly schedule");
    await user.click(screen.getByRole("button", { name: /Delete schedule/i }));
    await waitFor(() => {
      expect(mock.__calls.some((c) => c.table === "report_schedules" && c.method === "delete")).toBe(true);
    });
  });
});
