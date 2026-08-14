import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: vi.fn(),
  },
}));

import WhistleblowFollowUp from "@/pages/WhistleblowFollowUp";

const caseResponse = {
  case_reference: "WB-2026-00001",
  status: "Investigation",
  category: "Fraud",
  subject: "Procurement irregularity",
  created_at: "2026-01-05T10:00:00Z",
  priority: "High",
  timeline: [{ action: "status_changed", new_value: "Investigation", created_at: "2026-01-06T10:00:00Z" }],
  messages: [
    { id: "m1", sender_type: "investigator", sender_label: "Case Officer", message: "We are reviewing.", created_at: "2026-01-07T10:00:00Z" },
  ],
};

function mockFetchOnce(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => payload });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openCase(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("WB-2026-00001"), "WB-2026-00001");
  await user.type(screen.getByPlaceholderText("Your passphrase"), "correct horse");
  await user.click(screen.getByRole("button", { name: "View Case" }));
}

describe("WhistleblowFollowUp page", () => {
  beforeEach(() => {
    toastError.mockClear();
    toastSuccess.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the anonymous lookup form by default", () => {
    mockFetchOnce({});
    renderWithProviders(<WhistleblowFollowUp />, { role: null });
    expect(screen.getByPlaceholderText("WB-2026-00001")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your passphrase")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Case" })).toBeInTheDocument();
  });

  it("requires both reference and passphrase before calling the backend", async () => {
    const fetchMock = mockFetchOnce({});
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowFollowUp />, { role: null });

    await user.click(screen.getByRole("button", { name: "View Case" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Please enter both case reference and passphrase");
  });

  it("loads and displays the case, timeline and messages on success", async () => {
    mockFetchOnce(caseResponse);
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowFollowUp />, { role: null });
    await openCase(user);

    expect(await screen.findByText("Case: WB-2026-00001")).toBeInTheDocument();
    expect(screen.getByText("Procurement irregularity")).toBeInTheDocument();
    expect(screen.getByText("Status Changed")).toBeInTheDocument();
    expect(screen.getByText("We are reviewing.")).toBeInTheDocument();
  });

  it("surfaces backend errors without revealing case data", async () => {
    mockFetchOnce({ error: "Invalid case reference or passphrase" }, false);
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowFollowUp />, { role: null });
    await openCase(user);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Invalid case reference or passphrase"),
    );
    expect(screen.queryByText(/^Case: /)).not.toBeInTheDocument();
  });

  it("sends a follow-up message and clears the composer", async () => {
    const fetchMock = mockFetchOnce(caseResponse);
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowFollowUp />, { role: null });
    await openCase(user);
    await screen.findByText("Case: WB-2026-00001");

    const composer = screen.getByPlaceholderText("Send a message to the investigation team...");
    await user.type(composer, "Adding more context");
    await user.click(screen.getByRole("button", { name: /Send message/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Message sent"));
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(JSON.parse((lastCall[1] as RequestInit).body as string)).toMatchObject({
      action: "send_message",
      message: "Adding more context",
    });
    expect(composer).toHaveValue("");
  });

  it("returns to the lookup form when signing out of the case", async () => {
    mockFetchOnce(caseResponse);
    const user = userEvent.setup();
    renderWithProviders(<WhistleblowFollowUp />, { role: null });
    await openCase(user);
    await screen.findByText("Case: WB-2026-00001");

    await user.click(screen.getByRole("button", { name: "Sign Out of Case" }));
    expect(screen.getByRole("button", { name: "View Case" })).toBeInTheDocument();
  });
});
