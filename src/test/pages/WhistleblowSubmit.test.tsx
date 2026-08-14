import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { supabase: createSupabaseMock() };
});
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import WhistleblowSubmit from "@/pages/WhistleblowSubmit";

async function selectCategory(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name }));
}

describe("WhistleblowSubmit page", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ turnstile_site_key: "" }) }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts on step 1 with the anonymity guarantee and classification step", async () => {
    renderWithProviders(<WhistleblowSubmit />, { role: null });
    expect(screen.getByText("Incident Classification")).toBeInTheDocument();
    expect(screen.getByText("Your Identity is Protected")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("blocks progress from step 1 until a category is chosen", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowSubmit />, { role: null });

    const next = screen.getByRole("button", { name: /Next/i });
    expect(next).toBeDisabled();

    await selectCategory(user, "Fraud");
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled());
  });

  it("validates the subject and description lengths on step 2", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowSubmit />, { role: null });

    await selectCategory(user, "Fraud");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText("Incident Details")).toBeInTheDocument();

    const subject = screen.getByPlaceholderText("Brief title for the report");
    await user.type(subject, "ab");
    expect(screen.getByText("Subject must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();

    await user.type(subject, "cdef");
    const description = screen.getByPlaceholderText(
      /Describe the incident in as much detail as possible/i,
    );
    await user.type(description, "short");
    expect(screen.getByText("Description must be at least 10 characters")).toBeInTheDocument();

    await user.type(description, " but now long enough");
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled());
  });

  it("allows navigating back to the previous step", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowSubmit />, { role: null });

    await selectCategory(user, "Safety");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText("Incident Details");

    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(await screen.findByText("Incident Classification")).toBeInTheDocument();
  });

  it("rejects attachments with a disallowed file type", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<WhistleblowSubmit />, { role: null });

    await selectCategory(user, "Fraud");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText("Incident Details");
    await user.type(screen.getByPlaceholderText("Brief title for the report"), "Bribery report");
    await user.type(
      screen.getByPlaceholderText(/Describe the incident in as much detail as possible/i),
      "A detailed description of the misconduct observed.",
    );
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText("Evidence & Supporting Information")).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const bad = new File(["malware"], "payload.exe", { type: "application/x-msdownload" });
    // fireEvent instead of user.upload: userEvent enforces the `accept` filter,
    // which would drop the file before the component's own validation runs.
    Object.defineProperty(input, "files", { value: [bad], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByText(/file type not allowed/i)).toBeInTheDocument();
  });
});
