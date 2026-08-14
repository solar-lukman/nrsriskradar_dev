// Deno tests for risk-ai-analysis.
//
// Branches: missing bearer token -> 401, AI gateway 402 -> typed
// PAYMENT_REQUIRED, happy path stores + returns predictions, OPTIONS preflight.
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
    category: "Financial",
    status: "New",
    department: "Finance",
    inherent_likelihood: 4,
    inherent_impact: 4,
    residual_likelihood: 3,
    residual_impact: 3,
  },
];

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
      match: (url: string) => url.includes("/rest/v1/risk_audit_logs"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risk_controls"),
      respond: () => jsonResponse([{ effectiveness_rating: 75 }]),
    },
    {
      match: (url: string) => url.includes("/rest/v1/ai_predictions"),
      respond: () => jsonResponse({ id: "p1", title: "Emerging risk" }),
    },
    {
      match: (url: string) => url.includes("ai.gateway.lovable.dev"),
      respond: aiResponder,
    },
  ];
}

Deno.test({
  name: "risk-ai-analysis: rejects request with no bearer token",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/risk-ai-analysis", { method: "POST" }),
      );
      assertEquals(res.status, 401);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "risk-ai-analysis: surfaces AI gateway payment required as PAYMENT_REQUIRED",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(
      dataRoutes(() => jsonResponse({ error: "credits exhausted" }, 402)),
    );
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/risk-ai-analysis", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
        }),
      );
      assertEquals(res.status, 402);
      const body = await res.json();
      assertEquals(body.code, "PAYMENT_REQUIRED");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "risk-ai-analysis: happy path returns and stores predictions",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(
      dataRoutes(() =>
        jsonResponse({
          choices: [{
            message: {
              tool_calls: [{
                function: {
                  arguments: JSON.stringify({
                    predictions: [{
                      category: "Financial",
                      title: "Emerging risk",
                      description: "desc",
                      confidence_score: 80,
                      risk_factors: ["factor"],
                      recommended_actions: ["action"],
                      timeframe: "short-term",
                    }],
                    analysis_summary: "Summary text",
                  }),
                },
              }],
            },
          }],
        })
      ),
    );
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/risk-ai-analysis", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
        }),
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.success, true);
      assertEquals(body.predictions.length, 1);
      assert(body.analysis_summary.includes("Summary"));
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "risk-ai-analysis: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/risk-ai-analysis", { method: "OPTIONS" }),
      );
      assertEquals(res.status, 200);
    } finally {
      restore();
    }
  },
});
