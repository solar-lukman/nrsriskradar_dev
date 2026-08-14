import { describe, it, expect, vi, beforeEach } from "vitest";

const { calls } = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    supabase: createSupabaseMock({}, { calls }),
  };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

describe("verifyBcpSchema", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns true and logs an 'ok' audit entry when all columns are present", async () => {
    const { verifyBcpSchema } = await import("@/lib/bcpSchemaCheck");
    const ok = await verifyBcpSchema();
    expect(ok).toBe(true);
    const logCall = calls.find((c) => c.table === "bcp_schema_check_logs" && c.method === "insert");
    expect(logCall.args[0]).toMatchObject({ status: "ok", missing_columns: [] });
  });

  it("caches the verified result and skips re-querying on subsequent calls", async () => {
    const { verifyBcpSchema } = await import("@/lib/bcpSchemaCheck");
    await verifyBcpSchema();
    calls.length = 0;
    const ok = await verifyBcpSchema();
    expect(ok).toBe(true);
    expect(calls.some((c) => c.table === "business_continuity_plans")).toBe(false);
  });

  it("detects a missing column from the postgrest error message and logs it", async () => {
    const originalFrom = (supabase.from as any).bind(supabase);
    (supabase.from as any) = vi.fn((table: string) => {
      if (table !== "business_continuity_plans") return originalFrom(table);
      const builder: any = {
        select: () => builder,
        limit: () => Promise.resolve({
          data: null,
          error: { message: 'column "bia_criticality_rating" does not exist' },
        }),
      };
      builder.then = (resolve: any) => resolve(builder.limit());
      return builder;
    });
    const { verifyBcpSchema } = await import("@/lib/bcpSchemaCheck");
    const ok = await verifyBcpSchema();
    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "Business Continuity schema mismatch",
      expect.objectContaining({ description: expect.stringContaining("bia_criticality_rating") }),
    );
    const logCall = calls.find((c) => c.table === "bcp_schema_check_logs" && c.method === "insert");
    expect(logCall.args[0]).toMatchObject({ status: "missing_columns" });
    expect(logCall.args[0].missing_columns).toContain("bia_criticality_rating");
  });

  it("logs a generic error status when the query throws unexpectedly", async () => {
    const originalFrom2 = (supabase.from as any).bind(supabase);
    (supabase.from as any) = vi.fn((table: string) => {
      if (table !== "business_continuity_plans") return originalFrom2(table);
      throw new Error("network down");
    });
    const { verifyBcpSchema } = await import("@/lib/bcpSchemaCheck");
    const ok = await verifyBcpSchema();
    expect(ok).toBe(false);
    const logCall = calls.find((c) => c.table === "bcp_schema_check_logs" && c.method === "insert");
    expect(logCall.args[0]).toMatchObject({ status: "error", error_message: "network down" });
  });
});
