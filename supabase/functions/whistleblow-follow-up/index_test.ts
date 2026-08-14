// Deno tests for whistleblow-follow-up.
//
// Unauthenticated by design (reporters authenticate with case_reference +
// passphrase, not a JWT). Branches covered: missing fields -> 400, unknown
// case -> 404, wrong passphrase -> 401, and a successful message send.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import {
  installFetchStub,
  jsonResponse,
  loadServeHandler,
} from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");

async function hashPassphrase(passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(
    passphrase + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 16),
  );
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return base64Encode(new Uint8Array(hashBuffer));
}

Deno.test({
  name: "whistleblow-follow-up: rejects missing case_reference/passphrase",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-follow-up", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      assertEquals(res.status, 400);
      const body = await res.json();
      assert(body.error.includes("required"));
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "whistleblow-follow-up: unknown case returns 404",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      {
        match: (url) => url.includes("/rest/v1/whistleblow_cases"),
        respond: () => jsonResponse({ code: "PGRST116", message: "no rows" }, 406),
      },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-follow-up", {
          method: "POST",
          body: JSON.stringify({ case_reference: "WB-2024-99999", passphrase: "nope" }),
        }),
      );
      assertEquals(res.status, 404);
      const body = await res.json();
      assertEquals(body.error, "Case not found");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "whistleblow-follow-up: wrong passphrase returns 401",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const correctHash = await hashPassphrase("correct-passphrase");
    const restore = installFetchStub([
      {
        match: (url) => url.includes("/rest/v1/whistleblow_cases"),
        respond: () =>
          jsonResponse({
            id: "case-uuid",
            case_reference: "WB-2024-00042",
            reporter_passphrase_hash: correctHash,
          }),
      },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-follow-up", {
          method: "POST",
          body: JSON.stringify({
            case_reference: "WB-2024-00042",
            passphrase: "wrong-passphrase",
          }),
        }),
      );
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "Invalid passphrase");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "whistleblow-follow-up: happy path sends message and returns case data",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const correctHash = await hashPassphrase("correct-passphrase");
    const restore = installFetchStub([
      {
        match: (url) => url.includes("/rest/v1/whistleblow_cases"),
        respond: () =>
          jsonResponse({
            id: "case-uuid",
            case_reference: "WB-2024-00042",
            category: "Fraud",
            subject: "Suspicious activity",
            status: "Under Investigation",
            priority: "High",
            created_at: "2026-01-01T00:00:00Z",
            resolution_summary: null,
            resolution_date: null,
            assigned_to: "investigator-uuid",
            reporter_passphrase_hash: correctHash,
          }),
      },
      {
        match: (url) => url.includes("/rest/v1/whistleblow_messages"),
        respond: () => jsonResponse([{ id: "m1", sender_type: "reporter", message: "hi", is_read: false }]),
      },
      {
        match: (url) => url.includes("/rest/v1/whistleblow_audit_log"),
        respond: () => jsonResponse([{}]),
      },
      {
        match: (url) => url.includes("/rest/v1/notifications"),
        respond: () => jsonResponse([{}]),
      },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-follow-up", {
          method: "POST",
          body: JSON.stringify({
            case_reference: "WB-2024-00042",
            passphrase: "correct-passphrase",
            action: "send_message",
            message: "Here is an update.",
          }),
        }),
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.case_reference, "WB-2024-00042");
      assert(Array.isArray(body.messages));
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "whistleblow-follow-up: OPTIONS preflight is handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(
        new Request("https://edge.local/whistleblow-follow-up", { method: "OPTIONS" }),
      );
      assertEquals(res.status, 200);
    } finally {
      restore();
    }
  },
});
