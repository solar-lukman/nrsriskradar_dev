// Deno tests for export-onprem-snapshot.
// Branches: missing Authorization header -> 401, non-admin -> 403,
// storage/DB failure mid-export -> 500, happy path (empty tables) returns
// a manifest with signed URLs, OPTIONS preflight.
//
// Regression note: the module-level `json()` helper originally referenced
// `corsHeaders`, which only existed inside the `Deno.serve` closure — the
// same class of bug documented for sample-data-manager. Every response
// (including the 401/403 branches exercised below) would have thrown
// `ReferenceError: corsHeaders is not defined` instead of returning a
// Response. Fixed by moving `json()` inside the handler closure.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchStub, jsonResponse, loadServeHandler, makeTestJwt } from "../_shared/test_harness.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test-key");

function authRoutes(role: string) {
  return [
    { match: (u: string) => u.includes("/auth/v1"), respond: () => jsonResponse({ claims: { sub: "user-uuid" } }) },
    { match: (u: string) => u.includes("/rest/v1/profiles") && u.includes("select=role"), respond: () => jsonResponse({ role }) },
  ];
}

function storageAndTableRoutes(rowsResponder: () => Response) {
  return [
    { match: (u: string) => u.includes("/storage/v1/object/onprem-exports"), respond: () => jsonResponse({ Key: "ok" }) },
    { match: (u: string) => u.includes("/storage/v1/object/sign/onprem-exports"), respond: async (u: string, init?: RequestInit) => {
    let paths: string[] = [];
    try { paths = JSON.parse((init?.body as string) ?? "{}").paths ?? []; } catch { /* ignore */ }
    return jsonResponse(paths.map((p: string) => ({ signedURL: `https://signed.example/${p}`, path: p, error: null })));
  } },
    { match: (u: string) => u.includes("/auth/v1/admin/users"), respond: () => jsonResponse({ users: [] }) },
    { match: (u: string) => u.includes("/rest/v1/rpc/log_system_audit"), respond: () => jsonResponse({}) },
    { match: (u: string) => u.includes("/rest/v1/"), respond: rowsResponder },
  ];
}

Deno.test({
  name: "export-onprem-snapshot: missing Authorization header returns 401",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/export-onprem-snapshot", { method: "POST" }));
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "Unauthorized");
    } finally { restore(); }
  },
});

Deno.test({
  name: "export-onprem-snapshot: non-admin caller is forbidden",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub(authRoutes("STAFF"));
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/export-onprem-snapshot", {
        method: "POST", headers: { Authorization: `Bearer ${makeTestJwt()}` },
      }));
      assertEquals(res.status, 403);
    } finally { restore(); }
  },
});

Deno.test({
  name: "export-onprem-snapshot: a table read failure surfaces as 500",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      ...authRoutes("ADMIN"),
      { match: (u: string) => u.includes("/rest/v1/"), respond: () => jsonResponse({ message: "read failed" }, 500) },
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/export-onprem-snapshot", {
        method: "POST", headers: { Authorization: `Bearer ${makeTestJwt()}` },
        body: JSON.stringify({}),
      }));
      assertEquals(res.status, 500);
      const body = await res.json();
      assert(body.error.includes("Failed to read"));
    } finally { restore(); }
  },
});

Deno.test({
  name: "export-onprem-snapshot: happy path returns a manifest with signed URLs",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([
      ...authRoutes("ADMIN"),
      ...storageAndTableRoutes(() => jsonResponse([])),
    ]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/export-onprem-snapshot", {
        method: "POST", headers: { Authorization: `Bearer ${makeTestJwt()}` },
        body: JSON.stringify({ excludeWhistleblow: true }),
      }));
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(Array.isArray(body.results));
      assert(Array.isArray(body.signed_urls));
      assertEquals(body.manifest_path.endsWith("manifest.json"), true);
    } finally { restore(); }
  },
});

Deno.test({
  name: "export-onprem-snapshot: OPTIONS preflight is handled",
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const restore = installFetchStub([]);
    try {
      const handler = await loadServeHandler("./index.ts", import.meta.url);
      const res = await handler(new Request("https://edge.local/export-onprem-snapshot", { method: "OPTIONS" }));
      assertEquals(res.status, 200);
    } finally { restore(); }
  },
});
