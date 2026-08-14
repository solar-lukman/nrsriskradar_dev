// Deno tests for whistleblow-config.
//
// Trivial function: it must return the public Turnstile *site* key from env
// and must never leak the secret key, even if both are set.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchStub, loadServeHandler } from "../_shared/test_harness.ts";

Deno.env.set("TURNSTILE_SITE_KEY", "public-site-key-123");
Deno.env.set("TURNSTILE_SECRET_KEY", "super-secret-should-never-leak");

Deno.test({
  name: "whistleblow-config: returns the Turnstile site key",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-config", { method: "GET" }),
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.turnstile_site_key, "public-site-key-123");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "whistleblow-config: never leaks the secret key",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-config", { method: "GET" }),
      );
      const text = await res.text();
      assert(!text.includes("super-secret-should-never-leak"));
      assert(!text.toLowerCase().includes("secret"));
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "whistleblow-config: returns empty string when site key not configured",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    Deno.env.delete("TURNSTILE_SITE_KEY");
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-config", { method: "GET" }),
      );
      const body = await res.json();
      assertEquals(body.turnstile_site_key, "");
    } finally {
      restore();
      Deno.env.set("TURNSTILE_SITE_KEY", "public-site-key-123");
    }
  },
});

Deno.test({
  name: "whistleblow-config: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-config", { method: "OPTIONS" }),
      );
      assertEquals(res.status, 200);
    } finally {
      restore();
    }
  },
});
