import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import type { RecordedCall } from "@/test/mocks/supabase";
import { AuthContext } from "@/contexts/AuthContext";
import { makeAuthValue } from "@/test/renderWithProviders";

const { calls, errors, fixtures, channelSpies } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  errors: {} as Record<string, { message: string }>,
  fixtures: {} as Record<string, any[]>,
  channelSpies: { unsubscribeSpy: vi.fn(), removeChannelSpy: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  const mock = createSupabaseMock(fixtures, { calls, errors });
  return {
    supabase: {
      ...mock,
      channel: (name: string) => {
        const ch: any = {
          on: () => ch,
          subscribe: () => ch,
        };
        return ch;
      },
      removeChannel: (ch: any) => {
        channelSpies.removeChannelSpy(ch);
        return Promise.resolve("ok");
      },
    },
  };
});

import { NotificationProvider, useNotifications } from "@/contexts/NotificationContext";

function wrapperFor(authenticated: boolean) {
  const authValue = makeAuthValue(authenticated ? "ADMIN" : null);
  return ({ children }: { children: React.ReactNode }) => (
    <AuthContext.Provider value={authValue}>
      <NotificationProvider>{children}</NotificationProvider>
    </AuthContext.Provider>
  );
}

const baseNotification = (overrides: Partial<any> = {}) => ({
  id: "n1",
  user_id: "user-admin",
  title: "Risk updated",
  message: "A risk was updated",
  type: "info",
  category: "risk_update",
  is_read: false,
  created_at: "2024-01-01T00:00:00.000Z",
  metadata: {},
  ...overrides,
});

describe("NotificationContext", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(fixtures)) delete fixtures[k];
    channelSpies.removeChannelSpy.mockClear();
  });

  it("does not fetch when there is no authenticated user", () => {
    renderHook(() => useNotifications(), { wrapper: wrapperFor(false) });
    expect(calls.filter((c) => c.table === "notifications").length).toBe(0);
  });

  it("fetches notifications and computes unread count on mount", async () => {
    fixtures["notifications"] = [
      baseNotification({ id: "n1", is_read: false }),
      baseNotification({ id: "n2", is_read: true }),
      baseNotification({ id: "n3", is_read: false }),
    ];
    fixtures["notification_preferences"] = [{ id: "p1", user_id: "user-admin", quiet_hours_enabled: false }];

    const { result } = renderHook(() => useNotifications(), { wrapper: wrapperFor(true) });
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));
    expect(result.current.unreadCount).toBe(2);
  });

  it("markAsRead flips a single notification's is_read flag", async () => {
    fixtures["notifications"] = [baseNotification({ id: "n1", is_read: false })];
    fixtures["notification_preferences"] = [{ id: "p1", user_id: "user-admin" }];

    const { result } = renderHook(() => useNotifications(), { wrapper: wrapperFor(true) });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markAsRead("n1");
    });
    expect(result.current.notifications[0].is_read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it("markAllAsRead flips every notification", async () => {
    fixtures["notifications"] = [
      baseNotification({ id: "n1", is_read: false }),
      baseNotification({ id: "n2", is_read: false }),
    ];
    fixtures["notification_preferences"] = [{ id: "p1", user_id: "user-admin" }];

    const { result } = renderHook(() => useNotifications(), { wrapper: wrapperFor(true) });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    await act(async () => {
      await result.current.markAllAsRead();
    });
    expect(result.current.unreadCount).toBe(0);
  });

  it("deleteNotification removes it from state", async () => {
    fixtures["notifications"] = [baseNotification({ id: "n1" }), baseNotification({ id: "n2" })];
    fixtures["notification_preferences"] = [{ id: "p1", user_id: "user-admin" }];

    const { result } = renderHook(() => useNotifications(), { wrapper: wrapperFor(true) });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    await act(async () => {
      await result.current.deleteNotification("n1");
    });
    expect(result.current.notifications.map((n) => n.id)).toEqual(["n2"]);
  });

  it("subscribes to realtime changes on mount and unsubscribes via removeChannel on unmount", async () => {
    fixtures["notifications"] = [];
    fixtures["notification_preferences"] = [{ id: "p1", user_id: "user-admin" }];

    const { unmount } = renderHook(() => useNotifications(), { wrapper: wrapperFor(true) });
    await waitFor(() => expect(calls.some((c) => c.table === "notifications")).toBe(true));

    unmount();
    expect(channelSpies.removeChannelSpy).toHaveBeenCalled();
  });
});
