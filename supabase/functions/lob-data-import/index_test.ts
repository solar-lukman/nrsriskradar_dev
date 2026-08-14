// Deno tests for lob-data-import.
//
// Branches: missing/empty rows -> 500 (thrown validation error), AI gateway
// 429 -> typed RATE_LIMIT, happy path returns identified risks, OPTIONS preflight.
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

function authRoutes() {
  return [
    {
      match: (url: string) => url.includes("/auth/v1/user"),
      respond: () => jsonResponse({ id: "user-uuid", email: "rmd@test.local" }),
    },
  ];
}

Deno.test({
  name: "lob-data-import: rejects request with no rows",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(authRoutes());
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/lob-data-import", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ userId: "u1", rows: [] }),
        }),
      );
      assertEquals(res.status, 500);
      const body = await res.json();
      assertEquals(body.error, "No data rows provided");
      assertEquals(body.success, false);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "lob-data-import: rejects request with no bearer token",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/lob-data-import", {
          method: "POST",
          body: JSON.stringify({ userId: "u1", rows: [{ a: 1 }] }),
        }),
      );
      assertEquals(res.status, 401);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "lob-data-import: surfaces AI gateway rate limit as RATE_LIMIT",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      ...authRoutes(),
      {
        match: (url) => url.includes("ai.gateway.lovable.dev"),
        respond: () => jsonResponse({ error: "too many requests" }, 429),
      },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/lob-data-import", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ userId: "u1", sourceSystem: "SAP", rows: [{ amount: 100 }] }),
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
  name: "lob-data-import: happy path returns identified risks",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      ...authRoutes(),
      {
        match: (url) => url.includes("ai.gateway.lovable.dev"),
        respond: () =>
          jsonResponse({
            choices: [{
              message: {
                tool_calls: [{
                  function: {
                    arguments: JSON.stringify({
                      risks: [{
                        title: "Late payments",
                        description: "desc",
                        category: "Financial",
                        inherent_likelihood: 3,
                        inherent_impact: 4,
                        residual_likelihood: 2,
                        residual_impact: 3,
                        confidence: 85,
                      }],
                      summary: "Found one risk",
                    }),
                  },
                }],
              },
            }],
          }),
      },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/lob-data-import", {
          method: "POST",
          headers: { Authorization: "Bearer good-token" },
          body: JSON.stringify({ userId: "u1", sourceSystem: "SAP", rows: [{ amount: 100 }] }),
        }),
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.success, true);
      assertEquals(body.identifiedRisks.length, 1);
      assert(body.summary.includes("Found one risk"));
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "lob-data-import: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/lob-data-import", { method: "OPTIONS" }),
      );
      assertEquals(res.status, 200);
    } finally {
      restore();
    }
  },
});
