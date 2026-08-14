import { describe, it, expect, vi, beforeEach } from "vitest";

if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";

const notifications = [
  {
    id: "n1", title: "Risk exceeded appetite", message: "Score exceeds tolerance",
    type: "warning", category: "risk_update", is_read: false,
    created_at: "2024-03-01T10:00:00Z", resource_type: "risk", resource_id: "r1",
    metadata: { threshold_score: 10, score: 20 },
  },
  {
    id: "n2", title: "New BCP uploaded", message: "A plan was updated",
    type: "info", category: "bcp_change", is_read: true,
    created_at: "2024-02-01T10:00:00Z", resource_type: "bcp", resource_id: "b1",
    metadata: {},
  },
  {
    id: "n3", title: "System error", message: "Something failed",
    type: "error", category: "system", is_read: false,
    created_at: "2024-01-01T10:00:00Z", metadata: {},
  },
];

const markAsRead = vi.fn();
const markAllAsRead = vi.fn();
const deleteNotification = vi.fn();
const updatePreferences = vi.fn();

vi.mock("@/contexts/NotificationContext", () => ({
  useNotifications: () => ({
    notifications,
    unreadCount: notifications.filter(n => !n.is_read).length,
    preferences: null,
    isMuted: () => false,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    updatePreferences,
  }),
}));

import NotificationCenter from "@/components/notifications/NotificationCenter";

describe("NotificationCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the unread count badge on the bell trigger", () => {
    renderWithProviders(<NotificationCenter />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("opens the dialog and lists notifications", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    expect(screen.getByText("Risk exceeded appetite")).toBeInTheDocument();
    expect(screen.getByText("New BCP uploaded")).toBeInTheDocument();
    expect(screen.getByText("System error")).toBeInTheDocument();
  });

  it("filters to only unread notifications", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    await user.click(screen.getByRole("button", { name: /^Unread/ }));
    expect(screen.getByText("Risk exceeded appetite")).toBeInTheDocument();
    expect(screen.queryByText("New BCP uploaded")).not.toBeInTheDocument();
  });

  it("filters by search text", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    await user.type(screen.getByPlaceholderText(/Search notifications/i), "system");
    expect(screen.getByText("System error")).toBeInTheDocument();
    expect(screen.queryByText("Risk exceeded appetite")).not.toBeInTheDocument();
  });

  it("calls markAsRead when marking a single notification read", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    const card = screen.getByText("Risk exceeded appetite").closest("div.rounded-lg, [class*='Card']") || screen.getByText("Risk exceeded appetite").closest("div");
    const markReadBtn = screen.getAllByRole("button", { name: /Mark read/i })[0];
    await user.click(markReadBtn);
    expect(markAsRead).toHaveBeenCalledWith("n1");
  });

  it("calls markAllAsRead from the header action", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    await user.click(screen.getByRole("button", { name: /Mark all read/i }));
    expect(markAllAsRead).toHaveBeenCalled();
  });

  it("calls deleteNotification when the delete icon is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    const deleteBtns = screen.getAllByRole("button", { name: /Delete notification/i });
    await user.click(deleteBtns[0]);
    expect(deleteNotification).toHaveBeenCalledWith("n1");
  });
});
