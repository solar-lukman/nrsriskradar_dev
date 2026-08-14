// Deno tests for whistleblow-submit.
//
// This is an anonymous public-facing function (no JWT check by design —
// whistleblowers are not authenticated users). Instead of a JWT-rejection
// branch we cover the equivalent "unauthenticated/abuse" rejection path,
// Cloudflare Turnstile human-verification failure, alongside input
// validation and the happy path, per the spirit of the three branches.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  installFetchStub,
  jsonResponse,
  loadServeHandler,
} from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("TURNSTILE_SECRET_KEY", "test-secret");

const validBody = {
  category: "Fraud",
  subject: "Suspicious activity",
  description: "This is a sufficiently long description of the incident.",
  passphrase: "correct-horse-battery",
  turnstile_token: "a-token-that-is-long-enough",
};

function baseRoutes(): Parameters<typeof installFetchStub>[0] {
  return [
    {
      match: (url) => url.includes("challenges.cloudflare.com"),
      respond: () => jsonResponse({ success: true }),
    },
    {
      match: (url) => url.includes("/rest/v1/whistleblow_submission_attempts"),
      respond: () => jsonResponse([{}]),
    },
    {
      match: (url) => url.includes("/rest/v1/rpc/check_whistleblow_rate_limit"),
      respond: () => jsonResponse({ allowed: true }),
    },
    {
      match: (url) => url.includes("/rest/v1/rpc/nextval_whistleblow_seq"),
      respond: () => jsonResponse(42),
    },
    {
      match: (url) => url.includes("/rest/v1/whistleblow_cases"),
      // `.single()` asks PostgREST for a bare object, not an array.
      respond: () =>
        jsonResponse({ id: "case-uuid", case_reference: "WB-2024-00042" }),
    },
    {
      match: (url) => url.includes("/rest/v1/whistleblow_audit_log"),
      respond: () => jsonResponse([{}]),
    },
    {
      match: (url) => url.includes("/rest/v1/user_roles"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url) => url.includes("/rest/v1/profiles"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url) => url.includes("/rest/v1/notifications"),
      respond: () => jsonResponse([]),
    },
  ];
}

Deno.test({
  name: "whistleblow-submit: rejects when Turnstile human-verification fails",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const restore = installFetchStub([
    ...baseRoutes().filter((r) => !r.match("challenges.cloudflare.com")),
    {
      match: (url) => url.includes("challenges.cloudflare.com"),
      respond: () => jsonResponse({ success: false, "error-codes": ["invalid-input-response"] }),
    },
  ]);
  try {
    const handler = await loadServeHandler("./index.ts", import.meta.url);
    const res = await handler(
      new Request("https://edge.local/whistleblow-submit", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );
    assertEquals(res.status, 400);
    const body = await res.json();
    assert(body.error.includes("Human verification failed"));
  } finally {
    restore();
  }
  },
});

Deno.test({
  name: "whistleblow-submit: rejects invalid input (subject too short)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const restore = installFetchStub(baseRoutes());
  try {
    const handler = await loadServeHandler("./index.ts", import.meta.url);
    const res = await handler(
      new Request("https://edge.local/whistleblow-submit", {
        method: "POST",
        body: JSON.stringify({ ...validBody, subject: "ab" }),
      }),
    );
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Validation failed");
    assert(body.details.subject);
  } finally {
    restore();
  }
  },
});

Deno.test({
  name: "whistleblow-submit: happy path returns case reference",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const restore = installFetchStub(baseRoutes());
  try {
    const handler = await loadServeHandler("./index.ts", import.meta.url);
    const res = await handler(
      new Request("https://edge.local/whistleblow-submit", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.case_reference, "WB-2024-00042");
  } finally {
    restore();
  }
  },
});
