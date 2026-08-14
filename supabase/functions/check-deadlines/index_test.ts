// Deno tests for check-deadlines.
//
// This function has no JWT/authorization check of its own (it is a
// scheduled/cron-invoked service function using the service-role key), and
// takes no request body, so there is no user input to validate. We therefore
// cover: (1) an RPC failure surfacing as a 500 ("rejection" branch), and
// (2) the happy path. A pure "unauthorized" test is not applicable here —
// see README-tests.md.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  installFetchStub,
  jsonResponse,
  loadServeHandler,
} from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");

Deno.test({
  name: "check-deadlines: RPC failure returns 500",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const restore = installFetchStub([
    {
      match: (url) => url.includes("/rest/v1/rpc/check_risk_deadlines"),
      respond: () =>
        jsonResponse({ message: "function check_risk_deadlines() failed" }, 400),
    },
  ]);
  try {
    const handler = await loadServeHandler("./index.ts", import.meta.url);
    const res = await handler(
      new Request("https://edge.local/check-deadlines", { method: "POST" }),
    );
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
  } finally {
    restore();
  }
  },
});

Deno.test({
  name: "check-deadlines: happy path returns success + timestamp",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const restore = installFetchStub([
    {
      match: (url) => url.includes("/rest/v1/rpc/check_risk_deadlines"),
      respond: () => jsonResponse(null, 200),
    },
  ]);
  try {
    const handler = await loadServeHandler("./index.ts", import.meta.url);
    const res = await handler(
      new Request("https://edge.local/check-deadlines", { method: "POST" }),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(typeof body.timestamp, "string");
  } finally {
    restore();
  }
  },
});

Deno.test({
  name: "check-deadlines: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const handler = await loadServeHandler("./index.ts", import.meta.url);
  const res = await handler(
    new Request("https://edge.local/check-deadlines", { method: "OPTIONS" }),
  );
  assertEquals(res.status, 200);
  },
});
