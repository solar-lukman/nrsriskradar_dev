import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardReportPreviewDialog } from "@/components/board-reports/BoardReportPreviewDialog";

describe("BoardReportPreviewDialog", () => {
  it("shows a loading state while generating", () => {
    render(
      <BoardReportPreviewDialog
        open reportTitle="Quarterly" reportPeriod="Q1 2024" sections={[]} loading
        onOpenChange={() => {}} onDownloadPDF={() => {}}
      />,
    );
    expect(screen.getByText(/Generating report/i)).toBeInTheDocument();
  });

  it("renders section headings and key/value table rows", () => {
    render(
      <BoardReportPreviewDialog
        open reportTitle="Quarterly" reportPeriod="Q1 2024" loading={false}
        sections={[{ title: "Executive Summary", content: "Overview text", data: [{ label: "Total Risks", value: 10 }] }]}
        onOpenChange={() => {}} onDownloadPDF={() => {}}
      />,
    );
    expect(screen.getByText("Executive Summary")).toBeInTheDocument();
    expect(screen.getByText("Overview text")).toBeInTheDocument();
    expect(screen.getByText("Total Risks")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("invokes the download callback", async () => {
    const user = userEvent.setup();
    const onDownloadPDF = vi.fn();
    render(
      <BoardReportPreviewDialog
        open reportTitle="Quarterly" reportPeriod="Q1 2024" loading={false} sections={[]}
        onOpenChange={() => {}} onDownloadPDF={onDownloadPDF}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Download PDF/i }));
    expect(onDownloadPDF).toHaveBeenCalled();
  });
});
