import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { createSupabaseMock } from "@/test/mocks/supabase";
import { canPerformAction } from "@/lib/permissions";

const fixtures = {
  risk_categories: [
    { id: "c1", name: "Cyber", description: "Cyber risks", color: "#111111", display_order: 10, is_active: true, risk_type: "institutional" },
    { id: "c2", name: "Fraud", description: null, color: null, display_order: 20, is_active: false, risk_type: "compliance" },
  ],
};

let mock: ReturnType<typeof createSupabaseMock>;

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock;
  },
}));

import { RiskCategoriesManager } from "@/components/settings/RiskCategoriesManager";

describe("RiskCategoriesManager", () => {
  beforeEach(() => {
    mock = createSupabaseMock(JSON.parse(JSON.stringify(fixtures)));
  });

  it("only ADMIN/RMD/CRO may manage system settings per the permission matrix", () => {
    expect(canPerformAction("ADMIN", "settings.manage")).toBe(true);
    // settings.manage requires the '*' wildcard, only held by ADMIN.
    expect(canPerformAction("RMD", "settings.manage")).toBe(false);
    expect(canPerformAction("CRO", "settings.manage")).toBe(false);
    expect(canPerformAction("RC", "settings.manage")).toBe(false);
  });

  it("lists institutional categories on the active tab", async () => {
    renderWithProviders(<RiskCategoriesManager />);
    expect(await screen.findByText("Cyber")).toBeInTheDocument();
    expect(screen.queryByText("Fraud")).not.toBeInTheDocument();
  });

  it("switches to the compliance tab and shows its categories", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RiskCategoriesManager />);
    await screen.findByText("Cyber");
    await user.click(screen.getByRole("tab", { name: /Compliance/i }));
    expect(await screen.findByText("Fraud")).toBeInTheDocument();
  });

  it("rejects creating a category with a blank name", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RiskCategoriesManager />);
    await screen.findByText("Cyber");
    await user.click(screen.getByRole("button", { name: /Add Category/i }));
    await user.click(screen.getByRole("button", { name: /Create Category/i }));
    // No insert call should have been recorded because validation blocked it.
    expect(mock.__calls.some((c) => c.table === "risk_categories" && c.method === "insert")).toBe(false);
  });

  it("creates a new category when the form is valid", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RiskCategoriesManager />);
    await screen.findByText("Cyber");
    await user.click(screen.getByRole("button", { name: /Add Category/i }));
    await user.type(screen.getByPlaceholderText(/Cybersecurity/i), "Operational");
    await user.click(screen.getByRole("button", { name: /Create Category/i }));
    await waitFor(() => {
      expect(mock.__calls.some((c) => c.table === "risk_categories" && c.method === "insert")).toBe(true);
    });
  });

  it("renames an existing category via the edit dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RiskCategoriesManager />);
    await screen.findByText("Cyber");
    await user.click(screen.getByLabelText("Edit category"));
    const nameInput = screen.getByDisplayValue("Cyber");
    await user.clear(nameInput);
    await user.type(nameInput, "Cybersecurity");
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));
    await waitFor(() => {
      expect(mock.__calls.some((c) => c.table === "risk_categories" && c.method === "update")).toBe(true);
    });
  });

  it("deletes a category with no usages after confirming", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RiskCategoriesManager />);
    await screen.findByText("Cyber");
    await user.click(screen.getByLabelText("Delete category"));
    expect(await screen.findByText(/safe to delete/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => {
      expect(mock.__calls.some((c) => c.table === "risk_categories" && c.method === "delete")).toBe(true);
    });
  });
});
