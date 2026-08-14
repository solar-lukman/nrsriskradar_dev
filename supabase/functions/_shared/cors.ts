// Shared CORS helper for edge functions.
//
// Replaces blanket `Access-Control-Allow-Origin: *` with an allowlist
// resolved from the `ALLOWED_ORIGINS` env var (comma-separated) plus a
// safe default set of Lovable preview / production origins.
//
// Usage inside a Deno.serve / serve handler:
//
//     import { buildCors } from "../_shared/cors.ts";
//     ...
//     const corsHeaders = buildCors(req);
//     if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
//
// Any origin not in the allowlist gets `null` for Allow-Origin, which
// browsers treat as a CORS failure — the request is blocked instead of
// silently succeeding.

const DEFAULT_ALLOWED = [
  // Lovable-hosted preview + published domains
  "https://nrsriskradar.lovable.app",
  "https://id-preview--978e63d1-7d04-4578-9d57-e779d9d03bf0.lovable.app",
  // Custom production domain
  "https://nrsrmp.codeware.com.ng",
  "https://riskradar.codeware.com.ng",
  // Local dev
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
];

const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, " +
  "x-supabase-client-platform, x-supabase-client-platform-version, " +
  "x-supabase-client-runtime, x-supabase-client-runtime-version";

function allowlist(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const extra = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set([...DEFAULT_ALLOWED, ...extra])];
}

// Wildcard-style origin matcher — supports exact matches plus any
// `*.lovable.app` / `*.lovableproject.com` sandbox preview origins that
// Lovable spins up per project.
function matchesAllowed(origin: string, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return (
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovable.dev")
    );
  } catch {
    return false;
  }
}


export function buildCors(
  req: Request,
  opts: { allowHeaders?: string; allowMethods?: string } = {},
): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowlist();
  const match = matchesAllowed(origin, allowed) ? origin : "";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": opts.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
    "Access-Control-Allow-Methods":
      opts.allowMethods ?? "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (match) {
    headers["Access-Control-Allow-Origin"] = match;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  // If origin is not allowed, we deliberately omit Allow-Origin so the
  // browser rejects the response. Same-origin / server-to-server calls
  // (no Origin header) still work because the browser does not enforce
  // CORS on them.

  return headers;
}
