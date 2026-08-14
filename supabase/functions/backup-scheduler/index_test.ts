// Deno tests for backup-scheduler.
// Branches: missing Authorization header -> 401, non-admin -> 403,
// DB failure fetching configurations -> 500, happy path (GET) lists
// scheduled backups, OPTIONS preflight.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchStub, jsonResponse, loadServeHandler } from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");

function authRoutes(role: string) {
  return [
    { match: (u: string) => u.includes("/auth/v1/user"), respond: () => jsonResponse({ id: "user-uuid" }) },
    { match: (u: string) => u.includes("/rest/v1/profiles"), respond: () => jsonResponse({ role }) },
  ];
}

Deno.test({
  name: "backup-scheduler: missing Authorization header returns 401",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-scheduler", { method: "GET" }));
      assertEquals(res.status, 401);
    } finally { restore(); }
  },
});

Deno.test({
  name: "backup-scheduler: non-admin caller is forbidden",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(authRoutes("STAFF"));
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-scheduler", {
        method: "GET", headers: { Authorization: "Bearer good-token" },
      }));
      assertEquals(res.status, 403);
    } finally { restore(); }
  },
});

Deno.test({
  name: "backup-scheduler: DB failure fetching configurations surfaces as 500",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      ...authRoutes("ADMIN"),
      { match: (u: string) => u.includes("/rest/v1/backup_configurations"), respond: () => jsonResponse({ message: "db down" }, 500) },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-scheduler", {
        method: "GET", headers: { Authorization: "Bearer good-token" },
      }));
      assertEquals(res.status, 500);
    } finally { restore(); }
  },
});

Deno.test({
  name: "backup-scheduler: happy path lists scheduled backups",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      ...authRoutes("ADMIN"),
      {
        match: (u: string) => u.includes("/rest/v1/backup_configurations"),
        respond: () => jsonResponse([{ id: "cfg-1", name: "Nightly", schedule_cron: "0 2 * * *" }]),
      },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-scheduler", {
        method: "GET", headers: { Authorization: "Bearer good-token" },
      }));
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(Array.isArray(body));
      assertEquals(body[0].id, "cfg-1");
      assert("next_run" in body[0]);
    } finally { restore(); }
  },
});

Deno.test({
  name: "backup-scheduler: OPTIONS preflight is handled",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/backup-scheduler", { method: "OPTIONS" }));
      assertEquals(res.status, 200);
    } finally { restore(); }
  },
});
