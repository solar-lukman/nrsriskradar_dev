// Deno tests for send-notification-email.
// Branches: malformed JSON body -> 500, unknown user (profile/prefs missing)
// -> 200 with a "disabled" message, happy path logs and returns success,
// OPTIONS preflight.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchStub, jsonResponse, loadServeHandler } from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");

Deno.test({
  name: "send-notification-email: malformed body surfaces as 500",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/send-notification-email", {
        method: "POST", body: "not-json",
      }));
      assertEquals(res.status, 500);
    } finally { restore(); }
  },
});

Deno.test({
  name: "send-notification-email: unknown user returns 200 with disabled message",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      { match: (u: string) => u.includes("/rest/v1/notification_preferences"), respond: () => jsonResponse(null) },
      { match: (u: string) => u.includes("/rest/v1/profiles"), respond: () => jsonResponse(null) },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/send-notification-email", {
        method: "POST",
        body: JSON.stringify({ userId: "u1", title: "t", message: "m", category: "system", type: "info" }),
      }));
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(body.message.toLowerCase().includes("disabled") || body.message.toLowerCase().includes("not found"));
    } finally { restore(); }
  },
});

Deno.test({
  name: "send-notification-email: happy path processes enabled notification",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      {
        match: (u: string) => u.includes("/rest/v1/notification_preferences"),
        respond: () => jsonResponse({ email_enabled: true, system_alerts_email: true }),
      },
      {
        match: (u: string) => u.includes("/rest/v1/profiles"),
        respond: () => jsonResponse({ email: "user@test.local", full_name: "Test User" }),
      },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/send-notification-email", {
        method: "POST",
        body: JSON.stringify({ userId: "u1", title: "New alert", message: "Something happened", category: "system", type: "info" }),
      }));
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.message, "Email notification processed successfully");
    } finally { restore(); }
  },
});

Deno.test({
  name: "send-notification-email: OPTIONS preflight is handled",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/send-notification-email", { method: "OPTIONS" }));
      assertEquals(res.status, 200);
    } finally { restore(); }
  },
});
