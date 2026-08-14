// Deno tests for admin-invite-user.
// Covers: (1) unauthorized caller (no/invalid JWT), (2) input-validation
// rejection (missing email/roles) for an authenticated ADMIN, and
// (3) the happy path (invite + role assignment succeed).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  installFetchStub,
  jsonResponse,
  loadServeHandler,
} from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test-key");

function adminRoutes(): Parameters<typeof installFetchStub>[0] {
  return [
    // GET /auth/v1/user -> authenticated admin
    {
      match: (url) => url.includes("/auth/v1/user"),
      respond: () =>
        jsonResponse({ id: "admin-uuid", email: "admin@test.local" }),
    },
    // profiles select -> role ADMIN
    {
      match: (url) => url.includes("/rest/v1/profiles"),
      respond: () => jsonResponse([{ role: "ADMIN" }]),
    },
    // invite user
    {
      match: (url) => url.includes("/auth/v1/invite"),
      respond: () =>
        jsonResponse({ id: "new-user-uuid", email: "new@test.local" }),
    },
    // insert user_roles
    {
      match: (url) => url.includes("/rest/v1/user_roles"),
      respond: () => jsonResponse([{ user_id: "new-user-uuid", role: "USER" }]),
    },
    // rpc log_system_audit
    {
      match: (url) => url.includes("/rest/v1/rpc/log_system_audit"),
      respond: () => jsonResponse(null),
    },
  ];
}

Deno.test({
  name: "admin-invite-user: rejects request with no Authorization header",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const restore = installFetchStub([
    {
      match: (url) => url.includes("/auth/v1/user"),
      respond: () => jsonResponse({ error: "invalid_token" }, 401),
    },
  ]);
  try {
    const handler = await loadServeHandler("./index.ts", import.meta.url);
    const res = await handler(
      new Request("https://edge.local/admin-invite-user", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.com", roles: ["USER"] }),
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
  name: "admin-invite-user: rejects invalid input (missing email/roles) for an admin",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const restore = installFetchStub(adminRoutes());
  try {
    const handler = await loadServeHandler("./index.ts", import.meta.url);
    const res = await handler(
      new Request("https://edge.local/admin-invite-user", {
        method: "POST",
        headers: { Authorization: "Bearer good-token" },
        body: JSON.stringify({ roles: [] }),
      }),
    );
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "email and roles[] required");
  } finally {
    restore();
  }
  },
});

Deno.test({
  name: "admin-invite-user: happy path invites user and assigns roles",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  const restore = installFetchStub(adminRoutes());
  try {
    const handler = await loadServeHandler("./index.ts", import.meta.url);
    const res = await handler(
      new Request("https://edge.local/admin-invite-user", {
        method: "POST",
        headers: { Authorization: "Bearer good-token" },
        body: JSON.stringify({ email: "new@test.local", roles: ["USER"] }),
      }),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.user_id, "new-user-uuid");
  } finally {
    restore();
  }
  },
});
