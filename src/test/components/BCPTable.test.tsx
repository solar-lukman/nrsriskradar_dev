import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { BCPTable, bcpRowsToCSV } from "@/components/bcp/BCPTable";

const plans = [
  {
    id: "1", title: "Data Center Recovery", department: "IT", business_function: "Infra",
    bia_criticality_rating: "Critical", status: "Ready", test_status: "Passed",
    recovery_time_objective: 4, recovery_point_objective: 1,
    last_updated_date: "2024-01-01", bia_assessment_date: "2023-12-01",
  },
  {
    id: "2", title: "Payroll Continuity", department: "HR", business_function: "Payroll",
    bia_criticality_rating: "Medium", status: "Needs Review", test_status: "Not Tested",
    recovery_time_objective: 24, recovery_point_objective: 12,
    last_updated_date: "2024-02-01", bia_assessment_date: null,
  },
];

describe("BCPTable", () => {
  it("renders plan rows", () => {
    renderWithProviders(<BCPTable plans={plans} />);
    expect(screen.getByText("Data Center Recovery")).toBeInTheDocument();
    expect(screen.getByText("Payroll Continuity")).toBeInTheDocument();
  });

  it("shows an empty state when there are no plans", () => {
    renderWithProviders(<BCPTable plans={[]} />);
    expect(screen.getByText(/No business continuity plans match/i)).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BCPTable plans={plans} showFilters />);
    await user.type(screen.getByPlaceholderText("Search plans…"), "payroll");
    expect(screen.getByText("Payroll Continuity")).toBeInTheDocument();
    expect(screen.queryByText("Data Center Recovery")).not.toBeInTheDocument();
  });

  it("sorts rows when clicking a column header", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BCPTable plans={plans} />);
    await user.click(screen.getByText(/Plan Title/));
    let rows = screen.getAllByRole("row").slice(1);
    // desc sort by title first click
    expect(within(rows[0]).getByText("Payroll Continuity")).toBeInTheDocument();
  });

  it("shows pagination summary when enabled", () => {
    renderWithProviders(<BCPTable plans={plans} showPagination initialPageSize={10} />);
    expect(screen.getByText(/Showing 1–2 of 2/)).toBeInTheDocument();
  });

  it("calls onView and onEdit callbacks", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onEdit = vi.fn();
    renderWithProviders(<BCPTable plans={plans} onView={onView} onEdit={onEdit} />);
    const viewButtons = screen.getAllByRole("button", { name: /View/i });
    await user.click(viewButtons[0]);
    expect(onView).toHaveBeenCalled();
    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    await user.click(editButtons[0]);
    expect(onEdit).toHaveBeenCalled();
  });

  it("generates a CSV export with the expected header and rows", () => {
    const csv = bcpRowsToCSV(plans);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "Title,Department,Business Function,Criticality,BIA Assessment Date,Status,Test Status,RTO (h),RPO (h),Last Updated"
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Data Center Recovery");
  });
});
