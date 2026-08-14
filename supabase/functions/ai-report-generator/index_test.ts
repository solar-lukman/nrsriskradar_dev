// Deno tests for ai-report-generator.
//
// Branches covered:
//   1. Authorization — missing / invalid bearer token must return 401 before
//      any data is read or any AI credit is spent.
//   2. Upstream rejection — a 429 from the AI gateway must be surfaced as a
//      typed RATE_LIMIT response rather than a generic 500.
//   3. Happy path — an authenticated caller gets Markdown plus the computed
//      risk statistics.
//
// The function talks to Supabase and the Lovable AI gateway over fetch, so the
// whole test rig is a fetch stub; no network and no API key are involved.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  installFetchStub,
  jsonResponse,
  loadServeHandler,
} from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test-key");
Deno.env.set("LOVABLE_API_KEY", "test-ai-key");

const RISKS = [
  {
    id: "r1",
    title: "Revenue leakage",
    category: "Financial",
    department: "Collections",
    status: "New",
    inherent_likelihood: 5,
    inherent_impact: 5,
    residual_likelihood: 3,
    residual_impact: 3,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "r2",
    title: "System outage",
    category: "Technology",
    department: "IT",
    status: "Mitigated",
    inherent_likelihood: 2,
    inherent_impact: 3,
    residual_likelihood: 1,
    residual_impact: 2,
    created_at: "2026-01-02T00:00:00Z",
  },
];

/** Routes for an authenticated caller with data available. */
function dataRoutes(aiResponder: () => Response) {
  return [
    {
      match: (url: string) => url.includes("/auth/v1/user"),
      respond: () => jsonResponse({ id: "user-uuid", email: "rmd@test.local" }),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risks"),
      respond: () => jsonResponse(RISKS),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risk_controls"),
      respond: () => jsonResponse([{ id: "c1", effectiveness_rating: 80 }]),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risk_assessments"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url: string) => url.includes("/rest/v1/business_continuity_plans"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url: string) => url.includes("ai.gateway.lovable.dev"),
      respond: aiResponder,
    },
  ];
}

Deno.test({
  name: "ai-report-generator: rejects a request with no bearer token",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/ai-report-generator", {
          method: "POST",
          body: JSON.stringify({ reportType: "executive_summary" }),
        }),
      );
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "Unauthorized");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "ai-report-generator: rejects an invalid token",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      {
        match: (url) => url.includes("/auth/v1/user"),
        respond: () => jsonResponse({ error: "invalid_token" }, 401),
      },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/ai-report-generator", {
          method: "POST",
          headers: { Authorization: "Bearer expired-token" },
          body: JSON.stringify({ reportType: "executive_summary" }),
        }),
      );
      assertEquals(res.status, 401);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "ai-report-generator: surfaces gateway rate limiting as RATE_LIMIT",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(
      dataRoutes(() => jsonResponse({ error: "too many requests" }, 429)),
    );
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/ai-report-generator", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ reportType: "executive_summary" }),
        }),
      );
      assertEquals(res.status, 429);
      const body = await res.json();
      assertEquals(body.code, "RATE_LIMIT");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "ai-report-generator: happy path returns markdown and computed stats",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(
      dataRoutes(() =>
        jsonResponse({
          choices: [{ message: { content: "# Executive Summary\n\nAll clear." } }],
        })
      ),
    );
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/ai-report-generator", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ reportType: "executive_summary" }),
        }),
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.success, true);
      assert(body.report.includes("Executive Summary"));
      assertEquals(body.stats.totalRisks, 2);
      // Only r2 is Mitigated, so one risk stays open.
      assertEquals(body.stats.openRisks, 1);
      // ISO 31000 high threshold is a score >= 15; only r1 (5x5) qualifies.
      assertEquals(body.stats.highRisks, 1);
      assertEquals(body.stats.criticalRisks, 1);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "ai-report-generator: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/ai-report-generator", { method: "OPTIONS" }),
      );
      assertEquals(res.status, 200);
    } finally {
      restore();
    }
  },
});
