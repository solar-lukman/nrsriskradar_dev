import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecordedCall } from "@/test/mocks/supabase";

const { calls, errors, fixtures } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  errors: {} as Record<string, { message: string }>,
  fixtures: {} as Record<string, any[]>,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { supabase: createSupabaseMock(fixtures, { calls, errors }) };
});

import { useMatrixDimensions } from "@/hooks/useMatrixDimensions";

describe("useMatrixDimensions", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(fixtures)) delete fixtures[k];
  });

  it("defaults to 5x5 when no setting row exists", async () => {
    const { result } = renderHook(() => useMatrixDimensions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dimensions).toEqual({ institutional: 5, compliance: 5 });
    expect(result.current.sizeFor("institutional")).toBe(5);
  });

  it("reads configured dimensions and clamps unexpected values to 4 or 5", async () => {
    fixtures["system_settings"] = [
      { setting_key: "matrix_dimensions", setting_value: { institutional: 4, compliance: 7 } },
    ];
    const { result } = renderHook(() => useMatrixDimensions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dimensions).toEqual({ institutional: 4, compliance: 5 });
    expect(result.current.sizeFor("compliance")).toBe(5);
  });

  it("refetch re-queries system_settings", async () => {
    fixtures["system_settings"] = [
      { setting_key: "matrix_dimensions", setting_value: { institutional: 4, compliance: 4 } },
    ];
    const { result } = renderHook(() => useMatrixDimensions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = calls.filter((c) => c.table === "system_settings" && c.method === "select").length;
    await result.current.refetch();
    expect(calls.filter((c) => c.table === "system_settings" && c.method === "select").length).toBe(before + 1);
  });
});
