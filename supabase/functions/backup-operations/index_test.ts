// Deno tests for backup-operations.
// Branches: missing Authorization header -> 401, non-admin -> 403,
// unknown configuration -> 404, happy path returns initiated status,
// OPTIONS preflight.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchStub, jsonResponse, loadServeHandler } from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");

// EdgeRuntime is a Supabase-runtime-only global; provide a no-op stub.
// deno-lint-ignore no-explicit-any
(globalThis as any).EdgeRuntime = { waitUntil: (_p: Promise<unknown>) => {} };

function authRoutes(role: string) {
  return [
    { match: (u: string) => u.includes("/auth/v1/user"), respond: () => jsonResponse({ id: "user-uuid" }) },
    { match: (u: string) => u.includes("/rest/v1/profiles"), respond: () => jsonResponse({ role }) },
  ];
}

Deno.test({
  name: "backup-operations: missing Authorization header returns 401",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-operations", { method: "GET" }));
      assertEquals(res.status, 401);
    } finally { restore(); }
  },
});

Deno.test({
  name: "backup-operations: non-admin caller is forbidden",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(authRoutes("STAFF"));
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-operations", {
        method: "GET", headers: { Authorization: "Bearer good-token" },
      }));
      assertEquals(res.status, 403);
    } finally { restore(); }
  },
});

Deno.test({
  name: "backup-operations: unknown configuration returns 404",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      ...authRoutes("ADMIN"),
      { match: (u: string) => u.includes("/rest/v1/backup_configurations"), respond: () => jsonResponse(null, 406) },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-operations", {
        method: "POST",
        headers: { Authorization: "Bearer good-token" },
        body: JSON.stringify({ configuration_id: "missing", backup_type: "incremental" }),
      }));
      assertEquals(res.status, 404);
    } finally { restore(); }
  },
});

Deno.test({
  name: "backup-operations: happy path initiates a backup",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      ...authRoutes("ADMIN"),
      {
        match: (u: string) => u.includes("/rest/v1/backup_configurations"),
        respond: () => jsonResponse({ id: "cfg-1", is_active: true, name: "Nightly", backup_type: "incremental", storage_location: "s3://x/" }),
      },
      { match: (u: string) => u.includes("/rest/v1/backup_logs"), respond: () => jsonResponse({ id: "log-1" }) },
      { match: (u: string) => u.includes("/rest/v1/rpc/log_system_audit"), respond: () => jsonResponse({}) },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-operations", {
        method: "POST",
        headers: { Authorization: "Bearer good-token" },
        body: JSON.stringify({ configuration_id: "cfg-1", backup_type: "incremental" }),
      }));
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.status, "initiated");
      assertEquals(body.backup_id, "log-1");
    } finally { restore(); }
  },
});

Deno.test({
  name: "backup-operations: OPTIONS preflight is handled",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-operations", { method: "OPTIONS" }));
      assertEquals(res.status, 200);
    } finally { restore(); }
  },
});
