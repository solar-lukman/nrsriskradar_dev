import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { createSupabaseMock } from "@/test/mocks/supabase";
import { canPerformAction } from "@/lib/permissions";

let mock: ReturnType<typeof createSupabaseMock>;

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock;
  },
}));

import AddEditUserDialog from "@/components/user-management/AddEditUserDialog";

const editingUser = {
  id: "p1",
  user_id: "user-1",
  email: "existing@test.local",
  full_name: "Existing User",
  department: "Risk Management",
  avatar_url: null,
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  roles: ["RC"] as any[],
};

describe("AddEditUserDialog", () => {
  beforeEach(() => {
    mock = createSupabaseMock({});
  });

  it("changing a user's role is an ADMIN-only permission in the matrix", () => {
    expect(canPerformAction("ADMIN", "user.set_role")).toBe(true);
    expect(canPerformAction("RMD", "user.set_role")).toBe(false);
    expect(canPerformAction("CRO", "user.set_role")).toBe(false);
  });

  it("creates a new user via supabase.auth.signUp and assigns the default USER role", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithProviders(
      <AddEditUserDialog open onOpenChange={() => {}} user={null} onSuccess={onSuccess} />,
      { role: "ADMIN" },
    );
    await user.type(screen.getByLabelText(/Email/i), "new@test.local");
    await user.type(screen.getByLabelText(/^Password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /Create User/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled(), { timeout: 5000 });
  });

  it("toggles a role checkbox for the current selection", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AddEditUserDialog open onOpenChange={() => {}} user={editingUser} onSuccess={vi.fn()} />,
      { role: "ADMIN" },
    );
    const rcCheckbox = screen.getByLabelText("Risk Champion");
    expect(rcCheckbox).toBeChecked();
    await user.click(rcCheckbox);
    expect(rcCheckbox).not.toBeChecked();
  });

  it("saves an edited user's roles by clearing and re-inserting user_roles", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithProviders(
      <AddEditUserDialog open onOpenChange={() => {}} user={editingUser} onSuccess={onSuccess} />,
      { role: "ADMIN" },
    );
    await user.click(screen.getByLabelText("Chief Risk Officer"));
    await user.click(screen.getByRole("button", { name: /Update User/i }));

    await waitFor(() => {
      expect(mock.__calls.some((c) => c.table === "user_roles" && c.method === "delete")).toBe(true);
      expect(mock.__calls.some((c) => c.table === "user_roles" && c.method === "insert")).toBe(true);
    });
    expect(onSuccess).toHaveBeenCalled();
  });
});
