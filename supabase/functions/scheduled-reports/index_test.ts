// Deno tests for scheduled-reports.
// Branches: unknown action -> 400, DB failure on generate -> 500, happy
// path for "generate" action, OPTIONS preflight.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchStub, jsonResponse, loadServeHandler } from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");

function baseRoutes(archiveResponder: () => Response) {
  return [
    { match: (u: string) => u.includes("/rest/v1/risks"), respond: () => jsonResponse([]) },
    { match: (u: string) => u.includes("/rest/v1/risk_controls"), respond: () => jsonResponse([]) },
    { match: (u: string) => u.includes("/rest/v1/business_continuity_plans"), respond: () => jsonResponse([]) },
    { match: (u: string) => u.includes("/rest/v1/board_report_archives"), respond: archiveResponder },
    { match: (u: string) => u.includes("/rest/v1/profiles"), respond: () => jsonResponse([]) },
    { match: (u: string) => u.includes("/rest/v1/notifications"), respond: () => jsonResponse([]) },
  ];
}

Deno.test({
  name: "scheduled-reports: rejects unknown action",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/scheduled-reports", {
        method: "POST", body: JSON.stringify({ action: "bogus" }),
      }));
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "Unknown action");
    } finally { restore(); }
  },
});

Deno.test({
  name: "scheduled-reports: DB failure while archiving surfaces as 500",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(baseRoutes(() => jsonResponse({ message: "insert failed" }, 500)));
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/scheduled-reports", {
        method: "POST",
        body: JSON.stringify({ action: "generate", reportType: "monthly", title: "Report", period: "Jan", userId: "u1" }),
      }));
      assertEquals(res.status, 500);
    } finally { restore(); }
  },
});

Deno.test({
  name: "scheduled-reports: happy path archives and returns id",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(baseRoutes(() => jsonResponse({ id: "archive-1" })));
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/scheduled-reports", {
        method: "POST",
        body: JSON.stringify({ action: "generate", reportType: "monthly", title: "Report", period: "Jan", userId: "u1" }),
      }));
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.success, true);
      assertEquals(body.archiveId, "archive-1");
    } finally { restore(); }
  },
});

Deno.test({
  name: "scheduled-reports: OPTIONS preflight is handled",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/scheduled-reports", { method: "OPTIONS" }));
      assertEquals(res.status, 200);
    } finally { restore(); }
  },
});
