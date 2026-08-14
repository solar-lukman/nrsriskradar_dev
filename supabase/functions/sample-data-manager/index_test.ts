// Deno tests for sample-data-manager.
//
// This suite caught a real bug: the `json()` helper used for every response
// referenced `corsHeaders`, which was declared inside the Deno.serve closure
// rather than at module scope — so every request threw
// `ReferenceError: corsHeaders is not defined` instead of returning a
// response. `json()` now lives inside the handler; the first test below is
// the regression guard.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadServeHandler } from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test-key");

Deno.test({
  name: "sample-data-manager: missing Authorization returns 401 (corsHeaders regression)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const handler = await loadServeHandler("./index.ts", import.meta.url);
  const res = await handler(
    new Request("https://edge.local/sample-data-manager", { method: "POST" }),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Missing authorization");
  },
});

Deno.test({
  name: "sample-data-manager: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const handler = await loadServeHandler("./index.ts", import.meta.url);
  const res = await handler(
    new Request("https://edge.local/sample-data-manager", { method: "OPTIONS" }),
  );
  assertEquals(res.status, 200);
  },
});
