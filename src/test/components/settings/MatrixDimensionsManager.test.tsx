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

import { MatrixDimensionsManager } from "@/components/settings/MatrixDimensionsManager";

describe("MatrixDimensionsManager", () => {
  beforeEach(() => {
    mock = createSupabaseMock({
      system_settings: [{ setting_key: "matrix_dimensions", setting_value: { institutional: 5, compliance: 4 } }],
    });
  });

  it("loads the persisted matrix dimensions", async () => {
    renderWithProviders(<MatrixDimensionsManager />);
    expect(await screen.findByText("5×5 (25 cells)")).toBeInTheDocument();
    expect(screen.getByText("4×4 (16 cells)")).toBeInTheDocument();
  });

  it("saves updated dimensions on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MatrixDimensionsManager />);
    await screen.findByText("5×5 (25 cells)");
    await user.click(screen.getByRole("button", { name: /Save Matrix Dimensions/i }));
    await waitFor(() => {
      expect(mock.__calls.some((c) => c.table === "system_settings" && c.method === "update")).toBe(true);
    });
  });
});
