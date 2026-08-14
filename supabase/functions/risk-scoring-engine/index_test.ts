// Deno tests for risk-scoring-engine.
//
// Branches: missing bearer token -> 401, AI gateway 429 -> typed RATE_LIMIT,
// happy path returns recommendation results, plus OPTIONS preflight.
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

const RISK = {
  id: "r1",
  title: "Revenue leakage",
  category: "Financial",
  description: "Some description",
  status: "New",
  inherent_likelihood: 5,
  inherent_impact: 5,
  residual_likelihood: 3,
  residual_impact: 3,
  control_effectiveness_score: 70,
  target_control_score: 80,
  mitigation_plan: "Plan",
  updated_at: "2026-01-01T00:00:00Z",
};

function dataRoutes(aiResponder: () => Response) {
  return [
    {
      match: (url: string) => url.includes("/auth/v1/user"),
      respond: () => jsonResponse({ id: "user-uuid", email: "rmd@test.local" }),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risks") && !url.includes("category"),
      respond: () => jsonResponse([RISK]),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risks"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risk_assessments"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url: string) => url.includes("/rest/v1/risk_controls"),
      respond: () => jsonResponse([{ id: "c1", effectiveness_rating: 80 }]),
    },
    {
      match: (url: string) => url.includes("ai.gateway.lovable.dev"),
      respond: aiResponder,
    },
  ];
}

Deno.test({
  name: "risk-scoring-engine: rejects request with no bearer token",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/risk-scoring-engine", {
          method: "POST",
          body: JSON.stringify({ analyzeAll: true }),
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
  name: "risk-scoring-engine: surfaces AI gateway rate limit as RATE_LIMIT",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(
      dataRoutes(() => jsonResponse({ error: "too many requests" }, 429)),
    );
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/risk-scoring-engine", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ analyzeAll: true }),
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
  name: "risk-scoring-engine: happy path returns recommendations",
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
                    recommended_likelihood: 2,
                    recommended_impact: 3,
                    confidence: 90,
                    reasoning: "Because controls are strong.",
                    key_factors: ["Strong controls"],
                    improvement_suggestions: ["Automate more checks"],
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
        new Request("https://edge.local/risk-scoring-engine", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ riskId: "r1" }),
        }),
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.success, true);
      assertEquals(body.results.length, 1);
      assertEquals(body.results[0].recommendedLikelihood, 2);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "risk-scoring-engine: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/risk-scoring-engine", { method: "OPTIONS" }),
      );
      assertEquals(res.status, 200);
    } finally {
      restore();
    }
  },
});
