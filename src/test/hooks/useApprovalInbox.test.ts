import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import type { RecordedCall } from "@/test/mocks/supabase";
import { AuthContext } from "@/contexts/AuthContext";
import { makeAuthValue } from "@/test/renderWithProviders";

const { calls, fixtures, errors } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  fixtures: {
    "rpc:get_approval_inbox": [
      { id: "1", bucket: "awaiting_review" },
      { id: "2", bucket: "awaiting_approval" },
      { id: "3", bucket: "reviewing" },
      { id: "4", bucket: null },
    ] as any[],
  },
  errors: {} as Record<string, { message: string }>,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { supabase: createSupabaseMock(fixtures, { calls, errors }) };
});

import { useApprovalInbox, useApprovalInboxCount } from "@/hooks/useApprovalInbox";

function wrapperFor(role: "ADMIN" | null) {
  const authValue = makeAuthValue(role);
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthContext.Provider, { value: authValue }, children);
}

describe("useApprovalInbox", () => {
  beforeEach(() => {
    calls.length = 0;
    delete errors["rpc:get_approval_inbox"];
  });

  it("returns no rows and stops loading when there is no user", async () => {
    const { result } = renderHook(() => useApprovalInbox(), { wrapper: wrapperFor(null) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
    expect(calls.some((c) => c.table === "rpc:get_approval_inbox")).toBe(false);
  });

  it("calls the get_approval_inbox rpc and returns rows", async () => {
    const { result } = renderHook(() => useApprovalInbox(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(4);
    expect(result.current.error).toBeNull();
    expect(calls.some((c) => c.table === "rpc:get_approval_inbox")).toBe(true);
  });

  it("surfaces rpc errors", async () => {
    errors["rpc:get_approval_inbox"] = { message: "rpc failed" };
    const { result } = renderHook(() => useApprovalInbox(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("rpc failed");
    expect(result.current.rows).toEqual([]);
  });
});

describe("useApprovalInboxCount", () => {
  beforeEach(() => {
    calls.length = 0;
    delete errors["rpc:get_approval_inbox"];
  });

  it("counts only actionable buckets, excluding 'reviewing' and null", async () => {
    const { result } = renderHook(() => useApprovalInboxCount(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(2);
  });
});
