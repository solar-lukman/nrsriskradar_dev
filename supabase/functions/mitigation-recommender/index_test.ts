// Deno tests for mitigation-recommender.
//
// Branches: missing riskId -> 400, AI gateway 429 -> typed RATE_LIMIT,
// happy path returns parsed recommendations, OPTIONS preflight.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  installFetchStub,
  jsonResponse,
  loadServeHandler,
} from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("LOVABLE_API_KEY", "test-ai-key");

const RISK = {
  id: "r1",
  title: "Revenue leakage",
  description: "desc",
  category: "Financial",
  department: "Finance",
  residual_likelihood: 4,
  residual_impact: 5,
  inherent_likelihood: 5,
  inherent_impact: 5,
  mitigation_plan: "None",
  status: "New",
};

function dataRoutes(aiResponder: () => Response) {
  return [
    {
      match: (url: string) => url.includes("/rest/v1/risks") && url.includes("status=eq.Mitigated"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risks"),
      respond: () => jsonResponse(RISK),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risk_controls"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url: string) => url.includes("ai.gateway.lovable.dev"),
      respond: aiResponder,
    },
  ];
}

Deno.test({
  name: "mitigation-recommender: rejects missing riskId",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/mitigation-recommender", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({}),
        }),
      );
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "Risk ID is required");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "mitigation-recommender: surfaces AI gateway rate limit as RATE_LIMIT",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(
      dataRoutes(() => jsonResponse({ error: "too many requests" }, 429)),
    );
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/mitigation-recommender", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ riskId: "r1" }),
        }),
      );
      assertEquals(res.status, 429);
      const body = await res.json();
      assertEquals(body.code, "RATE_LIMIT");
      assertEquals(body.success, false);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "mitigation-recommender: happy path returns parsed recommendations",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(
      dataRoutes(() =>
        jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                summary: "Do X",
                strategies: [],
                controls: [],
                kpis: [],
                bestPractices: [],
                warnings: [],
              }),
            },
          }],
        })
      ),
    );
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/mitigation-recommender", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ riskId: "r1" }),
        }),
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.success, true);
      assertEquals(body.riskId, "r1");
      assert(body.recommendations.summary.includes("Do X"));
      assertEquals(body.currentRiskLevel, "Critical");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "mitigation-recommender: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/mitigation-recommender", { method: "OPTIONS" }),
      );
      assertEquals(res.status, 200);
    } finally {
      restore();
    }
  },
});
