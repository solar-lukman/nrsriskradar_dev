import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    supabase: createSupabaseMock({
      risks: [{ id: "r1", title: "Cyber breach risk", description: "desc", category: "Technology", status: "New" }],
      business_continuity_plans: [],
      control_documents: [],
    }),
  };
});

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { GlobalSearch } from "@/components/GlobalSearch";

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("renders the placeholder when no query is entered", () => {
    renderWithProviders(<GlobalSearch isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Start typing to search/i)).toBeInTheDocument();
  });

  it("searches and displays results after typing (debounced)", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderWithProviders(<GlobalSearch isOpen={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/Search risks, BCPs, or documents/i), "cyber");
    await waitFor(() => expect(screen.getByText("Cyber breach risk")).toBeInTheDocument(), { timeout: 2000 });
  });

  it("navigates and closes when a result is clicked", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<GlobalSearch isOpen={true} onClose={onClose} />);
    await user.type(screen.getByPlaceholderText(/Search risks, BCPs, or documents/i), "cyber");
    const result = await screen.findByText("Cyber breach risk");
    await user.click(result);
    expect(navigateMock).toHaveBeenCalledWith("/risk-register");
    expect(onClose).toHaveBeenCalled();
  });

  it("clears the query when the clear button is clicked", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderWithProviders(<GlobalSearch isOpen={true} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Search risks, BCPs, or documents/i);
    await user.type(input, "abc");
    expect(input).toHaveValue("abc");
    const clearBtn = input.parentElement!.querySelector("button")!;
    await user.click(clearBtn);
    expect(input).toHaveValue("");
  });
});
