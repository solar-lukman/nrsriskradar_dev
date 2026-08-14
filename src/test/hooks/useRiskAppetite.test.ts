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

import { useRiskAppetite } from "@/hooks/useRiskAppetite";

const config = (overrides: any) => ({
  id: overrides.id,
  category: null,
  risk_type: "institutional",
  taxpayer_segment: null,
  tolerance_level: "moderate",
  threshold_score: 15,
  escalation_action: "notify",
  description: null,
  is_active: true,
  ...overrides,
});

describe("useRiskAppetite", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(errors)) delete errors[k];
    for (const k of Object.keys(fixtures)) delete fixtures[k];
  });

  it("fetches configs ordered by risk_type then threshold_score", async () => {
    fixtures["risk_appetite_config"] = [config({ id: "1" })];
    const { result } = renderHook(() => useRiskAppetite());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.configs).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(
      calls.filter((c) => c.table === "risk_appetite_config" && c.method === "order").map((c) => c.args[0]),
    ).toEqual(["risk_type", "threshold_score"]);
  });

  it("surfaces fetch errors", async () => {
    errors["risk_appetite_config"] = { message: "boom" };
    const { result } = renderHook(() => useRiskAppetite());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.configs).toEqual([]);
  });

  it("resolveForRisk picks the most specific active matching rule", async () => {
    fixtures["risk_appetite_config"] = [
      config({ id: "generic", category: null, threshold_score: 20 }),
      config({ id: "specific", category: "Cyber", threshold_score: 10 }),
      config({ id: "inactive", category: "Cyber", is_active: false, threshold_score: 1 }),
    ];
    const { result } = renderHook(() => useRiskAppetite());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const resolved = result.current.resolveForRisk({ risk_type: "institutional", category: "Cyber" });
    expect(resolved?.id).toBe("specific");
  });

  it("resolveForRisk returns null when risk_type is missing or nothing matches", async () => {
    fixtures["risk_appetite_config"] = [config({ id: "1", risk_type: "compliance" })];
    const { result } = renderHook(() => useRiskAppetite());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.resolveForRisk({})).toBeNull();
    expect(result.current.resolveForRisk({ risk_type: "institutional" })).toBeNull();
  });

  it("rankCandidatesForRisk explains why non-matching rules were skipped", async () => {
    fixtures["risk_appetite_config"] = [
      config({ id: "match", category: "Cyber", threshold_score: 5 }),
      config({ id: "wrong-category", category: "Fraud", threshold_score: 1 }),
    ];
    const { result } = renderHook(() => useRiskAppetite());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ranked = result.current.rankCandidatesForRisk({ risk_type: "institutional", category: "Cyber" });
    expect(ranked[0].config.id).toBe("match");
    expect(ranked[0].isMatch).toBe(true);
    const skipped = ranked.find((r) => r.config.id === "wrong-category")!;
    expect(skipped.isMatch).toBe(false);
    expect(skipped.reason).toContain('doesn\'t match');
  });

  it("refetch re-queries the table", async () => {
    fixtures["risk_appetite_config"] = [config({ id: "1" })];
    const { result } = renderHook(() => useRiskAppetite());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = calls.filter((c) => c.table === "risk_appetite_config" && c.method === "select").length;
    await result.current.refetch();
    expect(calls.filter((c) => c.table === "risk_appetite_config" && c.method === "select").length).toBe(before + 1);
  });
});
