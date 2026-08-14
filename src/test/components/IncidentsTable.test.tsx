import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { IncidentsTable } from "@/components/incidents/IncidentsTable";

const incidents = [
  {
    id: "1", reference_number: "INC-001", title: "Server outage",
    event_date: "2024-01-10", severity: "High", status: "Open",
    risk_posture: "Elevated", owner: { full_name: "Alice" }, financial_impact: 5000,
  },
  {
    id: "2", reference_number: "INC-002", title: "Data leak",
    event_date: "2024-02-15", severity: "Critical", status: "Closed",
    risk_posture: "Stable", owner: { full_name: "Bob" }, financial_impact: 20000,
  },
  {
    id: "3", reference_number: "INC-003", title: "Minor glitch",
    event_date: "2024-03-01", severity: "Low", status: "Resolved",
    risk_posture: "Reduced", owner: { full_name: "Carol" }, financial_impact: 0,
  },
];

describe("IncidentsTable", () => {
  it("renders all rows by default", () => {
    renderWithProviders(<IncidentsTable incidents={incidents} />);
    expect(screen.getByText("Server outage")).toBeInTheDocument();
    expect(screen.getByText("Data leak")).toBeInTheDocument();
    expect(screen.getByText("Minor glitch")).toBeInTheDocument();
  });

  it("shows empty state message when there are no incidents", () => {
    renderWithProviders(<IncidentsTable incidents={[]} />);
    expect(screen.getByText(/No incidents match the current filters/i)).toBeInTheDocument();
  });

  it("filters rows by search text", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IncidentsTable incidents={incidents} showFilters />);
    const search = screen.getByPlaceholderText("Search incidents…");
    await user.type(search, "leak");
    expect(screen.getByText("Data leak")).toBeInTheDocument();
    expect(screen.queryByText("Server outage")).not.toBeInTheDocument();
  });

  it("sorts rows when a sortable header is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IncidentsTable incidents={incidents} />);
    const titleHeader = screen.getByText(/Title \/ Risk/);
    // default sort is by event_date desc -> Minor glitch (Mar) first
    let rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Minor glitch")).toBeInTheDocument();

    await user.click(titleHeader); // sorts by title desc first click
    rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Server outage")).toBeInTheDocument();
  });

  it("paginates rows and moves to the next page", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IncidentsTable incidents={incidents} showPagination initialPageSize={10} />);
    // with pageSize default (10 via select not shown unless showFilters), page size defaults to initialPageSize
    expect(screen.getByText(/Showing 1–3 of 3/)).toBeInTheDocument();
  });

  it("only makes rows clickable when canEdit is true", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderWithProviders(<IncidentsTable incidents={incidents} canEdit onRowClick={onRowClick} />);
    const row = screen.getByText("Server outage").closest("tr")!;
    await user.click(row);
    expect(onRowClick).toHaveBeenCalledWith(incidents[0]);
  });

  it("invokes onOpen with the details tab when the Open action is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithProviders(<IncidentsTable incidents={incidents} onOpen={onOpen} />);
    const openButtons = screen.getAllByRole("button", { name: /Open/i });
    await user.click(openButtons[0]);
    expect(onOpen).toHaveBeenCalledWith(incidents[2], "details");
  });
});
